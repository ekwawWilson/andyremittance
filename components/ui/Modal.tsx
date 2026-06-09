'use client';

import { Fragment, ReactNode } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export default function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  if (!isOpen) return null;

  const sizes = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-md',
    lg: 'sm:max-w-lg',
    xl: 'sm:max-w-xl',
  };

  return (
    <Fragment>
      <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />

        {/* Modal — bottom sheet on mobile, centered card on sm+ */}
        <div
          className={`
            relative bg-white shadow-xl w-full mt-auto
            rounded-t-2xl max-h-[92vh] flex flex-col
            sm:mt-0 sm:rounded-2xl sm:mx-auto ${sizes[size]}
          `}
        >
          {/* Pull handle (mobile only) */}
          <div className="flex justify-center pt-3 pb-1 shrink-0 sm:hidden">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          {/* Header */}
          {title && (
            <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-gray-200 shrink-0">
              <h3 className="text-base font-semibold text-gray-900 sm:text-lg">{title}</h3>
              <button
                onClick={onClose}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Content — scrollable */}
          <div className="px-4 py-3 sm:px-6 sm:py-4 overflow-y-auto safe-area-bottom">{children}</div>
        </div>
      </div>
    </Fragment>
  );
}
