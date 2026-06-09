'use client';
import { useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';

export default function SyncPage() {
  const [syncDate, setSyncDate] = useState(new Date().toISOString().split('T')[0]);
  const [eodResult, setEodResult] = useState<{ synced: number } | null>(null);
  const [addResult, setAddResult] = useState<{ synced: number } | null>(null);
  const [isEodLoading, setIsEodLoading] = useState(false);
  const [isAddLoading, setIsAddLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEodSync = async () => {
    setIsEodLoading(true); setError(''); setEodResult(null);
    const res = await apiClient.endOfDaySync(syncDate + 'T00:00:00.000Z');
    if (res.success && res.data) setEodResult(res.data);
    else setError(res.error || 'Sync failed');
    setIsEodLoading(false);
  };

  const handleAdditionalSync = async () => {
    setIsAddLoading(true); setError(''); setAddResult(null);
    const res = await apiClient.additionalSync();
    if (res.success && res.data) setAddResult(res.data);
    else setError(res.error || 'Sync failed');
    setIsAddLoading(false);
  };

  return (
    <div className="max-w-2xl w-full">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Synchronization</h1>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <Card className="mb-6">
        <CardHeader><CardTitle>End-of-Day Sync</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 mb-4">Syncs all STANDARD transactions for a given date to the receiving portals and allocates funds to vaults.</p>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Sync Date</label>
              <input type="date" value={syncDate} onChange={(e) => setSyncDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" />
            </div>
            <Button onClick={handleEodSync} isLoading={isEodLoading} size="lg">Run End-of-Day Sync</Button>
          </div>
          {eodResult && <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg"><p className="text-green-800 font-semibold">{eodResult.synced} transaction(s) synced successfully</p></div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Additional (Immediate) Sync</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 mb-4">Syncs all ADDITIONAL transactions immediately. Use for urgent transfers that cannot wait for end-of-day.</p>
          <Button onClick={handleAdditionalSync} isLoading={isAddLoading} size="lg">Run Additional Sync</Button>
          {addResult && <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg"><p className="text-green-800 font-semibold">{addResult.synced} additional transaction(s) synced</p></div>}
        </CardContent>
      </Card>
    </div>
  );
}
