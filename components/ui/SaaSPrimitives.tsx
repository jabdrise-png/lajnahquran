import React, { useEffect, useState, useCallback } from 'react';
import { SupportSessionStore, ActiveSupportSession, CanonicalRole } from '../../lib/permissions';

// ============================================================================
// 1. STATUS BADGE (MURNI TIPOGRAFI BERSIH & KONTRAS WARNA SEMANTIK — TANPA IKON PAKSAAN)
// ============================================================================
export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

export const StatusBadge: React.FC<{
  label: string;
  tone?: BadgeTone;
  className?: string;
}> = ({ label, tone = 'neutral', className = '' }) => {
  const toneClasses: Record<BadgeTone, string> = {
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
    primary: 'bg-blue-50 text-blue-700 border-blue-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-800 border-amber-200',
    danger: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold border whitespace-nowrap shrink-0 tabular-nums ${toneClasses[tone]} ${className}`}
    >
      {label}
    </span>
  );
};

// ============================================================================
// 2. TENANT CONTEXT & SUPPORT ACCESS BANNER (SUPERADMIN BREAK-GLASS INDICATOR)
// ============================================================================
export const TenantContextBar: React.FC<{
  role?: CanonicalRole | 'pending' | 'unknown';
  isSuperAdmin?: boolean;
  orgName?: string;
  supportSession?: ActiveSupportSession | null;
  currentPath?: string;
  onNavigatePath?: (path: string) => void;
  onOpenPlatformConsole?: () => void;
  onEndSupportSession?: (session: ActiveSupportSession) => void;
}> = ({
  role,
  isSuperAdmin,
  orgName,
  supportSession: propSupportSession,
  currentPath,
  onNavigatePath,
  onOpenPlatformConsole,
  onEndSupportSession,
}) => {
  const [internalSession, setInternalSession] = useState<ActiveSupportSession | null>(() =>
    SupportSessionStore.getSession()
  );
  const activeSession = propSupportSession !== undefined ? propSupportSession : internalSession;
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  useEffect(() => {
    return SupportSessionStore.subscribe((sess) => {
      setInternalSession(sess);
    });
  }, []);

  useEffect(() => {
    if (!activeSession) {
      setRemainingSeconds(0);
      return;
    }
    const updateTimer = () => {
      const diff = Math.max(
        0,
        Math.floor((new Date(activeSession.expiresAt).getTime() - Date.now()) / 1000)
      );
      setRemainingSeconds(diff);
      if (diff <= 0) {
        SupportSessionStore.endSession();
      }
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  const effectiveIsSuperAdmin = Boolean(isSuperAdmin || role === 'superadmin');
  if (!effectiveIsSuperAdmin && !activeSession) return null;

  const pathNow = currentPath || (typeof window !== 'undefined' ? window.location.pathname : '');
  const isPlatformRoute = pathNow.startsWith('/platform');
  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;

  return (
    <div
      className={`print:hidden px-4 sm:px-6 py-2 text-xs border-b flex flex-wrap items-center justify-between gap-3 transition-colors ${
        activeSession
          ? 'bg-amber-950 text-amber-100 border-amber-800'
          : 'bg-slate-900 text-slate-200 border-slate-800'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-bold tracking-tight text-white whitespace-nowrap">
          {activeSession ? 'SESI SUPPORT TENANT AKTIF' : 'KONSOL PLATFORM GLOBAL'}
        </span>
        <span aria-hidden="true" className="text-slate-500">
          ·
        </span>
        {activeSession ? (
          <div className="flex items-center gap-2 truncate">
            <span className="font-semibold text-amber-200 truncate">
              Tenant: {activeSession.organizationName || orgName || '-'}
            </span>
            <span aria-hidden="true" className="text-amber-600">
              ·
            </span>
            <span className="text-amber-300">
              Mode: {activeSession.mode === 'read_write' ? 'Baca & Tulis' : 'Hanya Baca (Read-Only)'}
            </span>
            <span aria-hidden="true" className="text-amber-600 hidden sm:inline">
              ·
            </span>
            <span className="text-amber-200/90 hidden sm:inline truncate">
              Alasan: {activeSession.reason}
            </span>
          </div>
        ) : (
          <span className="text-slate-300 truncate">
            Role: Superadmin Platform · Data operasional harian santri diisolasi per lembaga
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {activeSession && (
          <span className="font-mono tabular-nums px-2 py-0.5 rounded bg-amber-900/80 text-amber-100 border border-amber-700">
            {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
          </span>
        )}

        {!isPlatformRoute && (onOpenPlatformConsole || onNavigatePath) && (
          <button
            type="button"
            onClick={() => {
              if (onOpenPlatformConsole) onOpenPlatformConsole();
              else if (onNavigatePath) onNavigatePath('/platform/dashboard');
            }}
            className="px-3 py-1 rounded-md font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors whitespace-nowrap"
          >
            Kembali ke Konsol Platform
          </button>
        )}

        {activeSession && (
          <button
            type="button"
            onClick={() => {
              if (onEndSupportSession) onEndSupportSession(activeSession);
              else SupportSessionStore.endSession();
            }}
            className="px-3 py-1 rounded-md font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors whitespace-nowrap"
          >
            Akhiri Sesi Support
          </button>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 3. BREADCRUMBS, PAGE SHELL & PAGE HEADER (STANDAR KOMPOSISI HALAMAN SAAS)
// ============================================================================
export const Breadcrumbs: React.FC<{
  items: string[];
}> = ({ items }) => {
  if (!items || items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-500">
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <React.Fragment key={`${item}-${idx}`}>
            {idx > 0 && <span className="text-slate-300">/</span>}
            <span className={isLast ? 'font-semibold text-slate-800' : 'text-slate-500'}>
              {item}
            </span>
          </React.Fragment>
        );
      })}
    </nav>
  );
};

export const PageShell: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div className={`max-w-[1400px] mx-auto space-y-6 pb-12 font-sans ${className}`}>
    {children}
  </div>
);

export const PageHeader: React.FC<{
  title: string;
  description?: string;
  kicker?: string;
  breadcrumbs?: string[];
  actions?: React.ReactNode;
}> = ({ title, description, kicker, breadcrumbs, actions }) => (
  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
    <div className="space-y-1">
      {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
      {kicker && (
        <p className="text-xs font-semibold text-blue-600 tracking-wide uppercase">{kicker}</p>
      )}
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight text-balance">
        {title}
      </h1>
      {description && (
        <p className="text-sm text-slate-600 max-w-2xl leading-relaxed">{description}</p>
      )}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2.5 shrink-0">{actions}</div>}
  </div>
);

// ============================================================================
// 4. STAT CARD (SINGLE-ELEVATION DEPTH + TABULAR NUMS)
// ============================================================================
export const StatCard: React.FC<{
  label: string;
  value: string | number;
  meta?: string;
  tone?: BadgeTone;
}> = ({ label, value, meta, tone = 'neutral' }) => {
  const valueColors: Record<BadgeTone, string> = {
    neutral: 'text-slate-900',
    primary: 'text-blue-700',
    success: 'text-emerald-700',
    warning: 'text-amber-700',
    danger: 'text-red-700',
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <div
        className={`mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums tracking-tight ${valueColors[tone]}`}
      >
        {value}
      </div>
      {meta && <p className="mt-1.5 text-xs text-slate-500">{meta}</p>}
    </div>
  );
};

// ============================================================================
// 5. FILTER BAR & URL SEARCH PARAMS HOOK (REACT ROUTER 7 SYNCED)
// ============================================================================
export function useUrlFilterParam(key: string, defaultValue: string = ''): [string, (val: string) => void] {
  const [value, setValue] = useState<string>(() => {
    if (typeof window === 'undefined') return defaultValue;
    const params = new URLSearchParams(window.location.search);
    return params.get(key) ?? defaultValue;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      setValue(params.get(key) ?? defaultValue);
    };
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, [key, defaultValue]);

  const updateValue = useCallback(
    (nextVal: string) => {
      setValue(nextVal);
      if (typeof window === 'undefined') return;
      const url = new URL(window.location.href);
      if (!nextVal || nextVal === defaultValue) {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, nextVal);
      }
      window.history.replaceState(window.history.state, '', url.toString());
    },
    [key, defaultValue]
  );

  return [value, updateValue];
}

export const FilterBar: React.FC<{
  children: React.ReactNode;
  onReset?: () => void;
  className?: string;
}> = ({ children, onReset, className = '' }) => (
  <div
    className={`bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-end justify-between gap-4 ${className}`}
  >
    <div className="flex flex-wrap items-end gap-4 flex-1">{children}</div>
    {onReset && (
      <button
        type="button"
        onClick={onReset}
        className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
      >
        Reset Filter
      </button>
    )}
  </div>
);

// ============================================================================
// 6. FORM FIELD & GENERIC DATA TABLE
// ============================================================================
export const FormField: React.FC<{
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}> = ({ label, required, hint, error, children }) => (
  <div className="space-y-1">
    <label className="block text-xs font-semibold text-slate-700">
      {label} {required && <span className="text-red-600">*</span>}
    </label>
    {children}
    {hint && !error && <p className="text-[11px] text-slate-500">{hint}</p>}
    {error && <p className="text-[11px] font-medium text-red-600">{error}</p>}
  </div>
);

export interface DataTableColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'center' | 'right';
  mono?: boolean;
  render: (row: T, index: number) => React.ReactNode;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  emptyTitle = 'Tidak Ada Data',
  emptyDescription = 'Belum ada baris data yang sesuai dengan filter saat ini.',
}: {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T, index: number) => string | number;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (!data || data.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-5 py-3.5 ${
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                      ? 'text-center'
                      : 'text-left'
                  }`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {data.map((row, idx) => (
              <tr key={rowKey(row, idx)} className="hover:bg-slate-50/70 transition-colors">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-5 py-3.5 ${
                      col.align === 'right'
                        ? 'text-right'
                        : col.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                    } ${col.mono ? 'font-mono tabular-nums' : ''}`}
                  >
                    {col.render(row, idx)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// 7. EMPTY STATE & AUDITED CONFIRM DIALOG
// ============================================================================
export const EmptyState: React.FC<{
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ title, description, actionLabel, onAction }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-10 text-center max-w-lg mx-auto my-4">
    <h3 className="text-base font-bold text-slate-900">{title}</h3>
    <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{description}</p>
    {actionLabel && onAction && (
      <button
        type="button"
        onClick={onAction}
        className="mt-4 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
      >
        {actionLabel}
      </button>
    )}
  </div>
);

export const ConfirmDialog: React.FC<{
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  isSubmitting?: boolean;
  onCancel: () => void;
  onConfirm: (reason?: string) => void;
}> = ({
  isOpen,
  title,
  description,
  confirmLabel = 'Konfirmasi',
  cancelLabel = 'Batal',
  tone = 'primary',
  requireReason = false,
  reasonLabel = 'Alasan Tindakan (Tercatat di Audit Log)',
  reasonPlaceholder = 'Tuliskan alasan tindakan ini...',
  isSubmitting = false,
  onCancel,
  onConfirm,
}) => {
  const [reason, setReason] = useState('');
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const previousActiveElement = React.useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      previousActiveElement.current = document.activeElement as HTMLElement | null;
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        if (previousActiveElement.current) {
          previousActiveElement.current.focus();
        }
      };
    }
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-5 space-y-4 shadow-lg focus:outline-none"
        tabIndex={-1}
      >
        <div>
          <h3 id="confirm-dialog-title" className="text-base font-bold text-slate-900">{title}</h3>
          <p id="confirm-dialog-description" className="text-xs text-slate-600 mt-1 leading-relaxed">{description}</p>
        </div>

        {requireReason && (
          <div>
            <label htmlFor="confirm-dialog-reason" className="block text-xs font-semibold text-slate-700 mb-1">
              {reasonLabel} <span className="text-red-600">*</span>
            </label>
            <textarea
              id="confirm-dialog-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
              autoFocus
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-600"
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isSubmitting || (requireReason && !reason.trim())}
            onClick={() => onConfirm(requireReason ? reason.trim() : undefined)}
            className={`px-4 py-2 rounded-lg text-white text-xs font-semibold disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-1 ${
              tone === 'danger'
                ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
            }`}
          >
            {isSubmitting ? 'Memproses...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
