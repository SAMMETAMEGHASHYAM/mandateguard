import { describe, expect, it } from "vitest";
import type { Purchase } from "../api";
import {
  decisionMeta,
  filterPurchases,
  purchaseCounts,
  riskTone,
  sortPurchases,
  statusMeta,
} from "./purchases";

let counter = 0;

function purchase(overrides: Partial<Purchase> = {}): Purchase {
  counter += 1;
  return {
    id: `pur_${counter}`,
    sku: "PAPER-A4",
    title: "A4 Printer Paper",
    merchant: "OfficeDepot Demo",
    category: "office_supplies",
    quantity: 2,
    amount_cents: 1798,
    currency: "USD",
    justification: "Two reams for the printer.",
    source: "agent",
    status: "PENDING_APPROVAL",
    policy_decision: "REQUIRE_APPROVAL",
    policy_reasons: [
      { code: "ABOVE_AUTO_APPROVE", message: "Over the auto limit", severity: "review" },
    ],
    risk_score: 0.12,
    risk_factors: [],
    provider: "simulated",
    simulated: true,
    provider_order_id: "",
    approve_url: "",
    capture_id: "",
    created_at: "2026-10-19T10:00:00Z",
    ...overrides,
  };
}

describe("status and decision metadata", () => {
  it("maps known statuses", () => {
    expect(statusMeta("CAPTURED")).toEqual({ label: "Paid", tone: "good" });
    expect(statusMeta("PENDING_APPROVAL").tone).toBe("warn");
  });

  it("falls back for unknown statuses", () => {
    expect(statusMeta("SOMETHING_NEW")).toEqual({
      label: "SOMETHING NEW",
      tone: "neutral",
    });
  });

  it("maps policy decisions", () => {
    expect(decisionMeta("DENY").tone).toBe("bad");
    expect(decisionMeta("ALLOW").label).toBe("Within mandate");
  });
});

describe("riskTone", () => {
  it("escalates tone with score", () => {
    expect(riskTone(0.05)).toBe("good");
    expect(riskTone(0.3)).toBe("info");
    expect(riskTone(0.55)).toBe("warn");
    expect(riskTone(0.9)).toBe("bad");
  });
});

describe("purchaseCounts", () => {
  it("counts each queue bucket", () => {
    const counts = purchaseCounts([
      purchase({ status: "PENDING_APPROVAL" }),
      purchase({ status: "ORDER_CREATED" }),
      purchase({ status: "CAPTURED" }),
      purchase({ status: "DENIED" }),
      purchase({ status: "EXPIRED" }),
    ]);

    expect(counts).toEqual({ all: 5, approval: 1, active: 1, paid: 1, blocked: 2 });
  });
});

describe("filterPurchases", () => {
  const items = [
    purchase({ title: "Printer paper", merchant: "OfficeDepot Demo" }),
    purchase({ title: "USB-C dock", merchant: "TechMart Demo", status: "ORDER_CREATED" }),
    purchase({ title: "Gift card", merchant: "QuickDeals", status: "DENIED" }),
    purchase({ title: "Coffee beans", merchant: "Pantry Co", status: "CAPTURED" }),
  ];

  it("filters by queue", () => {
    expect(filterPurchases(items, "approval")).toHaveLength(1);
    expect(filterPurchases(items, "active")).toHaveLength(1);
    expect(filterPurchases(items, "paid")).toHaveLength(1);
    expect(filterPurchases(items, "blocked")).toHaveLength(1);
    expect(filterPurchases(items, "all")).toHaveLength(4);
  });

  it("searches title, merchant and SKU case-insensitively", () => {
    expect(filterPurchases(items, "all", "techmart")).toHaveLength(1);
    expect(filterPurchases(items, "all", "USB")).toHaveLength(1);
    expect(filterPurchases(items, "all", "PAPER-A4")).toHaveLength(4);
    expect(filterPurchases(items, "all", "nothing-here")).toHaveLength(0);
  });

  it("combines filter and query", () => {
    expect(filterPurchases(items, "blocked", "gift")).toHaveLength(1);
    expect(filterPurchases(items, "blocked", "coffee")).toHaveLength(0);
  });
});

describe("sortPurchases", () => {
  it("surfaces approvals first, then newest", () => {
    const olderApproval = purchase({
      status: "PENDING_APPROVAL",
      created_at: "2026-10-19T08:00:00Z",
    });
    const newerPaid = purchase({
      status: "CAPTURED",
      created_at: "2026-10-19T11:00:00Z",
    });
    const newerApproval = purchase({
      status: "PENDING_APPROVAL",
      created_at: "2026-10-19T10:00:00Z",
    });

    const sorted = sortPurchases([olderApproval, newerPaid, newerApproval]);
    expect(sorted.map((item) => item.id)).toEqual([
      newerApproval.id,
      olderApproval.id,
      newerPaid.id,
    ]);
  });

  it("does not mutate the input array", () => {
    const items = [
      purchase({ created_at: "2026-10-19T08:00:00Z" }),
      purchase({ created_at: "2026-10-19T10:00:00Z" }),
    ];
    const before = items.map((item) => item.id);
    sortPurchases(items);
    expect(items.map((item) => item.id)).toEqual(before);
  });
});
