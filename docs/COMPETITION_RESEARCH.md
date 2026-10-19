# Competition research (accessed 2026-10-14)

Label key: **VERIFIED** = stated on official page; **INFERENCE** = derived; **UNKNOWN** = not found.

| Item | Finding | Label | Source |
|---|---|---|---|
| Identity | "PayPal AI Hackathon – Build what's next with PayPal and AI", sponsor PayPal Inc., administered by Devpost | VERIFIED | https://paypalaihackathon.devpost.com/ , /rules |
| Dates | Submit Oct 1 – **Nov 12 2026 12:00 pm PT**; judging Dec 1–15; winners ~Dec 21 | VERIFIED | /rules §1 |
| Eligibility | Age of majority; individuals, teams, orgs; sanctioned regions excluded; no team-size cap | VERIFIED | /rules §3 |
| Core requirement | Must integrate PayPal developer platform (free sandbox) AND meaningfully use AI; "PayPal integration central" | VERIFIED | overview, /rules §4 |
| Submission | Working project, text description, tools used, public repo with visible OSS license, <3 min YouTube demo showing the project functioning | VERIFIED | /rules §4 |
| Functional demo | Run instructions or hosted URL; mockups/non-functional demos do not qualify | VERIFIED | /rules §4 |
| Judging | Stage 1 pass/fail (theme + required APIs); Stage 2 five **equally weighted** criteria: Technological Implementation, Design, Potential Impact, Innovation/Idea, Presentation; tie-break by criteria order | VERIFIED (weights: "equally weighted"; 20% each is INFERENCE) | /rules §6 |
| Judging method | May include expert panels and automated AI-driven analysis | VERIFIED | /rules §6 |
| Prizes | $67,500+ cash: 1st $12k, 2nd $8k, 3rd $5k; honorable mentions $5k (Creative, Impactful, Demo Delivery, PayPal+AI, Agentic Commerce); sponsor prizes | VERIFIED | /rules §8 |
| AI-generated code rules | Not addressed. Originality/ownership clause applies; disclose tools used | UNKNOWN | /rules |
| Prior editions / past winners | No prior edition of this event found. A 2025 PayPal China hackathon exists (different event, different rules) | UNKNOWN for this event | search results |
| Competition scale | 13,7xx participants registered at time of access | VERIFIED | Devpost page |

**Not done:** Phase 2 winner analysis. There is no prior edition of this event to study, and I have not reviewed the live project gallery (https://paypalaihackathon.devpost.com/project-gallery) for overlap. Do that before final submission.

## Criteria → product evidence
| Criterion | Evidence in this repo |
|---|---|
| Technological Implementation | Orders v2 create/get/capture, OAuth, idempotency keys, retries, webhook verification + dedupe, hash-chained audit, ML risk model with baselines, strict LLM-output validation; 54 + 4 + 3 tests |
| Design | Single coherent flow in the UI: goal → decision with reasons → approval → capture → audit; accessible, responsive, light/dark; screenshots in docs/screenshots |
| Potential Impact | Concrete problem (agent overspend / prompt-injected purchases) for small businesses and individuals delegating purchasing to agents. *No user validation yet.* |
| Innovation/Idea | Separation of probabilistic AI from deterministic money rules; escalate-only risk; untrusted-listing injection scenario demonstrated end-to-end |
| Presentation | docs/DEMO_SCRIPT.md (≤3 min), deterministic scenarios that run offline |
