# Known limitations (honest list)

- **PayPal sandbox integration is mock-tested only.** On 2026-10-14 I checked the client against PayPal's current public docs (developer.paypal.com / docs.paypal.ai): Orders v2 create with `payment_source.paypal.experience_context`, the `payer-action` link and `PAYER_ACTION_REQUIRED` status, `PayPal-Request-Id` idempotency, and `/v1/notifications/verify-webhook-signature` fields + `verification_status: SUCCESS` all match what the code sends/parses. **Residual risks to test live:** (a) the verify endpoint receives the webhook body re-serialised from parsed JSON; if verification unexpectedly fails on real events, forward exact bytes instead; (b) whether the default token scope suffices for verification; (c) real response field details I could not see without credentials.
- Orders expire (docs: ~3 h to capture). Unapproved orders are marked `EXPIRED` lazily (on next request) and their reserved budget is released; there is no background scheduler.
- The default demo runs in **simulation**; simulated orders are not PayPal transactions and are labelled as such everywhere.
- Risk model is trained and evaluated on **synthetic data** with labels from the same generator as the features; recall ≈0.66 at precision ≈0.94 there (docs/EVAL_RESULTS.md). It says nothing about real-world accuracy. That is why it is advisory/escalate-only.
- The storefront is a UI over the same synthetic catalog (13 items). There is no cart persistence, inventory, shipping, tax, or real merchant account; checkout creates a PayPal order for the demo merchant. A real product source (e.g. a Channel3 adapter) is not implemented.
- Auth is two static API keys (demo); no user accounts or multi-tenant isolation. Single mandate.
- Rate limit and planner cache are in-memory (single process).
- Docker files untested here; Postgres untested.
- No refunds/disputes/subscriptions flows.
- The LLM planner path is exercised only with a mocked HTTP transport; model name is configurable and should be checked against current Anthropic docs.
- No real users, no adoption evidence; "impact" claims are prospective.
