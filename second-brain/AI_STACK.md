# N3mak Second Brain — AI stack under Grok Bot command

Selected tools (active now):
1. **OmniRoute** (`127.0.0.1:20128`) — control plane / model router
2. **CFP free** `cfp/openai/gpt-oss-20b` — default cheap path
3. **Codex** `codex/gpt-5.5-low` — coding / repair
4. **auto/best-coding** — routing combo when available
5. **GitHub MCP** — repo repair / PRs
6. **Whop MCP** — checkout / memberships / forum
7. **Telegram @N3mak_bot** — sales + fulfillment
8. **Postiz + Zernio** — social publish (auth OK; **channels not linked yet**)

Standing orders for the assistant:
- Prefer fixing over asking.
- Keep OmniRoute + bot alive (see `scripts/keep-alive.sh`).
- Default model for product answers: CFP free; for code: Codex.
- Revenue metric: first Whop payment > $0.
