"""Browser E2E against a RUNNING server (default http://localhost:8000, simulation mode).
Run: python -m pytest tests_e2e -q    (start the backend first; UI must be built: cd frontend && npm run build)"""
import os
import pytest
import httpx
from playwright.sync_api import expect, sync_playwright

BASE = os.environ.get("E2E_BASE", "http://localhost:8000")
SHOTS = os.path.join(os.path.dirname(__file__), "..", "..", "docs", "screenshots")

try:
    httpx.get(f"{BASE}/api/health", timeout=2)
except Exception:
    pytest.skip("server not running", allow_module_level=True)


@pytest.fixture(scope="module")
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


def new_page(browser, w, h):
    ctx = browser.new_context(viewport={"width": w, "height": h})
    page = ctx.new_page()
    page.goto(BASE)
    return page


def test_full_user_journey_desktop(browser):
    page = new_page(browser, 1280, 900)
    expect(page.get_by_text("SIMULATION: no real PayPal transactions")).to_be_visible()
    page.get_by_text("Demo scenarios (simulation only)").click()
    page.once("dialog", lambda d: d.accept())
    page.get_by_role("button", name="Reset demo data").click()
    expect(page.get_by_text("No purchases yet")).to_be_visible()

    # 1. natural-language goal -> auto-approved (within mandate) simulated order
    page.get_by_label("What should the agent buy?").fill("buy 2 reams of printer paper under $40")
    page.get_by_role("button", name="Send to agent").click()
    expect(page.get_by_text("Within mandate").first).to_be_visible()
    expect(page.get_by_text("SIMULATED order").first).to_be_visible()

    # 2. buyer approval -> signed webhook -> verified capture
    page.get_by_role("button", name="Simulate buyer approval").click()
    expect(page.get_by_text("CAPTURED").first).to_be_visible()
    page.screenshot(path=f"{SHOTS}/01-captured-desktop.png", full_page=True)

    # 3. prompt-injection scenario: must be escalated/blocked, no order created (panel is still open from step 0)
    page.get_by_role("button", name="Poisoned listing (prompt injection)").click()
    expect(page.get_by_text("INJECTION_SUSPECTED")).to_be_visible()
    expect(page.get_by_text("PER_PURCHASE_LIMIT")).to_be_visible()
    expect(page.get_by_text("Needs your approval").first).to_be_visible()
    page.screenshot(path=f"{SHOTS}/02-injection-blocked-desktop.png", full_page=True)

    # 4. human rejects the suspicious purchase
    page.get_by_role("button", name="Reject").first.click()
    expect(page.get_by_text("REJECTED").first).to_be_visible()

    # 5. audit tab shows a verified chain
    page.get_by_role("tab", name="Audit log").click()
    expect(page.get_by_text("BUYER_APPROVED")).to_be_visible()
    expect(page.get_by_text("Audit chain verified")).to_be_visible()
    page.screenshot(path=f"{SHOTS}/03-audit-desktop.png", full_page=True)


def test_mandate_validation_and_save(browser):
    page = new_page(browser, 1280, 900)
    page.get_by_role("tab", name="Mandate").click()
    page.get_by_label("Auto-approve up to (USD)").fill("500")
    expect(page.get_by_role("alert")).to_contain_text("cannot exceed")
    expect(page.get_by_role("button", name="Save mandate")).to_be_disabled()
    page.get_by_label("Auto-approve up to (USD)").fill("50")
    page.get_by_role("button", name="Save mandate").click()
    expect(page.get_by_text("Mandate saved.")).to_be_visible()


def test_mobile_layout_has_no_horizontal_overflow(browser):
    page = new_page(browser, 390, 844)
    expect(page.get_by_text("MandateGuard").first).to_be_visible()
    overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    assert overflow <= 1, f"horizontal overflow {overflow}px"
    page.screenshot(path=f"{SHOTS}/04-mobile.png", full_page=True)
