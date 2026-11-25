#!/usr/bin/env bash
# Ekspor STRUKTUR database (proyek ini) (tanpa data) ke database/baseline_2026-11.sql
# Pemakaian:
#   export PROD_DB_URL='postgresql://postgres:<sandi>@db.<ref>.supabase.co:5432/postgres'
#   bash scripts/dump-production-schema.sh
# Membutuhkan salah satu: Supabase CLI (`supabase`) atau `pg_dump` versi >= 15.
set -euo pipefail

: "${PROD_DB_URL:?Set PROD_DB_URL terlebih dahulu (lihat docs/LINGKUNGAN.md)}"
OUT="${1:-database/baseline_2026-11.sql}"

if command -v supabase >/dev/null 2>&1; then
  echo "Mengekspor dengan Supabase CLI ..."
  supabase db dump --db-url "$PROD_DB_URL" --schema public -f "$OUT"
elif command -v pg_dump >/dev/null 2>&1; then
  echo "Mengekspor dengan pg_dump ..."
  pg_dump "$PROD_DB_URL" --schema-only --schema=public --no-owner --no-privileges -f "$OUT"
else
  echo "Tidak menemukan 'supabase' maupun 'pg_dump'. Pasang salah satunya dulu." >&2
  exit 1
fi

echo "Selesai: $OUT ($(wc -l < "$OUT") baris)"
echo "Cek constraint penyebab BUG-01:"
grep -n "recitation_revisions_action_check" "$OUT" || echo "  (tidak ditemukan)"
