# N3mak Radar — Commercial report intake

## User path
1. The Radar services page links to Telegram with the `cyber_report` start payload.
2. The bot shows the report request CTA. Its inline button starts the intake directly.
3. The intake collects company name, public domain, country, report/monitoring type, and optional business contact.
4. Requests are stored in the existing Postgres database table `cyber_report_leads` and assigned an internal numeric lead ID.
5. If `OPERATIONS_GROUP_ID` is configured, the bot forwards the lead to the operations group. Optional `TOPIC_IDS` entry `cyber-leads=<thread_id>` routes it to a forum topic.

## Operations and safeguards
- `initDb` creates the lead table automatically during the normal database startup/retry.
- No additional database, service, paid plan, or secret is required.
- The intake does not request credentials, files, stolen data, or system access.
- A listing from a ransomware leak site is an allegation until independently corroborated.
- A submitted request is not a paid order, incident confirmation, or promise of a completed report.
- The lead is persisted before Telegram notification; a notification failure does not erase the lead.
- `/cyberreport` starts the flow; `/cancel` cancels it.

## Deployment verification
The changes are committed to the repository's default branch. Runtime activation depends on the existing deployment pipeline completing successfully. Verify the current bot's deployment/logs and submit one internal test lead before announcing the intake as live. Do not send test leads to real companies without authorization.
