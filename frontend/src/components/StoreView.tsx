import {
  Cable,
  Check,
  Coffee,
  Gift,
  Keyboard,
  Leaf,
  Loader2,
  Minus,
  Monitor,
  Package,
  Paperclip,
  PenLine,
  Plus,
  Printer,
  Search,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { money, type CatalogItem, type Mandate, type Purchase } from "../api";
import { categoryLabel, checkoutCheck } from "../lib/store";
import { Modal } from "./Modal";
import { Badge, EmptyState } from "./ui";

const ART: Record<string, { Icon: typeof Package; tone: string }> = {
  office_supplies: { Icon: Package, tone: "paper" },
  electronics: { Icon: Monitor, tone: "tech" },
  pantry: { Icon: Coffee, tone: "pantry" },
  cleaning: { Icon: Sparkles, tone: "clean" },
  gift_cards: { Icon: Gift, tone: "gift" },
};

const SKU_ICON: Record<string, typeof Package> = {
  "PAP-001": Package,
  "PAP-002": Package,
  "PAP-999": Package,
  "PEN-001": PenLine,
  "STA-001": Paperclip,
  "TON-001": Printer,
  "KEY-001": Keyboard,
  "MON-001": Monitor,
  "USB-001": Cable,
  "COF-001": Coffee,
  "TEA-001": Leaf,
  "CLN-001": Sparkles,
  "GFT-001": Gift,
};

function artFor(item: CatalogItem) {
  const category = ART[item.category] ?? { Icon: ShoppingBag, tone: "neutral" };
  return { Icon: SKU_ICON[item.sku] ?? category.Icon, tone: category.tone };
}

function ProductArt({ item }: { item: CatalogItem }) {
  const { Icon, tone } = artFor(item);
  return (
    <div className={`product-art product-art-${tone}`} aria-hidden>
      <Icon size={30} strokeWidth={1.5} />
      <span>{item.sku}</span>
    </div>
  );
}

export function StoreView({
  items,
  mandate,
  monthSpentCents,
  simulated,
  busy,
  onBuy,
  onAdjustMandate,
}: {
  items: CatalogItem[];
  mandate: Mandate;
  monthSpentCents: number;
  simulated: boolean;
  busy: boolean;
  onBuy: (item: CatalogItem, quantity: number) => Promise<Purchase | null>;
  onAdjustMandate: () => void;
}) {
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort(([a], [b]) =>
      categoryLabel(a).localeCompare(categoryLabel(b)),
    );
  }, [items]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (!needle) return true;
      return [item.title, item.merchant, item.category, item.sku]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [items, category, query]);

  const check = selected
    ? checkoutCheck(selected, mandate, monthSpentCents, quantity)
    : null;

  function open(item: CatalogItem) {
    setSelected(item);
    setQuantity(1);
    setSubmitting(false);
  }

  function close() {
    if (submitting) return;
    setSelected(null);
  }

  async function confirm() {
    if (!selected) return;
    setSubmitting(true);
    const result = await onBuy(selected, quantity);
    setSubmitting(false);
    if (result) setSelected(null);
  }

  function adjust() {
    setSelected(null);
    onAdjustMandate();
  }

  return (
    <div className="store-view">
      <header className="store-head">
        <div>
          <p className="kicker">Demo catalog</p>
          <h2>Shop inside your mandate</h2>
          <p>
            Pick an item and check out. Prices are set server-side, never by the
            agent, and every order passes the same policy and PayPal checks as an
            agent proposal.
          </p>
        </div>
        <Badge tone={simulated ? "warn" : "good"} dot>
          {simulated
            ? "Simulation · no real money"
            : "PayPal sandbox · test money"}
        </Badge>
      </header>

      <div className="list-toolbar store-toolbar">
        <div
          className="filter-row"
          role="group"
          aria-label="Filter products by category"
        >
          <button
            type="button"
            className={`filter-chip ${category === "all" ? "is-on" : ""}`}
            aria-pressed={category === "all"}
            onClick={() => setCategory("all")}
          >
            All products
            <span>{items.length}</span>
          </button>
          {categories.map(([name, count]) => (
            <button
              key={name}
              type="button"
              className={`filter-chip ${category === name ? "is-on" : ""}`}
              aria-pressed={category === name}
              onClick={() => setCategory(name)}
            >
              {categoryLabel(name)}
              <span>{count}</span>
            </button>
          ))}
        </div>

        <div className="search-box">
          <Search size={15} aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search catalog"
            aria-label="Search the catalog"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Search size={22} aria-hidden />}
          title="No products match that search"
          action={
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setQuery("");
                setCategory("all");
              }}
            >
              Clear filters
            </button>
          }
        >
          Try a different item, merchant or category.
        </EmptyState>
      ) : (
        <div className="product-grid">
          {visible.map((item) => {
            const itemCheck = checkoutCheck(item, mandate, monthSpentCents, 1);
            return (
              <article
                key={item.sku}
                className={`product ${itemCheck.blocked ? "is-blocked" : ""}`}
                aria-label={`${item.title} — ${
                  itemCheck.blocked ? "outside mandate" : "in mandate"
                }`}
              >
                <ProductArt item={item} />
                <div className="product-body">
                  <div className="product-tags">
                    <span className="product-cat">
                      {categoryLabel(item.category)}
                    </span>
                    {itemCheck.blocked ? (
                      <Badge tone="bad">Outside mandate</Badge>
                    ) : (
                      <Badge tone="good">In mandate</Badge>
                    )}
                  </div>
                  <h3>{item.title}</h3>
                  <p className="product-merchant">{item.merchant}</p>
                  <p className="product-desc">{item.description}</p>
                </div>
                <div className="product-foot">
                  <div className="product-price">
                    <strong>{money(item.unit_cents)}</strong>
                    <span>per unit</span>
                  </div>
                  <button
                    type="button"
                    className={`btn btn-sm ${
                      itemCheck.blocked ? "btn-ghost" : "btn-primary"
                    }`}
                    onClick={() => open(item)}
                  >
                    {itemCheck.blocked ? "Review limits" : "Buy now"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="store-footnote">
        {items.length} synthetic products. Descriptions are untrusted listing
        text; a purchase is never priced or approved from them.
      </p>

      {selected && check && (
        <Modal
          title="Checkout"
          description="The server re-checks your mandate before any order is created."
          onClose={close}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={close}
                disabled={submitting}
              >
                Cancel
              </button>
              {check.blocked ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={adjust}
                >
                  Adjust mandate
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void confirm()}
                  disabled={submitting || busy}
                >
                  {submitting ? (
                    <Loader2 size={15} className="spin" aria-hidden />
                  ) : (
                    <ShoppingBag size={15} aria-hidden />
                  )}
                  {simulated ? "Place simulated order" : "Create PayPal order"}
                </button>
              )}
            </>
          }
        >
          <div className="checkout">
            <div className="checkout-product">
              <ProductArt item={selected} />
              <div>
                <h3>{selected.title}</h3>
                <p>
                  {selected.merchant} · {categoryLabel(selected.category)}
                </p>
                <strong>{money(selected.unit_cents)} each</strong>
              </div>
            </div>

            <div className="checkout-qty">
              <span>Quantity</span>
              <div className="stepper">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() =>
                    setQuantity((value) => Math.max(1, value - 1))
                  }
                  disabled={quantity <= 1}
                  aria-label="Decrease quantity"
                >
                  <Minus size={14} aria-hidden />
                </button>
                <strong aria-live="polite">{quantity}</strong>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() =>
                    setQuantity((value) => Math.min(50, value + 1))
                  }
                  disabled={quantity >= 50}
                  aria-label="Increase quantity"
                >
                  <Plus size={14} aria-hidden />
                </button>
              </div>
            </div>

            <div className="checkout-total">
              <span>Order total</span>
              <strong>{money(check.totalCents)}</strong>
            </div>

            <ul className="checkout-checks">
              {check.reasons.map((reason) => (
                <li key={reason} className="is-bad">
                  <X size={14} aria-hidden />
                  <span>{reason}</span>
                </li>
              ))}
              {check.reasons.length === 0 && (
                <li className="is-good">
                  <Check size={14} aria-hidden />
                  <span>
                    Category, hard cap and monthly budget all pass.
                  </span>
                </li>
              )}
              {check.notes.map((note) => (
                <li key={note} className="is-warn">
                  <ShieldAlert size={14} aria-hidden />
                  <span>{note}</span>
                </li>
              ))}
            </ul>

            {check.blocked ? (
              <p className="checkout-blocked" role="alert">
                This purchase would be denied before a PayPal order is created.
                Change your limits first, or choose another item.
              </p>
            ) : (
              <p className="checkout-fineprint">
                {simulated
                  ? "A simulated order is created. Buyer approval and capture use the same signed-webhook path as the PayPal sandbox."
                  : "A PayPal sandbox order is created. Approve it with the buyer account, then capture is verified server-side."}
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
