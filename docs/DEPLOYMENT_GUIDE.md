# Panduan Deployment & Konfigurasi Server — Lajnah Quran SaaS

Panduan teknis langkah-demi-langkah untuk melakukan deployment aplikasi Lajnah Quran pada lingkungan produksi (Production Environment) menggunakan Vercel, Netlify, atau Node.js / Docker.

---

## 1. Referensi Variabel Lingkungan (Environment Variables)

Aplikasi menerapkan pemisahan ketat antara variabel publik peramban (browser) dan kredensial rahasia server (backend secrets).

### A. Variabel Publik Peramban (Wajib Prefiks `VITE_`)
Variabel ini dibundel ke dalam JavaScript frontend dan dapat dibaca oleh publik peramban:
- `VITE_SUPABASE_URL`: URL API Supabase instance (contoh: `https://xyzcompany.supabase.co`).
- `VITE_SUPABASE_ANON_KEY`: Kunci anonim (Anon Public Key) untuk inisialisasi sesi frontend.
- `VITE_APP_NAME`: Nama aplikasi antarmuka (default: `Lajnah Quran`).
- `VITE_APP_URL`: Domain publik aplikasi (contoh: `https://app.lajnahquran.id`).

### B. Variabel Rahasia Server-Side (DILARANG MENGGUNAKAN `VITE_`)
Variabel ini HANYA disuplai pada runtime backend (Node.js/Serverless), TIDAK PERNAH dikirim ke peramban:
- `SUPABASE_SERVICE_ROLE_KEY`: Kunci Service Role Supabase untuk operasi administratif/provisioning.
- `TELEGRAM_BOT_TOKEN`: Token bot Telegram default sistem.
- `TELEGRAM_WEBHOOK_SECRET`: Secret token acak untuk memvalidasi header `x-telegram-bot-api-secret-token`.
- `FONNTE_API_TOKEN`: Token gateway WhatsApp resmi lembaga.
- `GEMINI_API_KEY`: Kunci API Google AI Studio untuk pemrosesan asisten cerdas server-side.
- `PORT`: Port server backend (default: `3000`).

---

## 2. Urutan Eksekusi Migrasi Database (Database Setup)

Sebelum menjalankan aplikasi frontend atau backend, database PostgreSQL (Supabase) wajib dipersiapkan dengan menjalankan migrasi secara berurutan:

```bash
# 1. Jalankan migrasi kanonikal skema V2 (Tabel, Foreign Key, RLS)
psql -h db.xyz.supabase.co -U postgres -d postgres -f database/supabase_saas_v2_migration.sql

# 2. Jalankan pengerasan keamanan tingkat produksi (Security Hardening, State Machines, & Triggers)
psql -h db.xyz.supabase.co -U postgres -d postgres -f database/supabase_v2_1_production_hardening.sql
```

### Verifikasi Keamanan Pasca-Migrasi:
Pastikan perintah berikut menghasilkan status aman:
- `SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false;` (harus bernilai 0 untuk tabel kanonikal).
- Pastikan hak INSERT/UPDATE/DELETE telah dicabut dari role `anon`:
  `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon;`

---

## 3. Opsi Deployment 1: Vercel

Aplikasi telah dilengkapi dengan konfigurasi `vercel.json` dan standalone serverless functions di folder `/api/`:

1. Hubungkan repository GitHub ke dashboard Vercel.
2. Atur **Framework Preset**: `Vite`.
3. Atur **Build Command**: `npm run build`.
4. Atur **Output Directory**: `dist`.
5. Tambahkan seluruh Environment Variables pada tab *Project Settings > Environment Variables*.
6. Deploy project. Seluruh rute `/api/*` secara otomatis diarahkan ke serverless functions di direktori `api/`.

---

## 4. Opsi Deployment 2: Netlify

Aplikasi telah dilengkapi dengan router serverless terpadu `netlify/functions/api.ts` dan konfigurasi `netlify.toml`:

1. Hubungkan repository GitHub ke dashboard Netlify.
2. Atur **Build Command**: `npm run build`.
3. Atur **Publish Directory**: `dist`.
4. Atur **Functions Directory**: `netlify/functions`.
5. Masukkan Environment Variables di *Site Configuration > Environment Variables*.
6. Deploy site. Netlify secara otomatis meneruskan request `/api/*` ke `netlify/functions/api.ts`.

---

## 5. Opsi Deployment 3: Node.js VM / Docker Container

Untuk deployment mandiri (self-hosted / VPS / GCP Cloud Run):

### Dockerfile Rekomendasi:
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/api ./api

EXPOSE 3000
CMD ["npm", "start"]
```

---

## 6. Verifikasi Pasca-Deployment (Post-Deployment Healthcheck)

Setelah deployment selesai, lakukan pemeriksaan diagnostik langsung:

1. **Probe Health API**:
   Kunjungi atau lakukan curl:
   ```bash
   curl -i https://app.lajnahquran.id/api/health
   ```
   Respons yang valid (HTTP 200):
   ```json
   {
     "status": "healthy",
     "timestamp": "2026-11-06T14:40:00.000Z",
     "database": {
       "status": "connected",
       "latencyMs": 18
     },
     "version": "2.1.0-production"
   }
   ```

2. **Verifikasi Correlation ID Header**:
   Pastikan setiap response HTTP menyertakan header pelacakan:
   `X-Request-ID: req-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
