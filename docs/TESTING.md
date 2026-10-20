# Test report (actual runs, 2026-10-14, authoring environment)

| Suite | Command | Result |
|---|---|---|
| Backend unit + API + PayPal (mocked transport) | `cd backend && python -m pytest -q` | **55 passed** |
| Frontend unit | `cd frontend && npx vitest run` | **4 passed** |
| Frontend typecheck + build | `npm run build` | passed |
| Browser E2E (Chromium, desktop 1280×900 + mobile 390×844) | `cd backend && python -m pytest tests_e2e -q` (server running) | **3 passed** |
| Mutation spot-checks | manually broke 3 safety rules (capture w/o approval, DENY bypass, agent-supplied price) | each broke ≥1 test; originals restored, all passing |

## Defects found and fixed by testing
1. **`database is locked` on real server (HTTP 500 on the main workflow).** The simulator used a second DB connection while the request transaction held a write lock. Unit tests had used a single shared in-memory connection and missed it; found by browser E2E. Fix: commit intent + audit before any external provider call; tests now use a file-backed SQLite DB. Regression verified (9 tests fail with the old code, 0 with the fix).
2. E2E test bug (toggling an already-open `<details>`); test corrected.

## Not verified
Live PayPal sandbox (no credentials), Docker/docker-compose build, PostgreSQL, the optional LLM planner against the real API (only mocked transport), dependency vulnerability scan, accessibility audit with assistive technology, load testing.

## Final verification (2026-10-20, before publishing)

| Suite | Result |
|---|---|
| `cd backend && .venv/bin/python -m pytest -q` | **60 passed** |
| `cd frontend && npx vitest run` | **41 passed** (5 files) |
| `cd frontend && npx tsc --noEmit && npm run build` | clean |
| `cd backend && .venv/bin/python -m pytest tests_e2e -q` (simulation server) | **5 passed** |

The storefront was added after the first publish: product catalog/search, a checkout modal with client-side mandate
pre-checks (the server still re-checks), and a guarded order path. New coverage: `test_catalog_exposes_products_and_untrusted_descriptions`,
`store.test.ts`, and `test_storefront_checkout_creates_guarded_order`.

Two issues surfaced while running the expanded E2E suite in one session:

1. **429 responses from the app's own polling.** The UI fetched six endpoints every 8 seconds (45 requests/min/tab),
   so several open tabs exhausted the 120/min limit. Added `GET /api/workspace`, a single snapshot the UI now polls;
   the per-feature endpoints remain for actions and tests.
2. **E2E tabs were never closed**, so their polling continued between tests. The suite now closes every browser
   context after each test.

One flaky test was found and fixed here: `test_monthly_budget_enforced_across_purchases` asserted an auto-approved
order, but the risk model legitimately escalates a first-time purchase made outside business hours, so the result
depended on the wall clock. The test now approves the purchase if it was escalated before checking the monthly cap.

## Update
- Added `test_stale_unapproved_order_expires_and_releases_budget` after the PayPal docs check showed orders expire; the first run of this test failed because of a wrong expectation in the test itself (the routine scenario creates two orders), fixed. Backend total: 55 passing. Browser E2E re-run after the change: see command above (3 passed).
