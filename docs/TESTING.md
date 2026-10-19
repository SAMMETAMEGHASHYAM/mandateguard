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

## Update
- Added `test_stale_unapproved_order_expires_and_releases_budget` after the PayPal docs check showed orders expire; the first run of this test failed because of a wrong expectation in the test itself (the routine scenario creates two orders), fixed. Backend total: 55 passing. Browser E2E re-run after the change: see command above (3 passed).
