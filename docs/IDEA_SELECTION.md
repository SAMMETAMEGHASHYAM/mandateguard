# Idea selection

**Honest scope note:** the full 10-concept weighted-matrix exercise requested in the project directive was *not* performed with
rigorous scoring. The choice below was made quickly against the five official criteria; the table is a qualitative planning aid, not measured evidence.

| Concept | Why considered | Verdict |
|---|---|---|
| **Spending guardrails for AI shopping agents (MandateGuard)** | Targets the named "Agentic Commerce" prize; security story is demonstrable in 3 min; AI/ML is non-trivial but bounded; one developer can finish | **Chosen** |
| Merchant dispute-resolution assistant | Real pain, but PayPal disputes API access is restricted; hard to demo in sandbox | Rejected: API access risk |
| Invoice/reconciliation copilot | Useful; crowded category; AI mostly LLM summarisation | Rejected: weak differentiation |
| Fraud-scoring dashboard | Classic; Simility is PayPal-owned; synthetic-only data weakens claims | Rejected: unconvincing without real data |
| Conversational checkout chatbot | Very common hackathon pattern | Rejected: generic |
| Subscription-optimiser agent | Plausible; needs Subscriptions setup + long-lived state to demo | Rejected: demo complexity |
| Payout automation for freelancers | Payouts needs extra account permissions | Rejected: access risk |
| Price-comparison shopping agent (Channel3 etc.) | Sponsor prize; depends on external API/credits | Possible extension: a Channel3 adapter replacing the synthetic catalog |
| Accessibility voice payments | Good impact; heavy speech stack | Rejected: scope |
| Receipt-to-ledger expense categoriser | Common; little PayPal depth | Rejected |

Sensitivity: if the project gallery shows many near-identical "agent guardrail" entries, the fallback differentiator is the real-sandbox end-to-end + audit chain + injection demo; reassess then.
