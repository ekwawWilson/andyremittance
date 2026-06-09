'use client';
import { ReactNode } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
export default function ReceivingLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <DashboardLayout portal="receiving">{children}</DashboardLayout>
    </AuthProvider>
  );
}
