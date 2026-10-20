import type { Purchase } from "../api";

export type Tone = "good" | "warn" | "bad" | "info" | "neutral";

export type PurchaseFilter =
  | "all"
  | "approval"
  | "active"
  | "paid"
  | "blocked";

export const FILTERS: { id: PurchaseFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "approval", label: "Needs approval" },
  { id: "active", label: "In flight" },
  { id: "paid", label: "Paid" },
  { id: "blocked", label: "Blocked" },
];

export const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  PROPOSED: { label: "Proposed", tone: "neutral" },
  PENDING_APPROVAL: { label: "Awaiting approval", tone: "warn" },
  ORDER_CREATED: { label: "Order created", tone: "info" },
  CAPTURED: { label: "Paid", tone: "good" },
  DENIED: { label: "Blocked by policy", tone: "bad" },
  REJECTED: { label: "Rejected", tone: "neutral" },
  FAILED: { label: "Failed", tone: "bad" },
  EXPIRED: { label: "Expired", tone: "neutral" },
};

export const DECISION_META: Record<
  string,
  { label: string; short: string; tone: Tone }
> = {
  ALLOW: { label: "Within mandate", short: "Allow", tone: "good" },
  REQUIRE_APPROVAL: {
    label: "Needs your approval",
    short: "Review",
    tone: "warn",
  },
  DENY: { label: "Blocked by policy", short: "Deny", tone: "bad" },
};

export function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status.replace(/_/g, " "), tone: "neutral" as Tone };
}

export function decisionMeta(decision: string) {
  return (
    DECISION_META[decision] ?? {
      label: decision.replace(/_/g, " "),
      short: decision,
      tone: "neutral" as Tone,
    }
  );
}

export function riskTone(score: number): Tone {
  if (score >= 0.7) return "bad";
  if (score >= 0.5) return "warn";
  if (score >= 0.25) return "info";
  return "good";
}

export function purchaseCounts(purchases: Purchase[]) {
  return {
    all: purchases.length,
    approval: purchases.filter((p) => p.status === "PENDING_APPROVAL").length,
    active: purchases.filter((p) => p.status === "ORDER_CREATED").length,
    paid: purchases.filter((p) => p.status === "CAPTURED").length,
    blocked: purchases.filter((p) =>
      ["DENIED", "REJECTED", "FAILED", "EXPIRED"].includes(p.status),
    ).length,
  };
}

export function filterPurchases(
  purchases: Purchase[],
  filter: PurchaseFilter,
  query = "",
): Purchase[] {
  const needle = query.trim().toLowerCase();

  return purchases.filter((purchase) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "approval" && purchase.status === "PENDING_APPROVAL") ||
      (filter === "active" && purchase.status === "ORDER_CREATED") ||
      (filter === "paid" && purchase.status === "CAPTURED") ||
      (filter === "blocked" &&
        ["DENIED", "REJECTED", "FAILED", "EXPIRED"].includes(purchase.status));

    if (!matchesFilter) return false;
    if (!needle) return true;

    return [
      purchase.title,
      purchase.merchant,
      purchase.category,
      purchase.sku,
      purchase.provider_order_id,
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}

/** Newest first, with anything awaiting the owner surfaced to the top. */
export function sortPurchases(purchases: Purchase[]): Purchase[] {
  return [...purchases].sort((a, b) => {
    const aPending = a.status === "PENDING_APPROVAL" ? 1 : 0;
    const bPending = b.status === "PENDING_APPROVAL" ? 1 : 0;
    if (aPending !== bPending) return bPending - aPending;
    return b.created_at.localeCompare(a.created_at);
  });
}
