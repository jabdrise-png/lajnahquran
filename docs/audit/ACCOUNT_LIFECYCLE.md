# TENANT PROVISIONING & USER LIFECYCLE SPECIFICATION (FASE 2)

**Aplikasi:** Lajnah Al-Qur'an — SaaS Multi-Tenant Tahfidz Management System  
**Cakupan:** Provisioning Organisasi/Tenant, Siklus Hidup Undangan Kriptografis Sekali Pakai, Aktivasi Akun, Suspend, dan Revoke Non-Destruktif  
**Role Kanonikal:** `superadmin`, `admin`, `musammi`

---

## 1. Alur Provisioning Tenant (End-to-End State Machine)

```
Superadmin
  │
  ├─► 1. Buat Tenant via rpc_create_tenant_with_admin(p_status := 'provisioning')
  │       └─ Status Organisasi: 'provisioning' (Belum Aktif Operasional)
  │
  ├─► 2. Validasi Identitas Tenant & Kirim Undangan Admin via POST /api/invitations
  │       ├─ Jika GAGAL:
  │       │    └─ rpc_mark_tenant_provisioning_status('provisioning_failed')
  │       │       (Tenant TIDAK terlihat sebagai tenant siap; dapat di-retry secara idempoten)
  │       └─ Jika BERHASIL:
  │            ├─ access_grants dibuat dengan status = 'invited', role = 'admin'
  │            ├─ tenant_invitations dibuat dengan status = 'pending', token_hash = SHA-256(token)
  │            └─ audit_logs mencatat 'invitation.created'
  │
  └─► 3. Admin Menerima Undangan di /invite?token=...&email=...&org=...
          ├─ Inspeksi token via rpc_inspect_invitation_token(p_token)
          ├─ Verifikasi kecocokan email sesi & kebijakan kata sandi baru (min. 8 karakter, tolak Mahad123!)
          └─ Aktivasi atomik via rpc_accept_invitation(p_organization_id, p_token):
               ├─ tenant_invitations.status  ──► 'accepted' (Token sekali pakai hangus)
               ├─ access_grants.status       ──► 'active', accepted_at = now()
               ├─ organizations.status       ──► 'active', setup_state.hasAdminAssigned = true
               ├─ profiles.role              ──► 'admin' (Disinkronkan dari grant)
               └─ audit_logs                 ──► 'invitation.accepted'
```

### Status Siklus Hidup Organisasi (`public.organizations.status`)

| Status | Deskripsi Operasional |
| :--- | :--- |
| `provisioning` | Tenant baru telah dibuat oleh Superadmin namun Admin pertama belum menyelesaikan aktivasi undangan. |
| `provisioning_failed` | Pembuatan atau pengiriman undangan Admin pertama mengalami kegagalan; dapat dilanjutkan (*retry*) tanpa membuat organisasi duplikat. |
| `trial` | Tenant aktif dalam masa evaluasi layanan. |
| `active` | Tenant aktif secara operasional penuh setelah Admin mengaktifkan akun. |
| `suspended` | Tenant ditangguhkan sementara oleh Superadmin; seluruh pembuatan undangan baru dan mutasi operasional diblokir. |
| `archived` | Tenant diarsipkan secara permanen (read-only historis). |

---

## 2. Siklus Hidup Undangan Pengguna (`public.tenant_invitations` & `public.access_grants`)

Setiap undangan pengguna dikelola melalui dua tabel yang terintegrasi secara transaksional:

1. **`public.tenant_invitations`**:
   - Menyimpan `token_hash` (SHA-256 dari token sekali pakai `inv_<48_hex>`), `email`, `full_name`, `role`, `organization_id`, `user_id`, `musammi_id`, `invited_by`, `status` (`pending`, `accepted`, `expired`, `revoked`), `expires_at`, `accepted_at`, `revoked_at`, dan `revoked_by`.
   - Dilindungi oleh RLS dan pencabutan hak `DELETE`/`TRUNCATE` agar seluruh jejak undangan tetap teraudit.
2. **`public.access_grants`**:
   - Sumber otoritatif tunggal untuk otorisasi role (`superadmin`, `admin`, `musammi`) dan status keanggotaan (`invited`, `active`, `suspended`, `revoked`).
   - Selama berstatus `invited`, pengguna **tidak memiliki akses operasional** ke tenant (`resolveTenantContext` mengembalikan `isAuthorized: false, isPending: true`) dan hanya diizinkan mengakses halaman `/invite`.

### Aturan Keamanan Undangan (`/api/invitations.ts`)

- **Hierarki Role Ketat**:
  - `superadmin` dapat mengundang `admin` atau `musammi` untuk tenant tertentu, maupun `superadmin` platform.
  - `admin` **hanya** boleh mengundang `musammi` di dalam organisasinya sendiri (`callerOrgId`). Percobaan mengundang `admin`, `superadmin`, atau mengirim undangan ke tenant lain ditolak dengan HTTP `403`.
  - `musammi` ditolak dengan HTTP `403`.
- **Validasi Pra-Pembuatan Akun (Anti Partial Creation)**:
  - Status organisasi tujuan diperiksa terlebih dahulu; organisasi berstatus `suspended` atau `archived` ditolak sebelum menyentuh Supabase Auth.
  - Jika `musammiId` disertakan, keberadaan baris `public.musammi` di organisasi yang sama dan status keterikatan `user_id` diperiksa **sebelum** membuat akun Auth.
  - Kata sandi lemah (`< 8` karakter) atau sandi default terlarang (`Mahad123!`) ditolak dengan HTTP `400`.
- **Rekonsiliasi & Retry Idempoten**:
  - Jika email tujuan sudah memiliki grant `active`, `suspended`, atau `revoked` di organisasi tersebut, API menolak duplikasi dengan HTTP `409`.
  - Jika email tujuan masih berstatus `invited`, retry akan menggunakan kembali `user_id` yang ada, mencabut (`revoked`) token `pending` lama, dan menerbitkan token sekali pakai baru tanpa membuat user duplikat.

---

## 3. Halaman Penerimaan Undangan (`/pages/AcceptInvitePage.tsx`)

- Dapat diakses melalui `PublicLayout` maupun saat pengguna memiliki sesi aktif dengan status `invited` (`App.tsx` mengizinkan `/invite` melewati layar tunggu aktivasi).
- Memanggil `rpc_inspect_invitation_token(p_token)` saat halaman dimuat dan membedakan secara tegas 5 status:
  1. `pending`: Menampilkan informasi lembaga, role tujuan, dan formulir penetapan kata sandi baru.
  2. `accepted`: Menampilkan pesan bahwa tautan undangan sekali pakai sudah pernah digunakan.
  3. `expired`: Menampilkan pesan bahwa masa berlaku tautan undangan telah berakhir.
  4. `revoked`: Menampilkan pesan bahwa undangan telah dibatalkan oleh Administrator.
  5. `invalid`: Menampilkan pesan bahwa token undangan tidak sah atau tidak ditemukan.
- **Anti Pertukaran Email (Anti Email-Swapping)**:
  - Jika pengguna sedang login dengan email yang berbeda dari email tujuan undangan (`sessionEmail !== invitedEmail`), formulir aktivasi dikunci dan menampilkan tombol untuk keluar dari sesi saat ini terlebih dahulu.
  - Di sisi database, `rpc_accept_invitation` juga memverifikasi `LOWER(auth.users.email) = LOWER(tenant_invitations.email)` dan `user_id = auth.uid()`.

---

## 4. Penangguhan (Suspend) & Pencabutan (Revoke) Tanpa Merusak Histori

- Seluruh aksi penangguhan (`suspended`) dan pencabutan (`revoked`) di `PlatformConsolePage.tsx` dan `Users.tsx` menggunakan RPC server-side `rpc_manage_access_grant` dan `rpc_revoke_invitation`.
- Aplikasi **tidak pernah** menjalankan `DELETE FROM public.profiles` saat menonaktifkan pengguna, sehingga referensi foreign key pada `halaqah_sessions`, `recitation_entries`, `attendance_records`, `report_cards`, dan `audit_logs` tetap utuh.
