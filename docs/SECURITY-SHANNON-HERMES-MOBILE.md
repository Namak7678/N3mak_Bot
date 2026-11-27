# N3mak Security & Remote Hermes Operations

## Scope
Integrate security testing into the existing N3mak_Bot repository. Do not create a second bot, hosting project, or paid subscription.

## Keygraph / Shannon
- Upstream: https://github.com/KeygraphHQ/shannon
- Use Shannon as an opt-in security assessment tool for N3mak web/API surfaces and repository changes.
- First run must be non-production and against a local/staging target that the owner controls.
- Keep generated reports and remediation notes in CI artifacts; never commit credentials, session cookies, API keys, or raw sensitive scan output.
- Before enabling CI, review Shannon's current installation, supported model providers, required API keys, and resource requirements. Open-source code does not imply free hosted model inference.
- Initial gate: manual/weekly security scan; later add a pull-request workflow only after the setup is verified and secrets are stored as GitHub Actions secrets.

## Hermes on iPhone
Hermes Agent is a host-side agent, not an iOS-native runtime. Keep the existing Windows Hermes installation and its data.
1. Diagnose the existing install at %LOCALAPPDATA%\\hermes\\hermes-agent; do not delete/reinstall blindly.
2. Start or repair the Hermes gateway/dashboard on the host.
3. Expose access only through a private network such as Tailscale; do not publish an unauthenticated gateway to the internet.
4. On iPhone, use a verified compatible companion app/TestFlight build if available, or open the secured dashboard in Safari and Add to Home Screen.
5. Confirm remote access, authentication, and a harmless test prompt before enabling agent actions.

## Current limitation
GitHub repository changes cannot repair the user's Windows machine or install an iPhone app. Those host/device steps require running commands on the user's Windows PC and tapping the iPhone installation flow.
