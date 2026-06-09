'use client';
import { useEffect, useState } from 'react';
import { apiClient, LedgerAccount } from '@/lib/api-client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import Select from '@/components/ui/Select';

export default function LedgerPage() {
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [accountType, setAccountType] = useState('');

  useEffect(() => {
    setIsLoading(true);
    apiClient.getLedgerAccounts({ accountType: accountType || undefined }).then((res) => {
      if (res.success && res.data) setAccounts(res.data);
      setIsLoading(false);
    });
  }, [accountType]);

  const typeBadge: Record<string, string> = {
    SENDER: 'bg-blue-100 text-blue-800',
    COMPANY_CASH: 'bg-green-100 text-green-800',
    COMPANY_VAULT: 'bg-purple-100 text-purple-800',
    TELLER_TILL: 'bg-orange-100 text-orange-800',
    BANK_CLEARING: 'bg-gray-100 text-gray-800',
    MOMO_CLEARING: 'bg-pink-100 text-pink-800',
    RECEIVABLE: 'bg-red-100 text-red-800',
  };

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Ledger Accounts</h1>

      <Card className="mb-4">
        <CardContent>
          <Select id="type-filter" label="Filter by Type" value={accountType} onChange={(e) => setAccountType(e.target.value)}
            options={[
              { value: '', label: 'All Types' },
              { value: 'COMPANY_CASH', label: 'Company Cash' },
              { value: 'COMPANY_VAULT', label: 'Company Vault' },
              { value: 'TELLER_TILL', label: 'Teller Till' },
              { value: 'SENDER', label: 'Sender' },
              { value: 'BANK_CLEARING', label: 'Bank Clearing' },
              { value: 'MOMO_CLEARING', label: 'MoMo Clearing' },
              { value: 'RECEIVABLE', label: 'Receivable' },
            ]} />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div></div>
          ) : accounts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b">
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Code</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Name</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Type</th>
                  <th className="text-right py-3 px-4 text-gray-500 font-medium">Balance</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Currency</th>
                </tr></thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 px-4 font-mono text-xs text-gray-500">{a.accountCode}</td>
                      <td className="py-3 px-4 font-medium text-gray-900">{a.accountName}</td>
                      <td className="py-3 px-4"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${typeBadge[a.accountType] || 'bg-gray-100 text-gray-800'}`}>{a.accountType}</span></td>
                      <td className={`py-3 px-4 text-right font-semibold ${Number(a.balance) >= 0 ? 'text-green-700' : 'text-red-700'}`}>{Number(a.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="py-3 px-4 text-gray-600">{a.currency}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-gray-500 text-center py-8">No ledger accounts</p>}
        </CardContent>
      </Card>
    </div>
  );
}
