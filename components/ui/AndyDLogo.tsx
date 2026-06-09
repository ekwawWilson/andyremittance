interface AndyDLogoProps {
  /** size of the outer badge in pixels */
  size?: number;
  /** 'color' = gradient fill (default), 'white' = white on transparent (for dark backgrounds) */
  variant?: 'color' | 'white';
  className?: string;
}

/**
 * Andy D Enterprise brand mark.
 *
 * The mark is a rounded-square badge containing:
 *  - Top line: stylised "AD" monogram (bold geometric letters)
 *  - Bottom line: small "ENTERPRISE" wordmark
 *
 * variant="color"  → gradient badge (blue→indigo), white text — for light backgrounds
 * variant="white"  → transparent background, all-white strokes — for dark backgrounds
 */
export default function AndyDLogo({ size = 48, variant = 'color', className = '' }: AndyDLogoProps) {
  const id = `ade-grad-${size}`;
  const radius = size * 0.22;          // corner radius
  const cx = size / 2;
  const cy = size / 2;

  const textColor = variant === 'white' ? '#ffffff' : '#ffffff';
  const badgeFill = variant === 'white' ? 'none' : `url(#${id})`;
  const badgeStroke = variant === 'white' ? 'rgba(255,255,255,0.35)' : 'none';

  // "AD" letter positions — designed on a 48×48 grid, scaled via viewBox
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Andy D Enterprise"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>
      </defs>

      {/* Badge background */}
      <rect
        x="1"
        y="1"
        width="46"
        height="46"
        rx={radius}
        fill={badgeFill}
        stroke={badgeStroke}
        strokeWidth={variant === 'white' ? 1.2 : 0}
      />

      {/* ── "A" glyph ── left half of monogram */}
      {/* left stroke */}
      <line x1="8"  y1="34" x2="14" y2="16" stroke={textColor} strokeWidth="3.2" strokeLinecap="round" />
      {/* right stroke */}
      <line x1="14" y1="16" x2="20" y2="34" stroke={textColor} strokeWidth="3.2" strokeLinecap="round" />
      {/* crossbar */}
      <line x1="10" y1="27" x2="18" y2="27" stroke={textColor} strokeWidth="2.4" strokeLinecap="round" />

      {/* ── "D" glyph ── right half of monogram */}
      {/* vertical spine */}
      <line x1="25" y1="16" x2="25" y2="34" stroke={textColor} strokeWidth="3.2" strokeLinecap="round" />
      {/* curved body — approximated with a cubic bezier arc */}
      <path
        d="M25 16 C 35 16, 40 20, 40 25 C 40 30, 35 34, 25 34"
        stroke={textColor}
        strokeWidth="3.2"
        strokeLinecap="round"
        fill="none"
      />

      {/* ── "ENTERPRISE" micro wordmark below the monogram ── */}
      <text
        x="24"
        y="44"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="4.5"
        fontWeight="600"
        letterSpacing="1.2"
        fill={textColor}
        opacity="0.82"
      >
        ENTERPRISE
      </text>
    </svg>
  );
}
