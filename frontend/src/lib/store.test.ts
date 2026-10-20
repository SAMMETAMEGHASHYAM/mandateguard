import { describe, expect, it } from "vitest";
import type { CatalogItem, Mandate } from "../api";
import { categoryLabel, checkoutCheck } from "../lib/store";

const item: CatalogItem = {
  sku: "COF-001",
  title: "Coffee beans 1kg medium roast",
  category: "pantry",
  merchant: "BeanBox Demo",
  unit_cents: 1899,
  description: "Whole bean arabica.",
};

const mandate: Mandate = {
  name: "Test",
  currency: "USD",
  per_purchase_limit_cents: 15000,
  auto_approve_limit_cents: 5000,
  monthly_limit_cents: 50000,
  max_purchases_per_day: 5,
  allowed_categories: ["office_supplies", "pantry"],
  trusted_merchants: ["BeanBox Demo"],
  blocked_merchants: [],
  active: true,
};

describe("checkoutCheck", () => {
  it("allows an item inside every limit", () => {
    const result = checkoutCheck(item, mandate, 0, 2);
    expect(result.totalCents).toBe(3798);
    expect(result.blocked).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it("blocks a category outside the mandate", () => {
    const gift = { ...item, category: "gift_cards", merchant: "GiftHub Demo" };
    expect(checkoutCheck(gift, mandate, 0, 1).reasons.join(" ")).toContain(
      "Gift Cards is outside",
    );
  });

  it("blocks the per-purchase hard cap", () => {
    expect(checkoutCheck(item, mandate, 0, 10).blocked).toBe(true);
  });

  it("blocks purchases that exceed the monthly budget", () => {
    const result = checkoutCheck(item, mandate, 48000, 2);
    expect(result.blocked).toBe(true);
    expect(result.reasons.join(" ")).toContain("monthly budget");
  });

  it("blocks a blocked merchant and a paused mandate", () => {
    expect(
      checkoutCheck(
        item,
        { ...mandate, blocked_merchants: ["BeanBox Demo"] },
        0,
        1,
      ).blocked,
    ).toBe(true);
    expect(
      checkoutCheck(item, { ...mandate, active: false }, 0, 1).blocked,
    ).toBe(true);
  });

  it("warns above auto-approve and for untrusted merchants without blocking", () => {
    const result = checkoutCheck(
      item,
      { ...mandate, auto_approve_limit_cents: 1000, trusted_merchants: [] },
      0,
      1,
    );
    expect(result.blocked).toBe(false);
    expect(result.notes).toHaveLength(2);
  });

  it("formats category labels for humans", () => {
    expect(categoryLabel("office_supplies")).toBe("Office Supplies");
    expect(categoryLabel("gift_cards")).toBe("Gift Cards");
  });
});
