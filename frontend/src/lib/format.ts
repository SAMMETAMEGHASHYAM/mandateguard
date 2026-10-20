function toDate(iso: string): Date | null {
  if (!iso) return null;
  // SQLite can return naive timestamps; treat them as UTC.
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function relativeTime(iso: string, now = Date.now()): string {
  const date = toDate(iso);
  if (!date) return "—";

  const diff = now - date.getTime();
  const minutes = Math.round(diff / 60_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function clockUtc(iso: string): string {
  const date = toDate(iso);
  if (!date) return "—";
  return date.toISOString().slice(11, 19);
}

export function fullTimeUtc(iso: string): string {
  const date = toDate(iso);
  if (!date) return "—";
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 19)} UTC`;
}

export function shortId(value: string, length = 10): string {
  if (!value) return "—";
  return value.length <= length ? value : `${value.slice(0, length)}…`;
}

export function percent(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.max(0, Math.min(100, Math.round((part / whole) * 100)));
}

export function initials(name: string): string {
  return name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

export function titleize(value: string): string {
  const words = value.toLowerCase().split("_").filter(Boolean);
  if (words.length === 0) return "";
  const text = words.join(" ");
  return text[0]!.toUpperCase() + text.slice(1);
}
