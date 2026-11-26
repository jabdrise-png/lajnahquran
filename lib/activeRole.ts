/**
 * Fase 2 · peran aktif untuk akun yang punya lebih dari satu peran
 * (contoh: Admin yang juga Musammi'). Disimpan per browser; dipilih setelah login
 * atau lewat menu "Ganti peran" di header.
 *
 * Catatan keamanan: pilihan ini hanya mengatur tampilan & menu. Hak akses di
 * database tetap mengikuti seluruh grant aktif pengguna (Admin tetap Admin).
 */
const KEY = 'lq_active_role';
const EVENT = 'lq-active-role-changed';

const storage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

export const ActiveRoleStore = {
  get(): string | null {
    try {
      return storage()?.getItem(KEY) || null;
    } catch {
      return null;
    }
  },
  set(role: string | null) {
    try {
      if (role) storage()?.setItem(KEY, role);
      else storage()?.removeItem(KEY);
    } catch {
      /* abaikan */
    }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        window.dispatchEvent(new CustomEvent(EVENT, { detail: role }));
      } catch {
        /* abaikan */
      }
    }
  },
  subscribe(fn: (role: string | null) => void) {
    if (typeof window === 'undefined') return () => {};
    const handler = (e: any) => fn(e?.detail ?? null);
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  },
};

/** Urutan peran tenant: peran pertama dipakai bila belum ada pilihan. */
export const TENANT_ROLE_ORDER = ['admin', 'musammi'];

/** Pilih peran aktif dari daftar peran aktif dan pilihan tersimpan. */
export function pilihPeranAktif(available: string[], preferred: string | null | undefined): string | null {
  if (!available.length) return null;
  if (preferred && available.includes(preferred)) return preferred;
  const sorted = [...available].sort(
    (a, b) => (TENANT_ROLE_ORDER.indexOf(a) + 100) % 100 - (TENANT_ROLE_ORDER.indexOf(b) + 100) % 100
  );
  return sorted[0];
}

export const labelPeran = (role?: string | null) =>
  role === 'admin' ? 'Admin Lembaga' : role === 'musammi' ? "Musammi'" : role === 'superadmin' ? 'Superadmin' : role || '-';
