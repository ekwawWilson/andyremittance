# Andy-D Remittance System — User Guide

> For staff and operators. Covers all three portals: Sending, Receiving, and Admin.

---

## Table of Contents

1. [Who Can Do What — Roles](#1-who-can-do-what--roles)
2. [Logging In](#2-logging-in)
3. [Sending Portal](#3-sending-portal)
   - Dashboard
   - Creating a Transaction
   - Transactions List
   - Senders & Receivers
   - End of Day (Sending)
4. [Receiving Portal](#4-receiving-portal)
   - Dashboard
   - Pending Payments
   - Disbursing a Transaction
   - Partial Payments
   - Multi-Receiver Transactions
   - Till Management
   - Reconciliation
   - End of Day (Receiving)
5. [Admin Portal](#5-admin-portal)
   - Users & Permissions
   - Exchange Rates
   - Server Dates
   - Reports
6. [Transaction Statuses](#6-transaction-statuses)
7. [Day-to-Day Workflows](#7-day-to-day-workflows)
8. [Error Messages & What They Mean](#8-error-messages--what-they-mean)
9. [Glossary](#9-glossary)

---

## 1. Who Can Do What — Roles

Every user is assigned one role. That role determines which portal(s) they can access and what actions they can perform.

### Role Summary

| Role | Portal(s) | Main Responsibility |
|---|---|---|
| **Sending Agent** | Sending only | Create transactions, manage senders and receivers |
| **Sending Admin** | Sending + Admin | Everything a Sending Agent can do, plus manage users, set exchange rates, close sending EOD |
| **Admin** | Sending + Admin | Full sending-side control plus global reports and ledger access |
| **Teller** | Receiving only | Disburse cash to receivers, manage personal till, submit daily reconciliation |
| **Manager** | Receiving + Admin | Everything a Teller can do, plus approve reconciliations, manage vault transfers, close branch EOD |
| **Receiving Admin** | Receiving + Admin | Manage receiving-side users, approve reconciliations, close branch EOD |
| **Super Admin** | All three portals | Full system access with no restrictions |

### What Each Role Can and Cannot Do

**Sending Agent**
- ✅ Create, view, and cancel transactions
- ✅ Create and manage senders and receivers
- ✅ Print receipts
- ❌ Cannot set exchange rates
- ❌ Cannot close EOD
- ❌ Cannot see other agents' transactions (only their own)

**Sending Admin / Admin**
- ✅ Everything a Sending Agent can do
- ✅ See all agents' transactions
- ✅ Edit and delete any transaction
- ✅ Set exchange rates
- ✅ Close sending EOD
- ✅ Manage users

**Teller**
- ✅ See and disburse synced transactions for their branch
- ✅ Manage their personal till (load cash, request top-up, return to vault)
- ✅ Submit daily reconciliation
- ❌ Cannot approve their own reconciliation
- ❌ Cannot close branch EOD

**Manager / Receiving Admin**
- ✅ Everything a Teller can do
- ✅ Approve or reject teller reconciliations
- ✅ Approve vault transfer requests
- ✅ Close branch EOD

---

## 2. Logging In

1. Open the system in your browser.
2. Enter your email address and password.
3. Click **Sign In**.
4. You will be taken directly to your portal (Sending, Receiving, or Admin) based on your role.

**Forgot password?** Contact your system administrator to reset it.

**Session:** You will be logged out automatically after 24 hours of inactivity.

---

## 3. Sending Portal

Used by agents in Canada to record money transfers from senders to receivers in Ghana.

---

### Dashboard

The first page you see after logging in. Shows a summary of today's activity.

**What you see:**

- **Transactions Today** — how many transactions were created today
- **CAD Collected** — total Canadian dollars received from senders
- **GHS Sent** — total Ghanaian cedis that will be disbursed to receivers in Ghana
- **Status breakdown** — a count of Pending, Synced, Paid, and Cancelled transactions

**Exchange rate warning:** If no rate has been set for today, a yellow warning banner appears at the top. You will not be able to create transactions at the correct rate until an admin sets today's rate.

**Recent Transactions:** The 10 most recent transactions from today are shown in a table below the summary cards. Each row shows the transaction code, sender name, receiver name, CAD and GHS amounts, and current status.

---

### Creating a Transaction

Go to **New Transaction** from the sidebar or the tab bar.

The form has four sections:

---

#### Section 1 — Sender & Receiver

**Sender:**
- Type a name or phone number to search existing senders.
- If the sender is not in the system, click **+ New Sender** and fill in their first name, last name, and phone number.
- Once selected, the sender's credit available and any outstanding balance are shown below their name.

**Receiver mode — choose one:**
- **Single Receiver**: One person receives the money.
- **Multi-Receiver**: Two or more people share the money. See [Multi-Receiver Transactions](#multi-receiver-transactions) for details.

**Receiver (Single mode):**
- Type a name or phone to search receivers linked to the selected sender.
- If not found, click **+ New Receiver** and fill in their first name and phone. Last name, email, and relationship are optional.

---

#### Section 2 — Amount & Payment

| Field | What to enter |
|---|---|
| **CAD Amount** | Total amount the sender is sending, in Canadian dollars |
| **Payment Method** | How the sender is paying you: **Cash**, **E-Transfer**, or **Split** (combination) |
| **Amount Paid** | How much the sender paid today. Can be less than the total (creates a pending balance). Click **Pay Full** to auto-fill. |

The **GHS equivalent** is calculated automatically using today's exchange rate and shown below the CAD amount field.

The **Pending Amount** shows how much the sender still owes. If fully paid it shows a green "Fully paid" badge.

**Transaction Type:**
- **Standard** — synced to Ghana at the end of the business day (after sending EOD closes).
- **Immediate** (⚡) — synced to Ghana right away. Use this for urgent transfers. No need to wait for EOD.

---

#### Section 3 — Delivery Details (Ghana Side)

| Field | What to enter |
|---|---|
| **Receiving Branch** | Select the Ghana branch where the receiver will collect |
| **Payout Method** | How the receiver will get their money: **Cash**, **Bank Transfer**, or **Mobile Money** |

**If Bank Transfer:**
- Bank Name, Account Number, Account Name, and Bank Branch are all required.
- If the receiver has these details saved on their profile, they will pre-fill.

**If Mobile Money:**
- MoMo Number is required. MoMo Account Name is optional (pre-fills with receiver's name).

**Notes:** Any special instructions for the branch (optional, max 500 characters).

---

#### Section 4 — Review & Submit

Check the summary at the bottom:
- CAD Amount, GHS Equivalent, Amount Paid, Pending Balance.

Click **Create Transaction**.

**On success:** A green banner shows the transaction code (e.g., `A0209-W001`). A receipt can be printed immediately.

---

#### Validation Rules

The system will block submission and show an error if any of the following are not met:

| Rule | Error shown |
|---|---|
| No exchange rate set for today | "Exchange rate not available. Contact admin to set today's rate." |
| CAD amount is zero | "CAD amount must be greater than 0." |
| Amount paid exceeds CAD amount | "Amount paid cannot exceed total." |
| No sender selected | "Please select a sender." |
| No receiver selected (single mode) | "Please select or create a receiver." |
| No branch selected | "Please select a receiving branch." |
| Bank details incomplete | "Bank name is required for bank payments." / "Account number is required." / etc. |
| MoMo number missing | "Mobile money number is required." |
| Multi-receiver over-allocated | "Allocated GHS exceeds total GHS." |
| Duplicate transaction | Blocked silently (same sender, receiver, amount, and date already exists) |

**Credit limit warning:** If the sender's unpaid portion exceeds their credit limit, a yellow warning appears showing exactly how much they owe vs. their credit allowance. The transaction can still be created but the agent should collect more upfront.

---

### Exchange Rate Override

Only available to users with the "Edit Exchange Rate" permission.

Below the GHS calculation, there is a rate override field. You can enter a custom rate for that transaction only.

- If the override differs from the official rate by more than 20%, you cannot submit. You must either reduce the deviation or clear the override.
- If the override is valid, a green "Rate set" badge appears.

---

### Transactions List

Go to **Transactions** in the sidebar. Shows all transactions (or just yours, if you don't have "View All Transactions" permission).

**Filters:**
- **Status**: All / Pending / Synced / Paid / Partial / Cancelled
- **Date range**: From and To date pickers
- **Search**: By transaction code, sender name, or receiver name
- **Mine only**: Toggle to show only your own transactions (for admins who want to filter)

**Actions available per transaction:**

| Status | Actions |
|---|---|
| Pending | Edit, Cancel, Collect Remaining (if unpaid balance) |
| Synced | View only (read-only after sync) |
| Partial | Collect Remaining, Cancel |
| Paid | Print Receipt |
| Cancelled | View only |

**Editing a transaction:** Opens the same form as creation. All fields can be changed. Note: once a transaction is Synced to the receiving portal, it can no longer be edited.

**Cancelling a transaction:** Shows a confirmation dialog. Changes status to Cancelled. Cannot be undone.

---

### Senders & Receivers

**Senders list** (`/sending/senders`): Search and view all senders. Click a sender to see their profile.

**Sender profile page:**
- Name, phone, email, credit limit, current balance (how much they owe or are in credit)
- All receivers linked to this sender
- Full transaction history
- Ledger statement (date-filtered, exportable)

**Receivers list** (`/sending/receivers`): Search all receivers across all senders.

**Receiver profile:** Name, phone, payment preference, linked sender, and transaction history.

---

### End of Day — Sending Portal

Go to **End of Day** in the sidebar.

**What EOD does:**
- Sends all Standard (non-Immediate) transactions created today to the Ghana receiving portal.
- Once synced, those transactions are visible to tellers and can be disbursed.
- After closing, the business date automatically advances by one day.

**Before you close:**

The EOD page shows a summary of the day:

| Stat | What it means |
|---|---|
| Total Transactions | All active (non-cancelled) transactions |
| CAD Collected | Total received from all senders |
| GHS Sent | Total cedis to be disbursed |
| Unsynced Standard | Transactions waiting to be sent to Ghana |
| Total Owing | Outstanding CAD balances from senders |

Below the stats:
- **Sender Owings Table**: Lists every transaction with an unpaid balance (who owes, how much).
- **Transactions by Type Table**: Groups Standard and Immediate transactions with counts and totals.

**To close the day:**
1. Click **Close Day**.
2. A confirmation dialog appears showing what will be synced.
3. Click **Confirm Close Day**.
4. A green success banner confirms: "Day closed successfully. X standard transaction(s) synced."
5. A **PDF Report** button appears for the day's EOD report.

**Already closed:** If EOD is already done for today, the button shows "Already Closed" and is disabled.

**History tab:** Shows all previous EOD closures with date, who closed it, how many transactions were synced, and a link to the PDF report.

---

#### Adjusting the Business Date

The current business date is shown in a banner at the top of the EOD page and in the top bar on every page.

Admins (Sending Admin, Admin, Super Admin) will see a small **pencil icon** next to the date in the top bar. Clicking it opens a dialog to set a new date manually.

> This is only needed if a day was missed or the date drifted. In normal operation, the date advances automatically each time EOD is closed.

---

## 4. Receiving Portal

Used by tellers and managers in Ghana to receive synced transactions, disburse cash, manage tills, and close the branch day.

---

### Dashboard

Shows the branch's current activity.

**KPI cards:**
- **Pending Payments** — transactions synced and waiting to be disbursed
- **Paid Out Today** — transactions already disbursed today
- **Total Today** — all transactions for the branch today
- **Today's GHS** — total value of GHS to be paid out

**Disbursement progress bar:** Shows what percentage of today's transactions have been paid (e.g., "60% — 12 paid today, 8 pending").

**Branch Float Health:** Each vault account is shown with its current GHS balance and a health status:
- **Healthy** — GHS 5,000 or more (green)
- **Low Float** — GHS 1,000–4,999 (amber)
- **Critical** — Below GHS 1,000 (red)

**Quick action cards:** Shortcuts to Pending Payments, My Till, Reconciliation, Disbursement History, and Branch EOD.

---

### Pending Payments

Go to **Pending** in the tab bar or sidebar.

Lists all transactions that have been synced from the sending portal and are ready to disburse.

**Till float alert (top of page):**
- **Critical** (red): Balance below GHS 200 — stop disbursing, request a vault top-up immediately.
- **Low Float** (amber): Balance GHS 200–499 — consider requesting a top-up soon.
- **Healthy** (green): Balance GHS 500 or above — safe to continue.

**Filters:**
- Payout Mode: All / Cash / Bank / MoMo
- Code Type: All / Standard / Immediate
- Date range: From and To
- Search: By transaction code, receiver name, or phone number

**Each transaction row shows:**
- Transaction code
- How long ago it arrived (age badge — turns red if waiting more than 4 hours or more than a day)
- Receiver name (or "Multi — assigned at branch" for deferred multi-receiver)
- Sender name
- GHS amount
- Action buttons

**Action buttons per transaction:**

| Transaction type | Button shown |
|---|---|
| Single receiver, not yet paid | **Disburse** |
| Single receiver, partial payment made | **Complete Payment** |
| Multi-receiver | **Multi-Disburse** |
| Any | **Partial Pay** (to pay in instalments) |

---

### Disbursing a Transaction

#### Single Receiver — Full Payment

1. Click **Disburse** on the transaction row.
2. A modal opens showing the receiver's details (name, phone) and the transaction details (code, GHS amount, branch).
3. **Verify the receiver's identity.** Tick the checkbox: *"I confirm the receiver's identity matches the details above and they have presented valid ID."*
4. Select the **Payout Mode** (Cash, Bank, or MoMo) — this should match what was specified at the sending side.
5. Fill in the required details:

   **Cash:**
   - Ghana Card Number (required)
   - Phone Number (required)

   **Bank Transfer:**
   - Bank Name, Account Number, Account Name (all required)

   **Mobile Money:**
   - MoMo Number (required)
   - MoMo Account Name (required)

6. Click **Confirm & Disburse**.
7. The transaction is marked as **Paid**, removed from the pending list, and a receipt prints automatically.

---

#### Single Receiver — Completing a Partial Payment

If a transaction shows **Complete Payment**, it means some GHS was already paid and a balance remains.

1. Click **Complete Payment**.
2. The modal shows the outstanding GHS amount (not the full total).
3. Verify identity, fill in payment details, and click **Confirm & Disburse**.
4. Transaction marked as **Paid**.

---

### Partial Payments

Use this when a receiver cannot collect the full GHS amount in one visit.

1. Click **Partial Pay** on any SYNCED or PARTIAL_PAYMENT transaction.
2. A modal opens showing:
   - Total GHS for the transaction
   - Amount already paid (if any)
   - Amount remaining
3. Enter the **partial amount** to pay now (manually or use the denomination calculator).
4. Verify identity and fill in payment details.
5. Add an optional note (e.g., "Will collect remainder next week").
6. Click **Submit**.
7. Status changes to **Partial Payment**. The transaction stays on the pending list with the remaining balance shown.

The receiver can return later to collect the rest. Repeat the partial payment process as many times as needed. On the final payment, click **Complete Payment** instead.

---

### Multi-Receiver Transactions

A single transaction where the total GHS is split among multiple receivers.

There are two types:

---

#### Type 1 — Pre-assigned (receivers set at sending side)

The sending agent already specified each receiver and their GHS allocation.

1. Click **Multi-Disburse** on the transaction.
2. The modal shows a table with each receiver's name, phone, and allocated GHS amount (read-only).
3. Verify identities and tick the confirmation checkbox.
4. Choose the payout mode and fill in payment details.
5. Click **Confirm & Disburse**.
6. A receipt is printed showing all allocations.

---

#### Type 2 — Deferred (receivers assigned at branch)

The sending agent did not specify receivers. The teller assigns them at disbursement time.

1. Click **Multi-Disburse** on a transaction marked "Multi — assigned at branch".
2. The modal opens with empty allocation rows.
3. For each receiver, enter:
   - Receiver Name (required)
   - Receiver Phone (required)
   - GHS Amount (required)
4. The running total is shown. It must exactly match the transaction's total GHS (within GHS 0.01).

   - If over: "Allocated X GHS exceeds transaction total Y GHS."
   - If under: "All funds must be allocated."

5. Click **+ Add Receiver** to add more rows if needed.
6. Once all GHS is allocated, verify identities and tick the confirmation checkbox.
7. Click **Confirm & Disburse**.
8. Multi-receiver receipt prints with all allocations.

---

### Till Management

Go to **Till** in the tab bar or sidebar.

This page tracks your personal cash drawer for the day.

**What you see:**
- **Till Balance** — your current cash position
- **Cash Loaded** — total cash added today (from vault, bank, etc.)
- **Disbursed** — total paid out to receivers
- **Returned to Vault** — total returned today
- **Till Statement** — a full list of every cash movement today (time, type, amount, running balance)

**Viewing past dates:** Use the date picker to view any previous day's statement. All action buttons are hidden on historical views — you can only read past statements.

---

#### Loading Cash Into Your Till

Click **Load Cash**.

1. Select a **source**:
   - Bank Withdrawal
   - Cash Brought In
   - Agent Deposit
   - Other
2. Enter the amount (manual) or count denominations using the denomination calculator toggle.
3. Add a note if needed (e.g., bank withdrawal reference number).
4. Click **Load GHS [amount]**.

Your till balance increases immediately.

---

#### Requesting Cash From the Vault

Click **Request from Vault** when your balance is running low.

1. Select the vault to request from (shows vault name and current balance).
2. Enter the amount you need.
3. Add a reason (optional).
4. Click **Submit Request**.

The request is sent to the branch manager or admin for approval. It appears in the **Transfer Requests** section at the bottom of your till page with a **Pending** status.

Once approved, the funds are transferred and your till balance increases. If rejected, the reason is shown.

---

#### Returning Cash to the Vault

Click **Return to Vault** at end of shift or when you have excess cash.

1. Select the vault to return to.
2. Enter the amount (cannot exceed your current till balance).
3. Add a note.
4. Click **Submit Request**.

This also requires manager approval before the funds move.

---

#### Printing a Till Slip

Click the **Print** button at the top of the till page. Opens a printable version of your till statement for the current day or selected period.

---

#### Float Alerts

If your till balance is low, alerts appear at the top of the page:

- **Critical** (red): Below GHS 200 — request a top-up immediately.
- **Low Float** (amber): GHS 200–499 — consider requesting a top-up.

These alerts also appear at the top of the Pending Payments page so you know before trying to disburse.

---

### Reconciliation

Go to **Reconciliation** in the sidebar.

Done at the **end of every shift** before the branch can close its day.

**Purpose:** Count your physical cash and confirm it matches the till ledger. Any difference (variance) is reported for supervisor review.

---

#### Submitting a Reconciliation

Click **New Reconciliation**.

**Section 1 — Ledger Figures (read-only, auto-populated):**

| Field | What it shows |
|---|---|
| Opening Balance | Your closing balance from the previous approved reconciliation |
| Cash / Transfers In | Total cash loaded today (vault transfers + manual loads) |
| Payments Made / Disbursed | Total paid out to receivers today |
| Returns to Vault | Total returned to vault today |
| **Expected Closing** | Opening + In − Disbursed − Returned |

**Section 2 — Physical Cash Count:**

Count the cash in your till right now. Either:
- Enter the total directly in the **Manual Entry** field, or
- Use the **Denomination Calculator** — enter how many of each note/coin you have, and the total is calculated for you.

**Variance section** appears once you enter a physical count:
- If physical count = expected: **No variance** — "Reconciliation will complete automatically." ✅
- If difference < GHS 1.00: **Minor variance** — "Supervisor approval required." ⚠️
- If difference ≥ GHS 1.00: **Over threshold** — "A note is required and supervisor approval will be needed." 🔴

**Notes field:**
- Optional if no variance or minor variance.
- **Required** if variance is GHS 1.00 or more. Explain what happened (e.g., change given, denomination error).

**Sign-off checkbox (required):**
Tick: *"I confirm that the physical cash count entered above is accurate…"*

Click **Submit Reconciliation**.

---

#### What Happens After Submission

| Outcome | Status |
|---|---|
| No variance | **Completed** — no further action needed |
| Variance < GHS 1.00 | **Pending** — manager reviews and approves or rejects |
| Variance ≥ GHS 1.00 | **Pending** — manager reviews and approves or rejects |

If your reconciliation is **Rejected**, you must resubmit with corrections before branch EOD can close.

**Reconciliation history** is shown below the form, listing all previous submissions with dates, amounts, variance, and status.

---

#### For Managers — Approving Reconciliations

Go to **Admin → Reconciliations** (or the Reconciliations section in the receiving admin pages).

- See all teller submissions with their variance amounts and status.
- Click **Approve** or **Reject**.
- If rejecting, add a reason. The teller must resubmit.
- On approval, any variance is automatically journalled (written off or credited).

---

### End of Day — Receiving Portal

Go to **Branch EOD** from the dashboard or sidebar.

**What branch EOD does:**
- Confirms all tellers have reconciled for the day.
- Records the day's total disbursements.
- Advances the branch business date by one day.

---

#### Before Closing

1. Select the **branch** (locked to your own branch if you're a teller or single-branch manager).
2. Select the **business date** (defaults to current branch server date).
3. Click **Check Status**.

The system runs a pre-close check and shows:

**KPI bar:**
- Tellers Submitted (how many submitted reconciliations out of total)
- Resolved Recons (how many are Completed or Approved)
- Today's Disbursements (total GHS paid out today)
- Total Variance (sum of all teller variances today)

**Outstanding Payable:** Shows the total GHS the branch still owes to receivers (from synced but unpaid transactions).
- Blue if GHS still outstanding: "This is the total GHS the branch owes to receivers."
- Green if all cleared: "All payables cleared — no outstanding obligations."

**Teller Status Table:** Every teller with:
- Their reconciliation status (Missing / Pending Review / Completed / Approved / Rejected)
- Their current till balance
- Their variance amount

**Close Day button** is enabled only when all tellers are either Completed or Approved.

---

#### Closing the Day

1. Click **Close Branch Day**.
2. Confirmation modal shows:
   - Date being closed
   - Outstanding conditions (if any)
   - Tick: *"I understand all tellers have either balanced or been supervisor-approved."*
   - **Force Close** option (for emergencies — bypasses pending reconciliations. Use with caution.)
3. Click **Confirm Close Day**.

**On success:**
- Green banner: "Branch EOD closed for [Branch]. GHS X disbursed across Y transaction(s)."
- Branch business date advances to the next day.
- PDF Report button appears.

---

#### Already Closed

If EOD for this date has already been closed, the system shows:
- Green banner: "This branch is already closed for [date]."
- No Close button shown.

**History tab:** Lists all previous branch EOD records — date, who closed it, time, disbursements, and a PDF report link.

---

## 5. Admin Portal

Accessible to Sending Admin, Admin, Manager, Receiving Admin, and Super Admin.

---

### Users & Permissions

Go to **Users** in the Admin sidebar.

**Creating a new user:**
1. Click **+ New User**.
2. Fill in:
   - First Name, Last Name (required)
   - Email (required, must be unique)
   - Role (select from dropdown — options depend on your own role)
   - Receiving Branch (required for Teller, Manager, Receiving Admin)
   - Status: Active or Inactive
3. Click **Save**.

The user receives login credentials (set via the admin or a password reset).

**Editing a user:** Click the edit button next to any user. Change any field and save.

**Deactivating a user:** Toggle Status to Inactive. Inactive users cannot log in.

**Permissions:** Super Admins and Admins can grant individual permissions to specific users beyond their role defaults. This allows fine-grained control (e.g., giving a specific Teller the ability to reprint receipts).

---

### Exchange Rates

Go to **Exchange Rates** in the Admin sidebar.

A new CAD→GHS rate must be set each business day before agents can create transactions.

**To set today's rate:**
1. The date defaults to today. Change it if setting a rate for another day.
2. Enter the rate (e.g., `14.5500` for GHS 14.55 per CAD $1).
3. Add a reference note if needed (e.g., "Bank of Ghana rate").
4. Click **Set Rate**.

**Rate history:** All past rates are listed with the date they were set and who set them.

> **Important:** If today's rate is not set before agents start creating transactions, they will see a warning and may use an outdated rate. Set the rate each morning before agents begin work.

---

### Server Dates

Go to **Server Dates** in the Admin sidebar.

Shows the current business date for the sending portal and each receiving branch.

**Sending portal date:** Advances automatically when sending EOD is closed. To adjust manually, click the pencil icon next to the date.

**Receiving branch dates:** Each branch has its own date. Each advances independently when that branch closes its EOD. To adjust manually, click the pencil icon next to the branch.

> **When to adjust manually:** Only if a day was skipped (e.g., a public holiday with no transactions) or if the date drifted due to a system issue. In normal operation, dates advance automatically.

You can also adjust dates directly from the top bar on any page — the pencil icon next to the date is visible on all pages for authorised users.

---

### Reports

Various reports are available depending on your role.

**Daily Report:** Transaction counts and totals by date. Filter by date range and branch.

**Agent Report:** Per-agent transaction count, CAD collected, and GHS sent. Shows commission calculations.

**Closing Balances Report:** Till closing balances per teller per branch. Useful for end-of-day auditing.

**Additional Till Report:** Activity for Immediate (Additional) transaction type separately.

All reports can be exported as **PDF** or **CSV/Excel**.

---

## 6. Transaction Statuses

| Status | What it means | Who sees it | Available actions |
|---|---|---|---|
| **Pending** | Created on sending side, not yet synced to Ghana | Sending portal | Edit, Cancel, Collect Remaining |
| **Synced** | Sent to Ghana branch, waiting to be disbursed | Both portals | Receiving: Disburse, Partial Pay |
| **Partial Payment** | Some GHS disbursed, balance remaining | Both portals | Receiving: Complete Payment, more Partial Pay |
| **Paid** | Fully disbursed to receiver | Both portals (read-only) | Print Receipt |
| **Cancelled** | Cancelled by sending agent | Sending portal (greyed out) | View only |
| **Flagged** | Held by branch (ID issue, dispute, etc.) | Receiving portal | Unflag to restore previous status |
| **Void** | Force-closed by admin | Both portals (read-only) | View only |

---

## 7. Day-to-Day Workflows

### Sending Agent — Typical Day

1. **Check the exchange rate.** If no rate is set, contact your admin.
2. **Create transactions** as senders come in.
   - For urgent transfers, select **Immediate** type.
   - For regular transfers, leave as **Standard**.
3. **Collect payments.** Record what each sender pays upfront. If they pay in full, mark "Pay Full". If partial, enter the amount they paid.
4. **Print receipts** for senders who request them.
5. **At end of day:** Notify your Sending Admin that day's transactions are ready.

---

### Sending Admin — End of Day Close

1. Review the EOD page — check unsynced standard transaction count and any owings.
2. Click **Close Day** and confirm.
3. Transactions sync to Ghana instantly.
4. Download/print the PDF report.
5. Business date automatically advances.

---

### Teller — Typical Day

1. **Load your till** at the start of shift (from vault or bring cash in).
2. **Process disbursements** from the Pending Payments page as receivers arrive.
   - Verify ID, confirm details, disburse, receipt prints.
3. **Request a top-up** from the vault if your balance runs low.
4. **At end of shift:** Go to Reconciliation, count your cash, submit reconciliation.
5. Wait for manager approval if there is a variance.

---

### Manager — End of Day Close

1. Approve all pending teller reconciliations (or reject with a reason so tellers can resubmit).
2. Go to **Branch EOD** → **Check Status**.
3. Confirm all tellers show Completed or Approved.
4. Click **Close Branch Day** → confirm.
5. Branch date advances. PDF report available.

---

### Full Transaction Lifecycle Example

**Scenario:** John sends CAD $100 to Mary in Accra. Mary collects in cash.

| Step | Who | What happens |
|---|---|---|
| 1 | Sending Agent | Creates transaction: John → Mary, CAD $100, GHS 1,450, Cash payout, Accra branch |
| 2 | Sending Agent | John pays $100 upfront. "Fully paid" shown. |
| 3 | Sending Admin | Closes sending EOD. Transaction synced. Status → **Synced**. |
| 4 | Teller (Accra) | Sees transaction in Pending Payments. Mary arrives with her Ghana Card. |
| 5 | Teller | Clicks Disburse. Verifies Mary's identity. Enters Ghana Card number and phone. Confirms. |
| 6 | System | Status → **Paid**. Receipt prints. Till balance decreases by GHS 1,450. |
| 7 | Teller | At end of shift, counts cash, submits reconciliation. No variance → **Completed**. |
| 8 | Manager | Closes branch EOD. Branch date advances. |

---

## 8. Error Messages & What They Mean

| Error | Cause | What to do |
|---|---|---|
| "Exchange rate not available" | No rate set for today | Ask admin to set today's rate in Admin → Exchange Rates |
| "Amount paid cannot exceed total" | Amount Paid > CAD Amount | Reduce Amount Paid or increase CAD Amount |
| "Allocated GHS exceeds total GHS" | Multi-receiver allocations add up to more than the total | Adjust individual amounts to sum exactly to the total |
| "The same receiver is selected more than once" | Duplicate receiver in multi-receiver form | Remove the duplicate row |
| "Bank name is required for bank payments" | Bank transfer selected but bank details missing | Fill in Bank Name, Account Number, Account Name, and Branch |
| "Ghana Card number is required for cash payments" | Cash payout attempted without Ghana Card | Ask receiver for Ghana Card and enter the number |
| "Mobile money number is required" | MoMo payout attempted without MoMo number | Enter the receiver's MoMo number |
| "Variance exceeds threshold" | Physical cash count differs from ledger by more than GHS 1.00 | Enter a detailed note explaining the difference and submit |
| "Rate override deviation too large" | Custom rate differs from official rate by more than 20% | Clear the override and use the official rate |
| "This transaction has been synced and can no longer be edited" | Trying to edit a Synced transaction from the sending side | Contact receiving branch if correction is needed |
| "No reconciliation submitted for today yet" | Teller has not submitted daily reconciliation | Submit reconciliation before branch EOD can close |
| "All funds must be allocated" | Multi-receiver (deferred) allocations don't add up to total | Add more receivers or increase amounts to cover the full GHS total |

---

## 9. Glossary

| Term | Meaning |
|---|---|
| **CAD** | Canadian dollars — the currency used on the sending side |
| **GHS** | Ghanaian cedis — the currency disbursed to receivers in Ghana |
| **Exchange Rate** | How many GHS one CAD is worth today (e.g., 1 CAD = 14.55 GHS). Set daily by admin. |
| **Business Date / Server Date** | The official date the system is operating on. May differ from the calendar date if EOD has not yet been closed. |
| **Standard Transaction** | A regular transfer synced to Ghana at end of day. |
| **Immediate Transaction** | An urgent transfer synced to Ghana right away, without waiting for EOD. |
| **EOD (End of Day)** | The daily close process. Sending EOD syncs transactions to Ghana. Branch EOD confirms all tellers are balanced and advances the business date. |
| **Synced** | A transaction that has been sent from the sending portal to the Ghana receiving portal and is ready for disbursement. |
| **Disbursement** | Paying out GHS to a receiver in Ghana. |
| **Till** | A teller's personal cash drawer. Tracks every cash movement during a shift. |
| **Vault** | The branch's main cash reserve, separate from individual teller tills. |
| **Float** | The available cash in a teller's till. Low float means the teller should request a top-up before disbursing. |
| **Reconciliation** | A teller's daily cash count. Compares physical cash with the ledger to find any variance. |
| **Variance** | The difference between what the ledger says a teller should have and what they actually counted. A variance requires a supervisor's approval. |
| **Credit Limit** | The maximum amount a sender is allowed to owe the company at any time. Set by admin per sender. |
| **Partial Payment (sending)** | When a sender pays less than the full CAD amount upfront. The remainder is tracked as a pending balance. |
| **Partial Pay (receiving)** | When a receiver collects less than the full GHS in one visit. The remainder stays pending for future collection. |
| **Multi-Receiver** | A single transaction that splits GHS among two or more receivers. |
| **Deferred Receivers** | A multi-receiver transaction where receiver details are not provided at the sending side — the teller assigns them at disbursement. |
| **Receipt** | A printable A5 document generated after disbursement. Includes a Customer Copy and an Office Copy on one print job. |
