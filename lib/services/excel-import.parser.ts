/**
 * excel-import.parser — turns a sending-side Excel day-sheet into structured rows.
 *
 * The sending side does not use the sending portal; they keep a spreadsheet per
 * business day, one sheet per receiving branch.  The receiving side uploads that
 * file here and the transactions land ready for tellers to disburse.
 *
 * Sheet shape (as produced by the sending side):
 *
 *   row 0   "08TH SEPTEMBER 2026 TUESDAY ACCRA"   ← business date + branch
 *   row 1   #  | FROM | TO | CAN | USD | GHC      ← header (column order varies)
 *   row 2+  1  | AYISI | FLORENCE | 4500 |  | 37350
 *           5  | DORA BARIMAH | DANIEL ARKO NIMAFUL | 3073 | | 25505.9
 *           6  | GCB TARKWA BRANCH | A/C 4051120007007 | | | 0   ← bank detail for row 5
 *           9  | JULIANA | JOYCE OPOKU 0224963600 | 123 | | 1020.9  ← momo
 *   last    TOTAL row
 *
 * Classification rules:
 *   · A row whose TO starts with "A/C" is not a transaction — it carries the bank
 *     details of the row ABOVE it.  That row becomes receivingMode = BANK, with
 *     bankName from the detail row's FROM and the account number from its TO.
 *   · Otherwise, a TO ending in a run of 9–12 digits is a MOMO payout; the digits
 *     are the mobile-money number and the leading text is the receiver's name.
 *     Numbers are normalised to a leading 0 (the sheet often drops it).
 *   · Everything else is a CASH payout.
 *
 * This module is pure — no database, no Prisma.  It is safe to unit-test and is
 * the single source of truth for how a sheet is interpreted.
 */

import * as XLSX from 'xlsx';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ParsedReceivingMode = 'CASH' | 'BANK' | 'MOMO';

export type IssueSeverity = 'error' | 'warning';

export interface ParsedIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
}

export interface ParsedRow {
  /** 1-based row number as shown in Excel, so the user can find it in the file. */
  excelRow: number;
  /** The sheet's own "#" column, when present. */
  lineNo: number | null;

  senderName: string;
  receiverName: string;

  cadAmount: number;
  /** The GHS actually paid out — pesewas are dropped, never rounded up. */
  ghsAmount: number;
  /** The GHS exactly as the sheet wrote it, before the pesewas were dropped. */
  ghsRaw: number;
  usdAmount: number | null;
  /** ghsRaw / cadAmount for this row, rounded to 4dp. */
  rate: number | null;

  receivingMode: ParsedReceivingMode;

  /** MOMO: normalised to a leading 0. */
  momoNumber: string | null;
  /** MOMO: exactly what the sheet contained, for audit. */
  momoNumberRaw: string | null;

  /** BANK: taken from the following "A/C" detail row. */
  bankName: string | null;
  bankAccountNo: string | null;
  /** Excel row the bank details came from. */
  bankDetailRow: number | null;

  /** Free-text marker found in the columns after the amounts (e.g. "NP", "ETRANS"). */
  note: string | null;

  issues: ParsedIssue[];
  /** Rows with an error default to excluded; the user can still fix and include them. */
  include: boolean;
}

export interface ParsedSheet {
  sheetName: string;
  /** Branch code inferred from the sheet name (ACCRA, KUMASI …). */
  branchCode: string | null;
  title: string;
  /** ISO yyyy-mm-dd parsed from the title row. */
  transactionDate: string | null;
  /** Most common ghs/cad across rows — used as the day's exchange rate. */
  dominantRate: number | null;
  rows: ParsedRow[];
  /** Totals computed from the rows we parsed. */
  computedTotals: { cad: number; ghs: number; ghsRaw: number; count: number };
  /** Totals as declared on the sheet's own TOTAL row, when present. */
  declaredTotals: { cad: number | null; ghs: number | null } | null;
  issues: ParsedIssue[];
}

export interface ParsedWorkbook {
  sheets: ParsedSheet[];
  issues: ParsedIssue[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6,
  JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
  JAN: 1, FEB: 2, MAR: 3, APR: 4, JUN: 6, JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12,
};

/** Valid Ghanaian mobile prefixes (after the leading 0). */
const GH_MOMO_PREFIXES = [
  '020', '023', '024', '025', '026', '027', '028',
  '050', '053', '054', '055', '056', '057', '059',
];

/** Rows whose TO cell matches these are structural, not transactions. */
const NON_TRANSACTION_TO = /^\s*(TOTAL|TOTALS|SUB\s*TOTAL|GRAND\s*TOTAL)\s*$/i;

const BANK_DETAIL_RE = /^\s*A\s*\/\s*C\b\.?\s*/i;

/** A receiver cell ending in 9–12 digits, e.g. "JOYCE OPOKU 0244130552". */
const TRAILING_NUMBER_RE = /^(.*?)[\s,\-–—:]*(\d[\d\s\-]{7,})\s*$/;

// ─── Small helpers ───────────────────────────────────────────────────────────

function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

function cellNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const cleaned = String(v).replace(/[,\s$]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Excel arithmetic leaves noise like 2000.3000000000002 — snap to 2dp. */
function money(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function rate4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

/** Collapse internal whitespace and trim — sheets are full of trailing spaces. */
export function tidyName(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function issue(severity: IssueSeverity, code: string, message: string): ParsedIssue {
  return { severity, code, message };
}

// ─── Title row → business date + branch ──────────────────────────────────────

/**
 * "08TH SEPTEMBER 2026 TUESDAY ACCRA" → 2026-09-08
 * "05 SEPTEMBER 2026 WEEKEND ACCRA"   → 2026-09-05
 *
 * Returned as a plain ISO date string; the caller turns it into a UTC-midnight
 * Date so it lines up with the system's @db.Date business dates.
 */
export function parseTitleDate(title: string): string | null {
  const t = title.toUpperCase();

  // "08TH SEPTEMBER 2026" / "5 SEPT 2026"
  const dmy = t.match(/\b(\d{1,2})\s*(?:ST|ND|RD|TH)?\s+([A-Z]+)\.?\s+(\d{4})\b/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = MONTHS[dmy[2]];
    const year = Number(dmy[3]);
    if (month && day >= 1 && day <= 31) return isoDate(year, month, day);
  }

  // "SEPTEMBER 08 2026"
  const mdy = t.match(/\b([A-Z]+)\.?\s+(\d{1,2})\s*(?:ST|ND|RD|TH)?,?\s+(\d{4})\b/);
  if (mdy) {
    const month = MONTHS[mdy[1]];
    const day = Number(mdy[2]);
    const year = Number(mdy[3]);
    if (month && day >= 1 && day <= 31) return isoDate(year, month, day);
  }

  // "08/09/2026" or "2026-09-08"
  const numeric = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (numeric) return isoDate(Number(numeric[1]), Number(numeric[2]), Number(numeric[3]));

  return null;
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "ACCRA (2)" → "ACCRA".  Sheet names are the authoritative branch marker. */
export function normaliseBranchCode(sheetName: string): string {
  return sheetName
    .toUpperCase()
    .replace(/\(\s*\d+\s*\)/g, '')   // drop the "(2)" duplicate-sheet suffix
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Mobile money normalisation ──────────────────────────────────────────────

export interface NormalisedMomo {
  value: string | null;
  issues: ParsedIssue[];
}

/**
 * The sending side's sheet frequently drops the leading 0 (Excel treats the cell
 * as a number), so "244130552" and "0244130552" both appear.  Everything is
 * normalised to the 10-digit 0-prefixed local form the receiving side dials.
 */
export function normaliseMomoNumber(raw: string): NormalisedMomo {
  const issues: ParsedIssue[] = [];
  let digits = raw.replace(/\D/g, '');

  if (!digits) {
    return { value: null, issues: [issue('error', 'MOMO_EMPTY', 'No mobile money number found.')] };
  }

  // +233 24 413 0552 → 0244130552
  if (digits.startsWith('233') && digits.length >= 12) {
    digits = '0' + digits.slice(3);
  }

  if (digits.length === 9) {
    // Leading zero stripped by Excel — restore it.
    digits = '0' + digits;
  }

  if (digits.length === 10 && !digits.startsWith('0')) {
    issues.push(issue('warning', 'MOMO_NO_LEADING_ZERO',
      `Number "${raw}" is 10 digits but does not start with 0 — check it.`));
  }

  if (digits.length !== 10) {
    issues.push(issue('error', 'MOMO_LENGTH',
      `"${raw}" normalises to ${digits.length} digits (${digits}); a Ghana mobile number must be 10. Correct it before importing.`));
    return { value: digits, issues };
  }

  const prefix = digits.slice(0, 3);
  if (!GH_MOMO_PREFIXES.includes(prefix)) {
    issues.push(issue('warning', 'MOMO_PREFIX',
      `Prefix ${prefix} is not a recognised Ghana mobile prefix — verify ${digits}.`));
  }

  return { value: digits, issues };
}

// ─── Header mapping ──────────────────────────────────────────────────────────

interface ColumnMap {
  headerRow: number;
  lineNo: number | null;
  from: number;
  to: number;
  cad: number | null;
  usd: number | null;
  ghs: number | null;
  /** Columns after the amounts that may carry a free-text marker. */
  extras: number[];
}

const HEADER_ALIASES = {
  from: ['FROM', 'SENDER', 'FROM (SENDER)'],
  to:   ['TO', 'RECEIVER', 'TO (RECEIVER)', 'BENEFICIARY'],
  cad:  ['CAN', 'CAD', 'CAD$', 'CANADIAN', 'CAN$'],
  usd:  ['USD', 'US', 'US$', 'USD$'],
  ghs:  ['GHC', 'GNC', 'GHS', 'CEDIS', 'GH', 'GHC.'],
};

function matchesAlias(value: string, aliases: string[]): boolean {
  const v = value.toUpperCase().replace(/[^A-Z$]/g, '');
  return aliases.some((a) => a.replace(/[^A-Z$]/g, '') === v);
}

function findColumnMap(rows: unknown[][]): ColumnMap | null {
  const limit = Math.min(rows.length, 12);

  for (let r = 0; r < limit; r++) {
    const row = rows[r] ?? [];
    let from = -1;
    let to = -1;

    for (let c = 0; c < row.length; c++) {
      const text = cellText(row[c]);
      if (!text) continue;
      if (from === -1 && matchesAlias(text, HEADER_ALIASES.from)) from = c;
      else if (to === -1 && matchesAlias(text, HEADER_ALIASES.to)) to = c;
    }

    if (from === -1 || to === -1) continue;

    let cad: number | null = null;
    let usd: number | null = null;
    let ghs: number | null = null;
    const extras: number[] = [];

    for (let c = 0; c < row.length; c++) {
      const text = cellText(row[c]);
      if (!text || c === from || c === to) continue;
      if (cad === null && matchesAlias(text, HEADER_ALIASES.cad)) { cad = c; continue; }
      if (usd === null && matchesAlias(text, HEADER_ALIASES.usd)) { usd = c; continue; }
      // Some sheets repeat GHC/GNC (raw then rounded) — the first one is authoritative.
      if (ghs === null && matchesAlias(text, HEADER_ALIASES.ghs)) { ghs = c; continue; }
    }

    // Anything to the left of FROM that holds the running "#" counter.
    const lineNo = from > 0 ? from - 1 : null;

    // Columns beyond the last amount column may carry markers like "NP"/"ETRANS".
    const lastAmount = Math.max(cad ?? -1, usd ?? -1, ghs ?? -1, to);
    for (let c = lastAmount + 1; c < Math.max(row.length, lastAmount + 4); c++) {
      extras.push(c);
    }

    return { headerRow: r, lineNo, from, to, cad, usd, ghs, extras };
  }

  return null;
}

// ─── Sheet parser ────────────────────────────────────────────────────────────

function parseSheet(sheetName: string, rows: unknown[][]): ParsedSheet {
  const sheetIssues: ParsedIssue[] = [];

  // Title = first non-empty cell in the sheet.
  let title = '';
  for (const row of rows) {
    const first = (row ?? []).map(cellText).find((t) => t.length > 0);
    if (first) { title = first; break; }
  }

  const transactionDate = parseTitleDate(title);
  if (!transactionDate) {
    sheetIssues.push(issue('error', 'NO_DATE',
      `Could not read a business date from the sheet title ${title ? `"${title}"` : '(title row is empty)'}. Set it manually before importing.`));
  }

  const branchCode = normaliseBranchCode(sheetName) || null;

  const map = findColumnMap(rows);
  if (!map) {
    sheetIssues.push(issue('error', 'NO_HEADER',
      'Could not find a header row containing FROM and TO. Check the sheet layout.'));
    return {
      sheetName, branchCode, title, transactionDate,
      dominantRate: null, rows: [],
      computedTotals: { cad: 0, ghs: 0, ghsRaw: 0, count: 0 },
      declaredTotals: null, issues: sheetIssues,
    };
  }

  if (map.cad === null) {
    sheetIssues.push(issue('error', 'NO_CAD_COLUMN', 'No CAN/CAD amount column found in the header row.'));
  }
  if (map.ghs === null) {
    sheetIssues.push(issue('error', 'NO_GHS_COLUMN', 'No GHC/GNC amount column found in the header row.'));
  }

  const parsed: ParsedRow[] = [];
  let declaredTotals: ParsedSheet['declaredTotals'] = null;

  for (let r = map.headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const excelRow = r + 1;

    const fromText = tidyName(cellText(row[map.from]));
    const toText = tidyName(cellText(row[map.to]));
    const cad = map.cad !== null ? cellNumber(row[map.cad]) : null;
    const usd = map.usd !== null ? cellNumber(row[map.usd]) : null;
    const ghs = map.ghs !== null ? cellNumber(row[map.ghs]) : null;

    // ── TOTAL row → capture declared totals, then stop reading transactions ──
    if (NON_TRANSACTION_TO.test(toText) || NON_TRANSACTION_TO.test(fromText)) {
      declaredTotals = { cad: cad ?? null, ghs: ghs ?? null };
      continue;
    }

    // ── Bank detail row → belongs to the previous transaction ────────────────
    if (BANK_DETAIL_RE.test(toText)) {
      const accountNo = toText.replace(BANK_DETAIL_RE, '').replace(/\s+/g, '').trim();
      const target = parsed[parsed.length - 1];

      if (!target) {
        sheetIssues.push(issue('warning', 'ORPHAN_BANK_ROW',
          `Row ${excelRow} holds bank details ("${toText}") but no transaction row precedes it — ignored.`));
        continue;
      }

      target.receivingMode = 'BANK';
      target.bankName = fromText || null;
      target.bankAccountNo = accountNo || null;
      target.bankDetailRow = excelRow;

      // A bank payout supersedes any number that looked like momo on the name row.
      target.momoNumber = null;
      target.momoNumberRaw = null;
      target.issues = target.issues.filter((i) => !i.code.startsWith('MOMO_'));

      if (!accountNo) {
        target.issues.push(issue('error', 'BANK_NO_ACCOUNT',
          `Bank row ${excelRow} has no account number after "A/C".`));
      }
      if (!fromText) {
        target.issues.push(issue('warning', 'BANK_NO_NAME',
          `Bank row ${excelRow} has no bank name in the FROM column.`));
      }
      continue;
    }

    // ── Blank / filler row ───────────────────────────────────────────────────
    const hasAnyAmount = (cad ?? 0) !== 0 || (ghs ?? 0) !== 0 || (usd ?? 0) !== 0;
    if (!fromText && !toText && !hasAnyAmount) continue;

    // A numbered-but-empty row (e.g. "45" with a 0 total) is filler, not a transaction.
    if (!fromText && !toText) continue;

    // ── Transaction row ──────────────────────────────────────────────────────
    const issues: ParsedIssue[] = [];
    const lineNo = map.lineNo !== null ? cellNumber(row[map.lineNo]) : null;

    let receiverName = toText;
    let receivingMode: ParsedReceivingMode = 'CASH';
    let momoNumber: string | null = null;
    let momoNumberRaw: string | null = null;

    const numberMatch = toText.match(TRAILING_NUMBER_RE);
    if (numberMatch) {
      const namePart = tidyName(numberMatch[1]);
      const rawNumber = numberMatch[2].trim();

      receivingMode = 'MOMO';
      momoNumberRaw = rawNumber;
      receiverName = namePart;

      const normalised = normaliseMomoNumber(rawNumber);
      momoNumber = normalised.value;
      issues.push(...normalised.issues);

      if (!namePart) {
        issues.push(issue('error', 'NO_RECEIVER_NAME',
          `Row ${excelRow} has a mobile number but no receiver name.`));
      }
    }

    if (!fromText) {
      issues.push(issue('error', 'NO_SENDER', `Row ${excelRow} has no sender in the FROM column.`));
    }
    if (!receiverName) {
      issues.push(issue('error', 'NO_RECEIVER_NAME', `Row ${excelRow} has no receiver name in the TO column.`));
    }
    if (/^WILL\s*CALL$/i.test(receiverName)) {
      issues.push(issue('warning', 'WILL_CALL',
        `Row ${excelRow} is marked "WILL CALL" — confirm the receiver's name before disbursing.`));
    }

    if (cad === null || cad <= 0) {
      issues.push(issue('error', 'NO_CAD', `Row ${excelRow} has no CAD amount.`));
    }
    if (ghs === null || ghs <= 0) {
      issues.push(issue('error', 'NO_GHS', `Row ${excelRow} has no GHS amount.`));
    } else if (Math.floor(money(ghs)) <= 0) {
      issues.push(issue('error', 'NO_GHS',
        `Row ${excelRow} is GHS ${money(ghs).toFixed(2)}, which drops to zero once the pesewas are removed.`));
    }

    const cadAmount = money(cad ?? 0);
    // Ghana pays whole cedis — the pesewas on the sheet are dropped, not rounded,
    // so the receiver is never handed more than the sheet authorised.
    const ghsRaw = money(ghs ?? 0);
    const ghsAmount = Math.floor(ghsRaw);
    // Rate is derived from what the sheet wrote, so dropping pesewas cannot
    // manufacture a drift warning on an otherwise correct row.
    const rowRate = cadAmount > 0 && ghsRaw > 0 ? rate4(ghsRaw / cadAmount) : null;

    // Free-text marker in the trailing columns (NP, ETRANS, KEVIN TD …)
    let note: string | null = null;
    for (const c of map.extras) {
      const text = cellText(row[c]);
      if (text && Number.isNaN(Number(text))) { note = tidyName(text); break; }
    }

    parsed.push({
      excelRow,
      lineNo: lineNo !== null ? Math.trunc(lineNo) : null,
      senderName: fromText,
      receiverName,
      cadAmount,
      ghsAmount,
      ghsRaw,
      usdAmount: usd !== null ? money(usd) : null,
      rate: rowRate,
      receivingMode,
      momoNumber,
      momoNumberRaw,
      bankName: null,
      bankAccountNo: null,
      bankDetailRow: null,
      note,
      issues,
      include: true,
    });
  }

  // ── Dominant rate ─────────────────────────────────────────────────────────
  const rateCounts = new Map<number, number>();
  for (const row of parsed) {
    if (row.rate === null) continue;
    rateCounts.set(row.rate, (rateCounts.get(row.rate) ?? 0) + 1);
  }
  let dominantRate: number | null = null;
  let best = 0;
  for (const [value, count] of rateCounts) {
    if (count > best) { best = count; dominantRate = value; }
  }

  // Flag rows whose implied rate is materially off the day's rate — usually a typo.
  if (dominantRate) {
    for (const row of parsed) {
      if (row.rate === null) continue;
      const drift = Math.abs(row.rate - dominantRate) / dominantRate;
      if (drift > 0.02) {
        row.issues.push(issue('warning', 'RATE_DRIFT',
          `Row ${row.excelRow} implies a rate of ${row.rate} vs the sheet's ${dominantRate} — verify the amounts.`));
      }
    }
  }

  // Rows carrying an error start excluded so a careless import cannot post bad data.
  for (const row of parsed) {
    row.include = !row.issues.some((i) => i.severity === 'error');
  }

  const computedTotals = parsed.reduce(
    (acc, row) => ({
      cad: money(acc.cad + row.cadAmount),
      ghs: money(acc.ghs + row.ghsAmount),
      ghsRaw: money(acc.ghsRaw + row.ghsRaw),
      count: acc.count + 1,
    }),
    { cad: 0, ghs: 0, ghsRaw: 0, count: 0 }
  );

  // Reconcile against the sheet's own TOTAL row — catches rows we failed to read.
  if (declaredTotals?.cad != null && Math.abs(money(declaredTotals.cad) - computedTotals.cad) > 0.01) {
    sheetIssues.push(issue('warning', 'TOTAL_MISMATCH_CAD',
      `Sheet TOTAL says CAD ${money(declaredTotals.cad).toFixed(2)} but the parsed rows add up to CAD ${computedTotals.cad.toFixed(2)}.`));
  }
  // Compare against the pre-floor sum: the sheet's own TOTAL includes pesewas, so
  // checking the floored figure here would flag every sheet as mismatched.
  if (declaredTotals?.ghs != null && Math.abs(money(declaredTotals.ghs) - computedTotals.ghsRaw) > 0.01) {
    sheetIssues.push(issue('warning', 'TOTAL_MISMATCH_GHS',
      `Sheet TOTAL says GHS ${money(declaredTotals.ghs).toFixed(2)} but the parsed rows add up to GHS ${computedTotals.ghsRaw.toFixed(2)}.`));
  }

  return {
    sheetName,
    branchCode,
    title,
    transactionDate,
    dominantRate,
    rows: parsed,
    computedTotals,
    declaredTotals,
    issues: sheetIssues,
  };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export function parseWorkbook(buffer: ArrayBuffer | Buffer): ParsedWorkbook {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const issues: ParsedIssue[] = [];

  if (workbook.SheetNames.length === 0) {
    return { sheets: [], issues: [issue('error', 'EMPTY_WORKBOOK', 'The workbook contains no sheets.')] };
  }

  const sheets = workbook.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    });
    return parseSheet(name, rows);
  });

  // Duplicate branch codes (e.g. "ACCRA" and "ACCRA (2)") would double-post.
  const byBranch = new Map<string, string[]>();
  for (const sheet of sheets) {
    if (!sheet.branchCode) continue;
    byBranch.set(sheet.branchCode, [...(byBranch.get(sheet.branchCode) ?? []), sheet.sheetName]);
  }
  for (const [code, names] of byBranch) {
    if (names.length > 1) {
      issues.push(issue('warning', 'DUPLICATE_BRANCH_SHEETS',
        `Sheets ${names.map((n) => `"${n}"`).join(' and ')} both map to branch ${code}. Import only the correct one.`));
    }
  }

  return { sheets, issues };
}
