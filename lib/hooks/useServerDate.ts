'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api-client';

export function useServerDate(portal: 'sending' | 'receiving' | 'admin') {
  const { user } = useAuth();
  const fallback = new Date().toISOString().split('T')[0];
  const [sendingDate, setSendingDate]   = useState<string>(fallback);
  const [receivingDate, setReceivingDate] = useState<string>(fallback);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const tasks: Promise<unknown>[] = [];

    if (portal === 'sending' || portal === 'admin') {
      tasks.push(
        apiClient.getSendingServerDate().then((res) => {
          if (!cancelled && res.success && res.data) {
            setSendingDate((res.data as { serverDate: string }).serverDate);
          }
        })
      );
    }

    if (portal === 'receiving' || portal === 'admin') {
      const branchId = user?.receivingPoint?.id;
      if (branchId) {
        tasks.push(
          apiClient.getReceivingServerDate(branchId).then((res) => {
            if (!cancelled && res.success && res.data) {
              setReceivingDate((res.data as { serverDate: string }).serverDate);
            }
          })
        );
      } else if (portal === 'admin') {
        // SUPER_ADMIN/ADMIN with no branch — still try to fetch all branch dates
        tasks.push(
          apiClient.getReceivingServerDate().then((res) => {
            if (!cancelled && res.success && res.data) {
              const dates = res.data as { branches?: { serverDate: string }[]; serverDate?: string };
              if (dates.branches && dates.branches.length > 0) {
                setReceivingDate(dates.branches[0].serverDate);
              } else if (dates.serverDate) {
                setReceivingDate(dates.serverDate);
              }
            }
          })
        );
      }
    }

    Promise.all(tasks).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [portal, user?.receivingPoint?.id]);

  return { sendingDate, receivingDate, loading };
}
