PYTHON ?= $(shell command -v python3.13 || command -v python3.12 || command -v python3.11 || command -v python3)
VENV := backend/.venv

.PHONY: setup train test test-backend test-frontend e2e build dev-backend dev-frontend demo

# The app uses modern typing (X | None) and needs Python 3.11+.
$(VENV)/bin/python:
	$(PYTHON) -c 'import sys; assert sys.version_info >= (3, 11), "Python 3.11+ is required"'
	$(PYTHON) -m venv $(VENV)
	$(VENV)/bin/python -m pip install --upgrade pip
	$(VENV)/bin/pip install -r backend/requirements-dev.txt

setup: $(VENV)/bin/python
	cd backend && .venv/bin/python scripts/train_risk.py
	cd frontend && npm install

train:
	cd backend && .venv/bin/python scripts/train_risk.py

test: test-backend test-frontend

test-backend:
	cd backend && .venv/bin/python -m pytest -q

test-frontend:
	cd frontend && npx vitest run

build:
	cd frontend && npm run build

dev-backend:
	cd backend && .venv/bin/uvicorn app.main:get_app --factory --reload --port 8000

dev-frontend:
	cd frontend && npm run dev

# One command: build the UI, then serve UI + API on http://localhost:8000 (simulation mode).
demo: build $(VENV)/bin/python
	cd backend && .venv/bin/uvicorn app.main:get_app --factory --port 8000

e2e:
	cd backend && .venv/bin/python -m pytest tests_e2e -q
