/**
 * Fase 3 · kartu absensi satu halaqah untuk satu tanggal & waktu.
 * Dipakai layar Absensi (Admin: semua halaqah; Musammi': halaqahnya) dan Sesi Halaqah.
 *  - kehadiran musammi' + pilihan BADAL (digantikan musammi' lain)
 *  - kehadiran tiap santri lewat dropdown status (Fase 8c); "Tandai semua hadir" dipicu dari panel filter
 *  - tidak ada kunci sesi; mengubah catatan tanggal yang sudah lewat = koreksi Admin beralasan
 *  - tercatat siapa yang terakhir mengubah
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Save, UserCheck, RefreshCw } from 'lucide-react';
import type { AttendanceRecord, Halaqah, Musammi, Santri } from '../../types';
import type { AttendanceStatusRef } from '../../lib/v2Adapter';
import { hitungPerubahan, rosterPadaTanggal, statusHadir } from '../../lib/sesiHalaqah';
import { tampilkanError } from '../../lib/pesanError';
import { NotificationStore } from '../../lib/NotificationStore';
import AlasanDialog from '../ui/AlasanDialog';

interface Props {
  halaqah: Halaqah;
  date: string;
  slot: string;
  today: string;
  isAdmin: boolean;
  statuses: AttendanceStatusRef[];
  attendance: AttendanceRecord[];
  allSantri: Santri[];
  musammiList: Musammi[];
  onSave: (records: any[], reason?: string) => Promise<void>;
  defaultOpen?: boolean;
  /** Fase 8c: naikkan angka ini untuk menandai semua santri yang belum terisi sebagai hadir */
  sinyalTandai?: number;
  /** Fase 8c: saring baris santri menurut nama */
  cari?: string;
}

const jam = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

const kelasStatus = (st?: AttendanceStatusRef) =>
  !st ? '' : st.counts_as_present ? 'st-hadir' : st.code === 'alpa' ? 'st-alpa' : 'st-lain';

const AbsensiHalaqahCard: React.FC<Props> = ({
  halaqah, date, slot, today, isAdmin, statuses, attendance, allSantri, musammiList, onSave, defaultOpen = true, sinyalTandai = 0, cari = '',
}) => {
  const aktif = useMemo(() => statuses.filter((s) => s.is_active), [statuses]);
  const byName = useMemo(() => new Map(statuses.map((s) => [s.name, s])), [statuses]);
  const isPast = date < today;

  const records = useMemo(
    () => attendance.filter((a) => a.date === date && a.waktu === slot && Number(a.halaqahId) === Number(halaqah.id)),
    [attendance, date, slot, halaqah.id]
  );
  const santriRecords = useMemo(
    () => new Map<number, AttendanceRecord>(records.filter((r) => r.peran === 'Santri').map((r) => [Number(r.personId), r] as [number, AttendanceRecord])),
    [records]
  );
  const musammiRecord = records.find((r) => r.peran === 'Musammi');

  // Roster: anggota pada tanggal itu + santri yang sudah tercatat di sesi ini
  const roster = useMemo(() => {
    const base = rosterPadaTanggal(halaqah, date, allSantri);
    const ids = new Set(base.map((s) => Number(s.id)));
    const extra = Array.from<number>(santriRecords.keys())
      .filter((id) => !ids.has(id))
      .map((id) => allSantri.find((s) => Number(s.id) === id) || ({ id, nama: santriRecords.get(id)?.nama || `Santri ${id}` } as Santri));
    return [...base, ...extra];
  }, [halaqah, date, allSantri, santriRecords]);

  const existing = useMemo(() => {
    const m: Record<string, string | undefined> = {};
    roster.forEach((s) => { m[`s:${s.id}`] = santriRecords.get(Number(s.id))?.status as string | undefined; });
    m['m'] = musammiRecord?.status as string | undefined;
    return m;
  }, [roster, santriRecords, musammiRecord]);

  const [draft, setDraft] = useState<Record<string, string | undefined>>({});
  const [badal, setBadal] = useState<{ on: boolean; id: number | null }>({ on: false, id: null });
  const [open, setOpen] = useState(defaultOpen);
  const [saving, setSaving] = useState(false);
  const [askReason, setAskReason] = useState(false);

  useEffect(() => {
    setDraft({});
    setBadal({ on: Boolean(musammiRecord?.isBadal), id: musammiRecord?.badalMusammiId ?? null });
  }, [date, slot, halaqah.id, musammiRecord?.id, musammiRecord?.isBadal, musammiRecord?.badalMusammiId]);

  const nilai = (k: string) => draft[k] ?? existing[k];
  const badalBerubah = Boolean(musammiRecord) && (badal.on !== Boolean(musammiRecord?.isBadal) || (badal.id ?? null) !== (musammiRecord?.badalMusammiId ?? null));
  const { berubah, mengubahTersimpan } = hitungPerubahan(existing, draft);
  const jumlahBerubah = berubah.length + (badalBerubah && !berubah.includes('m') ? 1 : 0);
  const terisi = roster.filter((s) => nilai(`s:${s.id}`)).length;
  const musammi = halaqah.musammi;
  const hadir = statusHadir(statuses);

  const tandaiSemuaHadir = () => {
    if (!hadir) return;
    const next = { ...draft };
    roster.forEach((s) => { if (!nilai(`s:${s.id}`)) next[`s:${s.id}`] = hadir.name; });
    setDraft(next);
  };
  // Fase 8c: tombol "Tandai semua hadir" ada di panel filter halaman
  const sinyalAwal = React.useRef(sinyalTandai);
  useEffect(() => {
    if (sinyalTandai === sinyalAwal.current) return;
    sinyalAwal.current = sinyalTandai;
    tandaiSemuaHadir();
    setOpen(true);
  }, [sinyalTandai]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = cari.trim().toLowerCase();
  const rosterTampil = q ? roster.filter((s) => (s.nama || '').toLowerCase().includes(q)) : roster;

  const kumpulkan = () => {
    const out: any[] = [];
    roster.forEach((s) => {
      const k = `s:${s.id}`;
      if (draft[k] && draft[k] !== existing[k]) {
        out.push({ peran: 'Santri', personId: Number(s.id), date, waktu: slot, status: draft[k], halaqahId: halaqah.id });
      }
    });
    const mStatus = nilai('m');
    if (musammi?.id && mStatus && (draft['m'] !== undefined && draft['m'] !== existing['m'] || badalBerubah || (!musammiRecord && badal.on))) {
      out.push({
        peran: 'Musammi', personId: Number(musammi.id), date, waktu: slot, status: mStatus, halaqahId: halaqah.id,
        isBadal: badal.on, badalMusammiId: badal.on ? badal.id : null,
      });
    }
    return out;
  };

  const simpan = async (reason?: string) => {
    const payload = kumpulkan();
    if (payload.length === 0) return;
    if (badal.on && !badal.id) {
      NotificationStore.addNotification("Pilih musammi' pengganti (badal) dulu.", 'error');
      return;
    }
    setSaving(true);
    try {
      await onSave(payload, reason);
      setDraft({});
      setAskReason(false);
      NotificationStore.addNotification(`Absensi ${halaqah.nama} (${slot}) tersimpan.`, 'success');
    } catch (e) {
      tampilkanError(e, 'Gagal menyimpan absensi');
    } finally {
      setSaving(false);
    }
  };

  const onKlikSimpan = () => {
    if (isPast && (mengubahTersimpan || badalBerubah)) {
      if (!isAdmin) {
        NotificationStore.addNotification('Absensi tanggal yang sudah lewat hanya bisa dikoreksi Admin.', 'error');
        return;
      }
      setAskReason(true);
      return;
    }
    simpan();
  };

  const PilihStatus: React.FC<{ k: string; label: string; disabled?: boolean }> = ({ k, label, disabled }) => {
    const v = nilai(k);
    return (
      <select
        aria-label={`Status ${label}`}
        value={v || ''}
        disabled={disabled}
        onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value || undefined }))}
        className={`pilih-status ${kelasStatus(v ? byName.get(v) : undefined)}`}
      >
        <option value="" disabled>Pilih…</option>
        {aktif.map((st) => <option key={st.code} value={st.name}>{st.name}</option>)}
        {v && !aktif.some((st) => st.name === v) && <option value={v}>{v}</option>}
      </select>
    );
  };

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
        <button type="button" onClick={() => setOpen(!open)} className="text-left min-w-0">
          <h3 className="font-bold text-slate-800 text-sm truncate">{halaqah.nama}</h3>
          <p className="text-xs text-slate-500">
            {[halaqah.marhalah, halaqah.jenis].filter(Boolean).join(' · ')}
            {records.length > 0 ? '' : ' · belum tercatat'}
          </p>
        </button>
        <span className={`badge ${terisi === roster.length && roster.length > 0 ? 'badge-hijau' : 'badge-netral'}`}>{terisi}/{roster.length}</span>
      </header>

      {open && (
        <div className="divide-y divide-slate-100">
          {/* Musammi' */}
          {musammi?.id ? (
            <div className="px-4 py-3 bg-slate-50/60">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <UserCheck size={16} className="text-blue-600 shrink-0" />
                    <span className="text-sm font-semibold text-slate-800 truncate">{musammi.nama}</span>
                    <span className="badge badge-biru shrink-0">Musammi'</span>
                  </div>
                  {musammiRecord?.markedByName && (
                    <div className="text-2xs text-slate-400 mt-0.5 pl-6">oleh {musammiRecord.markedByName} {jam(musammiRecord.updatedAt)}</div>
                  )}
                </div>
                <PilihStatus k="m" label={musammi.nama} />
              </div>
              <div className="mt-2 pl-6 flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-sm sm:text-xs text-slate-700">
                  <input type="checkbox" className="rounded border-slate-300" checked={badal.on}
                    onChange={(e) => setBadal({ on: e.target.checked, id: e.target.checked ? badal.id : null })} />
                  Digantikan (badal)
                </label>
                {badal.on && (
                  <select
                    value={badal.id ?? ''}
                    onChange={(e) => setBadal({ on: true, id: e.target.value ? Number(e.target.value) : null })}
                    className="kontrol h-9 w-auto text-sm"
                  >
                    <option value="">Pilih musammi' pengganti…</option>
                    {musammiList.filter((m) => Number(m.id) !== Number(musammi.id)).map((m) => (
                      <option key={m.id} value={m.id}>{m.nama}</option>
                    ))}
                  </select>
                )}
                {badal.on && !nilai('m') && <span className="text-sm sm:text-2xs text-amber-700">Isi juga status musammi' utama.</span>}
              </div>
            </div>
          ) : (
            <div className="px-4 py-2 text-sm sm:text-xs text-amber-700 bg-amber-50">Halaqah ini belum punya musammi' utama.</div>
          )}

          {/* Santri */}
          {roster.length === 0 && <div className="px-4 py-4 text-sm sm:text-xs text-slate-500">Belum ada santri di halaqah ini pada tanggal tersebut.</div>}
          {roster.length > 0 && rosterTampil.length === 0 && <div className="px-4 py-4 text-sm sm:text-xs text-slate-500">Tidak ada santri yang cocok dengan pencarian.</div>}
          {rosterTampil.map((s) => {
            const rec = santriRecords.get(Number(s.id));
            const k = `s:${s.id}`;
            const dirty = draft[k] !== undefined && draft[k] !== existing[k];
            const ket = rec?.markedByName ? `oleh ${rec.markedByName} ${jam(rec.updatedAt)}` : s.kelas && s.kelas !== '-' ? s.kelas : '';
            return (
              <div key={s.id} className={`px-4 py-2.5 flex items-center justify-between gap-3 ${dirty ? 'bg-blue-50/50' : ''}`}>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{s.nama}</div>
                  {ket && <div className="text-2xs text-slate-400 truncate">{ket}</div>}
                </div>
                <PilihStatus k={k} label={s.nama} />
              </div>
            );
          })}

          <footer className="bilah-simpan bg-white pl-4 pr-20 py-3 flex flex-wrap items-center justify-between gap-2 rounded-b-xl border-t border-slate-200">
            <span className="hidden sm:block text-2xs text-slate-500">
              {isPast ? 'Tanggal sudah lewat: perubahan catatan tersimpan = koreksi Admin dengan alasan.' : 'Perubahan hari ini bisa diperbarui Admin maupun Musammi\'.'}
            </span>
            <div className="flex flex-1 sm:flex-none items-center gap-2">
              {jumlahBerubah > 0 && (
                <button type="button" onClick={() => { setDraft({}); setBadal({ on: Boolean(musammiRecord?.isBadal), id: musammiRecord?.badalMusammiId ?? null }); }}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-300 text-sm sm:text-xs font-semibold text-slate-700">
                  <RefreshCw size={13} /> Batal
                </button>
              )}
              <button
                type="button"
                disabled={saving || jumlahBerubah === 0}
                onClick={onKlikSimpan}
                className="btn btn-primary btn-lg flex-1 sm:flex-none justify-center"
              >
                <Save size={15} /> {saving ? 'Menyimpan…' : `Simpan${jumlahBerubah ? ` (${jumlahBerubah})` : ''}`}
              </button>
            </div>
          </footer>
        </div>
      )}

      <AlasanDialog
        isOpen={askReason}
        title={`Koreksi absensi ${date}`}
        description={<>Anda mengubah absensi <b>{halaqah.nama}</b> ({slot}) yang sudah tersimpan pada tanggal yang sudah lewat. Alasan dicatat di log audit.</>}
        confirmLabel="Simpan koreksi"
        busy={saving}
        onCancel={() => setAskReason(false)}
        onConfirm={(alasan) => simpan(alasan)}
      />
    </section>
  );
};

export default AbsensiHalaqahCard;
