/**
 * Client-side export utilities for reports.
 * xlsx is dynamically imported to avoid inflating the initial bundle.
 */

export interface SummaryItem {
  label: string;
  value: string;
  highlight?: 'red' | 'green' | 'blue' | 'purple';
}

export async function exportToExcel(
  title: string,
  headers: string[],
  rows: (string | number)[][],
  filename: string,
  summary?: SummaryItem[]
) {
  const XLSX = await import('xlsx');

  const sheetData: (string | number)[][] = [];
  sheetData.push([title]);

  if (summary?.length) {
    sheetData.push([]);
    for (const item of summary) sheetData.push([item.label, item.value]);
    sheetData.push([]);
  } else {
    sheetData.push([]);
  }

  const headerRowIndex = sheetData.length;
  sheetData.push(headers);
  sheetData.push(...rows);

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Auto-size columns based on content
  ws['!cols'] = headers.map((h, i) => ({
    wch: Math.min(
      Math.max(h.length, ...rows.map((row) => String(row[i] ?? '').length)) + 2,
      50
    ),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title.substring(0, 31));
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportToPDF(
  title: string,
  headers: string[],
  rows: (string | number)[][],
  subtitle?: string,
  summary?: SummaryItem[]
) {
  const highlightColor: Record<string, string> = {
    red: '#dc2626',
    green: '#16a34a',
    blue: '#2563eb',
    purple: '#7c3aed',
  };

  let summaryHtml = '';
  if (summary?.length) {
    summaryHtml = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:28px;">
      ${summary
        .map(
          (s) =>
            `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;">
              <p style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.6px;font-weight:600;margin:0;">${s.label}</p>
              <p style="font-size:17px;font-weight:700;color:${highlightColor[s.highlight!] || '#374151'};margin:4px 0 0;">${s.value}</p>
            </div>`
        )
        .join('')}
    </div>`;
  }

  const headerCells = headers.map((h) => `<th>${h}</th>`).join('');
  const bodyRows = rows.map((row) => `<tr>${row.map((cell) => `<td>${cell ?? ''}</td>`).join('')}</tr>`).join('');

  const generated = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;padding:40px 48px;font-size:13px}
    .hdr{border-bottom:3px solid #1e3a5f;padding-bottom:14px;margin-bottom:26px}
    .hdr h1{font-size:22px;font-weight:700;color:#1e3a5f}
    .hdr p{font-size:11px;color:#6b7280;margin-top:3px}
    table{width:100%;border-collapse:collapse;margin-top:4px}
    th{background:#1e3a5f;color:#fff;padding:10px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.6px}
    td{padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px}
    tr:nth-child(even) td{background:#f8fafc}
    tr:last-child td{border-bottom:none}
    .ftr{margin-top:24px;text-align:center;color:#9ca3af;font-size:10px}
    @media print{body{padding:20px 32px}@page{margin:14mm}}
  </style></head><body>
    <div class="hdr"><h1>${title}</h1><p>${subtitle || 'Generated: ' + generated}</p></div>
    ${summaryHtml}
    <table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>
    <div class="ftr">Andy Remittance — Confidential Report</div>
    <script>window.onload=function(){setTimeout(function(){window.print()},350)};window.onafterprint=function(){window.close()};</script>
  </body></html>`;

  const w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}
