export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand">
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        className="brand-mark"
        focusable="false"
      >
        <defs>
          <linearGradient id="mg-shield" x1="4" y1="2" x2="28" y2="30">
            <stop offset="0" stopColor="#7cc0ff" />
            <stop offset="0.55" stopColor="#2f8bf5" />
            <stop offset="1" stopColor="#0b4fa8" />
          </linearGradient>
        </defs>
        <path
          d="M16 2.6l10.4 4v8.1c0 6.9-4.4 12.1-10.4 14.7C10 26.8 5.6 21.6 5.6 14.7V6.6l10.4-4z"
          fill="url(#mg-shield)"
        />
        <path
          d="M11 11.4h10M11 15.2h6.8M11 19h10"
          stroke="#f7fbff"
          strokeWidth="1.7"
          strokeLinecap="round"
          opacity="0.92"
        />
      </svg>
      {!compact && (
        <span className="brand-word">
          Mandate<span>Guard</span>
        </span>
      )}
    </span>
  );
}
