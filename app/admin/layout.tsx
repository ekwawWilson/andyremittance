'use client';
import { ReactNode } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <DashboardLayout portal="admin">{children}</DashboardLayout>
    </AuthProvider>
  );
}
