export type Reason = { code: string; message: string; severity: "deny" | "review" | "info" };

export type Purchase = {
  id: string;
  sku: string;
  title: string;
  merchant: string;
  category: string;
  quantity: number;
  amount_cents: number;
  currency: string;
  justification: string;
  source: string;
  status: string;
  policy_decision: "ALLOW" | "REQUIRE_APPROVAL" | "DENY";
  policy_reasons: Reason[];
  risk_score: number;
  risk_factors: { factor: string; detail: string }[];
  provider: string;
  simulated: boolean;
  provider_order_id: string;
  approve_url: string;
  capture_id: string;
  created_at: string;
};

export type Mandate = {
  id?: number;
  name: string;
  currency: string;
  per_purchase_limit_cents: number;
  auto_approve_limit_cents: number;
  monthly_limit_cents: number;
  max_purchases_per_day: number;
  allowed_categories: string[];
  trusted_merchants: string[];
  blocked_merchants: string[];
  active: boolean;
};

export type Status = {
  paypal_mode: string;
  simulated: boolean;
  banner: string;
  risk_model: string;
  risk_data: string;
  llm_enabled: boolean;
  llm_calls_today: number;
  llm_daily_budget: number;
  audit: { valid: boolean; checked: number; first_bad_event_id: number | null };
};

export type Spend = {
  month_spent_cents: number;
  monthly_limit_cents: number;
  by_status: Record<string, number>;
};

export type AuditRow = {
  id: number;
  ts: string;
  actor: string;
  action: string;
  purchase_id: string;
  details: Record<string, unknown>;
  hash: string;
};

export type CatalogItem = {
  sku: string;
  title: string;
  category: string;
  merchant: string;
  unit_cents: number;
};

const STORAGE_KEY = "mandateguard.ownerKey";
let memoryKey: string | null = null;

export function getOwnerKey(): string | null {
  if (memoryKey) return memoryKey;
  try {
    memoryKey = window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    memoryKey = null;
  }
  return memoryKey;
}

export function setOwnerKey(key: string): void {
  memoryKey = key.trim();
  try {
    window.sessionStorage.setItem(STORAGE_KEY, memoryKey);
  } catch {
    /* sessionStorage can be unavailable in hardened browsers */
  }
}

export function clearOwnerKey(): void {
  memoryKey = null;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function readError(response: Response): Promise<string> {
  let detail = response.statusText || `Request failed (${response.status})`;
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") detail = body.detail;
    else if (body?.detail) detail = JSON.stringify(body.detail);
  } catch {
    /* non-JSON error body */
  }
  return detail;
}

async function request<T>(path: string, init: RequestInit, key?: string | null): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  };
  if (key) headers["X-API-Key"] = key;

  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError(
      "Cannot reach the MandateGuard API. Start the backend and try again.",
      0,
    );
  }

  if (!response.ok) {
    throw new ApiError(await readError(response), response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
  key: string | null = getOwnerKey(),
): Promise<T> {
  if (!key) throw new ApiError("Enter your owner key to continue.", 401);
  return request<T>(path, init, key);
}

/** Public endpoint: the status banner is safe to read before authenticating. */
export async function publicStatus(): Promise<Status> {
  return request<Status>("/status", { method: "GET" }, null);
}

export async function verifyOwnerKey(key: string): Promise<boolean> {
  try {
    await request<Mandate>("/mandate", { method: "GET" }, key);
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return false;
    throw error;
  }
}

export const money = (cents: number, cur = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: cur,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);

export const csv = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
