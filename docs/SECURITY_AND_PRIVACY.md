# Security & privacy (prototype; not audited)

| Threat | Control | Test |
|---|---|---|
| Agent/LLM invents a price or SKU | Price from server catalog; SKU/qty validated; LLM output parsed strictly | `test_agent_cannot_set_price...`, `test_llm_output_is_untrusted...` |
| Prompt injection via listing text | Injection detector → forced human review; policy limits independent of model | `test_poisoned_listing_...`, `test_injection_detected` |
| Agent self-approves | Separate owner/agent keys; 403 for agent on approve/capture/mandate | `test_auth_required_and_roles` |
| Approval overrides hard limits | Deny rules re-evaluated at approval time; incoherent mandates rejected at the API edge | `test_approval_cannot_override_mandate_limits`, `test_mandate_rejects_incoherent_limits` |
| Browser redirect treated as payment proof | Capture only after provider `GET order` == APPROVED and amount matches | `test_..._full_capture_via_webhook`, capture-before-approval 409 |
| Webhook forgery | Signature verified (PayPal verify API in sandbox; HMAC in simulator); fails closed | `test_webhook_*` |
| Replay / duplicates | Unique `event_id`; `PayPal-Request-Id`; `Idempotency-Key` on proposals | `test_webhook_rejects_bad_signature_and_deduplicates`, `test_idempotency_key_...` |
| Secrets | Env-only; `.env*` gitignored; sandbox refuses default API keys; live base URL refused | `test_config_safety_guards` |
| Owner key leaking through the UI bundle | The browser asks for the key at runtime and keeps it in `sessionStorage`; no `VITE_OWNER_KEY` exists and `frontend.env.rtf` was removed | manual bundle inspection |
| Audit tampering | Hash chain; verify endpoint; full SHA-256 hashes exposed to the owner | `test_audit_chain_detects_tampering`, `test_audit_returns_full_hashes` |
| Abuse / cost | Rate limiter; LLM daily call budget; planner cache; bounded retries | `test_rate_limiter` |
| Clickjacking / MIME sniffing / referrer leakage | `Content-Security-Policy`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`; API responses are `no-store` | `test_security_headers_and_private_api_caching` |

## Authentication model

- Two long-lived bearer keys are configured server-side: `OWNER_API_KEY` (approve, capture, mandate) and `AGENT_API_KEY` (propose only).
- The dashboard unlocks with the owner key, verifies it against `GET /api/mandate`, and stores it in tab-scoped `sessionStorage`. Closing the tab logs out; **Lock** clears it immediately.
- Requests carry `X-API-Key`. APIs are JSON-only and mutations use custom headers rather than cookies, so classic CSRF does not apply; CORS is restricted to the configured frontend origin and `http://localhost:5173`.
- The strict CSP (`script-src 'self'`) plus first-party-only assets limit the injection surface that could read the stored key.

## Gaps (explicit)

- No user accounts, OAuth or multi-tenancy: two static keys and a single mandate.
- `sessionStorage` is readable by any script running as the app origin. CSP reduces but does not eliminate XSS risk; a production build should use an httpOnly session cookie with CSRF protection and key rotation.
- In-memory rate limiter, cache and API-key comparison are single-process; there is no distributed rate limiting or key management.
- No dependency vulnerability scan, penetration test or assistive-technology audit has been run.
- Sandbox webhook verification has not been exercised against PayPal's live service.
- No PCI DSS/GDPR compliance claims. All demo data is synthetic; the app never handles card data (PayPal hosts approval).

If a key was ever committed to the repository, **rotate it** — removing the file does not remove it from git history.
