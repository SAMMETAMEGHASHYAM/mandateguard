import { Inbox, Search } from "lucide-react";
import type { Purchase } from "../api";
import {
  FILTERS,
  filterPurchases,
  type PurchaseFilter,
} from "../lib/purchases";
import { PurchaseCard } from "./PurchaseCard";
import { EmptyState } from "./ui";

export function PurchasesView({
  purchases,
  filter,
  query,
  counts,
  busyKey,
  onFilter,
  onQuery,
  onApprove,
  onReject,
  onCapture,
  onSimulate,
}: {
  purchases: Purchase[];
  filter: PurchaseFilter;
  query: string;
  counts: Record<PurchaseFilter, number>;
  busyKey: string | null;
  onFilter: (filter: PurchaseFilter) => void;
  onQuery: (query: string) => void;
  onApprove: (purchase: Purchase) => void;
  onReject: (purchase: Purchase) => void;
  onCapture: (purchase: Purchase) => void;
  onSimulate: (purchase: Purchase) => void;
}) {
  const visible = filterPurchases(purchases, filter, query);

  return (
    <div className="purchases-view">
      <div className="list-toolbar">
        <div className="filter-row" role="group" aria-label="Filter purchases">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`filter-chip ${filter === item.id ? "is-on" : ""}`}
              aria-pressed={filter === item.id}
              onClick={() => onFilter(item.id)}
            >
              {item.label}
              <span>{counts[item.id]}</span>
            </button>
          ))}
        </div>

        <div className="search-box">
          <Search size={15} aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search item, merchant or order ID"
            aria-label="Search purchases"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Inbox size={22} aria-hidden />}
          title={
            query
              ? "No purchases match that search"
              : filter === "all"
                ? "No purchases yet"
                : "Nothing in this view"
          }
        >
          {query
            ? "Try a different item, merchant, SKU or order ID."
            : filter === "approval"
              ? "Nothing is waiting on you. New escalations will appear here."
              : filter === "all"
                ? "Send the agent a goal above. Every proposal is checked against your mandate before a PayPal order can exist."
                : "Switch filters to see other purchases."}
        </EmptyState>
      ) : (
        <div className="purchase-list">
          {visible.map((purchase) => (
            <PurchaseCard
              key={purchase.id}
              purchase={purchase}
              busyKey={busyKey}
              onApprove={onApprove}
              onReject={onReject}
              onCapture={onCapture}
              onSimulate={onSimulate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
