'use client';

import { HTMLAttributes } from 'react';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

export default function Badge({ className = '', variant = 'default', children, ...props }: BadgeProps) {
  const variants = {
    default: 'bg-gray-100 text-gray-800',
    success: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    danger: 'bg-red-100 text-red-800',
    info: 'bg-blue-100 text-blue-800',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}

export function TransactionStatusBadge({ status }: { status: string }) {
  const statusMap: Record<string, { variant: 'default' | 'success' | 'warning' | 'danger' | 'info'; label: string }> = {
    PENDING: { variant: 'warning', label: 'Pending' },
    SYNCED: { variant: 'info', label: 'Synced' },
    PAID: { variant: 'success', label: 'Paid' },
    PARTIAL: { variant: 'warning', label: 'Partial' },
    PARTIAL_PAYMENT: { variant: 'warning', label: 'Partial Payment' },
    CANCELLED: { variant: 'danger', label: 'Cancelled' },
  };

  const { variant, label } = statusMap[status] || { variant: 'default', label: status };

  return <Badge variant={variant}>{label}</Badge>;
}
