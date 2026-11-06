#!/usr/bin/env python3
"""Mint a real OmniRoute API key into storage.sqlite (same format as OmniRoute)."""
import hashlib, json, os, re, secrets, sqlite3, sys, time, uuid
from pathlib import Path

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
    name = sys.argv[1] if len(sys.argv) > 1 else "whop-buyer"
    secret = read_secret()
    mid = machine_id()
    key_id = secrets.token_hex(3)
    crc = hashlib.pbkdf2_hmac("sha256", (mid + key_id).encode(), secret.encode(), 1000, dklen=32).hex()[:8]
    key = f"sk-{mid}-{key_id}-{crc}"
    key_hash = hashlib.sha256(key.encode()).hexdigest()
    kid = str(uuid.uuid4())
    now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    db_path = os.environ.get("OMNIROUTE_SQLITE_PATH") or str(Path.home() / ".omniroute" / "storage.sqlite")
    db = sqlite3.connect(db_path)
    db.execute(
        """INSERT INTO api_keys
           (id,name,key,machine_id,allowed_models,no_log,created_at,key_prefix,scopes,
            allowed_combos,allowed_connections,key_hash,model_access_mode,is_active)
           VALUES (?,?,?,?, '[]', 0, ?, ?, ?, ?, '[]', ?, 'all', 1)""",
        (
            kid,
            name[:120],
            key,
            mid,
            now,
            key[:12],
            json.dumps(["self:usage"]),
            json.dumps(["*"]),
            key_hash,
        ),
    )
    db.commit()
    db.close()
    print(json.dumps({"key": key, "id": kid, "via": "sqlite"}))

if __name__ == "__main__":
    main()
