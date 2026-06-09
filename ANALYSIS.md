# Remittance System — Analysis Report & Improvement Plan

**Date:** February 2026
**System:** Andy Dre Remittance — CAD → GHS Corridor
**Stack:** Next.js 15 · PostgreSQL · Prisma 5 · JWT Auth · TailwindCSS

---

## 1. System Overview

The system is a full-stack multi-portal remittance management application supporting a Canada-to-Ghana money transfer corridor. It comprises three portals:

| Portal | Users | Core Function |
|--------|-------|---------------|
| **Sending** | Agents, Managers | Create transactions, manage senders/receivers, EOD sync |
| **Receiving** | Tellers, Managers | Disburse payments, reconcile tills |
| **Admin** | Admin, Super Admin | Users, permissions, exchange rates, ledger, reports |

### Key Technical Strengths
- Double-entry ledger system with 7 account types
- Fine-grained permission model (30+ keys) with role defaults and per-user overrides
- End-of-day batch sync workflow with ADDITIONAL (immediate) transaction support
- WhatsApp notification service (implemented, not yet wired)
- Audit log model exists with some usage (cancel transaction writes to it)

---

## 2. Gap Analysis

### 🔴 HIGH PRIORITY — Operational Gaps

#### H1 · No Search/Filter on Pending Payments (Receiving Portal)
**Problem:** The Pending Payments page loads all SYNCED transactions for the branch in a flat table with no search. In a busy branch handling 50+ transactions/day, tellers cannot quickly find a specific customer.
**Impact:** Operational slowdown; tellers cannot serve customers efficiently.
**Fix:** Add search by transaction code, receiver name, sender name, and receiving mode filter to the Pending Payments page.
**Status:** ✅ Implemented

#### H2 · Partial Payments Have No Completion Path
**Problem:** Transactions with `status = PARTIAL` (where sender paid partially) have no UI mechanism to record the remaining balance. The sender remains in debt with no way to close the transaction.
**Impact:** Unclosed PARTIAL transactions accumulate; sender balances are permanently wrong.
**Fix:** Add a "Collect Remaining" action on PARTIAL transactions in the sending transaction list. This records the outstanding `amountPendingCAD` as paid, updates the ledger, and sets status to PENDING for eventual sync.
**Status:** ✅ Implemented

#### H3 · No Missing Exchange Rate Warning
**Problem:** If no exchange rate is set for today, the today's rate API returns the most recent historical rate silently. The sending dashboard and new transaction page show no alert, so agents unknowingly use a stale rate.
**Impact:** Incorrect GHS amounts; compliance issues; customer complaints.
**Fix:** Check whether today's rate is actually today's. If it's a stale rate (`isLatest: true` in the response), show a prominent red/amber banner on the sending dashboard and the new transaction form blocking submission.
**Status:** ✅ Implemented

#### H4 · AuditLog Not Written on All Mutations
**Problem:** The `AuditLog` model exists and is written for `CANCEL_TRANSACTION` and `UPDATE_TRANSACTION` in routes, but NOT for: create transaction, mark paid, create sender, create receiver, login events, permission changes.
**Impact:** Incomplete audit trail; compliance and forensic investigation gaps.
**Fix:** Write AuditLog entries in transaction.service.ts (create, markAsPaid) and in the key API routes. The `mark-paid` route already writes an audit entry — verify and extend coverage.
**Status:** ✅ Verified (mark-paid and update routes write audit; create route extended)

---

### 🟡 MEDIUM PRIORITY — Business Logic & Usability

#### M1 · No Duplicate Transaction Detection
**Problem:** Nothing prevents an agent from accidentally submitting the same transaction twice (same sender, receiver, amount, date). Double-clicks or form re-submission can create duplicate charges.
**Impact:** Incorrect sender balances; duplicate disbursements; customer disputes.
**Fix:** In `transaction.service.ts`, before creating a transaction, check if a non-cancelled transaction exists for the same sender + receiver + cadAmount + transactionDate. Return a clear error if found.
**Status:** ✅ Implemented

#### M2 · Sender Credit Limit Not Enforced
**Problem:** The `Sender` model has a `creditLimit` field, but `transaction.service.ts` never checks it. An agent can create unlimited credit transactions for a sender regardless of their balance.
**Impact:** Uncontrolled debt accumulation; financial exposure.
**Fix:** In `createTransaction()`, fetch the sender's ledger balance. If `balance - cadAmount < -creditLimit`, throw an error preventing transaction creation.
**Status:** ✅ Implemented

#### M3 · EOD History Has No Page
**Problem:** The `EndOfDayRecord` model tracks which transactions were batched in each sync, but there is no UI to view past EOD records with totals. Managers cannot review or audit historical closeouts.
**Impact:** Managers cannot reconcile historical sync batches.
**Fix:** Add `/sending/eod/history` page listing past EOD records with date, count, synced-by, and links to individual batch transactions.
**Status:** ✅ Implemented

#### M4 · Exchange Rate History Has No UI
**Problem:** The admin exchange rates page shows only the most recent rate with no history view. Past rates are stored but unviewable.
**Impact:** No audit trail for rate changes; compliance gap.
**Fix:** Add a rate history table to the admin exchange rates page.
**Status:** ✅ Implemented

#### M5 · Running Balance Missing From Sender Statement
**Problem:** The sender statement page lists ledger entries (debits/credits) but has no running balance column, making it impossible to audit the account chronologically.
**Impact:** Senders and managers cannot verify balance progression.
**Fix:** Compute a running balance from the entries array and display it in the statement.
**Status:** ✅ Implemented

#### M6 · Receiver ID Fields Not Collected in UI
**Problem:** The `Receiver` schema has `idType` and `idNumber` fields (for KYC) but they are never shown or collected in the Create/Edit Receiver forms. This is a compliance gap.
**Impact:** KYC data is lost; regulatory non-compliance risk.
**Fix:** Add ID Type and ID Number fields to the Create Receiver modal, Edit Receiver modal, and Receiver Detail page.
**Status:** ✅ Implemented

---

### 🟢 LOWER PRIORITY — Compliance & Future Improvements

#### L1 · No AML Threshold Flagging
Transactions ≥ CAD $10,000 should trigger enhanced due diligence. Add a `requiresReview` flag auto-set on high-value transactions.

#### L2 · No Cumulative Sender Volume Tracking
30-day, 90-day, YTD volume metrics on the sender detail page for AML pattern detection.
**Status:** ✅ Implemented — `/api/senders/[id]` now returns `volume.last30Days`, `volume.last90Days`, `volume.ytd` (cadAmount + count); sender detail page shows three metric cards.

#### L3 · No Purpose of Transfer Field
Most regulated remittance operators require a declared purpose (Family Support, Business, Medical). Add `purposeOfTransfer` to the transaction schema and form.

#### L4 · WhatsApp Notifications Not Wired
The `WhatsAppService` is implemented but never called. Wire it to the sync route to notify receiving branches.
**Status:** ✅ Implemented — EOD POST route now calls `sendWhatsAppNotification()` after a successful sync, sending agent name, transaction count, and CAD/GHS totals. No-ops silently when env vars are not configured.

#### L5 · Receiver Identity Verification at Disbursement
Require tellers to confirm receiver phone/name before marking paid, to prevent fraudulent disbursements.
**Status:** ✅ Implemented — "Disburse" button now opens a verification modal showing receiver name, phone, ID (if on file), amount, and transaction code. Teller must tick a confirmation checkbox before the "Confirm & Disburse" button becomes active.

---

## 3. Implementation Summary

| # | Issue | Priority | Files Changed |
|---|-------|----------|---------------|
| H1 | Pending payments search | High | `app/receiving/pending/page.tsx` |
| H2 | Partial payment completion | High | `app/sending/transactions/page.tsx`, `app/api/transactions/[id]/collect-remaining/route.ts`, `lib/api-client.ts` |
| H3 | Missing rate warning | High | `app/sending/page.tsx`, `app/sending/transactions/new/page.tsx` |
| H4 | Audit log coverage | High | `lib/services/transaction.service.ts` |
| M1 | Duplicate detection | Medium | `lib/services/transaction.service.ts` |
| M2 | Credit limit enforcement | Medium | `lib/services/transaction.service.ts` |
| M3 | EOD history page | Medium | `app/sending/eod/history/page.tsx`, `app/api/eod/route.ts` |
| M4 | Rate history UI | Medium | `app/admin/exchange-rates/page.tsx` |
| M5 | Running balance on statement | Medium | `app/sending/senders/[id]/statement/page.tsx` |
| M6 | Receiver ID fields | Medium | `app/sending/receivers/page.tsx`, `app/sending/receivers/[id]/page.tsx` |

---

## 4. Architecture Notes

- All mutations should write to `AuditLog` with `userId`, `action`, `entity`, `entityId`, `changes`
- The double-entry ledger must be kept in sync with all balance mutations — never update balances directly in routes; always go through `LedgerService`
- `PARTIAL` status exists but has no lifecycle completion — this is now resolved with the "Collect Remaining" endpoint
- The `isLatest: true` flag returned by the today's-rate API is the correct hook for stale-rate detection
- Credit limit check: `senderLedger.balance - newAmount < -sender.creditLimit` means over-limit
