# Security & privacy (prototype; not audited)

| Threat | Control | Test |
|---|---|---|
| Agent/LLM invents a price or SKU | Price from server catalog; SKU/qty validated; LLM output parsed strictly | `test_agent_cannot_set_price...`, `test_llm_output_is_untrusted...` |
| Prompt injection via listing text | Injection detector → forced human review; policy limits independent of model | `test_poisoned_listing_...`, `test_injection_detected` |
| Agent self-approves | Separate owner/agent keys; 403 for agent on approve/capture/mandate | `test_auth_required_and_roles` |
| Approval overrides hard limits | Deny rules re-evaluated at approval time | `test_approval_cannot_override_mandate_limits` |
| Browser redirect treated as payment proof | Capture only after provider `GET order` == APPROVED and amount matches | `test_..._full_capture_via_webhook`, capture-before-approval 409 |
| Webhook forgery | Signature verified (PayPal verify API in sandbox; HMAC in simulator); fails closed | `test_webhook_*` |
| Replay / duplicates | Unique `event_id`; `PayPal-Request-Id`; `Idempotency-Key` on proposals | `test_webhook_rejects_bad_signature_and_deduplicates`, `test_idempotency_key_...` |
| Secrets | Env-only; `.env` gitignored; sandbox mode refuses default API keys; live base URL refused | `test_config_safety_guards` |
| Audit tampering | Hash chain; verify endpoint | `test_audit_chain_detects_tampering` |
| Abuse / cost | Rate limiter; LLM daily call budget; planner cache; bounded retries | `test_rate_limiter` |

**Gaps:** no user accounts (two static API keys); the UI ships the owner key via `VITE_OWNER_KEY` (demo only); no CSRF/session model; in-memory rate limiter and cache (single process); no dependency audit run;
sandbox signature verification not yet exercised against PayPal; no claims of PCI DSS/GDPR compliance. All demo data is synthetic. No card data is handled by this app (PayPal hosts approval).
