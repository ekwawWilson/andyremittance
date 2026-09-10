# Andy D Enterprise — Sending Portal User Manual

**System:** PETROS — Canada to Ghana  
**Portal:** Sending Portal (`/sending`)  
**Applies to:** Sending Admin · Sending Agent  
**Passwords:** issued separately by your Super Admin

---

## Table of Contents

1. [Logging In](#1-logging-in)
2. [Roles & Permissions](#2-roles--permissions)
3. [Dashboard](#3-dashboard)
4. [Creating a Transaction](#4-creating-a-transaction)
5. [Managing Transactions](#5-managing-transactions)
6. [Senders](#6-senders)
7. [Receivers](#7-receivers)
8. [End of Day (EOD)](#8-end-of-day-eod)
9. [EOD History](#9-eod-history)
10. [Reports](#10-reports)
11. [Accounting](#11-accounting)
12. [Quick Reference — Accounts](#12-quick-reference--accounts)

---

## 1. Logging In

1. Open the system URL in your browser.
2. Enter your **email address** and the **password** issued to you by your Super Admin.
3. Click **Sign In**.
4. You will land on the Sending Dashboard automatically.

> If you see "Invalid credentials", double-check your email spelling. Contact your Super Admin to reset your password.

---

## 2. Roles & Permissions

| Feature | Sending Admin | Sending Agent |
|---|---|---|
| View dashboard | ✓ | ✓ |
| Create transactions | ✓ | ✓ |
| View own transactions | ✓ | ✓ |
| View ALL transactions | ✓ | — |
| Edit transactions | ✓ | — |
| Cancel transactions | ✓ | — |
| Add / edit senders | ✓ | ✓ |
| Add / edit receivers | ✓ | ✓ |
| Run End of Day | ✓ | — |
| Sync transactions | ✓ | — |
| View reports | ✓ | — |
| Accounting (Cash / Income) | ✓ | — |
| Manage exchange rates | ✓ | — |
| Manage users | ✓ | — |

---

## 3. Dashboard

**Path:** `/sending`

The dashboard gives you a real-time snapshot of today's activity.

### What You See

| Card | What it shows |
|---|---|
| Pending | Transactions not yet synced to Ghana |
| Synced | Transactions sent to the receiving branch |
| Paid | Fully disbursed transactions |
| Cancelled | Voided transactions |
| CAD Collected | Total Canadian dollars received today |
| GHS Sent | Total Ghana cedis sent today |

### Breakdown Rows

- **By type** — Standard (synced at EOD) vs Immediate (synced instantly)
- **By payment method** — Cash / E-Transfer / Split

### Exchange Rate Warning

If no exchange rate has been set for today, a **red warning banner** appears at the top. No transactions can be created until an admin sets the rate.

### Recent Transactions

The bottom of the dashboard lists the last 10 transactions with their code, sender, receiver, amount, and status. Click any transaction code to open its detail view.

---

## 4. Creating a Transaction

**Path:** `/sending/transactions/new`

This is the core workflow. The form has **4 steps**.

---

### Step 1 — Sender & Receiver

#### Selecting a Sender

1. Type the sender's **name or phone number** in the search box.
2. Results appear as you type — click the correct sender to select them.
3. Their **balance and credit limit** are shown beneath their name.
   - Green = sender has credit on account
   - Red = sender owes money
4. If no sender is found, click **+ Add new sender**.

#### Adding a New Sender

Fill in:
- First Name *(required)*
- Last Name *(required)*
- Phone *(required, e.g. +1 416 555 1234)*

Click **Create Sender**.

#### Editing a Sender (Sending Admin only)

Click **Edit** next to the selected sender's name to update their First Name, Last Name, or Phone, then click **Save Changes**.

---

#### Receiver Mode

After selecting a sender, choose the receiver mode:

| Mode | When to use |
|---|---|
| **Single Receiver** (default) | One recipient collects the full GHS amount |
| **Multi-Receiver** | Multiple recipients split the GHS amount |

---

#### Single Receiver

1. Type the receiver's **name or phone** in the search box.
2. All receivers linked to this sender appear automatically — scroll or type to filter.
3. Click the correct receiver to select.
4. If not found, click **+ Add new receiver**.

#### Adding a New Receiver

Fill in:
- First Name *(required)*
- Last Name *(required)*
- Phone *(required, e.g. 055 123 4567)*
- Relationship (Family / Friend / Business)

Click **Create Receiver**.

---

#### Multi-Receiver

Two receiver slots appear by default. For each slot:
1. Search and select a receiver.
2. Enter the **GHS amount** for that receiver.
3. Optionally add a note.
4. Click **+ Add Another Receiver** to add more slots.

A running tally shows how much GHS has been allocated vs the total.

**Deferred option:** Check **"Assign receivers at branch"** if you do not know the individual receivers yet. The teller in Ghana will assign names and amounts during disbursement.

---

### Step 2 — Amount & Payment

| Field | Description |
|---|---|
| **CAD Amount** | Total Canadian dollars being sent *(required)* |
| **GHS Equivalent** | Calculated automatically using today's rate |
| **Payment Method** | Cash / E-Transfer / Split |
| **Amount Paid (CAD)** | How much the sender has paid right now |
| **Pending (CAD)** | Calculated automatically (Total − Paid) |
| **Transaction Type** | Standard (synced at EOD) or Immediate (synced instantly) |

Click **Pay full** to auto-fill the Amount Paid with the total.

> A **credit warning** appears in orange if the unpaid portion exceeds the sender's available credit limit.

---

### Step 3 — Delivery Details (Ghana)

| Field | Description |
|---|---|
| **Receiving Branch** | Select the Ghana branch (Accra or Kumasi) |
| **Payout Method** | Cash / Bank Transfer / Mobile Money |

**If Bank Transfer:**
- Bank Name *(required)*
- Account Number *(required)*
- Account Name *(required)*
- Bank Branch *(required)*

**If Mobile Money:**
- MoMo Number *(required)*
- Name on Number

**Notes:** Optional free-text field for special instructions.

---

### Step 4 — Review & Submit

A summary strip shows **CAD sent**, **GHS equivalent**, and **pending amount**.

Click **Create Transaction** to submit.

- A **green confirmation banner** appears with the transaction code.
- A **receipt popup** opens automatically — click Print to print two copies (Customer Copy + Office Copy) on one A4 sheet.
- For Immediate transactions, a **Copy WhatsApp** button appears to copy the notification message.

> If the exchange rate override deviates more than 20% from the official rate, the submit button is disabled until the override is corrected.

---

## 5. Managing Transactions

**Path:** `/sending/transactions`

### Filters

| Filter | Description |
|---|---|
| Search | Transaction code, sender name, or receiver name |
| Status | All / Pending / Synced / Paid / Partial / Cancelled |
| Date Range | From date — To date |
| Mine only | Toggle to see only your own transactions (Sending Admin sees all by default) |

### Transaction Status Meanings

| Status | Meaning |
|---|---|
| **PENDING** | Created, not yet synced to Ghana |
| **SYNCED** | Sent to the receiving branch, awaiting payment |
| **PARTIAL** | Sender paid part of the CAD amount upfront |
| **PAID** | Receiver has collected the GHS in Ghana |
| **CANCELLED** | Transaction voided |

### Actions Per Transaction

| Action | Who | When |
|---|---|---|
| **View detail** | All | Any status |
| **Edit** | Sending Admin | Pending / Partial only |
| **Cancel** | Sending Admin | Pending / Partial only |
| **Collect balance** | Sending Admin | Partial status — records remaining CAD payment |
| **Print receipt** | Sending Admin | Any paid transaction |
| **Copy WhatsApp** | All | Immediate (Additional) transactions |
| **Sync Additional** | Sending Admin | Syncs all pending Immediate transactions |

### Editing a Transaction

Click **Edit** on any Pending or Partial transaction. Fields you can change:
- CAD Amount, Amount Paid, Payment Method
- Receiver, Receiving Mode, Branch
- Bank / MoMo details
- Notes, Transaction Date

Click **Save Changes** when done.

---

## 6. Senders

**Path:** `/sending/senders`

### Sender List

Shows all senders with their name, phone, number of receivers, and transaction count. Use the **search box** to filter by name or phone.

### Adding a Sender

Click **+ New Sender** and fill in:
- First Name, Last Name *(required)*
- Phone *(required)*
- City, ID Type, ID Number *(optional)*

### Sender Detail Page

Click any sender's name to open their full profile.

**Profile section:** Name, phone, city, ID details, account code, credit limit.

**Balance card:**
- Green = sender has credit remaining
- Red = sender owes money
- Credit utilisation bar (green → amber → red as limit is consumed)

**Volume KPIs:** Transactions and amounts for the last 30 days and year-to-date.

**Receivers tab:** All receivers linked to this sender with their preferred payout method.

**Transactions tab:** Full history with status, amounts, and dates.

#### Recording a Debt Payment

When a sender owes money (balance is negative):
1. Click **Record Payment**.
2. Enter the amount paid, payment method, and optional notes.
3. Click **Save** — the balance updates immediately.

#### Adding a Credit Note

1. Click **Credit Note**.
2. Enter the credit amount and reason.
3. Click **Save**.

#### Sender Statement

Click **View Statement** to open the sender's full ledger statement (see [Reports — Sender Statements](#sender-statements)).

---

## 7. Receivers

**Path:** `/sending/receivers`

### Receiver List

Shows all receivers with their name, phone, linked sender, and preferred payout method. Use the search box to filter by name or phone, or use the **Sender filter** to see only a specific sender's receivers.

### Adding a Receiver

Click **+ Add Receiver** and fill in:
- Sender *(select from list)*
- First Name, Last Name *(required)*
- Phone *(required)*
- ID Type, ID Number *(optional)*
- Preferred Method — Cash / Bank / Mobile Money

**If Bank:**
- Bank Name, Account Number, Account Name, Branch

**If Mobile Money:**
- MoMo Number, Provider (MTN / Vodafone / AirtelTigo)

### Editing a Receiver

Click **Edit** on any receiver row to update their details.

---

## 8. End of Day (EOD)

**Path:** `/sending/eod`

> **Sending Admin only.** Agents cannot close the day.

The EOD process **syncs all Standard (non-Immediate) transactions** to the receiving branches in Ghana and advances the business date.

### When to Run EOD

Run EOD at the **end of each business day** after all transactions for the day have been entered.

### EOD Steps

1. Review the **summary on screen** — it shows counts and totals for Standard transactions pending sync, Immediate transactions, and any outstanding debts.
2. Confirm the **business date** shown is correct.
3. Check the payment breakdown (Cash / E-Transfer / Split).
4. Click **Close Day**.
5. A confirmation prompt appears — click **Confirm**.
6. The system syncs all Standard transactions, generates an EOD report, and advances the server date.

### After Closing

- A **PDF report** is available to download.
- Standard transactions move from PENDING → SYNCED.
- The server business date advances to the next working day.

### Manual Date Adjustment

If the server date is wrong, Sending Admin can adjust it using the **Adjust Date** control before closing.

> Do not run EOD twice for the same date. Check EOD History first if unsure.

---

## 9. EOD History

**Path:** `/sending/eod/history`

Shows a paginated list of all past EOD closings (15 per page).

Each record shows:
- Business date closed
- Closed by (user name)
- Time closed
- Number of transactions synced
- Total CAD and GHS

Click **View Details** on any record to open a modal showing the full transaction list for that batch with totals, payment method breakdown, and an option to **print/export** the report.

---

## 10. Reports

### Transaction Report

**Path:** `/sending/reports`

#### Filters

| Filter | Description |
|---|---|
| Date From / To | Date range for the report |
| Agent | Sending Admin can filter by specific agent or see all |
| Receiving Branch | Filter by Ghana branch |
| Receiving Mode | Cash / Bank / MoMo |
| Transaction Type | Standard / Immediate |
| Payment Method | Cash / E-Transfer / Split |

Click **Generate Report** to run. A summary bar shows totals by status.

#### Exports

Click **CSV**, **PDF**, or **Excel** to download the full report with headers, all rows, and a totals summary.

---

### Sender Statements

**Path:** `/sending/reports/sender-statements`

Produces a full ledger statement for one sender over a date range.

1. Select the **sender** from the search dropdown.
2. Set the **date range** (defaults to last 30 days).
3. Click **Apply**.

The statement shows:
- Opening balance
- Each transaction (debit), payment (credit), and credit note (credit) in date order
- Running balance after each entry
- Closing balance with totals summary

Export as **CSV, PDF, or Excel**.

---

### Closing Balances

**Path:** `/sending/reports/closing-balances`

Shows a snapshot of all **outstanding (unpaid) balances** on any given date.

1. Select a **date** (defaults to today).
2. Click **Refresh**.

The report shows:
- Summary totals (transactions, cash collected, e-transfers, total owing)
- Per-sender breakdown with transaction count, total CAD, amount paid, and amount owing
- Full transaction detail with payment method and owing amounts highlighted in red

Export as **CSV, PDF, or Excel**.

---

### Sender Balances

**Path:** `/sending/reports/sender-balances`

Quick view of all senders who currently have an **outstanding balance** (owe money). Useful for daily collections follow-up.

---

## 11. Accounting

> **Sending Admin only.**

### Cash Management

**Path:** `/sending/accounting/cash-management`

Tracks the physical cash vault and bank clearing account using double-entry bookkeeping.

**Current balances shown:**
- Sending Vault (CAD) — physical cash on hand
- Bank Clearing — funds in the bank account

#### Recording a Cash Deposit

1. Click **Record Deposit**.
2. Enter amount, reference number, date, and optional description.
3. Click **Save**.

This debits the Sending Vault and credits the appropriate income account.

#### Recording a Bank Transfer

1. Click **Record Bank Transfer**.
2. Enter amount, reference, and date.
3. Click **Save**.

#### Recording an Operating Expense

1. Click **Record Expense**.
2. Select the expense category:
   - General Operating Expense
   - Staff Salaries & Wages
   - Bank Charges & Fees
   - Other Operating Expense
3. Enter amount, reference, date, and description.
4. Click **Save**.

Each entry shows a **double-entry preview** (which account is debited, which is credited) before you save.

The **transaction history** at the bottom shows all entries with date, type, reference, description, amount, and the user who recorded it.

---

### Income Summary

**Path:** `/sending/accounting/income-summary`

A profit & loss overview for any date range (defaults to month-to-date).

**Shows:**
- Total revenue (remittance income — Standard + Immediate)
- Total expenses (operating costs recorded in Cash Management)
- Net income
- Transaction volume (count, CAD sent, GHS equivalent)
- Revenue breakdown by account

---

## 12. Quick Reference — Accounts

| Name | Role | Email |
|---|---|---|
| Edward Wilson | Super Admin | edward.wilson@andydenterprise.com |
| Jeffery Asante | Sending Admin | jeffery.asante@andydenterprise.com |
| Denise Asante | Sending Admin | denise.asante@andydenterprise.com |

> Passwords are not recorded here. Your Super Admin issues them directly and can
> reset one with `npx tsx scripts/reset-password.ts <email> <newpassword>`.

---

## Tips & Common Mistakes

| Situation | What to do |
|---|---|
| "No exchange rate available" error | Contact Sending Admin to set today's rate before creating transactions |
| Transaction stuck in PENDING after EOD | Check if it was an Immediate (Additional) type — use Sync Additional button |
| Sender balance shows owing but they paid | Use Record Payment on the sender's detail page |
| Wrong date on transaction | Edit the transaction and change the Transaction Date field |
| Accidentally created duplicate transaction | Cancel one of them immediately before EOD |
| EOD already run but need to add a transaction | Create it as an **Immediate** type — it syncs instantly without waiting for EOD |

---

*Andy D Enterprise — PETROS · Canada–Ghana*
