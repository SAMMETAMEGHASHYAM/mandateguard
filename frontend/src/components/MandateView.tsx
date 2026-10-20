import { Check, Loader2, LockKeyhole, Save, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Mandate } from "../api";
import {
  applyPreset,
  formToMandate,
  mandateToForm,
  PRESETS,
  toggleCategory,
  validateMandate,
  type MandateForm,
} from "../lib/mandate";
import { Badge } from "./ui";

export function MandateView({
  mandate,
  categories,
  busy,
  onSave,
}: {
  mandate: Mandate;
  categories: string[];
  busy: boolean;
  onSave: (mandate: Mandate) => Promise<boolean> | boolean;
}) {
  const [form, setForm] = useState<MandateForm>(() => mandateToForm(mandate));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setForm(mandateToForm(mandate));
  }, [mandate, dirty]);

  const error = validateMandate(form);
  const selected = useMemo(
    () =>
      form.categories
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    [form.categories],
  );

  const allCategories = useMemo(
    () => Array.from(new Set([...categories, ...selected])).sort(),
    [categories, selected],
  );

  function update(patch: Partial<MandateForm>) {
    setForm((current) => ({ ...current, ...patch }));
    setDirty(true);
  }

  async function save() {
    if (error) return;
    const saved = await onSave(formToMandate(form, mandate));
    if (saved !== false) setDirty(false);
  }

  return (
    <div className="mandate-layout">
      <form
        className="panel mandate-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="panel-head">
          <div>
            <p className="kicker">Guardrails</p>
            <h2>Spending mandate</h2>
          </div>
          <Badge tone={form.active ? "good" : "warn"} dot>
            {form.active ? "Enforcing" : "Paused"}
          </Badge>
        </div>

        <div className="preset-row" role="group" aria-label="Guardrail presets">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="preset"
              onClick={() => {
                setForm((current) => applyPreset(current, preset));
                setDirty(true);
              }}
            >
              <span>{preset.label}</span>
              <small>{preset.hint}</small>
            </button>
          ))}
        </div>

        <fieldset className="form-section">
          <legend>Identity</legend>
          <label className="field">
            <span className="field-label">Mandate name</span>
            <input
              className="input"
              value={form.name}
              maxLength={120}
              onChange={(event) => update({ name: event.target.value })}
            />
          </label>
        </fieldset>

        <fieldset className="form-section">
          <legend>Limits</legend>
          <div className="field-grid">
            <label className="field">
              <span className="field-label">
                Auto-approve up to ({mandate.currency})
              </span>
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                value={form.autoApprove}
                onChange={(event) => update({ autoApprove: Number(event.target.value) })}
              />
              <span className="field-hint">Charged without asking you.</span>
            </label>

            <label className="field">
              <span className="field-label">Hard cap per purchase</span>
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                value={form.perPurchase}
                onChange={(event) => update({ perPurchase: Number(event.target.value) })}
              />
              <span className="field-hint">Even you cannot approve above this.</span>
            </label>

            <label className="field">
              <span className="field-label">Monthly budget</span>
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                value={form.monthly}
                onChange={(event) => update({ monthly: Number(event.target.value) })}
              />
              <span className="field-hint">Reserved orders count against it.</span>
            </label>

            <label className="field">
              <span className="field-label">Max purchases per day</span>
              <input
                className="input"
                type="number"
                min={0}
                step="1"
                value={form.daily}
                onChange={(event) => update({ daily: Number(event.target.value) })}
              />
              <span className="field-hint">Stops runaway agent loops.</span>
            </label>
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend>Scope</legend>
          <p className="field-hint section-hint">
            Only these categories are purchasable. Leave empty to allow every
            category.
          </p>
          <div className="category-row">
            {allCategories.map((category) => {
              const on = selected.includes(category);
              return (
                <button
                  key={category}
                  type="button"
                  className={`category-chip ${on ? "is-on" : ""}`}
                  aria-pressed={on}
                  onClick={() => update({ categories: toggleCategory(form.categories, category) })}
                >
                  {on && <Check size={12} aria-hidden />}
                  {category.replace(/_/g, " ")}
                </button>
              );
            })}
          </div>

          <label className="field">
            <span className="field-label">Trusted merchants</span>
            <input
              className="input"
              value={form.trusted}
              onChange={(event) => update({ trusted: event.target.value })}
              placeholder="OfficeDepot Demo, TechMart Demo"
            />
            <span className="field-hint">
              Purchases elsewhere still work, but they escalate to you.
            </span>
          </label>

          <label className="field">
            <span className="field-label">Blocked merchants</span>
            <input
              className="input"
              value={form.blocked}
              onChange={(event) => update({ blocked: event.target.value })}
              placeholder="QuickDeals Outlet"
            />
            <span className="field-hint">Always denied, no exceptions.</span>
          </label>
        </fieldset>

        <fieldset className="form-section">
          <legend>Authority</legend>
          <label className="switch-row">
            <span>
              <strong>Mandate active</strong>
              <small>Uncheck to pause all agent spending instantly.</small>
            </span>
            <input
              type="checkbox"
              className="switch"
              checked={form.active}
              onChange={(event) => update({ active: event.target.checked })}
            />
          </label>
        </fieldset>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="save-bar">
          <span className="save-state">
            {dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || Boolean(error) || !dirty}
          >
            {busy ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
            Save mandate
          </button>
        </div>
      </form>

      <aside className="panel enforcement">
        <div className="panel-head">
          <div>
            <p className="kicker">Why it holds</p>
            <h2>Enforcement path</h2>
          </div>
          <LockKeyhole size={16} aria-hidden />
        </div>
        <ol className="enforcement-steps">
          <li>
            <span>1</span>
            <div>
              <strong>Agent proposes</strong>
              <p>SKU and quantity only. Prices come from the server catalog.</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Code decides</strong>
              <p>
                These limits run as pure functions. The risk model can escalate
                to you, never relax a rule.
              </p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>PayPal settles</strong>
              <p>
                Capture happens only after the provider confirms approval and
                the amount matches.
              </p>
            </div>
          </li>
        </ol>
        <div className="enforcement-note">
          <ShieldCheck size={14} aria-hidden />
          Every change is appended to the hash-chained audit log.
        </div>
      </aside>
    </div>
  );
}
