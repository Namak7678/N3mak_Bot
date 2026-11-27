# Revenue Recovery — Market Validation Pack

**Date:** 2026-11-18  
**Status:** Research hypothesis; customer willingness to pay is NOT yet proven  
**Parent project:** `Namak7678/N3mak_Bot`  
**Commercial goal:** First 10 paying customers, with 3 paid pilots as the initial validation gate

## 1. Product thesis

**Revenue Recovery is a lightweight unsold-estimate recovery desk for small roofing and home-service contractors.**

It does not replace their CRM, quoting, dispatch, or invoicing system. It imports open/unsold estimates from the system they already use, highlights high-value stale quotes, prepares a sensible follow-up sequence, and records whether each quote was won, lost, or remains open.

Positioning: **Recover the quotes your team forgot — without replacing your existing software.**

## 2. Initial ideal customer profile (hypothesis)

Start with owner-led roofing contractors and exterior-renovation businesses in the US, UK, Canada, and Australia.

Qualification hypotheses to test (not verified facts about the listed companies):
- Approximately 5–30 field/office staff, or an owner plus an office coordinator.
- At least 20 open or unsold estimates in a typical month.
- Quotes are currently followed up manually, inconsistently, or across spreadsheets/email.
- They already pay to generate leads and can identify the value of one recovered job.
- They are not already running a disciplined estimate-recovery workflow in ServiceTitan, Hatch, Jobber, Housecall Pro, or another incumbent.

Do not target one-person operators with very low quote volume or large enterprises with a dedicated sales-recovery team in the first pilot cohort.

## 3. Market evidence and limits

- Quo reports analysis of 16.7 million missed calls across its customers; 69% did not receive a callback within 48 hours. This supports a broader follow-up problem, but it is not direct proof that roofing firms will buy this product.
- Jobber's 2026 Home Service Trends report says only 11% of HVAC pros respond to new leads within an hour; it also reports that 60% of pros respond the same day. This supports the speed-to-lead problem, not our specific product's conversion rate.
- A June 2026 idea assessment of unsold-estimate follow-up identifies a narrow opportunity for smaller contractors who have quote volume but weak process ownership. It also names active competitors, so this is not an empty market.
- Jobber already includes quote and invoice follow-up in its product tiers. We must therefore sell cross-system recovery, stale-quote prioritization, and outcome visibility — not merely a reminder feature.

Sources:
- https://www.quo.com/blog/small-business-callback-statistics/
- https://www.getjobber.com/home-service-trends-report/
- https://research.briankeefe.dev/20260601-unsold-estimate-follow-up-workspace-for-home-service-contractors.html
- https://www.getjobber.com/pricing/

**Evidence distinction:** Industry reports establish that follow-up failures exist. Competitor prices establish that businesses already pay for adjacent software. Neither establishes willingness to pay for Revenue Recovery. Only real prospect conversations and collected pilot payments can do that.

## 4. Competitor map

| Competitor | Strength | Implication for Revenue Recovery |
|---|---|---|
| Jobber | Contractor CRM, quoting, invoicing, and quote/invoice follow-up | Do not rebuild field-service management; win on importing quotes from multiple existing systems and focused recovery reporting |
| GoHighLevel | Broad CRM, marketing, SMS, and workflow automation; public plans around $97–$497/month | Easier to explain a focused product with less setup and no agency-style configuration |
| HubSpot | General CRM with free and paid tiers | Competes for pipeline visibility, but not purpose-built for stale contractor estimates |
| Hatch | Multichannel AI customer-service and follow-up campaigns; sales-led pricing | Competes higher upmarket; avoid expensive omnichannel scope in v1 |
| Podium | Local-business messaging/reputation suite; public pricing substantially higher than a narrow tool | Focus on estimate recovery, not reviews/reputation or a unified communications suite |
| ServiceTitan / Housecall Pro / other field-service suites | Existing systems of record with varying follow-up workflows | Integrate/import rather than replace; disqualify customers whose current workflow already solves the problem |

Pricing references (vendor pricing can change and may vary by billing term, seat count, and usage):
- Jobber: https://www.getjobber.com/pricing/
- HubSpot: https://www.hubspot.com/pricing/sales
- Hatch: https://www.usehatchapp.com/pricing
- GoHighLevel / competitor comparison: https://www.thestackinsiders.com/blog/gohighlevel-competitors

## 5. Initial prospect sample

These are public business listings selected as potential discovery prospects. They have **not** been contacted, qualified, or confirmed as buyers. Employee count, estimate volume, software stack, and willingness to pay are unknown and must be checked in conversation.

| Company | Market | Public phone | Why include in discovery |
|---|---|---|---|
| LOA Construction and Austin Roofing | Austin, US | +1 512-375-3654 | Roofing and restoration work; test quote-volume and follow-up process |
| Clear Choice Roofing | Austin, US | +1 512-640-2643 | Roofing/exterior services; test whether estimates are tracked after inspection |
| Ja-Mar Roofing & Sheet Metal | Austin, US | +1 512-441-8437 | Roofing and exterior work; test multi-service quote workflow |
| K.H. Roofing | Manchester, UK | +44 161 825 7408 | Family-run roofing contractor; test manual follow-up and quote aging |
| R. L. Lovatt Ltd | Greater Manchester, UK | +44 161 763 6090 | Roofing and solar; test longer-cycle estimate follow-up |
| Harley & Sons Roofing | Melbourne, Australia | +61 3 9738 2501 | Roofing/guttering contractor; test quote recovery workflow |
| Expert Plumbing & Gas Services | Melbourne, Australia | +61 3 8400 0429 | Plumbing/gas services; secondary segment comparison |
| C Plus Roofing | Markham/Toronto, Canada | +1 416-917-9622 | Roofing contractor; test open-estimate backlog |
| True Service Plumbing | Toronto, Canada | +1 647-200-5238 | Plumbing contractor; compare urgent-service versus quote-led workflow |
| The Coolest LLC | Austin, US | +1 512-468-6140 | HVAC contractor; compare HVAC follow-up behavior with roofing |

Lead sources were public business search listings on 2026-11-18. Verify phone numbers and current fit before outreach. Do not bulk-message or call without observing applicable local marketing and privacy rules.

## 6. Willingness-to-pay experiment

### Offer to test

**Founding Customer Pilot: $49/month, cancel anytime, first 30 days.**  
No setup fee. Limited to one business and up to 100 open estimates during the pilot. This is a proposed test price, not a validated market price.

Do not offer a free pilot as the main test. A free trial measures curiosity; a paid pilot tests willingness to pay.

### Interview questions

1. How many estimates did you send last month?
2. How many were still undecided or unanswered after seven days?
3. How do you currently decide who follows up, and when?
4. Can you show an anonymized export of open estimates from your current system?
5. What is one typical job worth, and what happens when a quote is never followed up?
6. If a tool recovered one additional job, would $49/month be reasonable? If not, what would need to change?
7. Will you start a 30-day paid pilot at $49 today?

Do not lead with the product pitch. First establish their current process and quantify the backlog.

### Pass/fail criteria

- **Pass:** 3 paid pilots collected from the first 10 qualified prospects; at least 5 prospects share an anonymized estimate export or walk through their actual workflow.
- **Continue testing:** 1–2 paid pilots; interview another 10 qualified businesses and revise the offer based on objections.
- **Stop or reposition:** 0 paid pilots after 20 qualified conversations, or most prospects already have an effective incumbent workflow.
- A verbal “sounds interesting,” email signup, or free-trial request does not count as paid validation.

### Outreach message (English)

Subject: Quick question about unsold roofing estimates

Hi {{FirstName}},

I’m researching how independent roofing contractors follow up on estimates that have been sent but not approved.

We’re testing a lightweight recovery desk that works alongside the software you already use. It highlights older, higher-value quotes, prepares follow-up messages for approval, and tracks which estimates turn into jobs — without asking you to replace your CRM.

Could I ask you three short questions about how your team currently follows up on open estimates? If the problem is real in your business, I can show you a small paid pilot. If your current process already handles it, that is useful to know too.

Best,  
N3mak Revenue Recovery

## 7. MVP scope — only after paid validation

### Include in v1
1. Business workspace with a single owner/admin.
2. CSV import of open estimates from an existing system.
3. Quote table with amount, quote date, customer contact, status, last contact, and next follow-up.
4. Aging and value prioritization (for example: 0–2, 3–7, 8–14, and 15+ days).
5. AI-assisted follow-up drafts grounded only in imported quote data and approved company information.
6. Human approval before any customer message is sent.
7. Follow-up event log and outcome labels: won, lost, open, do-not-contact.
8. A simple weekly recovered-pipeline report.

### Exclude from v1
- Replacing CRM, scheduling, quoting, invoicing, or dispatch.
- Automated cold outreach.
- Unapproved autonomous messages.
- SMS, WhatsApp, voice AI, and multi-channel inbox until channel demand and compliance costs are verified.
- Multi-location enterprise features.
- Complex native integrations before the CSV workflow is proven.

### MVP success metrics
- Time from CSV import to first useful follow-up draft: under 10 minutes.
- At least 80% of imported rows map correctly after a preview/confirmation step.
- Every sent follow-up has an event record and opt-out/do-not-contact status.
- Pilot owner can identify the total value and age of open estimates.
- Report actual recovered jobs and collected revenue separately from attributed or merely re-opened conversations.

## 8. Existing N3mak assets and engineering constraints

Verified in `Namak7678/N3mak_Bot`:
- `bot/src/index.js`: existing Express/Telegraf server entry point.
- `bot/src/db.js`: PostgreSQL pool and existing user/deposit/portfolio schema.
- `bot/src/llm.js`: OpenAI-compatible OmniRoute client.
- `bot/package.json`: Node.js service with Express, PostgreSQL, Redis, Stripe, Telegraf, and node-cron.
- `web/package.json`: existing Next.js 14 application.
- `web/app/globals.css`: existing web styling.
- `bot/src/trial/gateway.js`: existing Cloudflare Gateway client.

Current repository observations:
- PR #13, "fix(bot): restore payment modules and idempotent confirmations", is open and not merged. Its description reports 11 isolated tests passing, but explicitly says no full production build or live Telegram/Whop payment test was performed.
- The repository README currently positions the product as a Telegram + Whop AI gateway, not a Revenue Recovery SaaS.
- Existing Whop checkout links in README are one-time products; do not assume recurring SaaS billing is configured.
- SARA is not yet a confirmed integrated feature in the main branch.
- Production deployment and live payment status must be rechecked before release.

### Recommended implementation boundary

Keep Revenue Recovery isolated inside the existing repository. Proposed new module boundary: `bot/src/revenue-recovery/` for quote import, prioritization, follow-up draft generation, and event logging. Reuse the existing PostgreSQL pool and OmniRoute client; add dedicated tables rather than changing the existing `users`, `deposits`, or `portfolios` tables. Reuse the existing web app only after inspecting its actual route structure. Do not create another bot, repository, Vercel project, or paid cloud service.

The exact email-sending provider, subscription payment provider, and production deployment target remain open decisions. Do not create paid resources or change production secrets without explicit approval.

## 9. Next actions

1. Contact the first 10 prospects individually and record the response and objections.
2. Conduct at least 5 discovery conversations.
3. Ask for anonymized quote exports from qualified prospects.
4. Collect 3 paid $49 pilots before committing to full MVP implementation.
5. Once the gate passes, implement the CSV-first MVP in this repository using test-driven development and a reviewable pull request.
