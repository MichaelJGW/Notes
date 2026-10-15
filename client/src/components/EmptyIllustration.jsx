// Three floating note cards in the brand tones.
export default function EmptyIllustration() {
  return (
    <svg className="illustration" viewBox="0 0 240 170" aria-hidden="true">
      <ellipse className="ill-shadow" cx="120" cy="158" rx="80" ry="7" />
      <g className="ill-card ill-card-1">
        <rect x="28" y="40" width="96" height="112" rx="12" fill="var(--teal)" />
        <rect x="42" y="60" width="54" height="7" rx="3.5" fill="#fff" opacity=".9" />
        <rect x="42" y="76" width="68" height="5" rx="2.5" fill="#fff" opacity=".55" />
        <rect x="42" y="88" width="60" height="5" rx="2.5" fill="#fff" opacity=".55" />
      </g>
      <g className="ill-card ill-card-2">
        <rect x="116" y="30" width="96" height="112" rx="12" fill="var(--aubergine)" />
        <rect x="130" y="50" width="48" height="7" rx="3.5" fill="#fff" opacity=".9" />
        <rect x="130" y="66" width="68" height="5" rx="2.5" fill="#fff" opacity=".55" />
        <rect x="130" y="78" width="52" height="5" rx="2.5" fill="#fff" opacity=".55" />
      </g>
      <g className="ill-card ill-card-3">
        <rect x="70" y="14" width="100" height="120" rx="14" fill="var(--orange)" />
        <text x="86" y="50" fill="#fff" fontFamily="Ubuntu Mono, monospace" fontWeight="700" fontSize="22">
          #
        </text>
        <rect x="104" y="36" width="50" height="8" rx="4" fill="#fff" opacity=".95" />
        <rect x="86" y="62" width="68" height="5" rx="2.5" fill="#fff" opacity=".6" />
        <rect x="86" y="74" width="58" height="5" rx="2.5" fill="#fff" opacity=".6" />
        <rect x="86" y="86" width="64" height="5" rx="2.5" fill="#fff" opacity=".6" />
        <circle cx="90" cy="108" r="4" fill="#fff" opacity=".8" />
        <rect x="100" y="105.5" width="40" height="5" rx="2.5" fill="#fff" opacity=".6" />
      </g>
    </svg>
  );
}
