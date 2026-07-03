/* Custom Haxax mark — a survey-benchmark hexagon with a crosshair X.
   Evokes tenement pegging / targeting; restrained, technical. */

export function HaxaxMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className="haxax-mark">
      <path
        d="M16 4 L27 10 V22 L16 28 L5 22 V10 Z"
        fill="var(--accent-softer)"
        stroke="var(--border-strong)"
        strokeWidth="1.4"
      />
      <path
        d="M11 11 L21 21 M21 11 L11 21"
        stroke="var(--accent)"
        strokeWidth="2.3"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="1.8" fill="var(--bg-app)" stroke="var(--accent)" strokeWidth="1.3" />
    </svg>
  );
}

export function HaxaxLogo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <span className="haxax-logo" aria-label="HAXAX">
      <HaxaxMark size={26} />
      {!collapsed && <span className="haxax-wordmark">HAXAX</span>}
    </span>
  );
}
