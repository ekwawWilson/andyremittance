'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, Notification } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';

export default function ReceivingNotificationBadge({ compact }: { compact?: boolean } = {}) {
  const { user } = useAuth();
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [immediateCount, setImmediateCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const totalBadge = immediateCount + pendingCount;

  const fetchCounts = async () => {
    if (!user?.receivingPoint?.id) return;
    const [nRes, tRes] = await Promise.all([
      apiClient.getNotifications(),
      apiClient.getTransactions({ status: 'SYNCED', receivingPointId: user.receivingPoint.id, limit: 1 }),
    ]);
    if (nRes.success && nRes.data) {
      setNotifications(nRes.data.notifications);
      setImmediateCount(nRes.data.notifications.length);
    }
    if (tRes.success && tRes.data) {
      setPendingCount(tRes.data.pagination.total);
    }
  };

  useEffect(() => {
    fetchCounts();
  }, [user?.receivingPoint?.id]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const dismissNotification = async (id: string) => {
    await apiClient.markNotificationRead(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setImmediateCount((c) => Math.max(0, c - 1));
  };

  const goToPending = () => {
    setIsOpen(false);
    router.push('/receiving/pending');
  };

  if (totalBadge === 0) return null;

  if (compact) {
    return (
      <span className="flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
      </span>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button + badge */}
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="relative p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:outline-none"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {/* Balloon badge */}
        <span className="absolute top-0.5 right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-bold text-white bg-red-500 rounded-full leading-none">
          {totalBadge > 99 ? '99+' : totalBadge}
        </span>
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          {/* Immediate / ADDITIONAL notifications */}
          {immediateCount > 0 && (
            <div className="border-b border-gray-100">
              <div className="flex items-center justify-between px-4 py-2 bg-amber-50">
                <span className="text-xs font-bold text-amber-800 uppercase tracking-wide">Immediate Transfers</span>
                <span className="text-xs font-bold text-white bg-amber-500 rounded-full px-2 py-0.5">{immediateCount}</span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {notifications.map((n) => (
                  <div key={n.id} className="flex items-start gap-2 px-3 py-2.5 border-b border-gray-50 last:border-0 hover:bg-amber-50 transition-colors">
                    <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <p className="flex-1 text-xs text-gray-700 leading-snug">{n.message}</p>
                    <button type="button" onClick={() => dismissNotification(n.id)} className="text-gray-300 hover:text-gray-500 shrink-0">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending (SYNCED, not yet paid) */}
          {pendingCount > 0 && (
            <div>
              <div className="flex items-center justify-between px-4 py-2 bg-blue-50">
                <span className="text-xs font-bold text-blue-800 uppercase tracking-wide">Pending Disbursements</span>
                <span className="text-xs font-bold text-white bg-blue-500 rounded-full px-2 py-0.5">{pendingCount}</span>
              </div>
              <button
                type="button"
                onClick={goToPending}
                className="w-full text-left px-4 py-3 text-sm text-blue-700 hover:bg-blue-50 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span>{pendingCount} transaction{pendingCount !== 1 ? 's' : ''} awaiting disbursement</span>
              </button>
            </div>
          )}

          {/* Footer link */}
          <div className="border-t border-gray-100 px-4 py-2 bg-gray-50">
            <button type="button" onClick={goToPending} className="w-full text-center text-xs font-semibold text-green-700 hover:text-green-900">
              View all pending →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
