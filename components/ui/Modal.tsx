'use client';

import { Fragment, ReactNode, useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export default function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizes = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-lg', xl: 'sm:max-w-xl' };

  return (
    <Fragment>
      <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:p-4">
        <div className="fixed inset-0 bg-black/30" onClick={onClose} />

        <div className={`relative bg-white border border-gray-200 shadow-lg w-full mt-auto rounded-t-lg max-h-[92vh] flex flex-col sm:mt-0 sm:rounded-lg sm:mx-auto ${sizes[size]}`}>
          {/* Pull handle mobile */}
          <div className="flex justify-center pt-2.5 pb-1 shrink-0 sm:hidden">
            <div className="w-8 h-1 bg-gray-300 rounded-full" />
          </div>

          {title && (
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 shrink-0">
              <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          <div className="px-5 py-4 overflow-y-auto safe-area-bottom">{children}</div>
        </div>
      </div>
    </Fragment>
  );
}
