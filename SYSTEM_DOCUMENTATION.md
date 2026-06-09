# Remittance System — Complete Flow & Rules Documentation

> Last updated: 2026-06-08  
> Stack: Next.js 15 App Router · TypeScript strict · Tailwind CSS v4 · Prisma ORM · PostgreSQL

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Data Models](#2-data-models)
3. [Authentication & Roles](#3-authentication--roles)
4. [Permission Matrix](#4-permission-matrix)
5. [Transaction Lifecycle](#5-transaction-lifecycle)
6. [Ledger & Double-Entry Mechanics](#6-ledger--double-entry-mechanics)
7. [Sending Portal — EOD Flow](#7-sending-portal--eod-flow)
8. [Receiving Portal — EOD Flow](#8-receiving-portal--eod-flow)
9. [Sync Flow](#9-sync-flow)
10. [Reconciliation Flow](#10-reconciliation-flow)
11. [Server Date System](#11-server-date-system)
12. [Multi-Receiver Transactions](#12-multi-receiver-transactions)
13. [Partial Payments (Sub-Payments)](#13-partial-payments-sub-payments)
14. [Business Rules & Validation Guards](#14-business-rules--validation-guards)
15. [Notifications & Audit Trail](#15-notifications--audit-trail)
16. [API Route Reference](#16-api-route-reference)
17. [Portal Page Map](#17-portal-page-map)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                  Three Portals                          │
│  /sending  (Agents)  │  /receiving  (Tellers)  │  /admin│
└──────────────────────┴─────────────────────────┴────────┘
              ↓ Next.js API Routes (/app/api/)
┌─────────────────────────────────────────────────────────┐
│              Core Services (lib/services/)               │
│  TransactionService · LedgerService · SyncService        │
│  JournalService · (WhatsApp notifications)               │
└───────────────────────────┬─────────────────────────────┘
                            ↓ Prisma ORM
                       PostgreSQL Database
```

**Portal Roles:**
- **Sending Portal** (`/sending`) — Canada-side agents create transactions, record payments, manage senders/receivers, run EOD.
- **Receiving Portal** (`/receiving`) — Ghana-side tellers disburse cash, manage tills, reconcile, close branch EOD.
- **Admin Portal** (`/admin`) — Management views for users, exchange rates, branches, accounting, audit, server dates.

---

## 2. Data Models

### User Management

| Model | Key Fields | Notes |
|---|---|---|
| `User` | id, email, role, receivingPointId (nullable) | 7 roles; tellers/managers are branch-scoped |
| `ReceivingPoint` | id, name, code, serverDate | Per-branch business date |
| `Permission` | userId, key | Per-user grants beyond role defaults |
| `Role` | name, permissions[] | Seeded metadata; defines role defaults |

### Financial Entities

| Model | Key Fields | Notes |
|---|---|---|
| `Sender` | id, name, email, creditLimit (CAD) | Canada-side remitter |
| `Receiver` | id, name, phone, paymentPreference | Ghana-side beneficiary; CASH/BANK/MOMO |
| `Transaction` | id, code, codeType, status, amountCAD, amountGHS, amountPaidCAD, receivingPointId | Core remittance record |
| `SubPayment` | id, transactionId, ghsAmount, mode, paidAt | Partial disbursement record |
| `TransactionReceiver` | id, transactionId, receiverId, allocatedGHS, isPaid, paidAt | For multi-receiver transactions |
| `ExchangeRate` | id, date, rate (CAD→GHS) | One per business date |

**Transaction statuses:** `PENDING` → `SYNCED` → `PAID` (normal path); also `PARTIAL`, `PARTIAL_PAYMENT`, `CANCELLED`, `VOID`, `FLAGGED`

**Transaction code types:** `STANDARD` (waits for EOD sync) · `ADDITIONAL` (immediate, same-day)

### Ledger & Accounting

| Model | Key Fields | Notes |
|---|---|---|
| `LedgerAccount` | id, accountType, currency, balance, userId/receivingPointId | Per-sender, per-teller, per-branch accounts |
| `LedgerEntry` | id, accountId, type (DEBIT/CREDIT), amount, currency | Primitive double-entry unit |
| `JournalEntry` | id, type, status, lines[], referenceId | DRAFT/POSTED/REVERSED; always balanced |
| `JournalLine` | id, journalEntryId, accountId, debit, credit, currency | One per account per journal entry |
| `AccountingPeriod` | id, year, month, status, receivingPointId | OPEN/CLOSED/LOCKED per branch |

### Reconciliation & EOD

| Model | Key Fields | Notes |
|---|---|---|
| `TellerReconciliation` | id, tellerId, reconciliationDate, openingBalance, actualClosing, expectedClosing, variance, status | PENDING/COMPLETED/APPROVED/REJECTED |
| `EndOfDayRecord` | id, date, closedById, syncedCount | Sending portal EOD |
| `ReceivingEodRecord` | id, date, receivingPointId, totalDisbursed, disbursementCount | Per-branch EOD |
| `CashTransferRequest` | id, fromAccountId, toAccountId, amount, status, approvedById | Vault→Teller approval workflow |

### System

| Model | Key Fields | Notes |
|---|---|---|
| `SystemConfig` | key='DEFAULT', sendingServerDate | Sending portal business date singleton |
| `Notification` | id, receivingPointId, transactionId, message, isRead | Branch-scoped notifications |
| `AuditLog` | id, userId, action, entity, entityId, changes, ipAddress | Immutable audit trail |

---

## 3. Authentication & Roles

### Auth Flow

1. `POST /api/auth/login` — Rate-limited (10 req/15 min per IP). Returns JWT + user object.
2. Client stores JWT in `localStorage`; `ApiClient` sends as `Authorization: Bearer <token>`.
3. `middleware.ts` validates JWT on every request, injects context headers:
   - `x-user-id`, `x-user-email`, `x-user-role`, `x-receiving-point-id`
4. `requirePermission(request, key)` in each API route checks headers + DB permission rows.

### Security Headers (middleware)
- `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`

### Seven Roles

| Role | Portal Access | Description |
|---|---|---|
| `SUPER_ADMIN` | All | Short-circuits all permission checks |
| `ADMIN` | All | Full access to sending + admin |
| `SENDING_ADMIN` | Sending + Admin | Manages rates, users, permissions, EOD |
| `SENDING_AGENT` | Sending | Creates transactions; owns their senders/receivers |
| `RECEIVING_ADMIN` | Receiving + Admin | Manages branch users, approves reconciliations |
| `MANAGER` | Receiving + Admin | Approves reconciliations, views reports |
| `TELLER` | Receiving | Marks paid, reconciles own till; branch-scoped |

---

## 4. Permission Matrix

43 permission keys. SUPER_ADMIN always granted. Per-user grants extend role defaults.

| Permission Key | Default Roles |
|---|---|
| `CREATE_TRANSACTIONS` | SENDING_AGENT, SENDING_ADMIN, ADMIN, MANAGER |
| `EDIT_TRANSACTIONS` | SENDING_ADMIN, ADMIN |
| `DELETE_TRANSACTIONS` | SENDING_ADMIN, ADMIN |
| `VIEW_ALL_TRANSACTIONS` | SENDING_ADMIN, ADMIN, RECEIVING_ADMIN, MANAGER |
| `SYNC_TRANSACTIONS` | SENDING_ADMIN, ADMIN |
| `MARK_PAID` | TELLER, MANAGER, RECEIVING_ADMIN, ADMIN |
| `CREATE_RECONCILIATION` | TELLER, MANAGER |
| `APPROVE_RECONCILIATION` | MANAGER, RECEIVING_ADMIN, ADMIN |
| `RECEIVING_EOD` | RECEIVING_ADMIN, MANAGER |
| `MANAGE_TELLER_TILL` | TELLER, MANAGER, RECEIVING_ADMIN |
| `APPROVE_TRANSFERS` | MANAGER, RECEIVING_ADMIN, ADMIN |
| `EDIT_EXCHANGE_RATE` | SENDING_ADMIN, ADMIN |
| `MANAGE_USERS` | SENDING_ADMIN, ADMIN |
| `MANAGE_PERMISSIONS` | SENDING_ADMIN, ADMIN |
| `VIEW_AUDIT_LOG` | ADMIN, SUPER_ADMIN |
| `VIEW_REPORTS` | All except SENDING_AGENT (own data only) |
| `REPRINT_RECEIPT` | Most except SENDING_AGENT |

**Receiving-point scoping:** All TELLER and MANAGER routes additionally filter by `x-receiving-point-id` header (set from JWT payload).

---

## 5. Transaction Lifecycle

### Standard Transaction (CAD→GHS, waits for EOD)

```
[SENDING AGENT] creates transaction
         │
         ▼
    PENDING ──────────────────────────────────── CANCELLED
         │                                          ▲
         │  (partial payment upfront)               │
         ├──→ PARTIAL                               │
         │       │                                  │
         │       ▼                                  │
         │  (remaining paid)                        │
         │                                          │
         ▼  (Sending EOD closes)                    │
    SYNCED ─────────────────────────────────────────┤
         │                                          │
         │  (teller disbursements)                  │
         ├──→ PARTIAL_PAYMENT ──→ PAID              │
         │                                          │
         ▼                                          │
      PAID ──────────────────────────────────────── │
         │                                          │
         ├──→ FLAGGED (receiving side hold)         │
         │       │                                  │
         │       └──→ Unflag → restores prior status│
         │                                          │
         └──→ VOID (admin force-close)              │
```

### Additional Transaction (immediate same-day)

```
[SENDING AGENT] creates ADDITIONAL transaction
         │
         ▼
    SYNCED (immediately, same moment as creation)
         │
         ▼
    Visible to tellers immediately
         │
         ▼
      PAID
```

### Creation Rules

1. **EOD readiness** — Cannot create STANDARD transactions if the prior business day's EOD is not yet closed. ADDITIONAL transactions bypass this.
2. **Credit limit** — `unpaidAmount ≤ sender.creditLimit + sender.ledgerBalance`. Blocks if exceeded.
3. **Duplicate check** — Same sender + receiver + amount + same date is rejected (CANCELLED excluded).
4. **Exchange rate** — Must have a rate for the server date. SENDING_ADMIN+ can override.
5. **Receiver ownership** — Receiver must belong to the sender (via Receiver.senderId).
6. **Ledger entry** — If `amountPaidCAD > 0`, immediately records: Dr COMPANY_CASH, Cr SENDER-account.

### Payment at Creation

```
amountPaidCAD = 0       → status = PENDING  (full debt on sender)
amountPaidCAD < total   → status = PARTIAL  (partial debt on sender)
amountPaidCAD = total   → status = PENDING  (fully paid; no debt)
```

### Disbursement (Receiving Side)

1. Teller sees SYNCED or PARTIAL_PAYMENT transactions in `/receiving/pending`.
2. Selects payment mode: CASH, BANK, MOMO.
3. System calls `LedgerService.recordDisbursement()`:
   - Pessimistic lock (`SELECT ... FOR UPDATE`) on teller till row.
   - Validates till balance ≥ disbursement amount.
   - Dr DISBURSE-EXPENSE, Cr TELLER_TILL (decrements till balance).
   - Decrements PAYABLE-GHS-{branchId} (settles company obligation to that branch).
4. Transaction status → PAID.
5. Receipt auto-printed (A5 popup with CUSTOMER COPY + OFFICE COPY).

---

## 6. Ledger & Double-Entry Mechanics

### Account Types

| Account Type | Currency | Purpose |
|---|---|---|
| `SENDER` | CAD | Per-sender debt/credit tracking |
| `COMPANY_CASH` | CAD | Company operating cash (Canada side) |
| `COMPANY_VAULT` | GHS | Main GHS vault (rarely used directly) |
| `TELLER_TILL` | GHS | Per-teller cash drawer |
| `ADDITIONAL_TILL` | GHS | Dedicated pool for ADDITIONAL transactions |
| `PAYABLE-GHS-{branchId}` | GHS | Per-branch liability (company owes this branch's pool) |
| `INCOME-STANDARD` | CAD | Revenue from standard remittances |
| `INCOME-ADDITIONAL` | CAD | Revenue from additional/immediate remittances |
| `DISBURSE-EXPENSE` | GHS | Cash disbursement expense tracking |
| `EQUITY-RETAINED-GHS` | GHS | GHS equity / fund source for branch allocations |
| `BANK_CLEARING` | GHS | In-transit bank payments |
| `MOMO_CLEARING` | GHS | In-transit mobile money payments |

### Journal Entry Templates

#### 1. Remittance Receipt (Sending side — payment from sender)
```
Dr  COMPANY_CASH      +X CAD
Cr  INCOME-STANDARD   +X CAD
```
Also updates SENDER ledger balance (reduces debt).

#### 2. EOD Sync Allocation (per branch)
```
Dr  EQUITY-RETAINED-GHS        +Y GHS   (company funds the obligation)
Cr  PAYABLE-GHS-{branchId}     +Y GHS   (branch is owed this pool)
```

#### 3. ADDITIONAL Immediate Allocation
```
Dr  ADDITIONAL_TILL            +Y GHS
Cr  EQUITY-RETAINED-GHS        +Y GHS
```

#### 4. Disbursement (Receiving side — teller pays receiver)
```
Dr  DISBURSE-EXPENSE           +Z GHS
Cr  TELLER_TILL                +Z GHS
```
Also: PAYABLE-GHS-{branchId} decremented by Z (obligation settled).

#### 5. Vault → Teller Transfer
```
Dr  TELLER_TILL                +A GHS
Cr  COMPANY_VAULT              +A GHS
```

#### 6. Reconciliation Variance (shortage)
```
Dr  EQUITY-RETAINED-GHS        +V GHS   (write off shortage)
Cr  TELLER_TILL                +V GHS   (adjust till to actual)
```

#### 7. Reconciliation Variance (overage)
```
Dr  TELLER_TILL                +V GHS   (accept surplus)
Cr  EQUITY-RETAINED-GHS        +V GHS
```

### Atomicity & Locking

- All financial operations wrapped in Prisma `$transaction` blocks.
- `SELECT ... FOR UPDATE` on teller till and ADDITIONAL_TILL rows during disbursement to prevent concurrent over-draws.
- Journal entries are immutable; reversals create counter-entries (never delete/edit posted entries).

---

## 7. Sending Portal — EOD Flow

**Endpoint:** `POST /api/eod`  
**Required permission:** `SYNC_TRANSACTIONS` (SENDING_ADMIN, ADMIN)

### Steps

```
1. Validate:
   - No existing EndOfDayRecord for this business date
   - Current user has SYNC_TRANSACTIONS permission

2. Create EndOfDayRecord (syncedCount = 0)

3. SyncService.endOfDaySync(businessDate, eodRecordId):
   a. Find all PENDING + PARTIAL STANDARD transactions for businessDate
   b. In one atomic $transaction:
      - Update each tx: status → SYNCED, syncedAt = now, endOfDayRecordId set
      - Aggregate total GHS per receivingPoint
      - For each branch with allocated GHS:
        · Upsert PAYABLE-GHS-{branchId} account (create if first time)
        · Increment PAYABLE account balance
        · Create SYNC_ALLOCATION journal entry

4. Update EndOfDayRecord.syncedCount = number of synced transactions

5. Advance SystemConfig.sendingServerDate to next calendar day (UTC)

6. Write AuditLog entry

7. Fire-and-forget: WhatsApp notification with sync summary to configured chat
```

### Business Rules

- If there are 0 pending transactions, EOD still closes and advances the server date.
- Cannot re-close the same date (idempotency guard).
- Tellers on the receiving side can see SYNCED transactions immediately after sending EOD closes.

---

## 8. Receiving Portal — EOD Flow

**Endpoint:** `POST /api/receiving/eod`  
**Required permission:** `RECEIVING_EOD` (RECEIVING_ADMIN, MANAGER)

### Validation (blocks close unless `forceClose: true`)

| Check | Reason |
|---|---|
| No existing ReceivingEodRecord for branch + date | Idempotency |
| All tellers have submitted reconciliation (COMPLETED or APPROVED) | Ensures books are balanced |
| No reconciliations in REJECTED state | Tellers must resubmit before close |
| No teller tills with non-zero balance | Cash accounted for before close |

`forceClose: true` bypasses reconciliation and till-balance checks (admin override).

### Steps

```
1. Validate guards above

2. Aggregate today's PAID + PARTIAL_PAYMENT transactions:
   - Sum ghsAmount → totalDisbursed
   - Count rows → disbursementCount

3. Advance ReceivingPoint.serverDate to next calendar day (UTC)

4. Create ReceivingEodRecord with totals

5. Write AuditLog entry
```

---

## 9. Sync Flow

### Standard (Sending EOD → Receiving branch)

```
Sending EOD closes
    │
    ▼
SyncService.endOfDaySync()
    │
    ├── Find PENDING/PARTIAL STANDARD txns for date
    ├── Batch status update → SYNCED (Promise.all, capped at 500/run)
    ├── Aggregate GHS per receivingPointId
    └── Per-branch:
        ├── Upsert PAYABLE-GHS-{branch} LedgerAccount
        ├── Increment balance
        └── Post SYNC_ALLOCATION JournalEntry
```

Receiving tellers immediately see the newly SYNCED transactions in their pending list.

### Additional (Immediate, bypasses EOD)

```
SENDING_AGENT creates ADDITIONAL transaction
    │
    ├── Transaction created with status = SYNCED
    └── fundAdditionalTillForImmediateTransaction():
        ├── Find or create ADDITIONAL_TILL account
        ├── Increment ADDITIONAL_TILL balance
        └── Post IMMEDIATE_ALLOCATION JournalEntry
```

Additional transactions appear on the receiving side within seconds. Tellers draw from the ADDITIONAL_TILL pool.

### Manual Sync (`POST /api/sync/additional`)

Re-syncs any ADDITIONAL transactions that may have missed their initial sync. Used as a recovery tool.

---

## 10. Reconciliation Flow

**Who:** TELLER or MANAGER (CREATE_RECONCILIATION permission)  
**When:** Each teller, at the end of their business day (before receiving EOD)

### Inputs

| Field | Source |
|---|---|
| Opening balance | Last approved reconciliation's `actualClosing` (auto-prefilled) |
| Vault transfers in | Sum of approved CashTransferRequests to this teller for the day |
| Payments made | Sum of all disbursements from teller's till for the day |
| Returns to vault | Sum of approved teller→vault transfers for the day |
| Denomination count | Teller counts actual cash in denominations (GHS 200 down to GHS 0.01) |
| Actual closing | Computed from denomination count total |

### Variance Calculation

```
Expected closing = opening + vault_in - payments_made - vault_returns
Variance         = actual_closing - expected_closing
```

### Submission Rules

| Scenario | Outcome |
|---|---|
| `|variance| < GHS 0.001` | Status → **COMPLETED** (auto-approved; no manager action needed) |
| `|variance| ≥ GHS 0.001` | Status → **PENDING** (requires manager review and note) |
| Variance `> GHS 1.00` | Note field required on submission form |

### Manager Approval / Rejection

- **Approve:** Status → APPROVED. If variance ≠ 0, automatically posts a reconciliation variance journal entry (adjusts TELLER_TILL and EQUITY-RETAINED-GHS).
- **Reject:** Status → REJECTED. Teller must re-submit.

### Receiving EOD Dependency

All tellers must reach COMPLETED or APPROVED before the branch can close EOD (unless `forceClose`).

---

## 11. Server Date System

### Sending Server Date

- Stored in: `SystemConfig` singleton (`key = 'DEFAULT'`, field `sendingServerDate`)
- Auto-advances: +1 calendar day (UTC) when sending EOD closes
- Manual override: `PATCH /api/server-date` (SENDING_ADMIN or ADMIN)
- Used for: new transaction date stamp, EOD eligibility, duplicate-check window

### Receiving Server Date (Per-Branch)

- Stored in: `ReceivingPoint.serverDate` (@db.Date, per branch)
- Auto-advances: +1 calendar day (UTC) when that branch's receiving EOD closes
- Manual override: `PATCH /api/receiving/server-date` (RECEIVING_ADMIN or ADMIN)
- Used for: till view defaults, reconciliation date, pending transaction filter defaults, disbursement date context

### Hook: `useReceivingServerDate`

Client-side hook that fetches `ReceivingPoint.serverDate` for the logged-in teller's branch. Used by all receiving portal pages to initialize date filters and display the current business date badge.

### Admin Visibility

`/admin/server-dates` shows:
- Current sending server date + inline override control
- Per-branch receiving server dates + individual inline override controls
- "Next day after EOD close" preview for each entry

---

## 12. Multi-Receiver Transactions

Allows a single transaction to fund multiple receivers at the receiving branch.

### Mode 1: Pre-Assigned Receivers

```
Sending agent specifies:
  - receivers[] with { receiverId, allocatedGHS }
  - receiversDeferred = false

System creates:
  - Transaction record
  - TransactionReceiver rows (one per receiver, isPaid = false)

Receiving teller sees:
  - "Multi-Disburse" button (violet)
  - Opens modal showing pre-assigned receiver table (read-only)
  - Marks each TransactionReceiver.isPaid = true as disbursed
```

### Mode 2: Deferred Receivers

```
Sending agent checks "Receivers to be assigned at receiving branch"
  - receiversDeferred = true
  - No receivers[] required

System creates:
  - Transaction record (Transaction.receiversDeferred = true)
  - No TransactionReceiver rows yet

Receiving teller sees:
  - "Multi-Disburse" button (violet)
  - Opens modal with input fields: name, phone, amount per allocation
  - On confirm: creates TransactionReceiver rows inline + marks isPaid = true
```

### Rules

- Total of all allocations must equal transaction.ghsAmount.
- Each allocation uses the same disbursement ledger flow as single-receiver transactions.
- Transaction status → PAID only after all TransactionReceiver rows are marked paid.

---

## 13. Partial Payments (Sub-Payments)

For cases where a receiver collects the GHS amount in multiple instalments.

```
1. Teller makes first partial disbursement:
   POST /api/transactions/[id]/sub-payments
   → Creates SubPayment record
   → Transaction status → PARTIAL_PAYMENT

2. Teller makes additional partial payments (repeat)

3. Teller collects the remaining balance:
   POST /api/transactions/[id]/collect-remaining
   → Creates final SubPayment
   → Transaction status → PAID
```

Each SubPayment records: amount, mode (CASH/BANK/MOMO), tellerId, timestamp.

The sum of all SubPayment.ghsAmount for a transaction equals transaction.ghsAmount at completion.

---

## 14. Business Rules & Validation Guards

### Credit Limit

```
effective_credit = sender.creditLimit + sender.ledgerBalance
unpaid_on_new_tx = amountCAD - amountPaidCAD
Guard: unpaid_on_new_tx ≤ effective_credit
```

A sender with ledgerBalance > 0 (credits/overpayments) effectively gets extended capacity.

### Duplicate Detection

| Transaction Type | Duplicate Key |
|---|---|
| Single-receiver | sender + receiver + amountCAD + date |
| Multi-receiver | sender + amountCAD + branchId + date + sorted receiver set |

CANCELLED transactions excluded from duplicate check.

### EOD Readiness for New Transactions

- **STANDARD:** System checks that all business dates before the current server date have a corresponding EndOfDayRecord. Creating a STANDARD transaction on a date whose EOD hasn't been closed blocks with an error.
- **ADDITIONAL:** No EOD readiness check. Always allowed.

### Till Balance Guard

- `SELECT ... FOR UPDATE` locks the TELLER_TILL row before disbursement.
- If till balance < disbursement amount → error, no funds moved.
- Prevents concurrent over-draw by multiple tellers sharing a till (safety net; normally one teller per till).

### Reconciliation Submission

- Teller cannot submit reconciliation if one is already PENDING or COMPLETED for the same date.
- Manager cannot approve a reconciliation for a closed accounting period.

### Vault Transfer Approval

- Teller requests vault→teller transfer → status = PENDING.
- Manager/RECEIVING_ADMIN approves → funds move, LedgerEntry recorded.
- Rejected → no funds move.
- Approved transfers included in reconciliation's "vault transfers in" total.

### Exchange Rate

- Only one rate per date (unique constraint).
- Must exist for the current server date before transactions can be created.
- EDIT_EXCHANGE_RATE permission allows per-transaction rate override.

### Cancellation

- Cancellation reverses all ledger entries and journal entries.
- CANCELLED transactions cannot be reactivated.
- Only PENDING or PARTIAL transactions can be cancelled (not SYNCED/PAID).

### Flagging

- Any receiving-side user with MARK_PAID permission can flag a SYNCED or PAID transaction.
- Flag stores: reason, flaggedFromStatus (original status), flaggedAt, flaggedById.
- Unflagging restores the original status.
- Used for: receiver identity issues, unreachable receiver, disputed amounts.

---

## 15. Notifications & Audit Trail

### Notifications

- Created automatically when transactions sync to a branch (one per branch in the sync batch).
- Also created on EOD close events.
- Per-branch: `receivingPointId` scopes notifications to the correct branch.
- UI shows unread count badge; tellers can mark as read.
- `GET /api/notifications` returns the 100 most recent for the teller's branch.

### WhatsApp Notifications (WAHA)

After sending EOD closes, a fire-and-forget HTTP call to the WAHA (WhatsApp HTTP API) service sends a summary message to a configured group chat. Uses environment variables: `WAHA_API_URL`, `WAHA_SESSION`, `WAHA_CHAT_ID`, `WAHA_API_KEY`. Failure does not affect EOD completion.

### Audit Log

Every significant action creates an AuditLog row:

| Field | Content |
|---|---|
| userId | Who performed the action |
| action | String key (e.g., `EOD_CLOSE`, `MARK_PAID`, `APPROVE_RECON`) |
| entity | Table name (e.g., `Transaction`, `TellerReconciliation`) |
| entityId | PK of affected record |
| changes | JSON diff of before/after values |
| ipAddress | Client IP (from request headers) |
| userAgent | Browser/client identifier |

Login events, transaction create/edit/cancel/pay, EOD close, reconciliation submit/approve/reject, server date changes — all logged.

---

## 16. API Route Reference

### Auth
| Method | Path | Permission | Description |
|---|---|---|---|
| POST | `/api/auth/login` | None | Authenticate; returns JWT |
| GET | `/api/auth/me` | Any | Current user profile + permissions |

### Transactions
| Method | Path | Permission | Description |
|---|---|---|---|
| POST | `/api/transactions` | CREATE_TRANSACTIONS | Create single-receiver transaction |
| GET | `/api/transactions` | VIEW_ALL_TRANSACTIONS | List with filters; paginated (max 200) |
| GET | `/api/transactions/[id]` | VIEW_ALL_TRANSACTIONS | Single transaction detail |
| PATCH | `/api/transactions/[id]` | EDIT_TRANSACTIONS | Edit; replays ledger entries |
| DELETE | `/api/transactions/[id]` | DELETE_TRANSACTIONS | Cancel; reverses ledger entries |
| POST | `/api/transactions/[id]/mark-paid` | MARK_PAID | Disburse; decrements till + payable |
| POST | `/api/transactions/[id]/sub-payments` | MARK_PAID | Record partial disbursement |
| POST | `/api/transactions/[id]/collect-remaining` | MARK_PAID | Collect final remainder |
| POST | `/api/transactions/[id]/flag` | MARK_PAID | Flag / unflag transaction |
| POST | `/api/transactions/multi-receiver` | CREATE_TRANSACTIONS | Create multi-receiver transaction |
| POST | `/api/transactions/multi-receiver/disburse` | MARK_PAID | Assign receivers + mark paid |
| POST | `/api/transactions/bulk-disburse` | MARK_PAID | Bulk pay multiple transactions |

### Senders & Receivers
| Method | Path | Permission | Description |
|---|---|---|---|
| GET/POST | `/api/senders` | CREATE_TRANSACTIONS | List / create senders |
| GET/PATCH | `/api/senders/[id]` | — | Get / update sender |
| GET | `/api/senders/[id]/statement` | — | Ledger statement (date range) |
| POST | `/api/senders/[id]/payment` | — | Record sender payment or credit |
| GET/POST | `/api/receivers` | — | List / create receivers |
| GET/PATCH | `/api/receivers/[id]` | — | Get / update receiver |

### Exchange Rates
| Method | Path | Permission | Description |
|---|---|---|---|
| GET/POST | `/api/exchange-rates` | EDIT_EXCHANGE_RATE | List / create rates |
| GET | `/api/exchange-rates/today` | Any | Today's active rate |

### EOD
| Method | Path | Permission | Description |
|---|---|---|---|
| POST/GET | `/api/eod` | SYNC_TRANSACTIONS | Close / list sending EOD |
| POST/GET | `/api/receiving/eod` | RECEIVING_EOD | Close / list branch EOD |

### Sync
| Method | Path | Permission | Description |
|---|---|---|---|
| POST | `/api/sync/end-of-day` | SYNC_TRANSACTIONS | Manual EOD sync trigger |
| POST | `/api/sync/additional` | SYNC_TRANSACTIONS | Manual ADDITIONAL sync |

### Server Dates
| Method | Path | Permission | Description |
|---|---|---|---|
| GET/PATCH | `/api/server-date` | SENDING_ADMIN | Get / set sending server date |
| GET/PATCH | `/api/receiving/server-date` | RECEIVING_ADMIN | Get / set branch server date |

### Ledger & Transfers
| Method | Path | Permission | Description |
|---|---|---|---|
| GET/POST | `/api/ledger/accounts` | — | List / create ledger accounts |
| GET | `/api/ledger/till/status` | MANAGE_TELLER_TILL | Till balance + statement |
| POST | `/api/ledger/till/load` | MANAGE_TELLER_TILL | Manual cash load into till |
| POST | `/api/ledger/transfers/request` | MANAGE_TELLER_TILL | Request vault→teller |
| POST | `/api/ledger/transfers/request/[id]/approve` | APPROVE_TRANSFERS | Approve transfer |
| POST | `/api/ledger/transfers/request/[id]/reject` | APPROVE_TRANSFERS | Reject transfer |
| POST | `/api/ledger/transfers/vault-to-teller` | APPROVE_TRANSFERS | Execute vault→teller |
| POST | `/api/ledger/transfers/teller-to-vault` | MANAGE_TELLER_TILL | Return cash to vault |

### Reconciliation
| Method | Path | Permission | Description |
|---|---|---|---|
| POST/GET | `/api/reconciliation` | CREATE_RECONCILIATION | Submit / list reconciliations |
| POST | `/api/reconciliation/[id]/approve` | APPROVE_RECONCILIATION | Approve + auto-journal variance |
| POST | `/api/reconciliation/[id]/reject` | APPROVE_RECONCILIATION | Reject; teller resubmits |

### Accounting
| Method | Path | Description |
|---|---|---|
| POST/GET | `/api/accounting/journal` | Manual journal entries |
| POST | `/api/accounting/journal/[id]/reverse` | Reverse posted entry |
| GET | `/api/accounting/general-ledger` | GL by account |
| GET | `/api/accounting/trial-balance` | Debits vs credits summary |
| GET | `/api/accounting/balance-sheet` | Assets / liabilities / equity |
| GET | `/api/accounting/income-statement` | P&L (income vs expenses) |
| GET | `/api/accounting/chart-of-accounts` | Full CoA |

### Users & Permissions
| Method | Path | Permission | Description |
|---|---|---|---|
| GET/POST | `/api/users` | MANAGE_USERS | List / create users |
| GET/PATCH | `/api/users/[id]` | MANAGE_USERS | Get / update user |
| GET/POST | `/api/users/[id]/permissions` | MANAGE_PERMISSIONS | Get / grant permissions |
| GET/POST | `/api/permissions` | MANAGE_PERMISSIONS | List / grant permissions |
| DELETE | `/api/permissions/[userId]/[key]` | MANAGE_PERMISSIONS | Revoke permission |

### Branches & Admin
| Method | Path | Permission | Description |
|---|---|---|---|
| GET/POST | `/api/receiving-points` | MANAGE_USERS | List / create branches |
| GET/PATCH | `/api/receiving-points/[id]` | MANAGE_USERS | Get / update branch |
| GET | `/api/audit-log` | VIEW_AUDIT_LOG | Paginated audit trail |
| GET/POST | `/api/notifications` | Any | Branch notifications |

### Reports
| Method | Path | Description |
|---|---|---|
| GET | `/api/reports/dashboard` | Daily summary by status and method |
| GET | `/api/reports/agent` | Per-agent performance (paginated + DB aggregates) |
| GET | `/api/reports/additional-till` | ADDITIONAL code activity |
| GET | `/api/reports/closing-balances` | Teller till closing balances per branch |

---

## 17. Portal Page Map

### Sending Portal (`/sending/`)

| Page | Purpose |
|---|---|
| `/sending` | Dashboard: daily totals, status breakdown, icon stat cards |
| `/sending/transactions` | Transaction list with status/date/agent filters |
| `/sending/transactions/new` | Create transaction form (single or multi-receiver) |
| `/sending/transactions/[id]` | View / edit transaction |
| `/sending/senders` | Sender list |
| `/sending/senders/[id]` | Sender profile: receivers, credit limit, ledger balance |
| `/sending/senders/[id]/statement` | Sender ledger statement export |
| `/sending/receivers` | All receivers list |
| `/sending/receivers/[id]` | Receiver detail with transaction history |
| `/sending/eod` | Close EOD: pending count, business date, manual date override |
| `/sending/eod/history` | Historical EOD records |
| `/sending/reports` | Report hub |
| `/sending/reports/sender-balances` | Sender credit/debt balances |
| `/sending/reports/sender-statements` | Multi-sender statement export |
| `/sending/reports/closing-balances` | Branch vault balances |
| `/sending/accounting/sender-ledger` | Sender ledger statement |
| `/sending/accounting/cash-management` | Record cash in/out (sending side) |
| `/sending/accounting/income-summary` | Remittance income by code type |

### Receiving Portal (`/receiving/`)

| Page | Purpose |
|---|---|
| `/receiving` | Dashboard: pending disbursements, till balance, float health, quick actions |
| `/receiving/pending` | SYNCED transactions ready to disburse; search by code/name |
| `/receiving/disbursements` | Disbursement history with teller/mode/search filters; CSV/PDF export |
| `/receiving/till` | Till balance, statement, load from vault, denomination calculator, print slip |
| `/receiving/reconciliation` | Daily recon form: denomination count, variance, sign-off |
| `/receiving/admin/reconciliations` | Manager: approve/reject teller reconciliations |
| `/receiving/eod` | Close branch EOD; 4-KPI summary bar; teller status roll-up |
| `/receiving/eod/history` | Historical branch EOD records |
| `/receiving/sub-payment-report` | Partial payment history |
| `/receiving/additional-till-report` | ADDITIONAL code transactions |
| `/receiving/admin/reports/daily` | Daily branch summary |
| `/receiving/accounting/till-ledger` | Teller till ledger statement |
| `/receiving/accounting/branch-summary` | Vault + till balances |
| `/receiving/admin/transactions` | Flag/manage all branch transactions |
| `/receiving/admin/transfers` | Vault transfer approval queue |

### Admin Portal (`/admin/`)

| Page | Purpose |
|---|---|
| `/admin/users` | Create/edit users, assign roles |
| `/admin/permissions` | Grant/revoke per-user permissions |
| `/admin/exchange-rates` | Create/activate daily CAD→GHS rates |
| `/admin/receiving-points` | Create/edit branches |
| `/admin/server-dates` | Override sending + receiving server dates |
| `/admin/sync` | Manual sync triggers + status |
| `/admin/audit-log` | Action audit trail |
| `/admin/reports` | Consolidated reports |
| `/admin/ledger` | Chart of accounts + account details |
| `/admin/accounting/general-ledger` | GL by account |
| `/admin/accounting/journal` | Manual journal entries; view/reverse |
| `/admin/accounting/trial-balance` | Trial balance report |
| `/admin/accounting/balance-sheet` | Balance sheet |
| `/admin/accounting/income-statement` | P&L |
| `/admin/accounting/consolidated-report` | Company-wide summary |
| `/admin/accounting/chart-of-accounts` | CoA hierarchical view |
| `/admin/accounting/branch-summary` | Per-branch accounting snapshot |
| `/admin/accounting/period` | Monthly period closure |

---

## End-to-End Example: Standard Remittance

```
Day 1 — SENDING SIDE (Toronto)
─────────────────────────────────────────────────────────
09:00  Agent sets exchange rate: CAD 1 = GHS 14.50
09:15  Agent creates transaction:
         Sender: John Mensah
         Receiver: Akosua Asante (Accra branch)
         CAD 500 → GHS 7,250
         Paid upfront: CAD 300
       System:
         → status = PARTIAL
         → Dr COMPANY_CASH +300 CAD
         → Cr SENDER-John +300 CAD
         → JournalEntry: REMITTANCE_RECEIPT

16:00  Agent collects remaining CAD 200 from John
       PATCH /api/transactions/[id]  (or sub-payment)
         → Dr COMPANY_CASH +200 CAD
         → Cr SENDER-John +200 CAD (balance cleared)
         → status remains PARTIAL (not yet synced)

17:00  Sending Admin closes EOD
       POST /api/eod { date: "2026-06-08" }
       System:
         → Transaction status → SYNCED
         → PAYABLE-GHS-Accra += 7,250 GHS
         → JournalEntry: SYNC_ALLOCATION
           Dr EQUITY-RETAINED-GHS +7,250
           Cr PAYABLE-GHS-Accra   +7,250
         → sendingServerDate advances to 2026-06-09

─────────────────────────────────────────────────────────
Day 1 — RECEIVING SIDE (Accra branch)
─────────────────────────────────────────────────────────
17:05  Teller refreshes pending list — sees John's transaction (SYNCED)

17:20  Akosua arrives with her ID
       Teller marks as PAID:
         Mode: CASH
       System:
         → SELECT TELLER_TILL FOR UPDATE
         → Check till balance ≥ 7,250 GHS ✓
         → Dr DISBURSE-EXPENSE  +7,250 GHS
         → Cr TELLER_TILL       -7,250 GHS
         → PAYABLE-GHS-Accra    -7,250 GHS (obligation settled)
         → status = PAID
         → Print A5 receipt (CUSTOMER COPY + OFFICE COPY)

18:00  Teller submits reconciliation:
         Opening:   GHS 20,000
         Vault in:  GHS 10,000
         Paid out:  GHS 7,250
         Actual:    GHS 22,750
         Expected:  GHS 22,750
         Variance:  GHS 0.00
       → status = COMPLETED (auto)

18:30  Receiving Admin closes branch EOD
       POST /api/receiving/eod { date: "2026-06-08" }
       System:
         → Validates all tellers reconciled ✓
         → Creates ReceivingEodRecord (totalDisbursed: 7,250)
         → Accra serverDate advances to 2026-06-09
─────────────────────────────────────────────────────────
Transaction complete. Books balanced.
```
