"use client";

import { Transaction } from "@/lib/api-client";

interface TransactionReceiptProps {
  transaction: Transaction;
  onClose?: () => void;
}

// Format number with commas and 2 decimal places
function fmt(n: number | string): string {
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function TransactionReceipt({
  transaction,
  onClose,
}: TransactionReceiptProps) {
  // Strip "ADDITIONAL" prefix from code if present
  const displayCode = transaction.transactionCode.replace(
    /^ADDITIONAL\s*/i,
    "",
  );

  const handlePrint = () => {
    const printWindow = window.open("", "_blank", "width=600,height=800");
    if (!printWindow) return;

    const receiptDate = new Date(
      transaction.transactionDate,
    ).toLocaleDateString("en-CA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Transaction Receipt - ${displayCode}</title>
        <style>
          @page {
            size: A5 portrait;
            margin: 8mm;
          }

          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #f5f5f5;
            padding: 20px;
            display: flex;
            justify-content: center;
          }

          .receipt {
            width: 148mm;
            max-width: 400px;
            background: #FFFEF8;
            border: 2px solid #1a1a2e;
            border-radius: 6px;
            padding: 18px 16px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            color: #1a1a2e;
          }

          .header {
            text-align: center;
            margin-bottom: 14px;
            padding-bottom: 12px;
            border-bottom: 2px solid #D4AF37;
          }

          .business-address {
            font-size: 20px;
            font-weight: 700;
            color: #16213e;
            margin-bottom: 3px;
          }

          .business-phone {
            font-size: 15px;
            color: #4a5f7f;
          }

          .date-section {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            padding: 6px 0;
          }

          .date-label {
            font-size: 13px;
            font-weight: 600;
            color: #4a5f7f;
          }

          .date-value {
            font-size: 15px;
            font-weight: 500;
            border-bottom: 1px dotted #CCCCCC;
            padding-bottom: 2px;
            min-width: 140px;
            text-align: right;
          }

          .transaction-section {
            background: #f8f9fa;
            border: 1px solid #E0E0E0;
            border-radius: 6px;
            padding: 14px;
            margin-bottom: 12px;
          }

          .section-title {
            font-size: 13px;
            font-weight: 600;
            color: #4a5f7f;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 10px;
            padding-bottom: 6px;
            border-bottom: 1px solid #E0E0E0;
          }

          .field-row {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            margin-bottom: 8px;
          }

          .field-label {
            font-size: 13px;
            color: #666;
            flex-shrink: 0;
          }

          .field-value {
            font-size: 16px;
            font-weight: 600;
            text-align: right;
            border-bottom: 1px dotted #CCCCCC;
            padding-bottom: 2px;
            flex-grow: 1;
            margin-left: 12px;
          }

          .field-value.large {
            font-size: 20px;
            font-weight: 700;
            color: #16213e;
          }

          .field-value.code {
            font-family: 'Courier New', monospace;
            font-size: 18px;
            letter-spacing: 2px;
            color: #D4AF37;
            font-weight: bold;
          }

          .amount-highlight {
            background: linear-gradient(135deg, #16213e 0%, #1a1a2e 100%);
            color: white;
            padding: 12px;
            border-radius: 6px;
            margin: 10px 0;
          }

          .amount-highlight .field-row {
            margin-bottom: 6px;
          }

          .amount-highlight .field-label {
            color: #ccc;
          }

          .amount-highlight .field-value {
            color: white;
            border-bottom-color: rgba(255,255,255,0.3);
          }

          .amount-highlight .field-value.large {
            color: #D4AF37;
            font-size: 22px;
          }

          .party-section {
            margin-bottom: 12px;
          }

          .party-box {
            padding: 10px 12px;
            margin-bottom: 8px;
            border-left: 4px solid #D4AF37;
            background: #fafafa;
          }

          .party-label {
            font-size: 11px;
            font-weight: 600;
            color: #4a5f7f;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 3px;
          }

          .party-name {
            font-size: 16px;
            font-weight: 600;
            color: #16213e;
          }

          .party-phone {
            font-size: 13px;
            color: #666;
            margin-top: 2px;
          }

          .receiving-section {
            background: #f0f4f8;
            border-radius: 6px;
            padding: 10px 14px;
            margin-bottom: 12px;
          }

          .receiving-row {
            display: flex;
            justify-content: space-between;
          }

          .receiving-label {
            font-size: 13px;
            color: #666;
          }

          .receiving-value {
            font-size: 14px;
            font-weight: 600;
          }

          .footer {
            margin-top: 14px;
            padding-top: 12px;
            border-top: 2px solid #D4AF37;
          }

          .branches {
            display: flex;
            justify-content: space-between;
            gap: 12px;
          }

          .branch {
            flex: 1;
            text-align: center;
            padding: 8px;
            background: #f8f9fa;
            border-radius: 4px;
          }

          .branch-name {
            font-size: 11px;
            font-weight: 600;
            color: #16213e;
            margin-bottom: 3px;
          }

          .branch-location {
            font-size: 10px;
            color: #666;
            margin-bottom: 3px;
          }

          .branch-phones {
            font-size: 10px;
            color: #4a5f7f;
          }

          .branch-phones div {
            margin-bottom: 1px;
          }

          @media print {
            body {
              background: white;
              padding: 0;
            }

            .receipt {
              box-shadow: none;
              border: 1px solid #1a1a2e;
              width: 100%;
              max-width: none;
            }

            .no-print {
              display: none !important;
            }
          }

          .print-btn {
            display: block;
            width: 100%;
            padding: 10px;
            margin-top: 12px;
            background: #16213e;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s;
          }

          .print-btn:hover {
            background: #1a1a2e;
          }
        </style>
      </head>
      <body>
        <div class="receipt">
          <!-- Header -->
          <div class="header">
            <div class="business-address">1156 Albion Rd</div>
            <div class="business-phone">416-674-9150</div>
          </div>

          <!-- Date -->
          <div class="date-section">
            <span class="date-label">Date:</span>
            <span class="date-value">${receiptDate}</span>
          </div>

          <!-- Transaction Details -->
          <div class="transaction-section">
            <div class="section-title">Transaction Details</div>

            <div class="field-row">
              <span class="field-label">Code:</span>
              <span class="field-value code">${displayCode}</span>
            </div>

            <div class="amount-highlight">
              <div class="field-row">
                <span class="field-label">Amount (CAD):</span>
                <span class="field-value large">$${fmt(transaction.cadAmount)}</span>
              </div>
              <div class="field-row">
                <span class="field-label">Exchange Rate:</span>
                <span class="field-value">1 CAD = ${Number(transaction.exchangeRateUsed).toFixed(4)} GHS</span>
              </div>
              <div class="field-row">
                <span class="field-label">Amount (GHS):</span>
                <span class="field-value large">GH₵ ${fmt(transaction.ghsAmount)}</span>
              </div>
            </div>

            <div class="field-row">
              <span class="field-label">Amount Paid:</span>
              <span class="field-value">$${fmt(transaction.amountPaidCAD)}</span>
              ${
                Number(transaction.amountPendingCAD) > 0
                  ? `
              <span class="field-label" style="margin-left: 16px;">Owing:</span>
              <span class="field-value" style="color: #dc2626;">$${fmt(transaction.amountPendingCAD)}</span>
              `
                  : ""
              }
            </div>
          </div>

          <!-- Sender & Receiver -->
          <div class="party-section">
            <div class="party-box">
              <div class="party-label">Sender</div>
              <div class="party-name">${transaction.sender?.firstName ?? ""} ${transaction.sender?.lastName ?? ""}</div>
              <div class="party-phone">${transaction.sender?.phone ?? ""}</div>
            </div>

            <div class="party-box">
              <div class="party-label">Receiver</div>
              <div class="party-name">${transaction.receiver?.firstName ?? ""} ${transaction.receiver?.lastName ?? ""}</div>
              <div class="party-phone">${transaction.receiver?.phone ?? ""}</div>
            </div>
          </div>

          <!-- Collection Branch -->
          <div class="receiving-section">
            <div class="receiving-row">
              <span class="receiving-label">Collection Branch:</span>
              <span class="receiving-value">${transaction.receivingPoint?.name ?? "N/A"}</span>
            </div>
          </div>

          <!-- Footer - Branch Locations -->
          <div class="footer">
            <div class="branches">
              <div class="branch">
                <div class="branch-name">Kofi - Kumasi</div>
                <div class="branch-location">Opposite Ashtown Post Office</div>
                <div class="branch-phones">
                  <div>020 8153941</div>
                  <div>032 2001805</div>
                </div>
              </div>
              <div class="branch">
                <div class="branch-name">Mr. Asante Accra</div>
                <div class="branch-location">Kantamanto Branch</div>
                <div class="branch-phones">
                  <div>059 2761463</div>
                  <div>020 8134350</div>
                </div>
              </div>
            </div>
          </div>

          <button class="print-btn no-print" onclick="window.print()">Print Receipt</button>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Preview Header */}
        <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Transaction Receipt</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Receipt Preview */}
        <div className="p-4">
          <div
            className="border-2 border-gray-800 rounded-md p-4 mx-auto"
            style={{
              maxWidth: "350px",
              background: "#FFFEF8",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            {/* Header */}
            <div className="text-center mb-3 pb-3 border-b-2 border-yellow-600">
              <h1 className="text-lg font-bold text-gray-900">
                1156 Albion Rd
              </h1>
              <p className="text-sm text-gray-600">416-674-9150</p>
            </div>

            {/* Date */}
            <div className="flex justify-between items-center mb-3 text-sm">
              <span className="font-semibold text-gray-600">Date:</span>
              <span className="border-b border-dotted border-gray-400 pb-0.5 min-w-[140px] text-right">
                {new Date(transaction.transactionDate).toLocaleDateString(
                  "en-CA",
                  {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  },
                )}
              </span>
            </div>

            {/* Transaction Code */}
            <div className="bg-gray-100 rounded p-2 mb-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-gray-500 uppercase">
                  Code:
                </span>
                <span className="font-mono text-base font-bold text-yellow-700 tracking-wider">
                  {displayCode}
                </span>
              </div>
            </div>

            {/* Amounts */}
            <div className="bg-gray-900 text-white rounded p-3 mb-3">
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-xs text-gray-400">CAD Amount:</span>
                <span className="text-lg font-bold text-yellow-500">
                  ${fmt(transaction.cadAmount)}
                </span>
              </div>
              <div className="flex justify-between items-baseline mb-1.5 text-sm">
                <span className="text-xs text-gray-400">Rate:</span>
                <span className="text-gray-300">
                  1 CAD = {Number(transaction.exchangeRateUsed).toFixed(4)} GHS
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-gray-400">GHS Amount:</span>
                <span className="text-lg font-bold text-yellow-500">
                  GH₵ {fmt(transaction.ghsAmount)}
                </span>
              </div>
            </div>

            {/* Amount Paid / Balance */}
            <div className="flex items-baseline text-sm mb-3 px-1 gap-2">
              <span className="text-gray-600">Paid:</span>
              <span className="font-semibold">
                ${fmt(transaction.amountPaidCAD)}
              </span>
              {Number(transaction.amountPendingCAD) > 0 && (
                <>
                  <span className="text-gray-600 ml-auto">Owing:</span>
                  <span className="font-semibold text-red-600">
                    ${fmt(transaction.amountPendingCAD)}
                  </span>
                </>
              )}
            </div>

            {/* Sender/Receiver */}
            <div className="space-y-2 mb-3 mt-3">
              <div className="border-l-4 border-yellow-600 pl-3 py-1 bg-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase">
                  Sender
                </p>
                <p className="font-semibold text-sm text-gray-900">
                  {transaction.sender?.firstName} {transaction.sender?.lastName}
                </p>
                <p className="text-xs text-gray-600">
                  {transaction.sender?.phone}
                </p>
              </div>
              <div className="border-l-4 border-yellow-600 pl-3 py-1 bg-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase">
                  Receiver
                </p>
                <p className="font-semibold text-sm text-gray-900">
                  {transaction.receiver?.firstName}{" "}
                  {transaction.receiver?.lastName}
                </p>
                <p className="text-xs text-gray-600">
                  {transaction.receiver?.phone}
                </p>
              </div>
            </div>

            {/* Collection Branch */}
            <div className="bg-blue-50 rounded p-2 mb-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Collection Branch:</span>
                <span className="font-semibold">
                  {transaction.receivingPoint?.name ?? "N/A"}
                </span>
              </div>
            </div>

            {/* Branches */}
            <div className="mt-3 pt-2 border-t-2 border-yellow-600">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-center">
                  <p className="font-semibold">Kumasi</p>
                  <p className="text-gray-500">020 8153941</p>
                </div>
                <div className="text-center">
                  <p className="font-semibold">Accra</p>
                  <p className="text-gray-500">059 2761463</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 bg-white border-t px-4 py-3 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
              />
            </svg>
            Print Receipt
          </button>
        </div>
      </div>
    </div>
  );
}
