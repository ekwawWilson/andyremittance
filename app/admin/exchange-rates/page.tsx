'use client';
import { useEffect, useState } from 'react';
import { apiClient, ExchangeRate } from '@/lib/api-client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

const PAGE_SIZE = 15;

export default function ExchangeRatesPage() {
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [cadToGhs, setCadToGhs] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [page, setPage] = useState(1);

  const fetchRates = () => {
    apiClient.getExchangeRates().then((res) => {
      if (res.success && res.data) setRates(res.data);
      setIsLoading(false);
    });
  };
  useEffect(() => { fetchRates(); }, []);

  const handleSet = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsSubmitting(true);
    const res = await apiClient.setExchangeRate(date, parseFloat(cadToGhs));
    if (res.success) { setSuccess('Exchange rate saved successfully'); setCadToGhs(''); setPage(1); fetchRates(); }
    else { setError(res.error || 'Failed'); }
    setIsSubmitting(false);
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const totalPages = Math.max(1, Math.ceil(rates.length / PAGE_SIZE));
  const pagedRates = rates.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Exchange Rates</h1>

      <Card className="mb-6">
        <CardHeader><CardTitle>Set CAD to GHS Rate</CardTitle></CardHeader>
        <CardContent>
          {error && <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>}
          {success && <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded text-green-700 text-sm">{success}</div>}
          <form onSubmit={handleSet} className="flex gap-3 items-end">
            <div className="flex-1"><Input id="rate-date" label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
            <div className="flex-1"><Input id="rate-val" label="1 CAD = ? GHS" type="number" step="0.0001" min="0" value={cadToGhs} onChange={(e) => setCadToGhs(e.target.value)} placeholder="8.5000" required /></div>
            <Button type="submit" isLoading={isSubmitting}>Set Rate</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Rate History</CardTitle>
            {rates.length > 0 && <span className="text-sm text-gray-500">{rates.length} rate{rates.length !== 1 ? 's' : ''}</span>}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div></div>
          ) : rates.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">Date</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">1 CAD =</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">Set By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRates.map((r) => {
                      const rateDate = new Date(r.date).toISOString().split('T')[0];
                      const isToday = rateDate === todayStr;
                      return (
                        <tr key={r.id} className={`border-b last:border-0 ${isToday ? 'bg-purple-50' : 'hover:bg-gray-50'}`}>
                          <td className="py-3 px-4">
                            <span className={isToday ? 'font-semibold text-purple-800' : 'text-gray-700'}>
                              {new Date(r.date).toLocaleDateString('en-CA')}
                            </span>
                            {isToday && (
                              <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-purple-200 text-purple-800">Today</span>
                            )}
                          </td>
                          <td className={`py-3 px-4 font-semibold ${isToday ? 'text-purple-900' : 'text-gray-900'}`}>
                            GHS {Number(r.cadToGhs).toFixed(4)}
                          </td>
                          <td className="py-3 px-4 text-gray-600">{r.setByName}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-gray-500">Page {page} of {totalPages}</p>
                  <div className="flex gap-1">
                    <button onClick={() => setPage(page - 1)} disabled={page === 1}
                      className="px-3 py-1 text-xs rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50">
                      Prev
                    </button>
                    <button onClick={() => setPage(page + 1)} disabled={page === totalPages}
                      className="px-3 py-1 text-xs rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50">
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : <p className="text-gray-500 text-center py-6">No rates set yet</p>}
        </CardContent>
      </Card>
    </div>
  );
}
