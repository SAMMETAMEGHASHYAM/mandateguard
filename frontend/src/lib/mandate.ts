import type { Mandate } from "../api";

export type MandateForm = {
  name: string;
  autoApprove: number;
  perPurchase: number;
  monthly: number;
  daily: number;
  categories: string;
  trusted: string;
  blocked: string;
  active: boolean;
};

export function mandateToForm(mandate: Mandate): MandateForm {
  return {
    name: mandate.name,
    autoApprove: mandate.auto_approve_limit_cents / 100,
    perPurchase: mandate.per_purchase_limit_cents / 100,
    monthly: mandate.monthly_limit_cents / 100,
    daily: mandate.max_purchases_per_day,
    categories: mandate.allowed_categories.join(", "),
    trusted: mandate.trusted_merchants.join(", "),
    blocked: mandate.blocked_merchants.join(", "),
    active: mandate.active,
  };
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formToMandate(form: MandateForm, base: Mandate): Mandate {
  return {
    ...base,
    name: form.name.trim(),
    auto_approve_limit_cents: Math.round(form.autoApprove * 100),
    per_purchase_limit_cents: Math.round(form.perPurchase * 100),
    monthly_limit_cents: Math.round(form.monthly * 100),
    max_purchases_per_day: Math.round(form.daily),
    allowed_categories: splitList(form.categories),
    trusted_merchants: splitList(form.trusted),
    blocked_merchants: splitList(form.blocked),
    active: form.active,
  };
}

export function validateMandate(form: MandateForm): string | null {
  if (!form.name.trim()) return "Give the mandate a name.";

  for (const [label, value] of [
    ["Auto-approve limit", form.autoApprove],
    ["Per-purchase limit", form.perPurchase],
    ["Monthly budget", form.monthly],
    ["Daily purchase cap", form.daily],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      return `${label} must be zero or greater.`;
    }
  }

  if (!Number.isInteger(form.daily)) {
    return "The daily purchase cap must be a whole number.";
  }
  if (form.daily > 1000) return "The daily purchase cap cannot exceed 1000.";
  if (form.autoApprove > form.perPurchase) {
    return "Auto-approve limit cannot exceed the per-purchase limit.";
  }
  if (form.perPurchase > form.monthly) {
    return "Per-purchase limit cannot exceed the monthly budget.";
  }
  return null;
}

export type GuardrailPreset = {
  id: "conservative" | "balanced" | "open";
  label: string;
  hint: string;
  values: Pick<MandateForm, "autoApprove" | "perPurchase" | "monthly" | "daily">;
};

export const PRESETS: GuardrailPreset[] = [
  {
    id: "conservative",
    label: "Conservative",
    hint: "$25 auto · $75 cap · $200/mo",
    values: { autoApprove: 25, perPurchase: 75, monthly: 200, daily: 3 },
  },
  {
    id: "balanced",
    label: "Balanced",
    hint: "$50 auto · $150 cap · $500/mo",
    values: { autoApprove: 50, perPurchase: 150, monthly: 500, daily: 5 },
  },
  {
    id: "open",
    label: "Open",
    hint: "$100 auto · $300 cap · $1,500/mo",
    values: { autoApprove: 100, perPurchase: 300, monthly: 1500, daily: 10 },
  },
];

export function applyPreset(form: MandateForm, preset: GuardrailPreset): MandateForm {
  return { ...form, ...preset.values };
}

export function toggleCategory(value: string, category: string): string {
  const categories = splitList(value);
  const next = categories.includes(category)
    ? categories.filter((item) => item !== category)
    : [...categories, category];
  return next.join(", ");
}
