/**
 * Fase 8c · tab Setoran di Sesi Halaqah: satu daftar santri (ramah HP).
 * Tiap baris: nama, ringkasan setoran sesi ini, lalu tombol "Input" (belum setor) atau "Ubah" (sudah setor).
 * Input membuka form setoran untuk santri itu; Ubah membuka daftar setoran santri itu (koreksi/batal/riwayat)
 * beserta tombol menambah setoran lain.
 */
import React, { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import type { Halaqah, Santri } from '../../types';
import { bolehSetor, findStatus, type AttendanceStatusRef, type SetoranRow } from '../../lib/v2Adapter';
import Modal from '../Modal';
import FormSetoranRingkas from './FormSetoranRingkas';
import DaftarSetoran from './DaftarSetoran';

interface Props {
  roster: Santri[];
  rows: SetoranRow[];
  statusOf: (santriId: number) => string | undefined;
  statuses: AttendanceStatusRef[];
  halaqah: Halaqah;
  halaqahOptions: Halaqah[];
  date: string;
  slot: string;
  isAdmin: boolean;
  allSantri: Santri[];
  kosong?: string;
}

const rentang = (r: SetoranRow) =>
  r.surat_mulai === r.surat_selesai ? `${r.surat_mulai} ${r.ayat_mulai}–${r.ayat_selesai}` : `${r.surat_mulai} ${r.ayat_mulai} – ${r.surat_selesai} ${r.ayat_selesai}`;

const DaftarSantriSetoran: React.FC<Props> = ({ roster, rows, statusOf, statuses, halaqah, halaqahOptions, date, slot, isAdmin, allSantri, kosong }) => {
  const [buka, setBuka] = useState<{ santri: Santri; mode: 'input' | 'ubah' } | null>(null);
  const milik = (id: number) => rows.filter((r) => r.santri_id === id);

  if (roster.length === 0) {
    return <div className="card px-4 py-6 text-center text-sm text-slate-500">{kosong || 'Belum ada santri.'}</div>;
  }

  const rowsBuka = buka ? milik(Number(buka.santri.id)) : [];
  const tutup = () => setBuka(null);

  return (
    <>
      <ul className="card divide-y divide-slate-100 overflow-hidden">
        {roster.map((s) => {
          const id = Number(s.id);
          const punya = milik(id);
          const st = statusOf(id);
          const boleh = bolehSetor(st, statuses);
          const namaStatus = st ? findStatus(statuses, st)?.name || st : '';
          return (
            <li key={s.id} className="px-4 py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-800 truncate">{s.nama}</div>
                {punya.length > 0 ? (
                  <div className="mt-0.5 space-y-0.5">
                    {punya.map((r) => (
                      <div key={r.id} className="text-xs text-slate-600 truncate">
                        <span className="font-medium text-slate-700">{r.skema}</span> · {rentang(r)} · {r.jumlah_halaman} hal ·{' '}
                        <span className={r.is_repeat ? 'font-semibold text-red-700' : 'font-semibold text-emerald-700'}>
                          {r.nilai || '-'}{r.is_repeat ? ' (ulang)' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={`text-xs mt-0.5 ${boleh ? 'text-slate-400' : 'text-red-600'}`}>
                    {boleh ? `Belum setor${namaStatus ? ` · ${namaStatus}` : ''}` : `${namaStatus} · tidak bisa setor`}
                  </div>
                )}
              </div>
              {punya.length > 0 ? (
                <button type="button" onClick={() => setBuka({ santri: s, mode: 'ubah' })} className="btn btn-secondary btn-sm shrink-0">
                  <Pencil size={13} /> Ubah
                </button>
              ) : (
                <button type="button" disabled={!boleh} onClick={() => setBuka({ santri: s, mode: 'input' })} className="btn btn-primary btn-sm shrink-0">
                  <Plus size={14} /> Input
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <Modal
        isOpen={Boolean(buka)}
        onClose={tutup}
        title={buka ? `${buka.mode === 'input' ? 'Input setoran' : 'Setoran'} · ${buka.santri.nama}` : ''}
        maxWidth="lg"
      >
        {buka?.mode === 'input' && (
          <FormSetoranRingkas
            key={`${buka.santri.id}-${date}-${slot}`}
            halaqahOptions={halaqahOptions}
            initialHalaqahId={halaqah.id}
            date={date}
            slot={slot}
            lockContext
            santriTetap={Number(buka.santri.id)}
            onDone={tutup}
          />
        )}
        {buka?.mode === 'ubah' && (
          <div className="space-y-3">
            <DaftarSetoran rows={rowsBuka} isAdmin={isAdmin} halaqahOptions={halaqahOptions} santriList={allSantri} emptyText="Setoran sudah tidak ada." />
            <button type="button" onClick={() => setBuka({ santri: buka.santri, mode: 'input' })} className="btn btn-secondary w-full">
              <Plus size={15} /> Tambah setoran lain
            </button>
          </div>
        )}
      </Modal>
    </>
  );
};

export default DaftarSantriSetoran;
