'use client';
import { ReactNode } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
export default function SendingLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <DashboardLayout portal="sending">{children}</DashboardLayout>
    </AuthProvider>
  );
}
