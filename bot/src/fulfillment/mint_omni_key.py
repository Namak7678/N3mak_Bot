#!/usr/bin/env python3
"""Mint a real OmniRoute API key into storage.sqlite with per-plan limits."""
import hashlib, json, os, re, secrets, sqlite3, sys, time, uuid
from pathlib import Path

# Mirrors tierLimits.js / marketing/tier-proposal.md
PIONEER = "plan_n2uiwphhI5YG7"
STARTER = "plan_IkWmnOwW1ShYY"
PRO = "plan_SrqGnbkktuOUc"
PIONEER_MODELS = [
    "cfp/openai/gpt-oss-20b",
    "cfp/openai/gpt-oss-120b",
    "cfp/zai-org/glm-4.7-flash",
    "cfp/deepseek-ai/deepseek-v4-flash-0731",
    "cfp/meta/llama-3.1-8b-instruct-fp8",
    "cfp/meta/llama-4-scout-17b-16e-instruct",
    "cfp/qwen/qwen2.5-coder-32b-instruct",
    "cfp/mistralai/mistral-small-3.1-24b-instruct",
    "cfp/*",
]
STARTER_MODELS = PIONEER_MODELS + [
    "cfp/moonshotai/kimi-k2.6",
    "cfp/moonshotai/kimi-k2.7-code",
    "cfp/deepseek-ai/deepseek-v4-pro-0813",
    "cfp/zai-org/glm-5.2",
    "cfp/meta-llama/llama-3.3-70b-instruct-fp8-fast",
    "cfp/qwen/qwen3-30b-a3b-fp8",
    "cfp/qwen/qwq-32b",
    "cfp/google/gemma-4-26b-a4b-it",
]
TIERS = {
    PIONEER: {
        "name": "pioneer",
        "max_requests_per_day": 200,
        "max_requests_per_minute": 5,
        "model_access_mode": "restricted",
        "allowed_models": PIONEER_MODELS,
        "usage_limit_enabled": 1,
        "daily_usage_limit_usd": 0.5,
    },
    STARTER: {
        "name": "starter",
        "max_requests_per_day": 1000,
        "max_requests_per_minute": 20,
        "model_access_mode": "restricted",
        "allowed_models": STARTER_MODELS,
        "usage_limit_enabled": 1,
        "daily_usage_limit_usd": 3.0,
    },
    PRO: {
        "name": "pro",
        "max_requests_per_day": 10000,
        "max_requests_per_minute": 60,
        "model_access_mode": "all",
        "allowed_models": [],
        "usage_limit_enabled": 1,
        "daily_usage_limit_usd": 20.0,
    },
}

def resolve_plan(plan: str | None) -> str:
    if not plan:
        return PIONEER
    s = plan.lower()
    if plan in TIERS:
        return plan
    if s in ("pioneer",) or "n2uiwphh" in s:
        return PIONEER
    if s in ("starter",) or "ikwmnow" in s:
        return STARTER
    if s in ("pro",) or "srqgnbk" in s:
        return PRO
    return PIONEER

def read_secret():
    if os.environ.get("OMNIROUTE_API_KEY_SECRET"):
        return os.environ["OMNIROUTE_API_KEY_SECRET"].strip()
    for p in [
        os.environ.get("OMNIROUTE_ENV_FILE"),
        str(Path.home() / ".omniroute" / "server.env"),
        "/workspace/omniroute/.env",
    ]:
        if not p:
            continue
        try:
            text = Path(p).read_text()
        except Exception:
            continue
        m = re.search(r"^API_KEY_SECRET=(.*)$", text, re.M)
        if m:
            return m.group(1).strip().strip('"').strip("'")
    raise SystemExit("API_KEY_SECRET not found")

def machine_id():
    if os.environ.get("OMNIROUTE_MACHINE_ID"):
        return os.environ["OMNIROUTE_MACHINE_ID"].strip()
    k = os.environ.get("OPENAI_API_KEY") or os.environ.get("OMNIROUTE_API_KEY") or ""
    m = re.match(r"^sk-([a-f0-9]{16})-", k, re.I)
    if m:
        return m.group(1)
    return "6c7d6a2ee21fdf50"

def main():
    # argv: [name] [plan_id_or_name]
    name = sys.argv[1] if len(sys.argv) > 1 else "whop-buyer"
    plan_arg = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("N3MAK_PLAN") or PIONEER
    plan = resolve_plan(plan_arg)
    tier = TIERS[plan]
    secret = read_secret()
    mid = machine_id()
    key_id = secrets.token_hex(3)
    crc = hashlib.pbkdf2_hmac("sha256", (mid + key_id).encode(), secret.encode(), 1000, dklen=32).hex()[:8]
    key = f"sk-{mid}-{key_id}-{crc}"
    key_hash = hashlib.sha256(key.encode()).hexdigest()
    kid = str(uuid.uuid4())
    now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    db_path = os.environ.get("OMNIROUTE_SQLITE_PATH") or str(Path.home() / ".omniroute" / "storage.sqlite")
    allowed = json.dumps(tier["allowed_models"])
    db = sqlite3.connect(db_path)
    db.execute(
        """INSERT INTO api_keys
           (id,name,key,machine_id,allowed_models,no_log,created_at,key_prefix,scopes,
            allowed_combos,allowed_connections,key_hash,model_access_mode,is_active,
            max_requests_per_day,max_requests_per_minute,usage_limit_enabled,daily_usage_limit_usd)
           VALUES (?,?,?,?,?,0,?,?,?,?,?,?,?,1,?,?,?,?)""",
        (
            kid,
            name[:120],
            key,
            mid,
            allowed,
            now,
            key[:12],
            json.dumps(["self:usage"]),
            json.dumps(["*"]),
            "[]",
            key_hash,
            tier["model_access_mode"],
            tier["max_requests_per_day"],
            tier["max_requests_per_minute"],
            tier["usage_limit_enabled"],
            tier["daily_usage_limit_usd"],
        ),
    )
    db.commit()
    db.close()
    print(
        json.dumps(
            {
                "key": key,
                "id": kid,
                "via": "sqlite",
                "plan": plan,
                "tier": tier["name"],
                "limits": {
                    "max_requests_per_day": tier["max_requests_per_day"],
                    "max_requests_per_minute": tier["max_requests_per_minute"],
                    "model_access_mode": tier["model_access_mode"],
                    "allowed_models": tier["allowed_models"],
                    "usage_limit_enabled": bool(tier["usage_limit_enabled"]),
                    "daily_usage_limit_usd": tier["daily_usage_limit_usd"],
                },
            }
        )
    )

if __name__ == "__main__":
    main()
