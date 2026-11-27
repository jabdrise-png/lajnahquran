
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  noPadding?: boolean;
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl";
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, maxWidth = "lg", noPadding = false }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Fase 7b: Escape menutup modal (sama dengan modal lain)
  useEffect(() => {
    if (!isOpen) return;
    const tutup = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', tutup);
    return () => window.removeEventListener('keydown', tutup);
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  const maxWidthClass = {
    "sm": "max-w-sm",
    "md": "max-w-md",
    "lg": "max-w-lg",
    "xl": "max-w-xl",
    "2xl": "max-w-2xl",
    "3xl": "max-w-3xl",
    "4xl": "max-w-4xl"
  }[maxWidth];

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px] z-[100] flex justify-center items-end sm:items-center p-0 sm:p-6">
      <div role="dialog" aria-modal="true" aria-label={title}
        className={`bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full ${maxWidthClass} max-h-[92vh] sm:max-h-[90vh] flex flex-col border border-slate-200`}>
        <div className="flex justify-between items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-slate-200">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <button type="button" aria-label="Tutup" onClick={onClose} className="btn-icon -mr-1.5">
            <X size={18} />
          </button>
        </div>
        <div className={`${noPadding ? '' : 'p-4 sm:p-5'} overflow-y-auto`}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;
