const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('auth_token', token);
      } else {
        localStorage.removeItem('auth_token');
      }
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
    }
    return this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const token = this.getToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    };

    // Abort after 30 seconds to prevent indefinite hangs
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
        signal: controller.signal,
      });

      // Token expired or revoked — clear local session immediately
      if (response.status === 401) {
        this.setToken(null);
        return { success: false, error: 'Session expired. Please sign in again.' };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { success: false, error: 'Request timed out. Please try again.' };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Request failed',
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Auth
  async login(email: string, password: string) {
    const response = await this.request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (response.success && response.data?.token) {
      this.setToken(response.data.token);
    }
    return response;
  }

  async getProfile() {
    return this.request<User>('/api/auth/me');
  }

  logout() {
    this.setToken(null);
  }

  // Senders
  async getSenders(params?: { search?: string; page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    return this.request<{ senders: Sender[]; pagination: Pagination }>(`/api/senders?${query}`);
  }

  async getSender(id: string) {
    return this.request<Sender>(`/api/senders/${id}`);
  }

  async createSender(data: CreateSenderData) {
    return this.request<Sender>('/api/senders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSender(id: string, data: Partial<CreateSenderData>) {
    return this.request<Sender>(`/api/senders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async senderPayment(senderId: string, data: { amount: number; type: string; paymentMethod: string; notes?: string }) {
    return this.request<{ senderId: string; amount: number; type: string }>(`/api/senders/${senderId}/payment`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getSenderStatement(senderId: string, params?: { startDate?: string; endDate?: string }) {
    const query = new URLSearchParams();
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    return this.request<SenderStatement>(`/api/senders/${senderId}/statement?${query}`);
  }

  // Receivers
  async getReceivers(params?: { senderId?: string; search?: string }) {
    const query = new URLSearchParams();
    if (params?.senderId) query.set('senderId', params.senderId);
    if (params?.search) query.set('search', params.search);
    return this.request<Receiver[]>(`/api/receivers?${query}`);
  }

  async getReceiver(id: string) {
    return this.request<Receiver & { transactions: Transaction[] }>(`/api/receivers/${id}`);
  }

  async createReceiver(data: CreateReceiverData) {
    return this.request<Receiver>('/api/receivers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateReceiver(id: string, data: Partial<CreateReceiverData>) {
    return this.request<Receiver>(`/api/receivers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Transactions
  async getTransactions(params?: {
    status?: string;
    receivingPointId?: string;
    senderId?: string;
    receiverId?: string;
    createdById?: string;
    codeType?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.receivingPointId) query.set('receivingPointId', params.receivingPointId);
    if (params?.senderId) query.set('senderId', params.senderId);
    if (params?.receiverId) query.set('receiverId', params.receiverId);
    if (params?.createdById) query.set('createdById', params.createdById);
    if (params?.codeType) query.set('codeType', params.codeType);
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    return this.request<{ transactions: Transaction[]; pagination: Pagination }>(`/api/transactions?${query}`);
  }

  async getTransaction(id: string) {
    return this.request<Transaction>(`/api/transactions/${id}`);
  }

  async createTransaction(data: CreateTransactionData) {
    return this.request<Transaction>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async markTransactionPaid(id: string, data?: {
    receivingMode: 'CASH' | 'BANK' | 'MOMO';
    bankName?: string;
    bankAccountNo?: string;
    bankAccountName?: string;
    cashPhoneNumber?: string;
    cashGhanaCardNumber?: string;
    momoNumber?: string;
    momoName?: string;
  }) {
    return this.request<Transaction>(`/api/transactions/${id}/mark-paid`, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async updateTransaction(id: string, data: Partial<CreateTransactionData>) {
    return this.request<Transaction>(`/api/transactions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteTransaction(id: string) {
    return this.request<null>(`/api/transactions/${id}`, {
      method: 'DELETE',
    });
  }

  async collectRemaining(id: string, paymentMethod: string) {
    return this.request<Transaction>(`/api/transactions/${id}/collect-remaining`, {
      method: 'POST',
      body: JSON.stringify({ paymentMethod }),
    });
  }

  async flagTransaction(id: string, action: 'VOID' | 'FLAGGED' | 'RESTORE', reason: string) {
    return this.request<Transaction>(`/api/transactions/${id}/flag`, {
      method: 'POST',
      body: JSON.stringify({ action, reason }),
    });
  }

  // Exchange Rates
  async getTodayRate() {
    return this.request<ExchangeRate>('/api/exchange-rates/today');
  }

  async getExchangeRates(params?: { startDate?: string; endDate?: string }) {
    const query = new URLSearchParams();
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    return this.request<ExchangeRate[]>(`/api/exchange-rates?${query}`);
  }

  async setExchangeRate(date: string, cadToGhs: number) {
    return this.request<ExchangeRate>('/api/exchange-rates', {
      method: 'POST',
      body: JSON.stringify({ date, cadToGhs }),
    });
  }

  // Receiving Points
  async getReceivingPoints() {
    return this.request<ReceivingPoint[]>('/api/receiving-points');
  }

  async createReceivingPoint(data: CreateReceivingPointData) {
    return this.request<ReceivingPoint>('/api/receiving-points', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateReceivingPoint(id: string, data: Partial<{ name: string; address: string; city: string; country: string; phone: string; isActive: boolean }>) {
    return this.request<ReceivingPoint>(`/api/receiving-points/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Audit Log
  async getAuditLog(params?: { entity?: string; action?: string; userId?: string; startDate?: string; endDate?: string; page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.entity) query.set('entity', params.entity);
    if (params?.action) query.set('action', params.action);
    if (params?.userId) query.set('userId', params.userId);
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    return this.request<{ logs: AuditLog[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(`/api/audit-log?${query}`);
  }

  // Ledger
  async getLedgerAccounts(params?: { accountType?: string; receivingPointId?: string }) {
    const query = new URLSearchParams();
    if (params?.accountType) query.set('accountType', params.accountType);
    if (params?.receivingPointId) query.set('receivingPointId', params.receivingPointId);
    return this.request<LedgerAccount[]>(`/api/ledger/accounts?${query}`);
  }

  async getLedgerStatement(accountId: string, params?: { startDate?: string; endDate?: string }) {
    const query = new URLSearchParams();
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    return this.request<LedgerEntry[]>(`/api/ledger/statement/${accountId}?${query}`);
  }

  async vaultToTeller(vaultId: string, tellerId: string, amount: number, notes?: string) {
    return this.request<LedgerEntry>('/api/ledger/transfers/vault-to-teller', {
      method: 'POST',
      body: JSON.stringify({ vaultId, tellerId, amount, notes }),
    });
  }

  async tellerToVault(vaultId: string, amount: number, notes?: string) {
    return this.request<CashTransferRequest>('/api/ledger/transfers/teller-to-vault', {
      method: 'POST',
      body: JSON.stringify({ vaultId, amount, notes }),
    });
  }

  async vaultToSelfTill(vaultId: string, amount: number, notes?: string) {
    return this.request<CashTransferRequest>('/api/ledger/transfers/vault-to-self-till', {
      method: 'POST',
      body: JSON.stringify({ vaultId, amount, notes }),
    });
  }

  // Transfer request management
  async createTransferRequest(fromAccountId: string, toAccountId: string, amount: number, notes?: string) {
    return this.request<CashTransferRequest>('/api/ledger/transfers/request', {
      method: 'POST',
      body: JSON.stringify({ fromAccountId, toAccountId, amount, notes }),
    });
  }

  async getTransferRequests(params?: { status?: string }) {
    const query = params?.status ? `?status=${params.status}` : '';
    return this.request<CashTransferRequest[]>(`/api/ledger/transfers/request${query}`);
  }

  async approveTransferRequest(id: string) {
    return this.request<CashTransferRequest>(`/api/ledger/transfers/request/${id}/approve`, { method: 'POST' });
  }

  async rejectTransferRequest(id: string, reason: string) {
    return this.request<CashTransferRequest>(`/api/ledger/transfers/request/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  // Reconciliation approval
  async approveReconciliation(id: string) {
    return this.request<unknown>(`/api/reconciliation/${id}/approve`, { method: 'POST' });
  }

  async rejectReconciliation(id: string, reason: string) {
    return this.request<unknown>(`/api/reconciliation/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  // Receiving EOD
  async checkReceivingEod(date: string, receivingPointId?: string) {
    const query = new URLSearchParams({ date });
    if (receivingPointId) query.set('receivingPointId', receivingPointId);
    return this.request<EodCheckResult>(`/api/receiving/eod/check?${query}`);
  }

  async closeReceivingEod(data: { date: string; notes?: string; forceClose?: boolean; receivingPointId?: string }) {
    return this.request<{ eodRecord: ReceivingEodRecord; reconciliationsReady: number; totalDisbursed: number; disbursementCount: number }>('/api/receiving/eod', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getReceivingEodHistory(params?: { page?: number; limit?: number; receivingPointId?: string }) {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.receivingPointId) query.set('receivingPointId', params.receivingPointId);
    return this.request<{ records: ReceivingEodRecord[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(`/api/receiving/eod?${query}`);
  }

  // Bulk disburse
  async bulkDisburse(transactionIds: string[]) {
    return this.request<BulkDisburseResult>('/api/transactions/bulk-disburse', {
      method: 'POST',
      body: JSON.stringify({ transactionIds }),
    });
  }

  // Multi-receiver transaction
  async createMultiReceiverTransaction(data: {
    senderId: string;
    cadAmount: number;
    exchangeRateId: string;
    exchangeRateOverride?: number;
    paymentMethod: string;
    amountPaidCAD: number;
    receivingMode: string;
    receivingPointId: string;
    codeType?: string;
    bankName?: string;
    bankAccountNo?: string;
    bankAccountName?: string;
    bankBranch?: string;
    cashPhoneNumber?: string;
    cashGhanaCardNumber?: string;
    momoNumber?: string;
    momoName?: string;
    notes?: string;
    receiversDeferred?: boolean;
    receivers?: { receiverId: string; ghsAmount: number; notes?: string }[];
  }) {
    return this.request<Transaction & { transactionReceivers: TransactionReceiver[] }>(
      '/api/transactions/multi-receiver',
      { method: 'POST', body: JSON.stringify(data) }
    );
  }

  async disburseMultiReceiver(transactionId: string, allocations: {
    receiverId?: string;
    receiverName?: string;
    receiverPhone?: string;
    ghsAmount: number;
    notes?: string;
  }[]) {
    return this.request<Transaction & { transactionReceivers: TransactionReceiver[] }>(
      '/api/transactions/multi-receiver/disburse',
      { method: 'POST', body: JSON.stringify({ transactionId, allocations }) }
    );
  }

  // Sub-payments
  async createSubPayment(transactionId: string, data: {
    ghsAmount: number;
    receiverName: string;
    receiverPhone: string;
    receivingMode: 'CASH' | 'BANK' | 'MOMO';
    notes?: string;
    bankName?: string;
    bankAccountNo?: string;
    bankAccountName?: string;
    cashPhoneNumber?: string;
    cashGhanaCardNumber?: string;
    momoNumber?: string;
    momoName?: string;
  }) {
    return this.request<SubPaymentResult>(`/api/transactions/${transactionId}/sub-payments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getSubPayments(transactionId: string) {
    return this.request<SubPaymentListResult>(`/api/transactions/${transactionId}/sub-payments`);
  }

  async getSubPaymentReport(params?: { startDate?: string; endDate?: string; receivingPointId?: string }) {
    const query = new URLSearchParams();
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    if (params?.receivingPointId) query.set('receivingPointId', params.receivingPointId);
    return this.request<SubPaymentReportResult>(`/api/transactions/sub-payment-report?${query}`);
  }

  async getTillStatus(params?: { date?: string; startDate?: string; endDate?: string }) {
    const q = new URLSearchParams();
    if (params?.startDate && params?.endDate) {
      q.set('startDate', params.startDate);
      q.set('endDate', params.endDate);
    } else if (params?.date) {
      q.set('date', params.date);
    }
    const qs = q.toString() ? `?${q}` : '';
    return this.request<TillStatus>(`/api/ledger/till/status${qs}`);
  }

  async loadTillFromExternal(amount: number, source: string, notes?: string) {
    return this.request<LedgerEntry>('/api/ledger/till/load', {
      method: 'POST',
      body: JSON.stringify({ amount, source, notes }),
    });
  }

  // Sync
  async endOfDaySync(date: string) {
    return this.request<{ synced: number; transactions: Transaction[] }>('/api/sync/end-of-day', {
      method: 'POST',
      body: JSON.stringify({ date }),
    });
  }

  async additionalSync() {
    return this.request<{ synced: number; transactions: Transaction[] }>('/api/sync/additional', {
      method: 'POST',
    });
  }

  async getPendingAdditionalSyncTransactions() {
    return this.request<Transaction[]>('/api/sync/additional');
  }

  // Server Dates
  async getSendingServerDate() {
    return this.request<{ serverDate: string }>('/api/server-date');
  }

  async setSendingServerDate(date: string) {
    return this.request<{ serverDate: string }>('/api/server-date', {
      method: 'PATCH',
      body: JSON.stringify({ date }),
    });
  }

  async getReceivingServerDate(receivingPointId?: string) {
    const qs = receivingPointId ? `?receivingPointId=${receivingPointId}` : '';
    return this.request<{ serverDate: string; receivingPointId: string; name: string; code: string } | Array<{ serverDate: string; receivingPointId: string; name: string; code: string }>>(`/api/receiving/server-date${qs}`);
  }

  async setReceivingServerDate(data: { date: string; receivingPointId?: string }) {
    return this.request<{ serverDate: string; receivingPointId: string; name: string; code: string }>('/api/receiving/server-date', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // End-of-Day
  async closeEndOfDay(date: string) {
    return this.request<{ eodRecord: EndOfDayRecord; transactions: Transaction[] }>('/api/eod', {
      method: 'POST',
      body: JSON.stringify({ date }),
    });
  }

  async getEndOfDayHistory(params?: { agentId?: string; page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.agentId) query.set('agentId', params.agentId);
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    const qs = query.toString();
    return this.request<{ records: EndOfDayRecord[]; pagination: Pagination }>(`/api/eod${qs ? `?${qs}` : ''}`);
  }

  // Reconciliation
  async submitReconciliation(data: ReconciliationData) {
    return this.request<Reconciliation>('/api/reconciliation', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getReconciliations(params?: { tellerId?: string; receivingPointId?: string; status?: string }) {
    const query = new URLSearchParams();
    if (params?.tellerId) query.set('tellerId', params.tellerId);
    if (params?.receivingPointId) query.set('receivingPointId', params.receivingPointId);
    if (params?.status) query.set('status', params.status);
    return this.request<Reconciliation[]>(`/api/reconciliation?${query}`);
  }

  // Reports
  async getDashboardStats(receivingPointId?: string) {
    const query = receivingPointId ? `?receivingPointId=${receivingPointId}` : '';
    return this.request<DashboardStats>(`/api/reports/dashboard${query}`);
  }

  // Users
  async getUsers(params?: { role?: string; receivingPointId?: string }) {
    const query = new URLSearchParams();
    if (params?.role) query.set('role', params.role);
    if (params?.receivingPointId) query.set('receivingPointId', params.receivingPointId);
    return this.request<{ users: User[]; pagination: Pagination }>(`/api/users?${query}`);
  }

  async createUser(data: CreateUserData) {
    return this.request<User>('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateUser(id: string, data: Partial<CreateUserData & { isActive: boolean; password: string }>) {
    return this.request<User>(`/api/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deactivateUser(id: string) {
    return this.request<null>(`/api/users/${id}`, {
      method: 'DELETE',
    });
  }

  // Permissions
  async getPermissions(userId?: string) {
    const query = userId ? `?userId=${userId}` : '';
    return this.request<Permission[]>(`/api/permissions${query}`);
  }

  async grantPermission(userId: string, key: string) {
    return this.request<Permission>('/api/permissions', {
      method: 'POST',
      body: JSON.stringify({ userId, key }),
    });
  }

  async revokePermission(userId: string, key: string) {
    return this.request<null>('/api/permissions', {
      method: 'DELETE',
      body: JSON.stringify({ userId, key }),
    });
  }

  // User Permissions (get merged permissions for a user)
  async getUserPermissions(userId: string) {
    return this.request<{ permissions: string[] }>(`/api/users/${userId}/permissions`);
  }

  async updateUserPermissions(userId: string, permissions: string[]) {
    return this.request<{ permissions: string[] }>(`/api/users/${userId}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissions }),
    });
  }

  // Agent reports
  async getAgentReport(params?: { agentId?: string; startDate?: string; endDate?: string; includeAll?: boolean }) {
    const query = new URLSearchParams();
    if (params?.agentId) query.set('agentId', params.agentId);
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    if (params?.includeAll) query.set('includeAll', 'true');
    return this.request<AgentReport>(`/api/reports/agent?${query}`);
  }

  // Closing balances
  async getClosingBalances(date?: string) {
    const query = date ? `?date=${date}` : '';
    return this.request<ClosingBalances>(`/api/reports/closing-balances${query}`);
  }

  async getAdditionalTillReport(params?: { startDate?: string; endDate?: string; transactionType?: string; receivingPointId?: string }) {
    const query = new URLSearchParams();
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    if (params?.transactionType) query.set('transactionType', params.transactionType);
    if (params?.receivingPointId) query.set('receivingPointId', params.receivingPointId);
    return this.request<AdditionalTillReport>(`/api/reports/additional-till?${query}`);
  }

  // ─── Accounting module ──────────────────────────────────────────────────────

  async getChartOfAccounts(params?: { currency?: string; accountType?: string; receivingPointId?: string; includeInactive?: boolean }) {
    const q = new URLSearchParams();
    if (params?.currency)         q.set('currency',         params.currency);
    if (params?.accountType)      q.set('accountType',      params.accountType);
    if (params?.receivingPointId) q.set('receivingPointId', params.receivingPointId);
    if (params?.includeInactive)  q.set('includeInactive',  'true');
    return this.request<ChartOfAccountsResult>(`/api/accounting/chart-of-accounts?${q}`);
  }

  async createLedgerAccount(data: { accountCode: string; accountName: string; accountType: string; accountGroup?: string; accountNumber?: string; description?: string; currency: string; receivingPointId?: string }) {
    return this.request<AccountingAccount>('/api/accounting/chart-of-accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getGeneralLedger(params: { accountId?: string; accountCode?: string; from?: string; to?: string }) {
    const q = new URLSearchParams();
    if (params.accountId)   q.set('accountId',   params.accountId);
    if (params.accountCode) q.set('accountCode', params.accountCode);
    if (params.from)        q.set('from',        params.from);
    if (params.to)          q.set('to',          params.to);
    return this.request<GeneralLedgerResult>(`/api/accounting/general-ledger?${q}`);
  }

  async getJournalEntries(params?: { from?: string; to?: string; entryType?: string; status?: string; receivingPointId?: string; transactionId?: string; page?: number; limit?: number }) {
    const q = new URLSearchParams();
    if (params?.from)             q.set('from',             params.from);
    if (params?.to)               q.set('to',               params.to);
    if (params?.entryType)        q.set('entryType',        params.entryType);
    if (params?.status)           q.set('status',           params.status);
    if (params?.receivingPointId) q.set('receivingPointId', params.receivingPointId);
    if (params?.transactionId)    q.set('transactionId',    params.transactionId);
    if (params?.page)             q.set('page',             String(params.page));
    if (params?.limit)            q.set('limit',            String(params.limit));
    return this.request<{ entries: JournalEntry[]; pagination: Pagination }>(`/api/accounting/journal?${q}`);
  }

  async createManualJournal(data: { journalDate: string; reference: string; description: string; receivingPointId?: string; lines: Array<{ accountCode: string; debit?: number; credit?: number; currency: 'CAD' | 'GHS'; description?: string }> }) {
    return this.request<JournalEntry>('/api/accounting/journal', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async reverseJournalEntry(id: string, reason?: string) {
    return this.request<JournalEntry>(`/api/accounting/journal/${id}/reverse`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async getTrialBalance(params?: { receivingPointId?: string; currency?: string; asOf?: string }) {
    const q = new URLSearchParams();
    if (params?.receivingPointId) q.set('receivingPointId', params.receivingPointId);
    if (params?.currency)         q.set('currency',         params.currency);
    if (params?.asOf)             q.set('asOf',             params.asOf);
    return this.request<TrialBalance>(`/api/accounting/trial-balance?${q}`);
  }

  async getAccountingPeriods(params?: { receivingPointId?: string; status?: string; year?: number }) {
    const q = new URLSearchParams();
    if (params?.receivingPointId) q.set('receivingPointId', params.receivingPointId);
    if (params?.status)           q.set('status',           params.status);
    if (params?.year)             q.set('year',             String(params.year));
    return this.request<AccountingPeriod[]>(`/api/accounting/period?${q}`);
  }

  async createAccountingPeriod(data: { periodYear: number; periodMonth: number; receivingPointId?: string }) {
    return this.request<AccountingPeriod>('/api/accounting/period', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async closeAccountingPeriod(id: string, action?: 'CLOSE' | 'LOCK') {
    return this.request<AccountingPeriod>(`/api/accounting/period/${id}/close`, {
      method: 'POST',
      body: JSON.stringify({ action: action === 'LOCK' ? 'LOCK' : 'CLOSE' }),
    });
  }

  async getIncomeStatement(params: { from: string; to: string; receivingPointId?: string; currency?: string }) {
    const q = new URLSearchParams({ from: params.from, to: params.to });
    if (params.receivingPointId) q.set('receivingPointId', params.receivingPointId);
    if (params.currency)         q.set('currency',         params.currency);
    return this.request<IncomeStatement>(`/api/accounting/income-statement?${q}`);
  }

  async getBalanceSheet(params?: { asOf?: string; receivingPointId?: string }) {
    const q = new URLSearchParams();
    if (params?.asOf)             q.set('asOf',             params.asOf);
    if (params?.receivingPointId) q.set('receivingPointId', params.receivingPointId);
    return this.request<BalanceSheet>(`/api/accounting/balance-sheet?${q}`);
  }

  async getBranchAccountingSummary(params: { receivingPointId: string; from: string; to: string }) {
    const q = new URLSearchParams({ receivingPointId: params.receivingPointId, from: params.from, to: params.to });
    return this.request<BranchAccountingSummary>(`/api/accounting/branch-summary?${q}`);
  }

  async getConsolidatedReport(params: { from: string; to: string; exchangeRate?: number }) {
    const q = new URLSearchParams({ from: params.from, to: params.to });
    if (params.exchangeRate) q.set('exchangeRate', String(params.exchangeRate));
    return this.request<ConsolidatedReport>(`/api/accounting/consolidated-report?${q}`);
  }

  // Notifications
  async getNotifications() {
    return this.request<{ notifications: Notification[] }>('/api/notifications');
  }

  async markNotificationRead(id: string) {
    return this.request<{ ok: boolean }>('/api/notifications', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  }

  // ─── Sending-side Cash Management ───────────────────────────────────────────

  async getCashManagement(params?: { page?: number; limit?: number }) {
    const q = new URLSearchParams();
    if (params?.page)  q.set('page',  String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    return this.request<{
      vault: { balance: number; accountName: string } | null;
      bankClearing: { balance: number; accountName: string } | null;
      entries: CashManagementEntry[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/api/sending/cash-management?${q.toString()}`);
  }

  async recordCashDeposit(data: { amount: number; reference: string; description?: string; date: string }) {
    return this.request<{ journal: CashManagementEntry; vaultBalance: number | null }>(
      '/api/sending/cash-management',
      { method: 'POST', body: JSON.stringify({ type: 'CASH_DEPOSIT', ...data }) }
    );
  }

  async recordBankTransfer(data: { amount: number; reference: string; description?: string; date: string }) {
    return this.request<{ journal: CashManagementEntry; vaultBalance: number | null }>(
      '/api/sending/cash-management',
      { method: 'POST', body: JSON.stringify({ type: 'BANK_TRANSFER', ...data }) }
    );
  }

  async recordOperatingExpense(data: {
    amount: number;
    expenseCode: 'OPEX-GENERAL-CAD' | 'OPEX-SALARY-CAD' | 'OPEX-BANK-FEE-CAD' | 'OPEX-OTHER-CAD';
    reference: string;
    description?: string;
    date: string;
  }) {
    return this.request<{ journal: CashManagementEntry; vaultBalance: number | null }>(
      '/api/sending/cash-management',
      { method: 'POST', body: JSON.stringify({ type: 'OPERATING_EXPENSE', ...data }) }
    );
  }
}

export const apiClient = new ApiClient();

// Types
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'SENDING_ADMIN' | 'RECEIVING_ADMIN' | 'MANAGER' | 'TELLER' | 'SENDING_AGENT';
  receivingPoint?: ReceivingPoint;
  permissions?: string[];
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface Sender {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  address?: string;
  city?: string;
  country: string;
  idType?: string;
  idNumber?: string;
  creditLimit: number;
  receivers?: Receiver[];
  senderLedger?: LedgerAccount;
  _count?: { transactions: number };
  volume?: {
    last30Days: { cadAmount: number; count: number };
    last90Days: { cadAmount: number; count: number };
    ytd:        { cadAmount: number; count: number };
  };
}

export interface Receiver {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  idType?: string;
  idNumber?: string;
  preferredMethod: 'CASH' | 'BANK' | 'MOMO';
  bankName?: string;
  bankAccount?: string;
  bankBranch?: string;
  momoNumber?: string;
  momoProvider?: string;
  relationshipToSender?: string;
  senderId: string;
  sender?: Sender;
}

export interface TransactionReceiver {
  id: string;
  transactionId: string;
  receiverId?: string;
  receiver?: Receiver;
  receiverName?: string;
  receiverPhone?: string;
  ghsAmount: number;
  notes?: string;
  isPaid: boolean;
  paidAt?: string;
  paidByName?: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  transactionCode: string;
  codeType: 'STANDARD' | 'ADDITIONAL';
  sender: Sender;
  receiver?: Receiver;
  transactionReceivers?: TransactionReceiver[];
  subPayments?: SubPayment[];
  receiversDeferred?: boolean;
  cadAmount: number;
  ghsAmount: number;
  exchangeRateUsed: number;
  paymentMethod: 'CASH' | 'E_TRANSFER' | 'SPLIT';
  amountPaidCAD: number;
  amountPendingCAD: number;
  receivingMode: 'CASH' | 'BANK' | 'MOMO';
  receivingPointId: string;
  receivingPoint: ReceivingPoint;
  bankName?: string;
  bankAccountNo?: string;
  bankAccountName?: string;
  bankBranch?: string;
  cashPhoneNumber?: string;
  cashGhanaCardNumber?: string;
  momoNumber?: string;
  momoName?: string;
  status: 'PENDING' | 'SYNCED' | 'PAID' | 'PARTIAL' | 'PARTIAL_PAYMENT' | 'CANCELLED' | 'VOID' | 'FLAGGED';
  flagReason?: string;
  flaggedFromStatus?: 'PENDING' | 'SYNCED' | 'PAID' | 'PARTIAL' | 'PARTIAL_PAYMENT' | 'CANCELLED' | 'VOID' | 'FLAGGED';
  flaggedAt?: string;
  flaggedByName?: string;
  syncedToReceiving: boolean;
  paidAt?: string;
  paidByName?: string;
  transactionDate: string;
  createdAt: string;
  createdBy?: { firstName: string; lastName: string };
  notes?: string;
}

export interface ExchangeRate {
  id: string;
  date: string;
  cadToGhs: number;
  setByName: string;
}

export interface ReceivingPoint {
  id: string;
  name: string;
  code: string;
  address: string;
  city: string;
  country: string;
  phone?: string;
  vaultLedger?: LedgerAccount[];
  _count?: { transactions: number };
}

export interface LedgerAccount {
  id: string;
  accountType: string;
  accountName: string;
  accountCode: string;
  balance: number;
  currency: string;
  receivingPoint?: { name: string; code: string } | null;
  user?: { firstName: string; lastName: string; email: string } | null;
}

export interface LedgerEntry {
  id: string;
  amount: number;
  currency: string;
  description: string;
  entryType: string;
  entryDate: string;
  isDebit: boolean;
  runningBalance: number;
}

export interface Reconciliation {
  id: string;
  reconciliationDate: string;
  openingBalance: number;
  vaultTransfersIn: number;
  paymentsMade: number;
  returnsToVault: number;
  expectedClosing: number;
  actualClosing: number;
  variance: number;
  status: 'PENDING' | 'COMPLETED' | 'APPROVED' | 'REJECTED';
}

export interface DashboardStats {
  summary: {
    totalTransactions: number;
    pendingTransactions: number;
    syncedTransactions: number;
    paidTransactions: number;
    cancelledTransactions: number;
    todayTransactions: number;
    totalCAD: number;
    totalGHS: number;
  };
  today: {
    count: number;
    pending: number;
    synced: number;
    paid: number;
    cancelled: number;
    totalCAD: number;
    totalGHS: number;
  };
  vaults: Array<{
    id: string;
    name: string;
    balance: number;
    currency: string;
    receivingPoint?: ReceivingPoint;
  }>;
  recentTransactions: Transaction[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CreateSenderData {
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  address?: string;
  city?: string;
  country?: string;
  idType?: string;
  idNumber?: string;
  creditLimit?: number;
}

export interface CreateReceiverData {
  senderId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  preferredMethod?: 'CASH' | 'BANK' | 'MOMO';
  bankName?: string;
  bankAccount?: string;
  bankBranch?: string;
  momoNumber?: string;
  momoProvider?: string;
  relationshipToSender?: string;
}

export interface CreateTransactionData {
  senderId: string;
  receiverId: string;
  cadAmount: number;
  exchangeRateId: string;
  exchangeRateOverride?: number;
  paymentMethod: 'CASH' | 'E_TRANSFER' | 'SPLIT';
  amountPaidCAD: number;
  receivingMode: 'CASH' | 'BANK' | 'MOMO';
  receivingPointId: string;
  transactionDate: string;
  codeType?: 'STANDARD' | 'ADDITIONAL';
  bankName?: string;
  bankAccountNo?: string;
  bankAccountName?: string;
  bankBranch?: string;
  cashPhoneNumber?: string;
  cashGhanaCardNumber?: string;
  momoNumber?: string;
  momoName?: string;
  notes?: string;
}

export interface CreateReceivingPointData {
  name: string;
  code: string;
  address: string;
  city: string;
  country?: string;
  phone?: string;
}

export interface ReconciliationData {
  reconciliationDate: string;
  actualClosing: number;
  notes?: string;
}

export interface CreateUserData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'SENDING_ADMIN' | 'RECEIVING_ADMIN' | 'MANAGER' | 'TELLER' | 'SENDING_AGENT';
  receivingPointId?: string;
}

export interface Permission {
  id: string;
  userId: string;
  key: string;
  grantedBy: string;
  grantedAt: string;
  user?: { firstName: string; lastName: string; email: string; role: string };
}

export interface AgentReport {
  summary: {
    totalTransactions: number;
    totalCAD: number | string;
    totalGHS: number | string;
    byStatus: Array<{ status: string; count: number }>;
  };
  byBranch: Array<{ name: string; count: number; totalCAD: number; totalGHS: number }>;
  byReceivingMode: Array<{ mode: string; count: number; totalCAD: number; totalGHS: number }>;
  byPaymentMethod: Array<{ method: string; count: number; totalCAD: number }>;
  byCodeType: Array<{ type: string; count: number; totalCAD: number }>;
  transactions: Transaction[];
}

export interface ClosingBalances {
  date: string;
  summary: {
    totalTransactions: number;
    totalCAD: number;
    totalGHS: number;
    totalCashCAD: number;
    totalETransferCAD: number;
    totalSplitCAD: number;
    totalPaidCAD: number;
    totalOwingCAD: number;
  };
  bySender: Array<{
    senderId: string;
    senderName: string;
    transactions: number;
    totalCAD: number;
    paidCAD: number;
    owingCAD: number;
  }>;
  transactions: Transaction[];
}

export interface AdditionalTillReportEntry {
  id: string;
  transactionId?: string;
  transactionDate: string;
  transactionCode: string;
  amount: number;
  paymentMode: 'CASH' | 'BANK' | 'MOMO';
  referenceDetails: string;
  senderName: string;
  receiverName: string;
  receivingPointName: string;
}

export interface AdditionalTillReport {
  entries: AdditionalTillReportEntry[];
  totalGHS: number;
  count: number;
  accountCode: string;
}

export interface SenderStatementEntry {
  id: string;
  date: string;
  type: 'TRANSACTION' | 'PAYMENT' | 'CREDIT';
  status?: string;
  description: string;
  reference: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface SenderStatement {
  sender: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
    accountCode?: string;
    currentBalance: number;
  };
  period: {
    startDate: string | null;
    endDate: string | null;
  };
  summary: {
    openingBalance: number;
    totalDebits: number;
    totalCredits: number;
    closingBalance: number;
    transactionCount: number;
    paymentCount: number;
  };
  entries: SenderStatementEntry[];
}

export interface Notification {
  id: string;
  receivingPointId: string;
  transactionId: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  transaction?: {
    transactionCode: string;
    ghsAmount: string | number;
    sender?: { firstName: string; lastName: string };
    receiver?: { firstName: string; lastName: string };
  };
}

export interface TillStatementEntry {
  id: string;
  amount: number;
  currency: string;
  description: string;
  entryType: string;
  isDebit: boolean;
  runningBalance: number;
  createdAt: string;
  entryDate: string;
  transaction?: { transactionCode?: string; sender?: { firstName: string; lastName: string }; receiver?: { firstName: string; lastName: string } };
  enteredBy?: { firstName: string; lastName: string };
}

export interface TillReconciliationSummary {
  id: string;
  status: 'PENDING' | 'COMPLETED' | 'APPROVED' | 'REJECTED';
  actualClosing: number;
  expectedClosing: number;
  variance: number;
  openingBalance: number;
  vaultTransfersIn?: number;
  returnsToVault?: number;
  paymentsMade: number;
  reconciliationDate: string;
}

export interface TillStatus {
  till: { id: string; accountName: string; accountCode: string } | null;
  balance: number;
  statement: TillStatementEntry[];
  vaults: { id: string; accountName: string; accountCode: string; balance: number }[];
  priorClosing: { amount: number; date: string } | null;
  isHistorical?: boolean;
  isPeriod?: boolean;
  historicalDate?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  reconciliationForDate?: TillReconciliationSummary | null;
  todayReconciliation?: TillReconciliationSummary | null;
}

export interface EndOfDayRecord {
  id: string;
  date: string;
  closedById: string;
  closedBy?: { firstName: string; lastName: string };
  closedAt: string;
  syncedCount: number;
  transactions: Transaction[];
}

export interface CashTransferRequest {
  id: string;
  fromAccountId: string;
  fromAccount: { accountName: string; accountCode: string; balance: number };
  toAccountId: string;
  toAccount: { accountName: string; accountCode: string; balance: number };
  amount: number;
  notes?: string;
  requestedById: string;
  requestedBy: { firstName: string; lastName: string };
  requestedAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  rejectionReason?: string;
  receivingPointId?: string;
}

export interface EodCheckTellerStatus {
  tellerId: string;
  tellerName: string;
  till: { id: string; accountName: string; balance: number } | null;
  reconciliation: { id: string; status: string; actualClosing: number; variance: number } | null;
  hasSubmitted: boolean;
  isResolved: boolean;
  requiresSupervisorReview: boolean;
  isRejected: boolean;
  tillBalance: number;
}

export interface EodCheckResult {
  date: string;
  receivingPointId: string;
  allSubmitted: boolean;
  allResolved: boolean;
  canClose: boolean;
  canForceClose: boolean;
  unreconciledCount: number;
  pendingApprovalCount: number;
  rejectedCount: number;
  tellerStatus: EodCheckTellerStatus[];
  pendingTills: EodCheckTellerStatus[];
  tillsCleared: boolean;
  totalDisbursedToday: number;
  disbursementCount: number;
  alreadyClosed: boolean;
  existingEod?: ReceivingEodRecord;
}

export interface ReceivingEodRecord {
  id: string;
  receivingPointId: string;
  receivingPoint?: { name: string; code: string };
  date: string;
  closedById: string;
  closedBy?: { firstName: string; lastName: string };
  closedAt: string;
  totalDisbursed: number;
  disbursementCount: number;
  notes?: string;
}

export interface BulkDisburseResult {
  results: Array<{ id: string; success: boolean; error?: string }>;
  succeeded: number;
  failed: number;
}

export interface SubPayment {
  id: string;
  transactionId: string;
  ghsAmount: number;
  notes?: string;
  receiverName?: string;
  receiverPhone?: string;
  receivingMode?: 'CASH' | 'BANK' | 'MOMO';
  bankName?: string;
  bankAccountNo?: string;
  bankAccountName?: string;
  cashPhoneNumber?: string;
  cashGhanaCardNumber?: string;
  momoNumber?: string;
  momoName?: string;
  remainingBalance?: number;
  paidById: string;
  paidByName: string;
  paidAt: string;
  receivingPointId?: string;
}

export interface SubPaymentResult {
  subPayment: SubPayment;
  totalDisbursed: number;
  remaining: number;
  isFullyPaid: boolean;
}

export interface SubPaymentListResult {
  transaction: { id: string; transactionCode: string; ghsAmount: number; status: string };
  subPayments: SubPayment[];
  totalDisbursed: number;
  remaining: number;
}

export interface SubPaymentReportEntry extends SubPayment {
  transaction: {
    transactionCode: string;
    ghsAmount: number;
    status: string;
    receivingMode: string;
    sender?: { firstName: string; lastName: string };
    receiver?: { firstName: string; lastName: string; phone?: string };
  };
}

export interface SubPaymentReportResult {
  subPayments: SubPaymentReportEntry[];
  totalDisbursed: number;
  count: number;
}

export interface AuditLog {
  id: string;
  userId?: string;
  userName?: string;
  userRole?: string;
  action: string;
  entity: string;
  entityId?: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}

// ─── Accounting module types ────────────────────────────────────────────────

export interface AccountingAccount {
  id: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  accountGroup?: string;
  accountNumber?: string;
  description?: string;
  balance: number;
  currency: string;
  receivingPointId?: string;
  receivingPoint?: { name: string; code: string } | null;
  userName?: string;
  senderName?: string;
  isActive: boolean;
}

export interface JournalLineView {
  id: string;
  accountId: string;
  account: { accountCode: string; accountName: string; currency: string };
  debit: number;
  credit: number;
  currency: string;
  description?: string;
}

export interface JournalEntry {
  id: string;
  journalDate: string;
  reference: string;
  description: string;
  entryType: 'REMITTANCE_RECEIPT' | 'SYNC_ALLOCATION' | 'DISBURSEMENT' | 'VAULT_TRANSFER' | 'TELLER_RECONCILIATION' | 'EXCHANGE_ADJUSTMENT' | 'MANUAL';
  status: 'DRAFT' | 'POSTED' | 'REVERSED';
  receivingPointId?: string;
  receivingPoint?: { name: string; code: string } | null;
  transactionId?: string;
  reconciliationId?: string;
  transferRequestId?: string;
  lines: JournalLineView[];
  createdBy: { firstName: string; lastName: string };
  createdAt: string;
  reversalOfId?: string;
}

export interface GeneralLedgerLine {
  id: string;
  debit: number;
  credit: number;
  net: number;
  currency: string;
  description?: string;
  runningBalance: number;
  journalEntry: {
    id: string;
    journalDate: string;
    reference: string;
    description: string;
    entryType: string;
    createdBy: { firstName: string; lastName: string };
  };
}

export interface GeneralLedgerResult {
  account: AccountingAccount;
  ledger: GeneralLedgerLine[];
  totalDebits: number;
  totalCredits: number;
  netMovement: number;
  closingBalance: number;
  lineCount: number;
}

export interface TrialBalanceRow extends AccountingAccount {
  totalDebits: number;
  totalCredits: number;
  netBalance: number;
}

export interface TrialBalance {
  asOf: string | null;
  rows: TrialBalanceRow[];
  grandTotalDebits: number;
  grandTotalCredits: number;
  isBalanced: boolean;
}

export interface AccountingPeriod {
  id: string;
  periodYear: number;
  periodMonth: number;
  startDate: string;
  endDate: string;
  status: 'OPEN' | 'CLOSED' | 'LOCKED';
  receivingPointId?: string;
  receivingPoint?: { name: string; code: string } | null;
  closedBy?: { firstName: string; lastName: string } | null;
  closedAt?: string;
  createdAt: string;
}

export interface IncomeStatementRow {
  id: string;
  accountCode: string;
  accountName: string;
  accountGroup?: string;
  accountNumber?: string;
  currency: string;
  amount: number;
  totalDebits: number;
  totalCredits: number;
}

export interface IncomeStatement {
  period: { from: string; to: string };
  currency: string;
  income:   { rows: IncomeStatementRow[]; total: number };
  expenses: { rows: IncomeStatementRow[]; total: number };
  netIncome: number;
  transactionCount: number;
  totalCAD: number;
  totalGHS: number;
}

export interface BalanceSheet {
  asOf: string;
  assets:      { rows: AccountingAccount[]; totalCAD: number; totalGHS: number };
  liabilities: { rows: AccountingAccount[]; totalCAD: number; totalGHS: number };
  equity:      { rows: AccountingAccount[]; totalCAD: number; totalGHS: number };
  retainedNetIncome: { CAD: number; GHS: number };
  summary: {
    CAD: { totalAssets: number; totalLiabilities: number; totalEquity: number; check: number };
    GHS: { totalAssets: number; totalLiabilities: number; totalEquity: number; check: number };
  };
}

export interface BranchAccountingSummary {
  branch: { id: string; name: string; code: string; city: string };
  period: { from: string; to: string };
  vault: { accountCode: string; accountName: string; balance: number; currency: string } | null;
  tellers: Array<{ tellerId: string; tellerName: string; tillBalance: number }>;
  totalTillBalance: number;
  disbursements: { count: number; totalGHS: number };
  reconciliation: {
    completed: number; approved: number; pending: number; rejected: number;
    totalVariance: number; shortageAmount: number; excessAmount: number;
  };
  expenses: Array<{ accountCode: string; accountName: string; amount: number }>;
  totalExpenses: number;
}

export interface ConsolidatedReport {
  period: { from: string; to: string };
  reportingExchangeRate: number;
  branches: Array<{
    branchId: string; branchName: string; branchCode: string; city: string;
    vaultBalance: number; vaultCADEquiv: number;
    transactions: { pendingCount: number; syncedCount: number; paidCount: number; totalCAD: number; totalGHS: number; paidGHS: number };
    reconciliation: { totalVariance: number; reconCount: number };
  }>;
  sendingSide: { companyCashCAD: number; totalIncomeCAD: number; totalReceivableCAD: number };
  consolidated: { paidTransactions: number; totalCAD: number; totalGHS: number; totalVariance: number; totalGHSVaults: number; totalGHSCADEquiv: number; netCADPosition: number };
}

export interface ChartOfAccountsResult {
  accounts: AccountingAccount[];
  grouped: Array<{
    groupCode: string;
    groupLabel: string;
    accounts: AccountingAccount[];
    totalBalance: number;
  }>;
  totalAccounts: number;
}


export interface CashManagementEntry {
  id: string;
  journalDate: string;
  reference: string;
  description: string;
  entryType: 'CASH_DEPOSIT' | 'BANK_TRANSFER' | 'OPERATING_EXPENSE';
  status: string;
  createdBy: { firstName: string; lastName: string };
  lines: Array<{
    id: string;
    debit: number;
    credit: number;
    currency: string;
    description: string | null;
    account: { accountCode: string; accountName: string };
  }>;
}
