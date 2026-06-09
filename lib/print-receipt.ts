import type { Transaction } from '@/lib/api-client';

const COMPANY_NAME    = process.env.NEXT_PUBLIC_COMPANY_NAME    ?? 'ANDY D ENTERPRISE';
const COMPANY_TAGLINE = process.env.NEXT_PUBLIC_COMPANY_TAGLINE ?? 'Canada–Ghana Remittance';
const COMPANY_EMAIL   = process.env.NEXT_PUBLIC_COMPANY_EMAIL   ?? 'admin@andydenterprise.com';

export interface ReceiptPrintOptions {
  amountPaidGHS?: number;
  receiverName?: string;
  receiverPhone?: string;
  receivingMode?: 'CASH' | 'BANK' | 'MOMO';
  bankName?: string;
  bankAccountNo?: string;
  bankAccountName?: string;
  bankBranch?: string;
  cashPhoneNumber?: string;
  cashGhanaCardNumber?: string;
  momoNumber?: string;
  momoName?: string;
  notes?: string;
  title?: string;
  amountLabel?: string;
}

function fmt(n: number) {
  return n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function modeLabel(mode: string) {
  return mode === 'CASH' ? 'Cash' : mode === 'BANK' ? 'Bank Transfer' : mode === 'MOMO' ? 'Mobile Money' : mode;
}

function buildCopy(
  t: Transaction,
  branchName: string,
  copyLabel: string,
  options: ReceiptPrintOptions = {}
): string {
  const paidAt = t.paidAt ? new Date(t.paidAt) : new Date();
  const dateStr = paidAt.toLocaleDateString('en-GH', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = paidAt.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' });
  const receivingMode = options.receivingMode ?? t.receivingMode;
  const receiverName = options.receiverName ?? `${t.receiver?.firstName ?? ''} ${t.receiver?.lastName ?? ''}`.trim();
  const receiverPhone = options.receiverPhone ?? t.receiver?.phone ?? '';
  const amountPaid = Number(options.amountPaidGHS ?? t.ghsAmount);
  const notes = options.notes ?? t.notes;

  const modeDetails =
    receivingMode === 'BANK'
      ? `<tr><td>Bank</td><td>${(options.bankName ?? t.bankName) || '—'}</td></tr>
         <tr><td>Account No.</td><td>${(options.bankAccountNo ?? t.bankAccountNo) || '—'}</td></tr>
         <tr><td>Account Name</td><td>${(options.bankAccountName ?? t.bankAccountName) || '—'}</td></tr>
         ${(options.bankBranch ?? t.bankBranch) ? `<tr><td>Branch</td><td>${options.bankBranch ?? t.bankBranch}</td></tr>` : ''}`
      : receivingMode === 'MOMO'
      ? `<tr><td>MoMo No.</td><td>${(options.momoNumber ?? t.momoNumber) || '—'}</td></tr>
         <tr><td>MoMo Name</td><td>${(options.momoName ?? t.momoName) || '—'}</td></tr>`
      : `<tr><td>Phone</td><td>${(options.cashPhoneNumber ?? receiverPhone) || '—'}</td></tr>
         <tr><td>Ghana Card</td><td>${(options.cashGhanaCardNumber ?? t.cashGhanaCardNumber) || '—'}</td></tr>`;

  return `
  <section class="receipt">
    <div class="copy-label">${copyLabel}</div>

    <!-- Header -->
    <div class="header">
      <svg width="32" height="32" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
        <rect width="48" height="48" rx="10" fill="url(#g-${copyLabel.replace(/\s/g,'-')})"/>
        <defs><linearGradient id="g-${copyLabel.replace(/\s/g,'-')}" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stop-color="#2563EB"/><stop offset="1" stop-color="#6366F1"/>
        </linearGradient></defs>
        <text x="6" y="32" font-family="Arial Black,Arial" font-weight="900" font-size="22" fill="white">AD</text>
      </svg>
      <div>
        <div class="company-name">${COMPANY_NAME}</div>
        <div class="company-sub">${COMPANY_TAGLINE} &nbsp;·&nbsp; ${branchName}</div>
      </div>
    </div>

    <div class="divider"></div>

    <div class="title-row">
      <span class="title">${options.title ?? 'PAYMENT RECEIPT'}</span>
      <span class="code">${t.transactionCode}</span>
    </div>

    <!-- Meta: date/teller + sender/receiver in two columns -->
    <table class="meta-table" style="margin-top:3pt">
      <tr><td>Date</td><td>${dateStr} &nbsp; ${timeStr}</td><td style="width:8pt"></td><td style="color:#6b7280;width:28%">Teller</td><td style="font-weight:600">${t.paidByName || '—'}</td></tr>
    </table>

    <div class="two-col">
      <div>
        <div class="section-label">SENDER</div>
        <table class="meta-table">
          <tr><td>Name</td><td>${t.sender?.firstName ?? ''} ${t.sender?.lastName ?? ''}</td></tr>
          <tr><td>Country</td><td>${t.sender?.country || 'Canada'}</td></tr>
        </table>
      </div>
      <div>
        <div class="section-label">RECEIVER</div>
        <table class="meta-table">
          <tr><td>Name</td><td>${receiverName || '—'}</td></tr>
          ${receiverPhone ? `<tr><td>Phone</td><td>${receiverPhone}</td></tr>` : ''}
          <tr><td>Mode</td><td>${modeLabel(receivingMode)}</td></tr>
          ${modeDetails}
        </table>
      </div>
    </div>

    <div class="amount-box">
      <div class="amount-label">${options.amountLabel ?? 'AMOUNT PAID'}</div>
      <div class="amount-value">GHS ${fmt(amountPaid)}</div>
      <div class="amount-rate">@ CAD 1 = GHS ${Number(t.exchangeRateUsed).toFixed(4)} &nbsp;&nbsp;|&nbsp;&nbsp; Sent: CAD ${fmt(Number(t.cadAmount))}</div>
    </div>

    ${notes ? `<div class="notes">Note: ${notes}</div>` : ''}

    <div class="footer">
      <p>Thank you for choosing ${COMPANY_NAME} &nbsp;·&nbsp; enquiries: <strong>${COMPANY_EMAIL}</strong></p>
    </div>

    <div class="sig-row">
      <div class="sig-box">Receiver's Signature</div>
      <div class="sig-box">Teller's Signature</div>
    </div>
  </section>`;
}

export interface MultiReceiverAllocation {
  receiverName: string;
  receiverPhone: string;
  ghsAmount: number;
  notes?: string;
}

export function printMultiReceiverReceipt(
  t: Transaction,
  branchName: string,
  allocations: MultiReceiverAllocation[]
) {
  const paidAt = new Date();
  const dateStr = paidAt.toLocaleDateString('en-GH', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = paidAt.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' });

  const slips = allocations.map((alloc, idx) => `
  <section class="receipt${idx < allocations.length - 1 ? ' has-cut' : ''}">
    <div class="copy-label">RECEIVER ${idx + 1} OF ${allocations.length}</div>

    <div class="header">
      <svg width="32" height="32" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
        <rect width="48" height="48" rx="10" fill="url(#g-mr-${idx})"/>
        <defs><linearGradient id="g-mr-${idx}" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stop-color="#7c3aed"/><stop offset="1" stop-color="#4f46e5"/>
        </linearGradient></defs>
        <text x="6" y="32" font-family="Arial Black,Arial" font-weight="900" font-size="22" fill="white">AD</text>
      </svg>
      <div>
        <div class="company-name">${COMPANY_NAME}</div>
        <div class="company-sub">${COMPANY_TAGLINE} &nbsp;·&nbsp; ${branchName}</div>
      </div>
    </div>

    <div class="divider"></div>

    <div class="title-row">
      <span class="title">MULTI-RECEIVER PAYMENT</span>
      <span class="code">${t.transactionCode}</span>
    </div>

    <table class="meta-table" style="margin-top:3pt">
      <tr>
        <td>Date</td><td>${dateStr} &nbsp; ${timeStr}</td>
        <td style="width:8pt"></td>
        <td style="color:#6b7280;width:28%">Teller</td>
        <td style="font-weight:600">${t.paidByName || '—'}</td>
      </tr>
    </table>

    <div class="two-col">
      <div>
        <div class="section-label">SENDER</div>
        <table class="meta-table">
          <tr><td>Name</td><td>${t.sender?.firstName ?? ''} ${t.sender?.lastName ?? ''}</td></tr>
          <tr><td>Country</td><td>${t.sender?.country || 'Canada'}</td></tr>
        </table>
      </div>
      <div>
        <div class="section-label">RECEIVER</div>
        <table class="meta-table">
          <tr><td>Name</td><td>${alloc.receiverName || '—'}</td></tr>
          ${alloc.receiverPhone ? `<tr><td>Phone</td><td>${alloc.receiverPhone}</td></tr>` : ''}
        </table>
      </div>
    </div>

    <div class="amount-box">
      <div class="amount-label">AMOUNT PAID</div>
      <div class="amount-value">GHS ${fmt(alloc.ghsAmount)}</div>
      <div class="amount-rate">@ CAD 1 = GHS ${Number(t.exchangeRateUsed).toFixed(4)} &nbsp;&nbsp;|&nbsp;&nbsp; Sent: CAD ${fmt(Number(t.cadAmount))}</div>
    </div>

    ${alloc.notes ? `<div class="notes">Note: ${alloc.notes}</div>` : ''}

    <div class="footer">
      <p>Thank you for choosing ${COMPANY_NAME} &nbsp;·&nbsp; enquiries: <strong>${COMPANY_EMAIL}</strong></p>
    </div>

    <div class="sig-row">
      <div class="sig-box">Receiver's Signature</div>
      <div class="sig-box">Teller's Signature</div>
    </div>
  </section>
  ${idx < allocations.length - 1 ? '<div class="cut-line"><span class="cut-text">✂ &nbsp; cut here</span></div>' : ''}`
  ).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Receipt — ${t.transactionCode}</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9pt;
    color: #111;
    background: #fff;
    width: 210mm;
  }
  .receipt {
    width: 210mm;
    padding: 6mm 12mm 5mm;
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 3.5pt;
    overflow: hidden;
    page-break-after: avoid;
  }
  .cut-line {
    width: 100%;
    height: 6mm;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6pt;
  }
  .cut-line::before, .cut-line::after {
    content: '';
    flex: 1;
    border-top: 1pt dashed #9ca3af;
  }
  .cut-text {
    font-size: 6.5pt;
    color: #9ca3af;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .copy-label {
    position: absolute;
    top: 5mm;
    right: 10mm;
    font-size: 6.5pt;
    font-weight: 700;
    color: #6b7280;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border: 0.8pt solid #d1d5db;
    padding: 1pt 5pt;
    border-radius: 3pt;
  }
  .header { display: flex; align-items: center; gap: 8pt; padding-bottom: 3pt; }
  .company-name   { font-size: 11pt; font-weight: 900; letter-spacing: 0.02em; color: #4c1d95; }
  .company-sub    { font-size: 7pt; color: #6b7280; }
  .divider { border: none; border-top: 1.5pt solid #7c3aed; margin: 2.5pt 0; }
  .title-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 2pt 0;
  }
  .title { font-size: 10pt; font-weight: 800; letter-spacing: 0.04em; color: #6d28d9; }
  .code {
    font-family: 'Courier New', monospace; font-size: 9.5pt; font-weight: 700;
    background: #f5f3ff; border: 0.8pt solid #ddd6fe; padding: 1.5pt 5pt;
    border-radius: 3pt; color: #6d28d9;
  }
  .two-col { display: flex; gap: 10pt; margin-top: 3pt; }
  .two-col > div { flex: 1; }
  .section-label {
    font-size: 6.5pt; font-weight: 700; letter-spacing: 0.08em; color: #6b7280;
    text-transform: uppercase; margin-top: 4pt; margin-bottom: 1.5pt;
    border-bottom: 0.5pt solid #e5e7eb; padding-bottom: 1.5pt;
  }
  .meta-table { width: 100%; border-collapse: collapse; }
  .meta-table td { padding: 1.5pt 0; font-size: 8.5pt; vertical-align: top; }
  .meta-table td:first-child { color: #6b7280; width: 34%; }
  .meta-table td:last-child  { font-weight: 600; }
  .amount-box {
    background: #f5f3ff;
    border: 1.5pt solid #7c3aed;
    border-radius: 5pt;
    text-align: center;
    padding: 5pt 8pt;
    margin-top: 5pt;
  }
  .amount-label { font-size: 7pt; font-weight: 700; color: #7c3aed; letter-spacing: 0.06em; text-transform: uppercase; }
  .amount-value { font-size: 18pt; font-weight: 900; color: #4c1d95; letter-spacing: 0.01em; margin: 1.5pt 0; }
  .amount-rate  { font-size: 7pt; color: #6b7280; }
  .notes {
    font-size: 7.5pt; color: #374151; background: #fefce8;
    border: 0.5pt solid #fbbf24; border-radius: 3pt; padding: 3pt 5pt; margin-top: 3pt;
  }
  .footer {
    margin-top: auto; padding-top: 4pt; border-top: 0.5pt dashed #d1d5db;
    font-size: 7pt; color: #6b7280; text-align: center; line-height: 1.5;
  }
  .sig-row { display: flex; gap: 10pt; margin-top: 5pt; }
  .sig-box {
    flex: 1; border-top: 0.8pt solid #374151; padding-top: 2pt;
    font-size: 7pt; color: #6b7280; text-align: center;
  }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  ${slips}
  <script>
    window.onload = function() { window.print(); }
  <\/script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=700,height=900');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

export interface MultiReceiverStatementRow {
  receiverName: string;
  receiverPhone: string;
  ghsAmount: number;
  notes?: string;
  isPaid: boolean;
  paidAt?: string;
  paidByName?: string;
}

export function printMultiReceiverStatement(
  t: Transaction,
  branchName: string,
  rows: MultiReceiverStatementRow[]
) {
  const printedAt = new Date();
  const dateStr = printedAt.toLocaleDateString('en-GH', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = printedAt.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' });

  const totalGHS = rows.reduce((s, r) => s + r.ghsAmount, 0);
  const paidGHS  = rows.filter((r) => r.isPaid).reduce((s, r) => s + r.ghsAmount, 0);
  const pendingGHS = totalGHS - paidGHS;
  const paidCount  = rows.filter((r) => r.isPaid).length;

  let running = totalGHS;
  const rowsHtml = rows.map((r, i) => {
    const rowClass = r.isPaid ? 'paid' : 'pending';
    const statusBadge = r.isPaid
      ? `<span class="badge paid-badge">PAID</span>`
      : `<span class="badge pending-badge">PENDING</span>`;
    const paidAtStr = r.paidAt
      ? new Date(r.paidAt).toLocaleDateString('en-GH', { day: '2-digit', month: 'short', year: 'numeric' }) +
        ' ' + new Date(r.paidAt).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })
      : '—';
    const prevRunning = running;
    if (r.isPaid) running -= r.ghsAmount;
    return `
    <tr class="${rowClass}">
      <td class="num">${i + 1}</td>
      <td>
        <div class="rcv-name">${r.receiverName}</div>
        <div class="rcv-phone">${r.receiverPhone}</div>
        ${r.notes ? `<div class="rcv-note">${r.notes}</div>` : ''}
      </td>
      <td class="amt">GHS ${fmt(r.ghsAmount)}</td>
      <td class="center">${statusBadge}</td>
      <td class="meta">${r.isPaid ? `${paidAtStr}<br/><span class="teller">${r.paidByName || '—'}</span>` : '—'}</td>
      <td class="amt ${r.isPaid ? 'paid-amt' : 'dim'}">GHS ${fmt(r.isPaid ? prevRunning - r.ghsAmount : prevRunning)}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Statement of Payment — ${t.transactionCode}</title>
<style>
  @page { size: A4 portrait; margin: 14mm 16mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #111; background: #fff; }

  /* ── Header ── */
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 8pt; border-bottom: 2pt solid #7c3aed; margin-bottom: 10pt; }
  .logo-row { display: flex; align-items: center; gap: 8pt; }
  .company-name { font-size: 12pt; font-weight: 900; color: #4c1d95; letter-spacing: 0.02em; }
  .company-sub { font-size: 7pt; color: #6b7280; margin-top: 1pt; }
  .doc-title { text-align: right; }
  .doc-title h1 { font-size: 13pt; font-weight: 900; color: #4c1d95; letter-spacing: 0.03em; }
  .doc-title .code { font-family: 'Courier New', monospace; font-size: 10pt; font-weight: 700; color: #6d28d9; display: inline-block; margin-top: 2pt; background: #f5f3ff; border: 0.8pt solid #ddd6fe; padding: 1.5pt 6pt; border-radius: 3pt; }
  .doc-title .meta { font-size: 7pt; color: #9ca3af; margin-top: 3pt; }

  /* ── Transaction summary ── */
  .tx-summary { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6pt; margin-bottom: 10pt; }
  .summary-box { background: #f8f7ff; border: 0.8pt solid #e9d5ff; border-radius: 4pt; padding: 5pt 8pt; }
  .summary-box .lbl { font-size: 6.5pt; font-weight: 700; color: #7c3aed; text-transform: uppercase; letter-spacing: 0.06em; }
  .summary-box .val { font-size: 11pt; font-weight: 900; color: #4c1d95; margin-top: 1pt; }
  .summary-box .sub { font-size: 7pt; color: #6b7280; margin-top: 0.5pt; }

  /* ── People ── */
  .people { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt; margin-bottom: 10pt; }
  .person-box { border: 0.8pt solid #e5e7eb; border-radius: 4pt; padding: 5pt 8pt; }
  .person-box .section-label { font-size: 6.5pt; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3pt; }
  .person-box .name { font-size: 9.5pt; font-weight: 700; color: #111; }
  .person-box .detail { font-size: 7.5pt; color: #6b7280; margin-top: 1pt; }

  /* ── KPI bar ── */
  .kpi-bar { display: flex; gap: 6pt; margin-bottom: 8pt; }
  .kpi { flex: 1; text-align: center; border-radius: 4pt; padding: 4pt 6pt; }
  .kpi.total   { background: #f5f3ff; border: 0.8pt solid #ddd6fe; }
  .kpi.paid-k  { background: #f0fdf4; border: 0.8pt solid #bbf7d0; }
  .kpi.pending-k { background: #fffbeb; border: 0.8pt solid #fde68a; }
  .kpi .k-lbl { font-size: 6.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; }
  .kpi.paid-k .k-lbl { color: #15803d; }
  .kpi.pending-k .k-lbl { color: #92400e; }
  .kpi .k-val { font-size: 10pt; font-weight: 900; color: #4c1d95; margin-top: 1pt; }
  .kpi.paid-k .k-val  { color: #15803d; }
  .kpi.pending-k .k-val { color: #92400e; }

  /* ── Table ── */
  .section-title { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #6b7280; margin-bottom: 4pt; border-bottom: 0.5pt solid #e5e7eb; padding-bottom: 2pt; }
  table.stmt { width: 100%; border-collapse: collapse; font-size: 8pt; }
  table.stmt thead tr { background: #f5f3ff; }
  table.stmt thead th { padding: 4pt 5pt; text-align: left; font-size: 6.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #6d28d9; border-bottom: 1pt solid #ddd6fe; }
  table.stmt thead th.num { width: 18pt; text-align: center; }
  table.stmt thead th.amt { text-align: right; }
  table.stmt thead th.center { text-align: center; }
  table.stmt td { padding: 4pt 5pt; vertical-align: top; border-bottom: 0.5pt solid #f3f4f6; }
  table.stmt td.num { text-align: center; color: #9ca3af; font-size: 7.5pt; }
  table.stmt td.amt { text-align: right; font-weight: 700; font-size: 8.5pt; }
  table.stmt td.paid-amt { color: #15803d; }
  table.stmt td.dim { color: #9ca3af; }
  table.stmt td.center { text-align: center; }
  table.stmt td.meta { font-size: 7pt; color: #6b7280; }
  table.stmt .teller { font-size: 6.5pt; color: #9ca3af; }
  table.stmt tr.paid { background: #fff; }
  table.stmt tr.paid td.rcv-name { color: #111; }
  table.stmt tr.pending { background: #fffbeb; }
  .rcv-name { font-weight: 700; color: #111; font-size: 8.5pt; }
  .rcv-phone { font-size: 7.5pt; color: #6b7280; }
  .rcv-note  { font-size: 7pt; color: #92400e; background: #fef3c7; border-radius: 2pt; padding: 0.5pt 3pt; display: inline-block; margin-top: 1pt; }
  .badge { font-size: 6.5pt; font-weight: 700; padding: 1.5pt 5pt; border-radius: 10pt; letter-spacing: 0.05em; text-transform: uppercase; }
  .paid-badge    { background: #dcfce7; color: #15803d; border: 0.8pt solid #bbf7d0; }
  .pending-badge { background: #fef3c7; color: #92400e; border: 0.8pt solid #fde68a; }
  tfoot td { padding: 5pt; font-size: 8.5pt; font-weight: 700; border-top: 1.5pt solid #ddd6fe; background: #f5f3ff; }
  tfoot td.amt { text-align: right; color: #4c1d95; }
  tfoot td.paid-amt { color: #15803d; }

  /* ── Footer ── */
  .doc-footer { margin-top: 12pt; padding-top: 6pt; border-top: 0.5pt dashed #d1d5db; display: flex; justify-content: space-between; align-items: flex-end; }
  .doc-footer .sig-block { font-size: 7pt; color: #6b7280; text-align: center; }
  .sig-line { border-top: 0.8pt solid #374151; width: 80pt; margin: 20pt auto 2pt; }
  .doc-footer .note { font-size: 7pt; color: #9ca3af; text-align: center; flex: 1; padding: 0 12pt; }

  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>

  <!-- Header -->
  <div class="doc-header">
    <div class="logo-row">
      <svg width="34" height="34" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="48" height="48" rx="10" fill="url(#g-stmt)"/>
        <defs><linearGradient id="g-stmt" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stop-color="#7c3aed"/><stop offset="1" stop-color="#4f46e5"/>
        </linearGradient></defs>
        <text x="6" y="32" font-family="Arial Black,Arial" font-weight="900" font-size="22" fill="white">AD</text>
      </svg>
      <div>
        <div class="company-name">${COMPANY_NAME}</div>
        <div class="company-sub">${COMPANY_TAGLINE} &nbsp;·&nbsp; ${branchName}</div>
      </div>
    </div>
    <div class="doc-title">
      <h1>STATEMENT OF PAYMENT</h1>
      <div class="code">${t.transactionCode}</div>
      <div class="meta">Printed: ${dateStr} &nbsp; ${timeStr}</div>
    </div>
  </div>

  <!-- Transaction summary -->
  <div class="tx-summary">
    <div class="summary-box">
      <div class="lbl">CAD Sent</div>
      <div class="val">CAD ${fmt(Number(t.cadAmount))}</div>
      <div class="sub">${new Date(t.transactionDate ?? t.createdAt).toLocaleDateString('en-GH', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
    </div>
    <div class="summary-box">
      <div class="lbl">GHS Total</div>
      <div class="val">GHS ${fmt(totalGHS)}</div>
      <div class="sub">@ CAD 1 = GHS ${Number(t.exchangeRateUsed).toFixed(4)}</div>
    </div>
    <div class="summary-box">
      <div class="lbl">Receiving Mode</div>
      <div class="val" style="font-size:9pt">${t.receivingMode ?? 'CASH'}</div>
      <div class="sub">${t.receivingPoint?.name ?? branchName}</div>
    </div>
  </div>

  <!-- People -->
  <div class="people">
    <div class="person-box">
      <div class="section-label">Sender</div>
      <div class="name">${t.sender?.firstName ?? ''} ${t.sender?.lastName ?? ''}</div>
      <div class="detail">${t.sender?.phone ?? ''}</div>
      <div class="detail">${t.sender?.country || 'Canada'}</div>
    </div>
    <div class="person-box">
      <div class="section-label">Transaction Info</div>
      <div class="name">${t.transactionCode}</div>
      <div class="detail">Payment: ${(t.paymentMethod ?? '').replace('_', ' ')}</div>
      <div class="detail">Created by: ${t.createdBy?.firstName ?? ''} ${t.createdBy?.lastName ?? ''}</div>
    </div>
  </div>

  <!-- KPI bar -->
  <div class="kpi-bar">
    <div class="kpi total">
      <div class="k-lbl">Total Allocations</div>
      <div class="k-val">${rows.length}</div>
    </div>
    <div class="kpi paid-k">
      <div class="k-lbl">Paid (${paidCount})</div>
      <div class="k-val">GHS ${fmt(paidGHS)}</div>
    </div>
    <div class="kpi pending-k">
      <div class="k-lbl">Outstanding (${rows.length - paidCount})</div>
      <div class="k-val">GHS ${fmt(pendingGHS)}</div>
    </div>
  </div>

  <!-- Allocations table -->
  <div class="section-title">Receiver Allocations &amp; Running Balance</div>
  <table class="stmt">
    <thead>
      <tr>
        <th class="num">#</th>
        <th>Receiver</th>
        <th class="amt">GHS Amount</th>
        <th class="center">Status</th>
        <th>Paid At / Teller</th>
        <th class="amt">Running Balance</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2" style="font-size:7.5pt">Total &nbsp;·&nbsp; ${rows.length} allocation${rows.length !== 1 ? 's' : ''}</td>
        <td class="amt">GHS ${fmt(totalGHS)}</td>
        <td></td>
        <td style="font-size:7.5pt">${paidCount} paid &nbsp;·&nbsp; ${rows.length - paidCount} pending</td>
        <td class="amt paid-amt">GHS ${fmt(pendingGHS)} remaining</td>
      </tr>
    </tfoot>
  </table>

  <!-- Footer -->
  <div class="doc-footer">
    <div class="sig-block">
      <div class="sig-line"></div>
      Authorised Signature
    </div>
    <div class="note">
      This is a computer-generated statement of payment for transaction ${t.transactionCode}.<br/>
      Enquiries: <strong>${COMPANY_EMAIL}</strong>
    </div>
    <div class="sig-block">
      <div class="sig-line"></div>
      Branch Manager
    </div>
  </div>

  <script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=860,height=1000');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

export function printReceipt(t: Transaction, branchName: string, options: ReceiptPrintOptions = {}) {
  const customerCopy = buildCopy(t, branchName, 'CUSTOMER COPY', options);
  const officeCopy   = buildCopy(t, branchName, 'OFFICE COPY', options);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Receipt — ${t.transactionCode}</title>
<style>
  /*
   * One A4 sheet, portrait. Two half-page copies stacked vertically.
   * Each copy = 148mm wide × ~138mm tall (half of 297mm minus cut margin).
   * Print → cut along the dashed line → hand customer copy to customer.
   */
  @page {
    size: A4 portrait;
    margin: 0;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9pt;
    color: #111;
    background: #fff;
    width: 210mm;
  }

  /* Wrapper: two halves stacked on one A4 page */
  .page {
    width: 210mm;
    height: 297mm;
    display: flex;
    flex-direction: column;
  }

  /* Cut line between the two halves */
  .cut-line {
    width: 100%;
    height: 6mm;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6pt;
    flex-shrink: 0;
  }
  .cut-line::before, .cut-line::after {
    content: '';
    flex: 1;
    border-top: 1pt dashed #9ca3af;
  }
  .cut-text {
    font-size: 6.5pt;
    color: #9ca3af;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  /* Each copy occupies exactly half the A4 page */
  .receipt {
    width: 210mm;
    height: calc((297mm - 6mm) / 2);
    padding: 6mm 12mm 5mm;
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 3.5pt;
    overflow: hidden;
  }

  .copy-label {
    position: absolute;
    top: 5mm;
    right: 10mm;
    font-size: 6.5pt;
    font-weight: 700;
    color: #6b7280;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border: 0.8pt solid #d1d5db;
    padding: 1pt 5pt;
    border-radius: 3pt;
  }

  /* Header */
  .header { display: flex; align-items: center; gap: 8pt; padding-bottom: 3pt; }
  .company-name   { font-size: 11pt; font-weight: 900; letter-spacing: 0.02em; color: #1e3a8a; }
  .company-sub    { font-size: 7pt; color: #6b7280; }
  .company-branch { font-size: 7pt; color: #374151; font-weight: 600; margin-top: 1pt; }

  .divider { border: none; border-top: 1.5pt solid #1d4ed8; margin: 2.5pt 0; }

  .title-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 2pt 0;
  }
  .title { font-size: 10pt; font-weight: 800; letter-spacing: 0.04em; color: #1e40af; }
  .code {
    font-family: 'Courier New', monospace; font-size: 9.5pt; font-weight: 700;
    background: #eff6ff; border: 0.8pt solid #bfdbfe; padding: 1.5pt 5pt;
    border-radius: 3pt; color: #1d4ed8;
  }

  /* Two-column layout for sender+receiver side by side */
  .two-col { display: flex; gap: 10pt; margin-top: 3pt; }
  .two-col > div { flex: 1; }

  /* Tables */
  .section-label {
    font-size: 6.5pt; font-weight: 700; letter-spacing: 0.08em; color: #6b7280;
    text-transform: uppercase; margin-top: 4pt; margin-bottom: 1.5pt;
    border-bottom: 0.5pt solid #e5e7eb; padding-bottom: 1.5pt;
  }
  .meta-table { width: 100%; border-collapse: collapse; }
  .meta-table td { padding: 1.5pt 0; font-size: 8.5pt; vertical-align: top; }
  .meta-table td:first-child { color: #6b7280; width: 34%; }
  .meta-table td:last-child  { font-weight: 600; }

  /* Amount box */
  .amount-box {
    background: #eff6ff;
    border: 1.5pt solid #1d4ed8;
    border-radius: 5pt;
    text-align: center;
    padding: 5pt 8pt;
    margin-top: 5pt;
  }
  .amount-label { font-size: 7pt; font-weight: 700; color: #3b82f6; letter-spacing: 0.06em; text-transform: uppercase; }
  .amount-value { font-size: 18pt; font-weight: 900; color: #1e3a8a; letter-spacing: 0.01em; margin: 1.5pt 0; }
  .amount-rate  { font-size: 7pt; color: #6b7280; }

  .notes {
    font-size: 7.5pt; color: #374151; background: #fefce8;
    border: 0.5pt solid #fbbf24; border-radius: 3pt; padding: 3pt 5pt; margin-top: 3pt;
  }

  /* Footer */
  .footer {
    margin-top: auto; padding-top: 4pt; border-top: 0.5pt dashed #d1d5db;
    font-size: 7pt; color: #6b7280; text-align: center; line-height: 1.5;
  }

  /* Signatures */
  .sig-row { display: flex; gap: 10pt; margin-top: 5pt; }
  .sig-box {
    flex: 1; border-top: 0.8pt solid #374151; padding-top: 2pt;
    font-size: 7pt; color: #6b7280; text-align: center;
  }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="page">
    ${customerCopy}
    <div class="cut-line"><span class="cut-text">✂ &nbsp; cut here</span></div>
    ${officeCopy}
  </div>
  <script>
    window.onload = function() { window.print(); }
  <\/script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=700,height=900');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}
