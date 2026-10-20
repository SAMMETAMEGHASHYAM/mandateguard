"""Browser E2E against a RUNNING server (default http://localhost:8000, simulation mode).

Run:
    cd frontend && npm run build
    cd backend && uvicorn app.main:get_app --factory --port 8000
    cd backend && .venv/bin/python -m pytest tests_e2e -q

The suite unlocks the UI with the documented simulation key, exercises the full
proposal -> approval -> signed webhook -> capture path, and writes the screenshots
referenced by the README.
"""
import os

import httpx
import pytest
from playwright.sync_api import expect, sync_playwright

BASE = os.environ.get("E2E_BASE", "http://localhost:8000")
SHOTS = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "docs", "screenshots")
)
os.makedirs(SHOTS, exist_ok=True)

try:
    httpx.get(f"{BASE}/api/health", timeout=2)
except Exception:
    pytest.skip("server not running", allow_module_level=True)


@pytest.fixture(scope="module")
def browser():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        yield browser
        browser.close()


@pytest.fixture(autouse=True)
def close_contexts(browser):
    """Close every tab after each test.

    Open tabs keep polling the workspace every 8 seconds. Leaving them open
    across tests exhausted the per-key rate limit and made later tests read
    429 responses instead of the state they just created.
    """
    yield
    for context in browser.contexts:
        context.close()


def new_page(browser, width=1280, height=900):
    context = browser.new_context(viewport={"width": width, "height": height})
    page = context.new_page()
    page.goto(BASE)
    return page


def unlock(page):
    page.get_by_role("button", name="Explore the seeded simulation").click()
    expect(page.get_by_text("Give the agent a goal")).to_be_visible()


def open_scenarios(page):
    details = page.locator("details.scenarios")
    if not details.evaluate("(el) => el.open"):
        page.locator("summary", has_text="Demo scenarios").click()


def test_gate_shows_mode_and_owner_access(browser):
    page = new_page(browser)
    expect(page.get_by_role("heading", name="Owner access")).to_be_visible()
    expect(page.get_by_text("Simulation mode")).to_be_visible()
    expect(page.get_by_role("button", name="Enter workspace")).to_be_disabled()
    page.screenshot(path=f"{SHOTS}/01-gate-desktop.png", full_page=True)


def test_full_user_journey(browser):
    errors: list[str] = []
    page = new_page(browser)
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on(
        "console",
        lambda message: errors.append(message.text)
        if message.type == "error"
        else None,
    )

    unlock(page)

    # The owner key is tab-scoped and survives a reload.
    page.reload()
    expect(page.get_by_text("Give the agent a goal")).to_be_visible()

    open_scenarios(page)
    page.get_by_role("button", name="Reset demo data").click()
    page.get_by_role("button", name="Reset everything").click()
    expect(page.get_by_text("No purchases yet")).to_be_visible()
    page.screenshot(path=f"{SHOTS}/02-dashboard-desktop.png", full_page=True)

    # 1. Natural-language goal -> server-priced proposal -> auto-created order.
    page.get_by_label("What should the agent buy?").fill(
        "buy 2 reams of printer paper under $40"
    )
    page.get_by_role("button", name="Send to agent").click()
    expect(page.locator(".purchase-amount .badge", has_text="Within mandate")).to_be_visible()
    expect(page.locator(".purchase-meta .badge", has_text="Order created")).to_be_visible()

    # 2. Buyer approval -> signed webhook -> verified capture.
    page.get_by_role("button", name="Simulate buyer approval").click()
    expect(page.locator(".purchase-meta .badge", has_text="Paid")).to_be_visible()
    page.screenshot(path=f"{SHOTS}/03-captured-desktop.png", full_page=True)

    # 3. Prompt-injection listing escalates; the oversize quantity is denied.
    open_scenarios(page)
    page.get_by_role("button", name="Poisoned listing").click()
    expect(page.get_by_text("INJECTION_SUSPECTED")).to_be_visible()
    expect(page.get_by_text("PER_PURCHASE_LIMIT")).to_be_visible()
    expect(
        page.locator(".purchase-amount .badge", has_text="Needs your approval")
    ).to_be_visible()

    # 4. The owner rejects the suspicious purchase.
    page.get_by_role("button", name="Reject").first.click()
    expect(page.locator(".purchase-meta .badge", has_text="Rejected")).to_be_visible()

    # 5. Audit log is hash-linked and verified.
    page.get_by_role("tab", name="Audit log").click()
    expect(page.get_by_text("BUYER APPROVED")).to_be_visible()
    expect(page.get_by_text("Audit chain verified")).to_be_visible()
    page.screenshot(path=f"{SHOTS}/05-audit-desktop.png", full_page=True)

    assert errors == [], f"browser errors: {errors}"


def test_mandate_validation_and_save(browser):
    page = new_page(browser)
    unlock(page)
    page.get_by_role("tab", name="Mandate").click()

    auto_approve = page.get_by_label("Auto-approve up to (USD)")
    auto_approve.fill("500")
    expect(page.get_by_role("alert")).to_contain_text("cannot exceed")
    expect(
        page.get_by_role("button", name="Save mandate")
    ).to_be_disabled()

    auto_approve.fill("50")
    page.get_by_role("button", name="Save mandate").click()
    expect(page.get_by_text("Mandate saved", exact=False)).to_be_visible()
    page.screenshot(path=f"{SHOTS}/04-mandate-desktop.png", full_page=True)


def test_storefront_checkout_creates_guarded_order(browser):
    page = new_page(browser)
    unlock(page)

    page.get_by_role("tab", name="Storefront").click()
    expect(page.get_by_text("Shop inside your mandate")).to_be_visible()
    expect(page.get_by_text("Demo catalog")).to_be_visible()
    page.screenshot(path=f"{SHOTS}/07-store-desktop.png", full_page=True)

    page.get_by_label("Search the catalog").fill("coffee")
    page.get_by_role("button", name="Buy now").click()
    expect(page.get_by_role("heading", name="Checkout")).to_be_visible()
    expect(
        page.get_by_text("Category, hard cap and monthly budget all pass.")
    ).to_be_visible()
    page.get_by_role("button", name="Place simulated order").click()

    expect(page.locator("#tab-purchases")).to_have_attribute(
        "aria-selected", "true"
    )
    expect(page.get_by_text("Coffee beans 1kg medium roast")).to_be_visible()


def test_mobile_layout_has_no_horizontal_overflow(browser):
    page = new_page(browser, 390, 844)
    expect(page.get_by_role("heading", name="Owner access")).to_be_visible()
    gate_overflow = page.evaluate(
        "document.documentElement.scrollWidth - document.documentElement.clientWidth"
    )
    assert gate_overflow <= 1, f"gate overflow {gate_overflow}px"

    unlock(page)
    page.get_by_role("tab", name="Storefront").click()
    expect(page.get_by_text("Shop inside your mandate")).to_be_visible()
    overflow = page.evaluate(
        "document.documentElement.scrollWidth - document.documentElement.clientWidth"
    )
    assert overflow <= 1, f"horizontal overflow {overflow}px"
    page.screenshot(path=f"{SHOTS}/06-mobile.png", full_page=True)
