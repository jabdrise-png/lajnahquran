import React, { useEffect, useState, useCallback } from 'react';
import { SupportSessionStore, ActiveSupportSession, CanonicalRole } from '../../lib/permissions';

// ============================================================================
// 0. DESIGN SYSTEM TOKENS (FASE 1 BLUE-WHITE ENTERPRISE PALETTE)
// ============================================================================
export const SAAS_TOKENS = {
  primary: '#1557D5',
  primaryAccent: '#2563EB',
  primaryLight: '#E7F0FF',
  primarySubtle: '#F3F7FF',
  canvas: '#F3F6FB',
  surface: '#FFFFFF',
  textMain: '#101828',
  textMuted: '#667085',
  border: '#E1E7EF',
} as const;

// ============================================================================
// 1. STATUS BADGE & GENERIC BADGE
// ============================================================================
export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

export const StatusBadge: React.FC<{
  label: string;
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
}> = ({ label, tone = 'neutral', dot = false, className = '' }) => {
  const toneClasses: Record<BadgeTone, string> = {
    neutral: 'bg-slate-100 text-slate-600 border-slate-200',
    primary: 'bg-blue-50 text-blue-600 border-blue-200',
    info: 'bg-blue-50 text-blue-600 border-blue-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-red-50 text-red-700 border-red-200',
  };

  const dotClasses: Record<BadgeTone, string> = {
    neutral: 'bg-slate-400',
    primary: 'bg-blue-600',
    info: 'bg-blue-600',
    success: 'bg-emerald-600',
    warning: 'bg-amber-600',
    danger: 'bg-red-600',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold border whitespace-nowrap shrink-0 tabular-nums ${toneClasses[tone]} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClasses[tone]}`} />}
      {label}
    </span>
  );
};

export const Badge = StatusBadge;

// ============================================================================
// 2. BUTTON & ICON BUTTON PRIMITIVES
// ============================================================================
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'subtle';
export type ButtonSize = 'sm' | 'md' | 'lg';

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    isLoading?: boolean;
  }
> = ({
  variant = 'primary',
  size = 'md',
  leftIcon,
  rightIcon,
  isLoading = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}) => {
  // Fase 7b: tampilan dari kelas .btn-* di index.css (satu sumber aturan desain)
  const variantClasses: Record<ButtonVariant, string> = {
    primary: 'btn-primary',
    secondary: 'btn-soft',
    outline: 'btn-secondary',
    ghost: 'btn-ghost',
    subtle: 'btn-soft',
    danger: 'btn-danger',
  };

  const sizeClasses: Record<ButtonSize, string> = {
    sm: 'btn-sm',
    md: '',
    lg: 'btn-lg',
  };

  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      className={`btn ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...rest}
    >
      {isLoading ? (
        <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin shrink-0" />
      ) : (
        leftIcon
      )}
      {children}
      {!isLoading && rightIcon}
    </button>
  );
};

export const IconButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    label: string;
  }
> = ({ variant = 'outline', size = 'md', label, className = '', children, type = 'button', ...rest }) => {
  const sizeMap: Record<ButtonSize, string> = {
    sm: 'w-8 h-8 rounded-lg',
    md: 'w-9 h-9 rounded-lg',
    lg: 'w-10 h-10 rounded-lg',
  };
  const variantMap: Record<ButtonVariant, string> = {
    primary: 'bg-blue-600 hover:bg-blue-800 text-white border border-transparent',
    secondary: 'bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200',
    outline: 'bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200',
    ghost: 'bg-transparent hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-transparent',
    subtle: 'bg-blue-50 hover:bg-blue-50 text-blue-600 border border-transparent',
    danger: 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200',
  };
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50 ${sizeMap[size]} ${variantMap[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
};

// ============================================================================
// 3. FORM CONTROLS: INPUT, SELECT, TEXTAREA, CHECKBOX, SWITCH
// ============================================================================
export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { leftIcon?: React.ReactNode }
>(({ leftIcon, className = '', ...props }, ref) => {
  if (leftIcon) {
    return (
      <div className="relative flex items-center">
        <span className="absolute left-3 text-slate-500 pointer-events-none flex items-center">
          {leftIcon}
        </span>
        <input
          ref={ref}
          className={`field pl-9 ${className}`}
          {...props}
        />
      </div>
    );
  }
  return (
    <input
      ref={ref}
      className={`field ${className}`}
      {...props}
    />
  );
});
Input.displayName = 'Input';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className = '', children, ...props }, ref) => (
  <select
    ref={ref}
    className={`field ${className}`}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = 'Select';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className = '', ...props }, ref) => (
  <textarea
    ref={ref}
    className={`field ${className}`}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export const Checkbox: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}> = ({ checked, onChange, label, description, disabled = false, className = '' }) => (
  <label
    className={`inline-flex items-start gap-2.5 cursor-pointer select-none ${
      disabled ? 'opacity-50 cursor-not-allowed' : ''
    } ${className}`}
  >
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="mt-0.5 w-4 h-4 rounded border-slate-200 text-blue-600 focus:ring-blue-600"
    />
    {(label || description) && (
      <span className="flex flex-col">
        {label && <span className="text-xs sm:text-sm font-semibold text-slate-900">{label}</span>}
        {description && <span className="text-xs text-slate-500 mt-0.5">{description}</span>}
      </span>
    )}
  </label>
);

export const Switch: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}> = ({ checked, onChange, label, description, disabled = false, className = '' }) => (
  <div className={`flex items-center justify-between gap-4 ${className}`}>
    {(label || description) && (
      <div className="min-w-0">
        {label && <p className="text-xs sm:text-sm font-semibold text-slate-900">{label}</p>}
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
    )}
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 disabled:opacity-50 ${
        checked ? 'bg-blue-600' : 'bg-slate-200'
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  </div>
);

// ============================================================================
// 4. TENANT CONTEXT & SUPPORT ACCESS BANNER (SUPERADMIN BREAK-GLASS INDICATOR)
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

  if (!activeSession) return null;

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
        <span className="inline-flex items-center gap-1.5 font-bold tracking-tight text-white whitespace-nowrap">
          <span
            className={`w-2 h-2 rounded-full ${
              activeSession ? 'bg-amber-400 animate-pulse' : 'bg-blue-500'
            }`}
          />
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
            className="px-3 py-1 rounded-md font-semibold bg-blue-600 hover:bg-blue-600 text-white transition-colors whitespace-nowrap"
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
// 5. BREADCRUMBS, PAGE SHELL, PAGE HEADER & SECTION HEADING
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
            <span className={isLast ? 'font-semibold text-slate-900' : 'text-slate-500'}>
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
  <div className={`max-w-[1440px] mx-auto space-y-6 pb-12 font-sans ${className}`}>
    {children}
  </div>
);

export const PageHeader: React.FC<{
  title: string;
  description?: string;
  kicker?: string;
  breadcrumbs?: string[];
  actions?: React.ReactNode;
}> = ({ title, description, kicker, actions }) => (
  <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 sm:gap-4">
    <div className="space-y-1 min-w-0">
      {kicker && (
        <p className="text-xs font-semibold text-blue-700">{kicker}</p>
      )}
      <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight text-balance leading-tight">
        {title}
      </h1>
      {description && (
        <p className="text-sm text-slate-500 max-w-2xl leading-relaxed">{description}</p>
      )}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

export const SectionHeading: React.FC<{
  title: string;
  description?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}> = ({ title, description, badge, actions, className = '' }) => (
  <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${className}`}>
    <div>
      <div className="flex items-center gap-2.5">
        <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">{title}</h2>
        {badge}
      </div>
      {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

// ============================================================================
// 6. CARD & STAT CARD (BLUE-WHITE ENTERPRISE SURFACE)
// ============================================================================
export const Card: React.FC<{
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  noPadding?: boolean;
  className?: string;
}> = ({ children, title, subtitle, actions, footer, noPadding = false, className = '' }) => (
  <div
    className={`card overflow-hidden ${className}`}
  >
    {(title || subtitle || actions) && (
      <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div>
          {title && <h3 className="text-sm sm:text-base font-bold text-slate-900">{title}</h3>}
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    )}
    <div className={noPadding ? '' : 'p-4 sm:p-5'}>{children}</div>
    {footer && (
      <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-500">
        {footer}
      </div>
    )}
  </div>
);

export const StatCard: React.FC<{
  label: string;
  value: string | number;
  meta?: string;
  tone?: BadgeTone;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
}> = ({ label, value, meta, tone = 'neutral', icon, badge }) => {
  const valueColors: Record<BadgeTone, string> = {
    neutral: 'text-slate-900',
    primary: 'text-blue-600',
    info: 'text-blue-600',
    success: 'text-emerald-700',
    warning: 'text-amber-700',
    danger: 'text-red-700',
  };

  const iconBgColors: Record<BadgeTone, string> = {
    neutral: 'bg-slate-100 text-slate-600',
    primary: 'bg-blue-50 text-blue-600',
    info: 'bg-blue-50 text-blue-600',
    success: 'bg-emerald-50 text-emerald-600',
    warning: 'bg-amber-50 text-amber-600',
    danger: 'bg-red-50 text-red-600',
  };

  return (
    <div className="card p-4 sm:p-5 flex flex-col justify-between">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-semibold text-slate-500 leading-snug">{label}</span>
        {icon ? (
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconBgColors[tone]}`}>
            {icon}
          </div>
        ) : (
          badge
        )}
      </div>
      <div
        className={`mt-2 text-2xl sm:text-3xl font-bold tabular-nums tracking-tight ${valueColors[tone]}`}
      >
        {value}
      </div>
      {meta && <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">{meta}</p>}
    </div>
  );
};

// ============================================================================
// 7. PROGRESS BAR, QUOTA BAR & HEALTH ROW (SUPERADMIN METRICS & DIAGNOSTICS)
// ============================================================================
export const ProgressBar: React.FC<{
  value: number;
  max?: number;
  tone?: BadgeTone;
  size?: 'sm' | 'md';
  className?: string;
}> = ({ value, max = 100, tone = 'primary', size = 'sm', className = '' }) => {
  const pct = max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;
  const barColors: Record<BadgeTone, string> = {
    neutral: 'bg-slate-600',
    primary: 'bg-blue-600',
    info: 'bg-blue-600',
    success: 'bg-emerald-600',
    warning: 'bg-amber-600',
    danger: 'bg-red-600',
  };
  return (
    <div
      className={`w-full bg-slate-200/70 rounded-full overflow-hidden ${
        size === 'sm' ? 'h-1.5' : 'h-2.5'
      } ${className}`}
    >
      <div
        className={`h-full rounded-full transition-all duration-300 ${barColors[tone]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
};

export const QuotaBar: React.FC<{
  label?: string;
  used: number;
  limit: number;
  unit?: string;
  className?: string;
}> = ({ label, used, limit, unit = '', className = '' }) => {
  const safeLimit = Math.max(1, limit);
  const pct = Math.min(100, Math.round((used / safeLimit) * 100));
  const tone: BadgeTone = pct >= 90 ? 'danger' : pct >= 75 ? 'warning' : 'primary';

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between gap-2 text-xs">
        {label && <span className="font-medium text-slate-600 truncate">{label}</span>}
        <span className="font-semibold text-slate-900 tabular-nums shrink-0">
          {used} / {limit}
          {unit ? ` ${unit}` : ''} <span className="text-slate-500 font-normal">({pct}%)</span>
        </span>
      </div>
      <ProgressBar value={used} max={safeLimit} tone={tone} size="sm" />
    </div>
  );
};

export const HealthRow: React.FC<{
  label: string;
  detail?: string;
  status: 'healthy' | 'degraded' | 'down' | 'checking';
  metric?: string;
  icon?: React.ReactNode;
}> = ({ label, detail, status, metric, icon }) => {
  const badgeMap: Record<
    'healthy' | 'degraded' | 'down' | 'checking',
    { label: string; tone: BadgeTone }
  > = {
    healthy: { label: 'Normal', tone: 'success' },
    degraded: { label: 'Degraded', tone: 'warning' },
    down: { label: 'Gangguan', tone: 'danger' },
    checking: { label: 'Memeriksa...', tone: 'primary' },
  };
  const cfg = badgeMap[status];

  return (
    <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{label}</p>
          {detail && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{detail}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        {metric && (
          <span className="text-xs font-semibold text-slate-600 tabular-nums">
            {metric}
          </span>
        )}
        <StatusBadge label={cfg.label} tone={cfg.tone} dot />
      </div>
    </div>
  );
};

// ============================================================================
// 8. FILTER BAR & URL SEARCH PARAMS HOOK (REACT ROUTER 7 SYNCED)
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
    className={`w-full bg-white rounded-2xl border border-slate-200 p-4 flex flex-col lg:flex-row lg:items-end justify-between gap-3 shadow-2xs ${className}`}
  >
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-nowrap items-end gap-3 w-full flex-1 [&>*]:flex-1 [&>*]:min-w-0 [&_input]:w-full [&_select]:w-full">
      {children}
    </div>
    {onReset && (
      <button
        type="button"
        onClick={onReset}
        className="w-full lg:w-auto px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
      >
        Reset Filter
      </button>
    )}
  </div>
);

// ============================================================================
// 9. FORM FIELD & GENERIC DATA TABLE
// ============================================================================
export const FormField: React.FC<{
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ label, required, hint, error, className = '', children }) => (
  <div className={`space-y-1.5 flex-1 min-w-0 w-full ${className}`}>
    <label className="block text-xs font-semibold text-slate-700 truncate">
      {label} {required && <span className="text-red-600">*</span>}
    </label>
    {children}
    {hint && !error && <p className="text-2xs text-slate-500">{hint}</p>}
    {error && <p className="text-2xs font-medium text-red-600">{error}</p>}
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
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
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
              <tr key={rowKey(row, idx)} className="hover:bg-blue-50/60 transition-colors">
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
// 10. EMPTY STATE, LOADING STATE & ERROR STATE
// ============================================================================
export const EmptyState: React.FC<{
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}> = ({ title, description, actionLabel, onAction, icon }) => (
  <div className="card p-8 sm:p-10 text-center max-w-lg mx-auto my-4">
    {icon && (
      <div className="w-11 h-11 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
        {icon}
      </div>
    )}
    <h3 className="text-base font-bold text-slate-900">{title}</h3>
    <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{description}</p>
    {actionLabel && onAction && (
      <button
        type="button"
        onClick={onAction}
        className="btn btn-primary mt-4"
      >
        {actionLabel}
      </button>
    )}
  </div>
);

export const LoadingState: React.FC<{
  label?: string;
  rows?: number;
}> = ({ label = 'Memuat data platform...', rows = 3 }) => (
  <div className="card p-5 sm:p-6 space-y-4">
    <div className="flex items-center gap-3">
      <div className="w-4 h-4 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      <span className="text-sm font-medium text-slate-600">{label}</span>
    </div>
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
      ))}
    </div>
  </div>
);

export const ErrorState: React.FC<{
  title?: string;
  message: string;
  onRetry?: () => void;
}> = ({ title = 'Gagal Memuat Data', message, onRetry }) => (
  <div className="bg-red-50 rounded-xl border border-red-200 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div className="space-y-1">
      <h3 className="text-sm font-bold text-red-800">{title}</h3>
      <p className="text-xs text-red-700 leading-relaxed">{message}</p>
    </div>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="btn btn-danger-soft shrink-0"
      >
        Coba Lagi
      </button>
    )}
  </div>
);

// ============================================================================
// 11. MODAL, DRAWER & AUDITED CONFIRM DIALOG
// ============================================================================
export const Modal: React.FC<{
  isOpen: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidthClass?: string;
}> = ({
  isOpen,
  title,
  description,
  onClose,
  children,
  footer,
  maxWidthClass = 'max-w-lg',
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`bg-white rounded-t-2xl sm:rounded-2xl border border-slate-200 w-full ${maxWidthClass} shadow-xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[90vh]`}
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog"
            className="btn-icon -mr-1.5 -mt-1"
          >
            ✕
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export const Drawer: React.FC<{
  isOpen: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClass?: string;
}> = ({
  isOpen,
  title,
  subtitle,
  onClose,
  children,
  footer,
  widthClass = 'max-w-xl',
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex justify-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`bg-white border-l border-slate-200 w-full ${widthClass} h-full shadow-2xl flex flex-col`}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup panel"
            className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            Tutup
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

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
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4"
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
        className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-5 space-y-4 shadow-xl focus:outline-none"
        tabIndex={-1}
      >
        <div>
          <h3 id="confirm-dialog-title" className="text-base font-bold text-slate-900">
            {title}
          </h3>
          <p id="confirm-dialog-description" className="text-xs text-slate-500 mt-1 leading-relaxed">
            {description}
          </p>
        </div>

        {requireReason && (
          <div>
            <label
              htmlFor="confirm-dialog-reason"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              {reasonLabel} <span className="text-red-600">*</span>
            </label>
            <textarea
              id="confirm-dialog-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
              autoFocus
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
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
                : 'bg-blue-600 hover:bg-blue-800 focus:ring-blue-600'
            }`}
          >
            {isSubmitting ? 'Memproses...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

