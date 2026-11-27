/**
 * Fase 8c · panel filter bersama untuk Sesi Halaqah dan Absensi.
 * Selalu terisi penuh per baris (tanpa ruang kosong):
 *   HP (2 kolom)   : [Cari ×2] [Marhalah][Jenis] [Halaqah ×2] [Tanggal][Waktu] [Tandai ×2]
 *   Lebar (4 kolom): [Cari ×2][Marhalah][Jenis] / [Halaqah][Tanggal][Waktu][Tandai]
 * Tanpa tombol Tandai, kolom Waktu melebar agar baris tetap penuh.
 */
import React from 'react';
import { CheckCheck } from 'lucide-react';
import type { Halaqah } from '../../types';

export interface OpsiWaktu { value: string; label: string }

interface Props {
  cari: string;
  setCari: (v: string) => void;
  cariPlaceholder?: string;
  marhalahOpsi: string[];
  marhalah: string;
  setMarhalah: (v: string) => void;
  jenisOpsi: string[];
  jenis: string;
  setJenis: (v: string) => void;
  halaqahOpsi: Halaqah[];
  halaqahId: number | null;
  setHalaqahId: (v: number | null) => void;
  /** tampilkan pilihan "Semua halaqah" (layar Absensi) */
  semuaHalaqah?: boolean;
  date: string;
  setDate: (v: string) => void;
  today: string;
  slot: string;
  setSlot: (v: string) => void;
  slotOpsi: OpsiWaktu[];
  onTandai?: () => void;
  labelTandai?: string;
}

/** Nilai unik terurut dari daftar halaqah, untuk pilihan marhalah & jenis. */
export const unik = (list: (string | null | undefined)[]) =>
  Array.from(new Set(list.map((x) => String(x || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'id'));

/** Saring halaqah menurut marhalah, jenis, dan nama santri/halaqah/musammi'. */
export function saringHalaqah(list: Halaqah[], f: { marhalah: string; jenis: string; cari?: string }) {
  const q = (f.cari || '').trim().toLowerCase();
  return list.filter((h) =>
    (!f.marhalah || String(h.marhalah) === f.marhalah) &&
    (!f.jenis || String(h.jenis) === f.jenis) &&
    (!q || h.nama.toLowerCase().includes(q) || (h.musammi?.nama || '').toLowerCase().includes(q) ||
      (h.santri || []).some((s) => (s.nama || '').toLowerCase().includes(q)))
  );
}

const FilterSesi: React.FC<Props> = (p) => (
  <div className="panel-filter grid grid-cols-2 lg:grid-cols-4 items-center gap-3">
    <input
      value={p.cari}
      onChange={(e) => p.setCari(e.target.value)}
      placeholder={p.cariPlaceholder || 'Cari nama santri…'}
      aria-label="Cari nama"
      className="kontrol kontrol-cari col-span-2"
    />
    <select value={p.marhalah} onChange={(e) => p.setMarhalah(e.target.value)} className="kontrol !pl-3 !pr-7 text-xs sm:text-sm" aria-label="Marhalah">
      <option value="">Semua marhalah</option>
      {p.marhalahOpsi.map((m) => <option key={m} value={m}>{m}</option>)}
    </select>
    <select value={p.jenis} onChange={(e) => p.setJenis(e.target.value)} className="kontrol !pl-3 !pr-7 text-xs sm:text-sm" aria-label="Jenis halaqah">
      <option value="">Semua jenis</option>
      {p.jenisOpsi.map((j) => <option key={j} value={j}>{j}</option>)}
    </select>
    <select
      value={p.halaqahId ?? ''}
      onChange={(e) => p.setHalaqahId(e.target.value ? Number(e.target.value) : null)}
      className="kontrol col-span-2 lg:col-span-1"
      aria-label="Halaqah"
    >
      {p.semuaHalaqah && <option value="">Semua halaqah</option>}
      {!p.semuaHalaqah && p.halaqahOpsi.length === 0 && <option value="">Tidak ada halaqah</option>}
      {p.halaqahOpsi.map((h) => (
        <option key={h.id} value={h.id}>{h.nama}{h.musammi?.nama ? ` — ${h.musammi.nama}` : ''}</option>
      ))}
    </select>
    <input
      type="date"
      value={p.date}
      max={p.today}
      onChange={(e) => p.setDate(e.target.value || p.today)}
      className="kontrol"
      aria-label="Tanggal"
    />
    <select
      value={p.slot}
      onChange={(e) => p.setSlot(e.target.value)}
      className={`kontrol ${p.onTandai ? '' : 'lg:col-span-2'}`}
      aria-label="Waktu"
    >
      {p.slotOpsi.length === 0 && <option value="">Belum ada jadwal</option>}
      {p.slotOpsi.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
    </select>
    {p.onTandai && (
      <button
        type="button"
        onClick={p.onTandai}
        className="btn col-span-2 lg:col-span-1 h-11 rounded-xl border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
      >
        <CheckCheck size={16} /> {p.labelTandai || 'Tandai semua hadir'}
      </button>
    )}
  </div>
);

export default FilterSesi;
