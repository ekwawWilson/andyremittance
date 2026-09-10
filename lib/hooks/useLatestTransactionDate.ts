'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

interface UseLatestTransactionDateResult {
  /** YYYY-MM-DD of the most recent transaction, or the fallback while loading. */
  latestDate: string;
  /** True when the value came from real data rather than the fallback. */
  resolved: boolean;
  loading: boolean;
  refresh: () => void;
}

/**
 * The date a filter should open on.
 *
 * Defaulting to the wall-clock date or the branch's serverDate leaves screens
 * empty whenever those drift from the data — a branch that has not run EOD, or
 * an imported day-sheet carrying the sending side's date. Opening on the latest
 * date that actually has transactions means the default view shows work if
 * there is any.
 *
 * `status` narrows it to the statuses the calling screen lists, so a pending
 * page lands on the last day with pending work rather than the last day with
 * any activity.
 */
export function useLatestTransactionDate(
  fallback: string,
  options?: { status?: string; receivingPointId?: string }
): UseLatestTransactionDateResult {
  const [latestDate, setLatestDate] = useState<string>(fallback);
  const [resolved, setResolved] = useState(false);
  const [loading, setLoading] = useState(true);

  const status = options?.status;
  const receivingPointId = options?.receivingPointId;

  const load = () => {
    setLoading(true);
    apiClient
      .getLatestTransactionDate({ status, receivingPointId })
      .then((res) => {
        if (res.success && res.data?.latestDate) {
          setLatestDate(res.data.latestDate);
          setResolved(true);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, [status, receivingPointId]);

  return { latestDate, resolved, loading, refresh: load };
}
