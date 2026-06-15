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

/**
 * Build a WhatsApp-ready plain-text summary for an ADDITIONAL (immediate) transaction.
 * Returns a multi-line string that can be copied straight into WhatsApp.
 */
export function buildWhatsAppText(t: {
  transactionCode: string;
  cadAmount: number | string;
  ghsAmount: number | string;
  exchangeRateUsed: number | string;
  paymentMethod: string;
  receivingMode: string;
  receivingPoint?: { name?: string } | null;
  sender?: { firstName?: string; lastName?: string; phone?: string } | null;
  receiver?: { firstName?: string; lastName?: string; phone?: string } | null;
  transactionReceivers?: { receiverName?: string | null; receiverPhone?: string | null; ghsAmount?: number | string }[];
  receiversDeferred?: boolean;
  momoNumber?: string | null;
  momoName?: string | null;
  bankName?: string | null;
  bankAccountNo?: string | null;
  bankAccountName?: string | null;
  bankBranch?: string | null;
  notes?: string | null;
}): string {
  const ghs = Number(t.ghsAmount);
  const cad = Number(t.cadAmount);

  const senderName = `${t.sender?.firstName ?? ''} ${t.sender?.lastName ?? ''}`.trim() || '—';

  const multiReceivers = t.transactionReceivers ?? [];
  let receiverLines: string;
  if (multiReceivers.length > 0) {
    receiverLines = multiReceivers.map((r) =>
      `${r.receiverName || '—'} ${r.receiverPhone || ''}`
    ).join(', ');
  } else if (t.receiversDeferred) {
    receiverLines = 'To be assigned at branch';
  } else {
    const rName = `${t.receiver?.firstName ?? ''} ${t.receiver?.lastName ?? ''}`.trim() || '—';
    const rPhone = t.receiver?.phone ?? '';
    receiverLines = `${rName} ${rPhone}`.trim();
  }

  return [
    `Sender: ${senderName}`,
    `Receiver: ${receiverLines}`,
    `GHS: ${GHS_FMT.format(ghs)}`,
    `CAD: $${CAD_FMT.format(cad)}`,
  ].join('\n');
}
