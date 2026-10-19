export type Reason = { code: string; message: string; severity: "deny" | "review" | "info" };
export type Purchase = {
  id: string; sku: string; title: string; merchant: string; category: string; quantity: number;
  amount_cents: number; currency: string; justification: string; source: string; status: string;
  policy_decision: "ALLOW" | "REQUIRE_APPROVAL" | "DENY"; policy_reasons: Reason[]; risk_score: number;
  risk_factors: { factor: string; detail: string }[]; provider: string; simulated: boolean;
  provider_order_id: string; approve_url: string; capture_id: string; created_at: string;
};
export type Mandate = {
  name: string; currency: string; per_purchase_limit_cents: number; auto_approve_limit_cents: number;
  monthly_limit_cents: number; max_purchases_per_day: number; allowed_categories: string[];
  trusted_merchants: string[]; blocked_merchants: string[]; active: boolean;
};
export type Status = {
  paypal_mode: string; simulated: boolean; banner: string; risk_model: string; risk_data: string;
  llm_enabled: boolean; llm_calls_today: number; llm_daily_budget: number;
  audit: { valid: boolean; checked: number };
};
export type Spend = { month_spent_cents: number; monthly_limit_cents: number; by_status: Record<string, number> };
export type AuditRow = { id: number; ts: string; actor: string; action: string; purchase_id: string; details: Record<string, unknown>; hash: string };

const KEY = (import.meta.env.VITE_OWNER_KEY as string | undefined) ?? "dev-owner-key";

export class ApiError extends Error {}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init, headers: { "Content-Type": "application/json", "X-API-Key": KEY, ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError("Cannot reach the backend. Start it with `make dev-backend` and reload.");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try { const j = await res.json(); detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail); } catch { /* ignore */ }
    throw new ApiError(detail);
  }
  return res.json() as Promise<T>;
}

export const money = (cents: number, cur = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(cents / 100);

export const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
