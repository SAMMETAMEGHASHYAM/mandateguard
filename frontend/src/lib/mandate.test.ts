import { describe, expect, it } from "vitest";
import type { Mandate } from "../api";
import {
  applyPreset,
  formToMandate,
  mandateToForm,
  PRESETS,
  toggleCategory,
  validateMandate,
  type MandateForm,
} from "./mandate";

const mandate: Mandate = {
  id: 1,
  name: "Default mandate",
  currency: "USD",
  per_purchase_limit_cents: 15000,
  auto_approve_limit_cents: 5000,
  monthly_limit_cents: 50000,
  max_purchases_per_day: 5,
  allowed_categories: ["office_supplies", "electronics"],
  trusted_merchants: ["OfficeDepot Demo"],
  blocked_merchants: ["QuickDeals"],
  active: true,
};

function form(overrides: Partial<MandateForm> = {}): MandateForm {
  return { ...mandateToForm(mandate), ...overrides };
}

describe("mandate form mapping", () => {
  it("converts cents to dollars and back", () => {
    const mapped = mandateToForm(mandate);
    expect(mapped.autoApprove).toBe(50);
    expect(mapped.perPurchase).toBe(150);
    expect(mapped.monthly).toBe(500);
    expect(mapped.daily).toBe(5);
    expect(mapped.categories).toBe("office_supplies, electronics");
  });

  it("round-trips without losing limits", () => {
    const result = formToMandate(mandateToForm(mandate), mandate);
    expect(result.per_purchase_limit_cents).toBe(15000);
    expect(result.auto_approve_limit_cents).toBe(5000);
    expect(result.monthly_limit_cents).toBe(50000);
    expect(result.max_purchases_per_day).toBe(5);
    expect(result.allowed_categories).toEqual(["office_supplies", "electronics"]);
    expect(result.active).toBe(true);
  });

  it("trims names and drops empty list entries", () => {
    const result = formToMandate(
      form({
        name: "  Team budget  ",
        trusted: " OfficeDepot Demo ,, TechMart Demo ",
        categories: "office_supplies, ",
      }),
      mandate,
    );
    expect(result.name).toBe("Team budget");
    expect(result.trusted_merchants).toEqual([
      "OfficeDepot Demo",
      "TechMart Demo",
    ]);
    expect(result.allowed_categories).toEqual(["office_supplies"]);
  });

  it("rounds fractional dollars to whole cents", () => {
    const result = formToMandate(form({ autoApprove: 12.345 }), mandate);
    expect(result.auto_approve_limit_cents).toBe(1235);
  });
});

describe("validateMandate", () => {
  it("accepts a coherent mandate", () => {
    expect(validateMandate(form())).toBeNull();
  });

  it("requires a name", () => {
    expect(validateMandate(form({ name: "  " }))).toMatch(/name/i);
  });

  it("rejects negative limits", () => {
    expect(validateMandate(form({ monthly: -1 }))).toMatch(/monthly/i);
  });

  it("keeps auto-approve below the per-purchase cap", () => {
    expect(validateMandate(form({ autoApprove: 200, perPurchase: 150 }))).toMatch(
      /auto-approve/i,
    );
  });

  it("keeps the per-purchase cap inside the monthly budget", () => {
    expect(
      validateMandate(form({ perPurchase: 600, monthly: 500, autoApprove: 50 })),
    ).toMatch(/per-purchase/i);
  });

  it("requires a whole-number daily cap", () => {
    expect(validateMandate(form({ daily: 2.5 }))).toMatch(/whole number/i);
    expect(validateMandate(form({ daily: 2000 }))).toMatch(/1000/);
  });
});

describe("presets", () => {
  it("applies preset limits while preserving scope", () => {
    const applied = applyPreset(form(), PRESETS[0]!);
    expect(applied.autoApprove).toBe(25);
    expect(applied.perPurchase).toBe(75);
    expect(applied.monthly).toBe(200);
    expect(applied.daily).toBe(3);
    expect(applied.categories).toBe("office_supplies, electronics");
    expect(validateMandate(applied)).toBeNull();
  });
});

describe("toggleCategory", () => {
  it("adds and removes categories from the CSV field", () => {
    expect(toggleCategory("office_supplies", "electronics")).toBe(
      "office_supplies, electronics",
    );
    expect(toggleCategory("office_supplies, electronics", "office_supplies")).toBe(
      "electronics",
    );
  });
});
