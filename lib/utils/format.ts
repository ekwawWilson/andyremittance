/**
 * Shared currency formatting helpers.
 * Always produces thousand-separated, 2-decimal output.
 *
 * fmtGHS(1234567.5)  → "GHS 1,234,567.50"
 * fmtCAD(1234.5)     → "$1,234.50"
 * fmtCADSigned(-50)  → "-$50.00"
 * fmtNum(1234567.5)  → "1,234,567.50"
 */

const GHS_FMT = new Intl.NumberFormat('en-GH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const CAD_FMT = new Intl.NumberFormat('en-CA', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NUM_FMT = new Intl.NumberFormat('en', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format a GHS amount: "GHS 1,234.50" */
export function fmtGHS(amount: number | string): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  return `GHS ${GHS_FMT.format(isNaN(n) ? 0 : n)}`;
}

/** Format a CAD amount: "$1,234.50" */
export function fmtCAD(amount: number | string): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  return `$${CAD_FMT.format(isNaN(n) ? 0 : Math.abs(n))}`;
}

/**
 * Format a signed CAD amount (handles negatives correctly).
 * fmtCADSigned(-50.25) → "-$50.25"
 */
export function fmtCADSigned(amount: number | string): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(n)) return '$0.00';
  return `${n < 0 ? '-' : ''}$${CAD_FMT.format(Math.abs(n))}`;
}

/** Plain number with separators and 2 decimals, no currency symbol */
export function fmtNum(amount: number | string): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  return NUM_FMT.format(isNaN(n) ? 0 : n);
}
