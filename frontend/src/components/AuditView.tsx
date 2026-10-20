import { Download, Search, ShieldCheck, ShieldX } from "lucide-react";
import { useMemo, useState } from "react";
import type { AuditRow, Status } from "../api";
import { fullTimeUtc, shortId } from "../lib/format";
import type { Tone } from "../lib/purchases";
import { Badge, CopyButton, EmptyState } from "./ui";

function actionTone(action: string): Tone {
  if (["CAPTURED"].includes(action)) return "good";
  if (["ORDER_CREATED", "BUYER_APPROVED", "APPROVED_BY_OWNER"].includes(action)) return "info";
  if (["AMOUNT_MISMATCH", "ORDER_FAILED", "CAPTURE_ERROR"].includes(action)) return "bad";
  if (["APPROVAL_BLOCKED", "CAPTURE_NOT_COMPLETED"].includes(action)) return "warn";
  return "neutral";
}

export function AuditView({
  rows,
  status,
}: {
  rows: AuditRow[];
  status: Status | null;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.action, row.actor, row.purchase_id, JSON.stringify(row.details)]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [rows, query]);

  const verified = status?.audit.valid ?? false;

  function exportJson() {
    const blob = new Blob([JSON.stringify(rows, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mandateguard-audit-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="audit-view">
      <div className="audit-toolbar">
        <div className={`chain-state ${verified ? "is-good" : "is-bad"}`}>
          {verified ? <ShieldCheck size={16} aria-hidden /> : <ShieldX size={16} aria-hidden />}
          <div>
            <strong>
              {verified ? "Audit chain verified" : "Audit chain cannot be verified"}
            </strong>
            <small>
              {status
                ? `${status.audit.checked} events hash-linked${
                    verified ? "" : ` · first break at #${status.audit.first_bad_event_id}`
                  }`
                : "Waiting for chain status"}
            </small>
          </div>
        </div>

        <div className="audit-tools">
          <div className="search-box">
            <Search size={15} aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter actions, actors or IDs"
              aria-label="Filter audit events"
            />
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={exportJson}
            disabled={rows.length === 0}
          >
            <Download size={14} aria-hidden /> Export JSON
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={22} aria-hidden />}
          title={query ? "No events match that filter" : "No audit events yet"}
        >
          {query
            ? "Try a different action, actor or purchase ID."
            : "Every proposal, decision, approval, webhook and capture is appended here in a tamper-evident chain."}
        </EmptyState>
      ) : (
        <ol className="audit-list">
          {filtered.map((row) => {
            const tone = actionTone(row.action);
            const details = JSON.stringify(row.details);
            return (
              <li key={row.id} className="audit-row">
                <span className={`audit-dot tone-${tone}`} aria-hidden />
                <div className="audit-main">
                  <div className="audit-top">
                    <Badge tone={tone}>{row.action.replace(/_/g, " ")}</Badge>
                    <span className="audit-actor">{row.actor}</span>
                    <time dateTime={row.ts}>{fullTimeUtc(row.ts)}</time>
                    <span className="audit-id">#{row.id}</span>
                  </div>

                  <div className="audit-sub">
                    {row.purchase_id ? (
                      <span className="audit-purchase">
                        purchase <code>{shortId(row.purchase_id, 8)}</code>
                        <CopyButton value={row.purchase_id} label="Copy purchase ID" />
                      </span>
                    ) : (
                      <span className="audit-purchase">chain-level event</span>
                    )}
                    <details className="audit-details">
                      <summary>Details</summary>
                      <pre>{JSON.stringify(row.details, null, 2)}</pre>
                    </details>
                    <span className="audit-hash">
                      hash <code>{row.hash.slice(0, 12)}</code>
                      <CopyButton value={row.hash} label="Copy event hash" />
                    </span>
                  </div>

                  {details !== "{}" && (
                    <p className="audit-preview">
                      {details.length > 140 ? `${details.slice(0, 140)}…` : details}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
