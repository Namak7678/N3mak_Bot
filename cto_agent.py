"""Session-only AI provider gateway for the Orion CTO web experience.

The native Tauri application keeps provider credentials in SQLCipher.  The web
preview cannot offer that guarantee, so this module deliberately retains one
credential in process memory only, never writes it to SQLite, and forgets the
session on disconnect or process restart.
"""

from __future__ import annotations

import ipaddress
import json
import re
import threading
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener


MAX_RESPONSE_BYTES = 1_048_576
SUPPORTED_ADAPTERS = {"openai_compatible", "azure_openai", "anthropic", "gemini", "cohere", "ollama"}
ALLOWED_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


class CtoAgentError(RuntimeError):
    """A sanitized provider or response failure safe to display to the user."""


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[no-untyped-def]
        raise CtoAgentError("The provider attempted an unexpected redirect; connection was stopped.")


Transport = Callable[[str, Dict[str, str], bytes, int], Dict[str, Any]]


class CtoAgent:
    """Connect one model provider to a constrained CTO planning agent."""

    def __init__(self, catalog: Dict[str, Any], transport: Optional[Transport] = None) -> None:
        self._catalog = catalog
        self._transport = transport or self._http_json
        self._lock = threading.RLock()
        self._session: Optional[Dict[str, Any]] = None
        self._last_run_at: Optional[str] = None

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    def _definition(self, provider_id: str) -> Dict[str, Any]:
        provider = next(
            (item for item in self._catalog.get("providers", []) if item.get("id") == provider_id),
            None,
        )
        if provider is None:
            raise ValueError("Unknown AI provider.")
        if provider.get("operational") is False:
            raise ValueError("This provider is catalog-only and has no operational adapter yet.")
        if provider.get("adapter") not in SUPPORTED_ADAPTERS:
            raise ValueError("This provider protocol is not available in the CTO web runtime.")
        return provider

    @staticmethod
    def _clean(value: Any, limit: int) -> str:
        return " ".join(str(value or "").split())[:limit]

    @staticmethod
    def _validate_endpoint(definition: Dict[str, Any], endpoint: str) -> str:
        endpoint = endpoint.strip().rstrip("/")
        if not endpoint or len(endpoint) > 1024 or any(ord(char) < 32 for char in endpoint):
            raise ValueError("A valid provider endpoint is required.")
        parsed = urlparse(endpoint)
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("Provider endpoints cannot contain credentials, query strings, or fragments.")
        try:
            host = (parsed.hostname or "").casefold()
            port = parsed.port
        except ValueError as exc:
            raise ValueError("The provider endpoint contains an invalid port.") from exc
        local = bool(definition.get("local"))
        if local:
            if parsed.scheme != "http" or host not in ALLOWED_LOCAL_HOSTS:
                raise ValueError("Local providers must use an HTTP loopback endpoint.")
        else:
            if parsed.scheme != "https":
                raise ValueError("Hosted providers require HTTPS.")
            if port not in {None, 443}:
                raise ValueError("Hosted provider endpoints must use the standard HTTPS port.")
            configured_host = (urlparse(str(definition.get("base_url", ""))).hostname or "").casefold()
            if definition.get("adapter") == "azure_openai":
                azure_host = host.endswith(".openai.azure.com") and host != "openai.azure.com"
                if not azure_host:
                    raise ValueError("Azure OpenAI endpoints must use your *.openai.azure.com resource host.")
            elif not configured_host or host != configured_host:
                raise ValueError("The endpoint host does not match the selected provider.")
        try:
            literal = ipaddress.ip_address(host.strip("[]"))
        except ValueError:
            literal = None
        if not local and literal and (literal.is_private or literal.is_loopback or literal.is_link_local):
            raise ValueError("Hosted provider endpoints cannot target a private network address.")
        return endpoint

    def status(self) -> Dict[str, Any]:
        with self._lock:
            if self._session is None:
                return {
                    "connected": False,
                    "mode": "setup_required",
                    "role": "Chief Technology Officer",
                    "agent": "ORION",
                    "permission_granted": False,
                    "health_verified": False,
                    "rollback_ready": True,
                    "credential_storage": "not_stored",
                    "last_run_at": self._last_run_at,
                }
            return {
                "connected": True,
                "mode": "live_model_planning",
                "role": "Chief Technology Officer",
                "agent": "ORION",
                "provider_id": self._session["provider_id"],
                "provider_name": self._session["definition"]["name"],
                "model": self._session["model"],
                "permission_granted": True,
                "health_verified": True,
                "rollback_ready": True,
                "credential_storage": "process_memory_only",
                "connected_at": self._session["connected_at"],
                "last_run_at": self._last_run_at,
            }

    def connect(
        self,
        provider_id: str,
        endpoint: str,
        model: str,
        secret: str,
        permission_granted: bool,
        rollback_ready: bool,
    ) -> Dict[str, Any]:
        if permission_granted is not True:
            raise ValueError("Explicit Commander permission is required before model access.")
        if rollback_ready is not True:
            raise ValueError("Confirm the disconnect-and-forget rollback before connecting.")
        definition = self._definition(self._clean(provider_id, 100))
        endpoint = self._validate_endpoint(definition, endpoint or definition.get("base_url", ""))
        model = self._clean(model or definition.get("default_model", ""), 300)
        if not model:
            raise ValueError("A model name is required.")
        secret = str(secret or "").strip()
        auth = definition.get("auth", "bearer")
        if auth not in {"none", "optional-bearer"} and not secret:
            raise ValueError("An API key or access token is required for this provider.")
        if len(secret) > 8192:
            raise ValueError("The provider credential exceeds the allowed size.")

        candidate = {
            "provider_id": definition["id"],
            "definition": definition,
            "endpoint": endpoint,
            "model": model,
            "secret": secret,
            "connected_at": self._now(),
        }
        # A successful minimal inference is the health gate. A catalog entry alone is never enough.
        health_text = self._call_provider(candidate, "Reply with ATLANTIS_OK only.", max_tokens=24)
        if health_text.strip() != "ATLANTIS_OK":
            raise CtoAgentError("Provider health verification did not return the exact expected challenge response.")
        with self._lock:
            if self._session is not None:
                self._session["secret"] = ""
            self._session = candidate
        return self.status()

    def disconnect(self) -> Dict[str, Any]:
        with self._lock:
            if self._session is not None:
                self._session["secret"] = ""
            self._session = None
        return self.status()

    def run_goal(self, goal: str, context: Dict[str, Any]) -> Dict[str, Any]:
        goal = self._clean(goal, 500)
        if len(goal) < 3:
            raise ValueError("Describe a clear goal using at least three characters.")
        with self._lock:
            if self._session is None:
                raise ValueError("Connect and verify an AI provider before asking Orion CTO to work.")
            session = self._session
            prompt = self._planning_prompt(goal, context)
            raw = self._call_provider(session, prompt, max_tokens=1600)
            plan = self._normalize_plan(self._extract_json(raw), goal)
            self._last_run_at = self._now()
            plan["provider"] = {
                "id": session["provider_id"],
                "name": session["definition"]["name"],
                "model": session["model"],
            }
            plan["generated_at"] = self._last_run_at
            plan["execution_boundary"] = (
                "AI planning and delegation only. No filesystem, browser, desktop, publishing, "
                "payment, or deployment side effect was executed."
            )
            return plan

    @staticmethod
    def _planning_prompt(goal: str, context: Dict[str, Any]) -> str:
        instructions = """You are ORION, the user's single personal AI Chief Technology Officer. You may
coordinate internal specialist roles, but you alone report to the user. The user is Commander and
ultimate authority. Produce a practical answer and an auditable execution plan. Never claim that a
file, browser, desktop, payment, deployment, publication, account, or external system was changed:
you have planning/model access only. Mark deletion, money movement, external publication,
production deployment, contracts, legal decisions, sensitive-data disclosure, critical security
permission changes, and major strategy as requiring Commander approval.

Return only one valid JSON object with this exact shape:
{
  "executive_summary": "use the same language as the user's goal",
  "answer": "the useful CTO response or deliverable",
  "risk_level": "low|medium|high|critical",
  "requires_approval": false,
  "assumptions": ["..."],
  "delegations": [
    {"owner": "atlas|forge|sentinel|nexus|pulse|athena|orion", "action": "...", "acceptance": "..."}
  ],
  "next_action": "one concrete next step"
}
Use no more than 8 delegations and 6 assumptions. Do not include secrets."""
        return "{}\n\nCurrent local context:\n{}\n\nCommander goal:\n{}".format(
            instructions,
            json.dumps(context, ensure_ascii=False),
            goal,
        )

    @staticmethod
    def _extract_json(raw: str) -> Dict[str, Any]:
        text = raw.strip()
        fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL | re.IGNORECASE)
        if fenced:
            text = fenced.group(1)
        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end <= start:
            raise CtoAgentError("The model did not return the required structured CTO plan.")
        try:
            payload = json.loads(text[start:end + 1])
        except json.JSONDecodeError as exc:
            raise CtoAgentError("The model returned malformed plan JSON; no task was executed.") from exc
        if not isinstance(payload, dict):
            raise CtoAgentError("The model response was not a CTO plan object.")
        return payload

    @classmethod
    def _normalize_plan(cls, payload: Dict[str, Any], goal: str) -> Dict[str, Any]:
        summary = cls._clean(payload.get("executive_summary"), 1400)
        answer = cls._clean(payload.get("answer"), 6000)
        next_action = cls._clean(payload.get("next_action"), 700)
        if not summary or not answer or not next_action:
            raise CtoAgentError("The model plan omitted a required summary, answer, or next action.")
        risk = str(payload.get("risk_level", "medium")).casefold()
        if risk not in {"low", "medium", "high", "critical"}:
            risk = "medium"

        assumptions: List[str] = []
        for value in payload.get("assumptions", []) if isinstance(payload.get("assumptions"), list) else []:
            cleaned = cls._clean(value, 500)
            if cleaned:
                assumptions.append(cleaned)
            if len(assumptions) == 6:
                break

        allowed_owners = {"atlas", "forge", "sentinel", "nexus", "pulse", "athena", "orion"}
        delegations: List[Dict[str, str]] = []
        source_delegations = payload.get("delegations", [])
        if isinstance(source_delegations, list):
            for item in source_delegations:
                if not isinstance(item, dict):
                    continue
                owner = str(item.get("owner", "orion")).casefold()
                if owner not in allowed_owners:
                    owner = "orion"
                action = cls._clean(item.get("action"), 700)
                acceptance = cls._clean(item.get("acceptance"), 700)
                if action and acceptance:
                    delegations.append({"owner": owner, "action": action, "acceptance": acceptance})
                if len(delegations) == 8:
                    break
        if not delegations:
            delegations.append({
                "owner": "orion",
                "action": "Clarify and sequence the requested goal: {}".format(goal),
                "acceptance": "The Commander receives a bounded plan with measurable completion criteria.",
            })

        return {
            "executive_summary": summary,
            "answer": answer,
            "risk_level": risk,
            "requires_approval": payload.get("requires_approval") is True or risk == "critical",
            "assumptions": assumptions,
            "delegations": delegations,
            "next_action": next_action,
        }

    @staticmethod
    def _provider_text(adapter: str, response: Dict[str, Any]) -> str:
        """Extract text from supported APIs without leaking malformed payload details."""
        try:
            if adapter in {"openai_compatible", "azure_openai"}:
                choices = response.get("choices")
                message = choices[0].get("message", {}) if isinstance(choices, list) and choices else {}
                content = message.get("content", "") if isinstance(message, dict) else ""
                if isinstance(content, str):
                    return content
                if isinstance(content, list):
                    return "".join(
                        item.get("text", "")
                        for item in content
                        if isinstance(item, dict) and isinstance(item.get("text"), str)
                    )

            if adapter == "anthropic":
                content = response.get("content")
                if isinstance(content, list):
                    return "".join(
                        item.get("text", "")
                        for item in content
                        if isinstance(item, dict) and isinstance(item.get("text"), str)
                    )

            if adapter == "gemini":
                candidates = response.get("candidates")
                candidate = candidates[0] if isinstance(candidates, list) and candidates else {}
                content = candidate.get("content", {}) if isinstance(candidate, dict) else {}
                parts = content.get("parts", []) if isinstance(content, dict) else []
                if isinstance(parts, list):
                    return "".join(
                        item.get("text", "")
                        for item in parts
                        if isinstance(item, dict) and isinstance(item.get("text"), str)
                    )

            if adapter == "cohere":
                direct = response.get("text")
                if isinstance(direct, str):
                    return direct
                message = response.get("message", {})
                content = message.get("content", []) if isinstance(message, dict) else []
                if isinstance(content, str):
                    return content
                if isinstance(content, list):
                    return "".join(
                        item.get("text", "")
                        for item in content
                        if isinstance(item, dict) and isinstance(item.get("text"), str)
                    )

            if adapter == "ollama":
                message = response.get("message", {})
                content = message.get("content", "") if isinstance(message, dict) else ""
                if isinstance(content, str):
                    return content
        except (AttributeError, IndexError, TypeError):
            pass
        raise CtoAgentError("Provider returned an unexpected response shape.")

    def _call_provider(self, session: Dict[str, Any], prompt: str, max_tokens: int) -> str:
        definition = session["definition"]
        adapter = definition["adapter"]
        endpoint = session["endpoint"]
        model = session["model"]
        secret = session["secret"]
        headers = {"Content-Type": "application/json", "Accept": "application/json"}

        if adapter in {"openai_compatible", "azure_openai"}:
            if definition.get("auth") == "api-key":
                headers["api-key"] = secret
            elif secret:
                headers["Authorization"] = "Bearer {}".format(secret)
            if adapter == "azure_openai":
                if "/openai/deployments/" in endpoint:
                    url = endpoint + "/chat/completions?api-version=2024-10-21"
                else:
                    url = endpoint + "/openai/deployments/{}/chat/completions?api-version=2024-10-21".format(
                        quote(model, safe="")
                    )
                body = {"messages": [{"role": "user", "content": prompt}], "max_tokens": max_tokens}
            else:
                url = endpoint + "/chat/completions"
                body = {
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                }
                if definition.get("id") == "openai":
                    # OpenAI deprecated max_tokens for Chat Completions and
                    # current reasoning models may reject sampling controls.
                    body["max_completion_tokens"] = max_tokens
                else:
                    body.update({"temperature": 0.2, "max_tokens": max_tokens})
            response = self._transport(url, headers, json.dumps(body).encode("utf-8"), 45)
            return self._provider_text(adapter, response)

        if adapter == "anthropic":
            headers.update({"x-api-key": secret, "anthropic-version": "2023-06-01"})
            body = {"model": model, "max_tokens": max_tokens, "messages": [{"role": "user", "content": prompt}]}
            response = self._transport(endpoint + "/messages", headers, json.dumps(body).encode("utf-8"), 45)
            return self._provider_text(adapter, response)

        if adapter == "gemini":
            headers["x-goog-api-key"] = secret
            body = {
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.2, "maxOutputTokens": max_tokens},
            }
            url = endpoint + "/models/{}:generateContent".format(quote(model, safe=""))
            response = self._transport(url, headers, json.dumps(body).encode("utf-8"), 45)
            return self._provider_text(adapter, response)

        if adapter == "cohere":
            headers["Authorization"] = "Bearer {}".format(secret)
            body = {
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.2,
                "max_tokens": max_tokens,
                "stream": False,
            }
            response = self._transport(endpoint + "/chat", headers, json.dumps(body).encode("utf-8"), 45)
            return self._provider_text(adapter, response)

        if adapter == "ollama":
            body = {"model": model, "messages": [{"role": "user", "content": prompt}], "stream": False}
            response = self._transport(endpoint + "/api/chat", headers, json.dumps(body).encode("utf-8"), 90)
            return self._provider_text(adapter, response)

        raise CtoAgentError("The selected provider adapter is unavailable.")

    @staticmethod
    def _http_json(url: str, headers: Dict[str, str], body: bytes, timeout: int) -> Dict[str, Any]:
        request = Request(url, data=body, headers=headers, method="POST")
        try:
            with build_opener(_NoRedirect()).open(request, timeout=timeout) as response:
                content_length = response.headers.get("Content-Length")
                if content_length:
                    try:
                        declared_length = int(content_length)
                    except ValueError as exc:
                        raise CtoAgentError("Provider returned an invalid Content-Length header.") from exc
                    if declared_length < 0:
                        raise CtoAgentError("Provider returned an invalid Content-Length header.")
                    if declared_length > MAX_RESPONSE_BYTES:
                        raise CtoAgentError("The provider response exceeded the 1 MiB safety limit.")
                raw = response.read(MAX_RESPONSE_BYTES + 1)
                if len(raw) > MAX_RESPONSE_BYTES:
                    raise CtoAgentError("The provider response exceeded the 1 MiB safety limit.")
        except CtoAgentError:
            raise
        except HTTPError as exc:
            raise CtoAgentError("Provider request failed with HTTP status {}. Check the key, model, and quota.".format(exc.code)) from exc
        except (URLError, TimeoutError, OSError) as exc:
            raise CtoAgentError("Provider connection failed or timed out. No task was executed.") from exc
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise CtoAgentError("Provider returned an invalid JSON response.") from exc
        if not isinstance(payload, dict):
            raise CtoAgentError("Provider returned an unexpected response shape.")
        return payload
