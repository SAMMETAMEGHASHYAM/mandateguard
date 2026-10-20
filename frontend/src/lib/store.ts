import type { CatalogItem, Mandate } from "../api";

export type CheckoutCheck = {
  totalCents: number;
  blocked: boolean;
  reasons: string[];
  notes: string[];
};

export function categoryLabel(category: string): string {
  return category
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * Mirror of the cheap, client-visible mandate checks. The server remains the
 * source of truth: risk scoring and approval re-checks can still change the
 * outcome, so this only disables checkout for purchases that are certain to be
 * DENYed.
 */
export function checkoutCheck(
  item: CatalogItem,
  mandate: Mandate,
  monthSpentCents: number,
  quantity: number,
): CheckoutCheck {
  const totalCents = item.unit_cents * quantity;
  const reasons: string[] = [];
  const notes: string[] = [];

  if (!mandate.active) {
    reasons.push("Your mandate is paused, so the agent has no spending authority.");
  }
  if (mandate.blocked_merchants.includes(item.merchant)) {
    reasons.push(`${item.merchant} is on your blocked-merchant list.`);
  }
  if (
    mandate.allowed_categories.length > 0 &&
    !mandate.allowed_categories.includes(item.category)
  ) {
    reasons.push(
      `${categoryLabel(item.category)} is outside your allowed categories.`,
    );
  }
  if (totalCents > mandate.per_purchase_limit_cents) {
    reasons.push("The total is above your per-purchase hard cap.");
  }
  if (monthSpentCents + totalCents > mandate.monthly_limit_cents) {
    reasons.push("This would exceed your remaining monthly budget.");
  }

  if (totalCents > mandate.auto_approve_limit_cents) {
    notes.push("Above auto-approve — you will be asked to approve this order.");
  }
  if (!mandate.trusted_merchants.includes(item.merchant)) {
    notes.push("Merchant is not on your trusted list — policy may escalate it.");
  }

  return { totalCents, blocked: reasons.length > 0, reasons, notes };
}
