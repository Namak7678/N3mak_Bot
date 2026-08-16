import json
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch

from cto_agent import CtoAgent, CtoAgentError, MAX_RESPONSE_BYTES
from server import WorkforceEngine, make_server


ROOT = Path(__file__).resolve().parents[1]
CATALOG = json.loads((ROOT / "config" / "providers.json").read_text(encoding="utf-8"))


def plan_payload(risk="low", requires_approval=False):
    return {
        "executive_summary": "A bounded CTO plan is ready.",
        "answer": "Start with a measurable architecture baseline, then deliver in controlled increments.",
        "risk_level": risk,
        "requires_approval": requires_approval,
        "assumptions": ["The product goal is still in discovery."],
        "delegations": [
            {
                "owner": "forge",
                "action": "Create the technical delivery design.",
                "acceptance": "The design includes interfaces, tests, and rollback criteria.",
            },
            {
                "owner": "sentinel",
                "action": "Review the proposed trust boundaries.",
                "acceptance": "High-risk paths are identified before release.",
            },
        ],
        "next_action": "Confirm the first delivery milestone.",
    }


def provider_response(adapter, text):
    if adapter in {"openai_compatible", "azure_openai"}:
        return {"choices": [{"message": {"content": text}}]}
    if adapter == "anthropic":
        return {"content": [{"type": "text", "text": text}]}
    if adapter == "gemini":
        return {"candidates": [{"content": {"parts": [{"text": text}]}}]}
    if adapter == "cohere":
        return {"message": {"content": [{"type": "text", "text": text}]}}
    if adapter == "ollama":
        return {"message": {"content": text}}
    raise AssertionError(adapter)


class RecordingTransport:
    def __init__(self, adapter, plan=None):
        self.adapter = adapter
        self.plan = plan or plan_payload()
        self.calls = []
        self.malformed_plan = None

    def __call__(self, url, headers, body, timeout):
        decoded = json.loads(body.decode("utf-8"))
        self.calls.append({"url": url, "headers": dict(headers), "body": decoded, "timeout": timeout})
        serialized = json.dumps(decoded, ensure_ascii=False)
        if "ATLANTIS_OK" in serialized:
            return provider_response(self.adapter, "ATLANTIS_OK")
        if self.malformed_plan is not None:
            return self.malformed_plan
        return provider_response(self.adapter, json.dumps(self.plan))


class CtoAgentTests(unittest.TestCase):
    CASES = (
        ("openai", "https://api.openai.com/v1", "gpt-4.1-mini", "openai_compatible", "/chat/completions"),
        ("mistral", "https://api.mistral.ai/v1", "mistral-small-latest", "openai_compatible", "/chat/completions"),
        ("azure-openai", "https://unit-test.openai.azure.com", "deployment-a", "azure_openai", "/openai/deployments/deployment-a/chat/completions?api-version=2024-10-21"),
        ("anthropic", "https://api.anthropic.com/v1", "claude-sonnet-4-5", "anthropic", "/messages"),
        ("google-gemini", "https://generativelanguage.googleapis.com/v1beta", "gemini-2.5-flash", "gemini", "/models/gemini-2.5-flash:generateContent"),
        ("cohere", "https://api.cohere.com/v2", "command-a-plus-05-2026", "cohere", "/chat"),
        ("ollama", "http://127.0.0.1:11434", "llama3.2", "ollama", "/api/chat"),
    )

    def test_graphical_cto_setup_and_pwa_assets_are_wired(self):
        html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
        frontend = (ROOT / "web" / "app.js").read_text(encoding="utf-8")
        service_worker = (ROOT / "web" / "service-worker.js").read_text(encoding="utf-8")
        for element_id in (
            "cto-status-button", "cto-dialog", "cto-form", "cto-provider", "cto-endpoint",
            "cto-model", "cto-secret", "cto-permission", "cto-rollback", "cto-disconnect",
        ):
            self.assertIn('id="{}"'.format(element_id), html)
        self.assertIn('src="/assets/icons/icon-192.png"', html)
        self.assertIn('href="/cto.css"', html)
        self.assertIn('api("/api/cto/connect"', frontend)
        self.assertIn('api("/api/cto/disconnect"', frontend)
        self.assertIn('"/api/cto/run"', frontend)
        self.assertIn('"/cto.css"', service_worker)

    def test_orion_is_the_only_user_facing_cto_identity(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            engine = WorkforceEngine(
                config_path=ROOT / "config" / "workforce.json",
                runtime_path=Path(temp_dir) / "runtime.db",
            )
            agents = {agent["id"]: agent for agent in engine.get_state()["agents"]}
            self.assertIn("Chief Technology Officer", agents["orion"]["role"])
            self.assertNotIn("CTO", agents["forge"]["role"])
            self.assertEqual(agents["orion"]["reports_to"], "CEO / Commander")

    def test_all_provider_families_build_expected_requests(self):
        for provider_id, endpoint, model, adapter, suffix in self.CASES:
            with self.subTest(provider=provider_id):
                transport = RecordingTransport(adapter)
                agent = CtoAgent(CATALOG, transport=transport)
                secret = "" if adapter == "ollama" else "unit-test-secret"
                status = agent.connect(provider_id, endpoint, model, secret, True, True)
                self.assertTrue(status["connected"])
                self.assertTrue(status["health_verified"])
                result = agent.run_goal("Build a secure product launch plan", {"external_automation_enabled": False})

                self.assertEqual(len(transport.calls), 2)
                request = transport.calls[1]
                self.assertTrue(request["url"].endswith(suffix), request["url"])
                if secret:
                    self.assertNotIn(secret, json.dumps(request["body"]))
                self.assertIn("single personal AI Chief Technology Officer", json.dumps(request["body"]))
                self.assertEqual(result["provider"]["id"], provider_id)
                self.assertEqual(result["delegations"][0]["owner"], "forge")
                self.assertIn("No filesystem", result["execution_boundary"])

                headers = request["headers"]
                if adapter == "azure_openai":
                    self.assertEqual(headers.get("api-key"), secret)
                    self.assertNotIn("model", request["body"])
                elif adapter == "anthropic":
                    self.assertEqual(headers.get("x-api-key"), secret)
                    self.assertEqual(request["body"]["model"], model)
                elif adapter == "gemini":
                    self.assertEqual(headers.get("x-goog-api-key"), secret)
                    self.assertNotIn("key=", request["url"])
                    self.assertIn("contents", request["body"])
                elif adapter == "cohere":
                    self.assertEqual(headers.get("Authorization"), "Bearer {}".format(secret))
                    self.assertIn("messages", request["body"])
                    self.assertNotIn("message", request["body"])
                    self.assertFalse(request["body"]["stream"])
                elif adapter == "ollama":
                    self.assertNotIn("Authorization", headers)
                    self.assertFalse(request["body"]["stream"])
                else:
                    self.assertEqual(headers.get("Authorization"), "Bearer {}".format(secret))
                    if provider_id == "openai":
                        self.assertEqual(request["body"]["max_completion_tokens"], 1600)
                        self.assertNotIn("max_tokens", request["body"])
                        self.assertNotIn("temperature", request["body"])
                    else:
                        self.assertEqual(request["body"]["max_tokens"], 1600)
                        self.assertEqual(request["body"]["temperature"], 0.2)
                        self.assertNotIn("max_completion_tokens", request["body"])

    def test_credential_is_session_only_sanitized_and_forgotten(self):
        transport = RecordingTransport("openai_compatible")
        agent = CtoAgent(CATALOG, transport=transport)
        disconnected = agent.status()
        self.assertFalse(disconnected["connected"])
        self.assertEqual(disconnected["credential_storage"], "not_stored")

        status = agent.connect(
            "openai", "https://api.openai.com/v1", "gpt-4.1-mini", "first-secret", True, True
        )
        self.assertNotIn("secret", status)
        self.assertNotIn("endpoint", status)
        self.assertNotIn("first-secret", json.dumps(status))
        old_session = agent._session

        agent.connect("openai", "https://api.openai.com/v1", "gpt-4.1-mini", "second-secret", True, True)
        self.assertEqual(old_session["secret"], "")
        status = agent.disconnect()
        self.assertFalse(status["connected"])
        self.assertIsNone(agent._session)
        self.assertNotIn("second-secret", json.dumps(status))

    def test_connection_requires_permission_rollback_and_health_challenge(self):
        transport = RecordingTransport("openai_compatible")
        agent = CtoAgent(CATALOG, transport=transport)
        with self.assertRaisesRegex(ValueError, "permission"):
            agent.connect("openai", "https://api.openai.com/v1", "gpt-4.1-mini", "key", False, True)
        with self.assertRaisesRegex(ValueError, "rollback"):
            agent.connect("openai", "https://api.openai.com/v1", "gpt-4.1-mini", "key", True, False)

        for reply in ("not-the-challenge", "ATLANTIS_OK and ready", "atlantis_ok"):
            def wrong_challenge(url, headers, body, timeout, value=reply):
                return provider_response("openai_compatible", value)

            failing = CtoAgent(CATALOG, transport=wrong_challenge)
            with self.subTest(reply=reply), self.assertRaisesRegex(CtoAgentError, "challenge"):
                failing.connect("openai", "https://api.openai.com/v1", "gpt-4.1-mini", "key", True, True)
            self.assertFalse(failing.status()["connected"])

    def test_endpoint_validation_blocks_ssrf_and_cross_provider_hosts(self):
        openai = next(item for item in CATALOG["providers"] if item["id"] == "openai")
        azure = next(item for item in CATALOG["providers"] if item["id"] == "azure-openai")
        ollama = next(item for item in CATALOG["providers"] if item["id"] == "ollama")
        self.assertEqual(CtoAgent._validate_endpoint(openai, "https://api.openai.com/v1/"), "https://api.openai.com/v1")
        self.assertEqual(
            CtoAgent._validate_endpoint(azure, "https://example-resource.openai.azure.com"),
            "https://example-resource.openai.azure.com",
        )
        self.assertEqual(
            CtoAgent._validate_endpoint(ollama, "http://localhost:11434"), "http://localhost:11434"
        )
        for endpoint in (
            "http://api.openai.com/v1",
            "https://api.openai.com:8443/v1",
            "https://evil.example/v1",
            "https://127.0.0.1/v1",
            "https://user:pass@api.openai.com/v1",
            "https://api.openai.com/v1?token=secret",
        ):
            with self.subTest(endpoint=endpoint), self.assertRaises(ValueError):
                CtoAgent._validate_endpoint(openai, endpoint)
        with self.assertRaises(ValueError):
            CtoAgent._validate_endpoint(azure, "https://api.openai.com/v1")
        with self.assertRaises(ValueError):
            CtoAgent._validate_endpoint(ollama, "http://192.168.1.20:11434")

    def test_transport_rejects_invalid_or_oversized_response_lengths(self):
        class FakeResponse:
            def __init__(self, length, body=b"{}"):
                self.headers = {} if length is None else {"Content-Length": length}
                self.body = body

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc_value, traceback):
                return False

            def read(self, size):
                return self.body[:size]

        cases = (
            ("invalid", b"{}", "invalid Content-Length"),
            ("-1", b"{}", "invalid Content-Length"),
            (str(MAX_RESPONSE_BYTES + 1), b"{}", "1 MiB"),
            (None, b"x" * (MAX_RESPONSE_BYTES + 1), "1 MiB"),
        )
        for length, body, error in cases:
            with self.subTest(length=length), patch("cto_agent.build_opener") as opener:
                opener.return_value.open.return_value = FakeResponse(length, body)
                with self.assertRaisesRegex(CtoAgentError, error):
                    CtoAgent._http_json("https://api.openai.com/v1/chat/completions", {}, b"{}", 1)

    def test_malformed_provider_output_creates_no_task(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            transport = RecordingTransport("openai_compatible")
            agent = CtoAgent(CATALOG, transport=transport)
            engine = WorkforceEngine(
                config_path=ROOT / "config" / "workforce.json",
                runtime_path=Path(temp_dir) / "runtime.db",
                cto_agent=agent,
            )
            engine.connect_cto({
                "provider_id": "openai",
                "endpoint": "https://api.openai.com/v1",
                "model": "gpt-4.1-mini",
                "secret": "unit-test-secret",
                "permission_granted": True,
                "rollback_ready": True,
            })
            transport.malformed_plan = provider_response("openai_compatible", "not valid plan json")
            with self.assertRaises(CtoAgentError):
                engine.run_cto_goal("Create a safe delivery roadmap")
            self.assertEqual(engine.get_state()["runtime"]["command_count"], 0)

            transport.malformed_plan = {}
            with self.assertRaises(CtoAgentError):
                engine.run_cto_goal("Create another delivery roadmap")
            self.assertEqual(engine.get_state()["runtime"]["command_count"], 0)

    def test_model_and_deterministic_risk_independently_escalate_approval(self):
        cases = (
            (plan_payload(risk="high", requires_approval=False), "Plan a routine roadmap", True),
            (plan_payload(risk="low", requires_approval=False), "delete data after the review", True),
            (plan_payload(risk="low", requires_approval=False), "Plan a routine product roadmap", False),
        )
        for index, (plan, goal, expected) in enumerate(cases):
            with self.subTest(index=index), tempfile.TemporaryDirectory() as temp_dir:
                transport = RecordingTransport("openai_compatible", plan=plan)
                agent = CtoAgent(CATALOG, transport=transport)
                engine = WorkforceEngine(
                    config_path=ROOT / "config" / "workforce.json",
                    runtime_path=Path(temp_dir) / "runtime.db",
                    cto_agent=agent,
                )
                agent.connect("openai", "https://api.openai.com/v1", "gpt-4.1-mini", "key", True, True)
                result = engine.run_cto_goal(goal)
                self.assertEqual(result["requires_approval"], expected)
                self.assertEqual(result["accepted"], not expected)
                self.assertEqual(result["workflow"]["policy"]["requires_approval"], expected)
                self.assertEqual(result["workflow"]["policy"]["execution_scope"], "ai_planning_only")
                self.assertEqual(result["executed"], ["provider_inference", "plan_staged"])
                self.assertFalse(result["workflow"]["policy"]["external_effects_enabled"])
                self.assertEqual(result["task"]["owner"], "orion")
                self.assertEqual(result["task"]["executor"], "forge")
                self.assertEqual(result["task"]["delegated_agents"], ["forge", "sentinel"])
                self.assertEqual(result["workflow"]["stages"][0]["owner"], "orion")
                self.assertEqual(result["workflow"]["audit"][0]["agent"], "orion")
                queues = {agent["id"]: agent["queue"]["items"] for agent in engine.get_state()["agents"]}
                for agent_id in ("orion", "forge", "sentinel"):
                    self.assertIn(result["task"]["id"], [item["id"] for item in queues[agent_id]])


class CtoHttpRouteTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.transport = RecordingTransport("openai_compatible")
        self.agent = CtoAgent(CATALOG, transport=self.transport)
        self.engine = WorkforceEngine(
            config_path=ROOT / "config" / "workforce.json",
            runtime_path=Path(self.temp_dir.name) / "runtime.db",
            cto_agent=self.agent,
        )
        self.server = make_server(
            "127.0.0.1", 0, commander_key="unit-test-commander", engine=self.engine
        )
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = "http://127.0.0.1:{}".format(self.server.server_address[1])
        self.addCleanup(self._close_server)

    def _close_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=3)

    def post(self, path, payload, authorized=True):
        headers = {"Content-Type": "application/json"}
        if authorized:
            headers["Authorization"] = "Bearer unit-test-commander"
        request = Request(
            self.base_url + path,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urlopen(request, timeout=3) as response:
            return response.status, json.load(response)

    def test_cto_routes_are_commander_protected_and_sanitized(self):
        with self.assertRaises(HTTPError) as unauthorized:
            self.post("/api/cto/connect", {}, authorized=False)
        self.assertEqual(unauthorized.exception.code, 401)

        status_code, connected = self.post("/api/cto/connect", {
            "provider_id": "openai",
            "endpoint": "https://api.openai.com/v1",
            "model": "gpt-4.1-mini",
            "secret": "route-test-secret",
            "permission_granted": True,
            "rollback_ready": True,
        })
        self.assertEqual(status_code, 200)
        self.assertTrue(connected["cto"]["connected"])
        self.assertNotIn("route-test-secret", json.dumps(connected))

        status_code, result = self.post("/api/cto/run", {"command": "Create a secure MVP roadmap"})
        self.assertEqual(status_code, 201)
        self.assertEqual(result["task"]["source"], "ORION AI CTO")
        self.assertEqual(result["executed"], ["provider_inference", "plan_staged"])
        self.assertNotIn("route-test-secret", json.dumps(result))

        request = Request(
            self.base_url + "/api/state",
            headers={"Authorization": "Bearer unit-test-commander"},
        )
        with urlopen(request, timeout=3) as response:
            state = json.load(response)
        self.assertTrue(state["cto"]["connected"])
        self.assertNotIn("route-test-secret", json.dumps(state))

        status_code, disconnected = self.post("/api/cto/disconnect", {})
        self.assertEqual(status_code, 200)
        self.assertFalse(disconnected["cto"]["connected"])
        self.assertIsNone(self.agent._session)

    def test_malformed_model_plan_returns_sanitized_gateway_error(self):
        self.post("/api/cto/connect", {
            "provider_id": "openai",
            "endpoint": "https://api.openai.com/v1",
            "model": "gpt-4.1-mini",
            "secret": "route-test-secret",
            "permission_granted": True,
            "rollback_ready": True,
        })
        self.transport.malformed_plan = provider_response("openai_compatible", "bad output")
        with self.assertRaises(HTTPError) as failure:
            self.post("/api/cto/run", {"command": "Plan a secure launch"})
        self.assertEqual(failure.exception.code, 502)
        payload = json.loads(failure.exception.read().decode("utf-8"))
        self.assertEqual(payload["code"], "CTO_PROVIDER_ERROR")
        self.assertNotIn("route-test-secret", json.dumps(payload))
        self.assertEqual(self.engine.get_state()["runtime"]["command_count"], 0)


if __name__ == "__main__":
    unittest.main()
