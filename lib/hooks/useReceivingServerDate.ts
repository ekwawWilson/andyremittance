'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api-client';

interface UseReceivingServerDateResult {
  serverDate: string;       // YYYY-MM-DD — the branch business date
  loading: boolean;
  refresh: () => void;
}

// Returns the server date for the logged-in user's branch.
// Falls back to today's wall-clock date while loading or if the fetch fails.
export function useReceivingServerDate(): UseReceivingServerDateResult {
  const { user } = useAuth();
  const fallback = new Date().toISOString().split('T')[0];
  const [serverDate, setServerDate] = useState<string>(fallback);
  const [loading, setLoading]       = useState(true);

  const load = () => {
    const branchId = user?.receivingPoint?.id;
    if (!branchId) { setLoading(false); return; }
    setLoading(true);
    apiClient.getReceivingServerDate(branchId).then((res) => {
      if (res.success && res.data) {
        const d = (res.data as { serverDate: string }).serverDate;
        setServerDate(d);
      }
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, [user?.receivingPoint?.id]);

  return { serverDate, loading, refresh: load };
}
