/**
 * Aturan tampilan hak akses yang dipakai beberapa halaman (Fase 1, BUG-04/05/26/29).
 * Fungsi murni supaya bisa diuji otomatis. Penegakan sebenarnya ada di database
 * (trigger trg_guard_access_grants); fungsi ini hanya menyembunyikan tombol yang pasti ditolak.
 */

const SUPER = ['super_admin', 'superadmin'];
const ADMIN = ['admin', 'admin_mahad'];

export const isRoleSuperadmin = (role?: string | null) => SUPER.includes(String(role || '').toLowerCase());
export const isRoleAdmin = (role?: string | null) => ADMIN.includes(String(role || '').toLowerCase());

/**
 * Bolehkah pemanggil mengubah grant (edit peran, suspend, revoke, aktifkan) milik target?
 * - Tidak ada yang boleh mengubah akses akun sendiri.
 * - Superadmin boleh mengelola semua akun lain.
 * - Admin Lembaga hanya mengelola Musammi' (bukan Admin lain, bukan Superadmin).
 * - Peran lain tidak mengelola akun.
 */
export function bolehKelolaAkses(
  caller: { id?: string | null; role?: string | null } | null | undefined,
  target: { id?: string | null; role?: string | null } | null | undefined
): boolean {
  if (!caller?.id || !target?.id) return false;
  if (caller.id === target.id) return false;
  if (isRoleSuperadmin(caller.role)) return true;
  if (!isRoleAdmin(caller.role)) return false;
  return !isRoleSuperadmin(target.role) && !isRoleAdmin(target.role);
}

/** BUG-29: ke mana superadmin tanpa Support Access diarahkan saat membuka rute tenant. */
export function tujuanSuperadminTanpaSupport(pathname: string): string {
  const isDefault = ['/app', '/app/', '/app/dashboard'].includes(pathname);
  return isDefault ? '/platform/dashboard' : '/platform/support-sessions';
}

/** BUG-26: ringkasan status DB dari respons /api/health (format lama & baru). */
export function ringkasStatusDb(body: any): string {
  const db = body?.database || body?.services?.database || {};
  const status = db.status || 'tidak diketahui';
  const latency = db.latencyMs ? ` (${db.latencyMs} ms)` : '';
  const err = db.error ? ` — ${db.error}` : '';
  return `DB: ${status}${latency}${err}`;
}
