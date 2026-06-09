'use client';
import { exportToExcel, exportToPDF, SummaryItem } from '@/lib/utils/export';

interface Props {
  title: string;
  filename: string;
  headers: string[];
  rows: (string | number)[][];
  summary?: SummaryItem[];
  subtitle?: string;
}

export default function ExportButtons({ title, filename, headers, rows, summary, subtitle }: Props) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => exportToPDF(title, headers, rows, subtitle, summary)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        PDF
      </button>
      <button
        type="button"
        onClick={() => exportToExcel(title, headers, rows, filename, summary).catch(console.error)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-green-800 bg-green-50 rounded-lg hover:bg-green-100 border border-green-200 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
        </svg>
        Excel
      </button>
    </div>
  );
}
