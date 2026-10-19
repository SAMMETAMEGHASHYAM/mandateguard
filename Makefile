.PHONY: setup train test e2e build dev-backend dev-frontend demo
setup:
	cd backend && pip install -r requirements-dev.txt && python scripts/train_risk.py >/dev/null
	cd frontend && npm install
train:
	cd backend && python scripts/train_risk.py
test:
	cd backend && python -m pytest -q && cd ../frontend && npx vitest run
build:
	cd frontend && npm run build
dev-backend:
	cd backend && uvicorn app.main:get_app --factory --reload --port 8000
dev-frontend:
	cd frontend && npm run dev
# one command: build UI, serve UI + API on http://localhost:8000 (simulation mode)
demo: build
	cd backend && uvicorn app.main:get_app --factory --port 8000
e2e:
	cd backend && python -m pytest tests_e2e -q   # needs a running server + `playwright install chromium`
