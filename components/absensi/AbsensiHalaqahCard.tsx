/**
 * Fase 3 · kartu absensi satu halaqah untuk satu tanggal & waktu.
 * Dipakai layar Absensi (Admin: semua halaqah; Musammi': halaqahnya) dan Sesi Halaqah.
 *  - kehadiran musammi' + pilihan BADAL (digantikan musammi' lain)
 *  - kehadiran tiap santri, tombol "Tandai semua hadir"
 *  - tidak ada kunci sesi; mengubah catatan tanggal yang sudah lewat = koreksi Admin beralasan
 *  - tercatat siapa yang terakhir mengubah
 */
import React, { useEffect, useMemo, useState } from 'react';
import { CheckCheck, Save, UserCheck, RefreshCw } from 'lucide-react';
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
}

const jam = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

const toneFor = (st?: AttendanceStatusRef) =>
  !st ? 'border-slate-200 text-slate-600 bg-white'
    : st.counts_as_present ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
    : st.code === 'alpa' ? 'border-red-500 bg-red-50 text-red-700'
    : 'border-amber-500 bg-amber-50 text-amber-800';

const AbsensiHalaqahCard: React.FC<Props> = ({
  halaqah, date, slot, today, isAdmin, statuses, attendance, allSantri, musammiList, onSave, defaultOpen = true,
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

  const StatusChips: React.FC<{ k: string; disabled?: boolean }> = ({ k, disabled }) => (
    <div className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap">
      {aktif.map((st) => {
        const selected = nilai(k) === st.name;
        return (
          <button
            key={st.code}
            type="button"
            disabled={disabled}
            onClick={() => setDraft((d) => ({ ...d, [k]: st.name }))}
            className={`min-h-[44px] sm:min-h-0 min-w-[3.25rem] px-2.5 py-2 sm:py-1.5 rounded-lg border text-sm sm:text-xs font-semibold transition-colors ${
              selected ? toneFor(st) + ' ring-1 ring-offset-0' : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'
            }`}
          >
            {st.name}
          </button>
        );
      })}
    </div>
  );

  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
        <button type="button" onClick={() => setOpen(!open)} className="text-left min-w-0">
          <h3 className="font-bold text-slate-800 text-sm truncate">{halaqah.nama}</h3>
          <p className="text-sm sm:text-[11px] text-slate-500">
            {halaqah.marhalah} · {terisi}/{roster.length} santri terisi
            {records.length > 0 ? '' : ' · sesi belum tercatat'}
          </p>
        </button>
        <div className="flex items-center gap-2">
          {hadir && (
            <button type="button" onClick={tandaiSemuaHadir} className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[40px] sm:min-h-0 rounded-lg border border-emerald-300 text-emerald-700 text-sm sm:text-xs font-semibold hover:bg-emerald-50">
              <CheckCheck size={14} /> Tandai semua {hadir.name}
            </button>
          )}
        </div>
      </header>

      {open && (
        <div className="divide-y divide-slate-100">
          {/* Musammi' */}
          {musammi?.id ? (
            <div className="px-4 py-3 bg-slate-50/60">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <UserCheck size={16} className="text-blue-600 shrink-0" />
                  <span className="text-sm font-semibold text-slate-800 truncate">{musammi.nama}</span>
                  <span className="text-sm sm:text-[10px] uppercase font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5">Musammi'</span>
                </div>
                {musammiRecord?.markedByName && (
                  <span className="text-sm sm:text-[11px] text-slate-400">oleh {musammiRecord.markedByName} {jam(musammiRecord.updatedAt)}</span>
                )}
              </div>
              <StatusChips k="m" />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-sm sm:text-xs text-slate-700">
                  <input type="checkbox" className="rounded border-slate-300" checked={badal.on}
                    onChange={(e) => setBadal({ on: e.target.checked, id: e.target.checked ? badal.id : null })} />
                  Digantikan (badal)
                </label>
                {badal.on && (
                  <select
                    value={badal.id ?? ''}
                    onChange={(e) => setBadal({ on: true, id: e.target.value ? Number(e.target.value) : null })}
                    className="border border-slate-300 rounded-lg px-2 py-1 text-sm sm:text-xs"
                  >
                    <option value="">Pilih musammi' pengganti…</option>
                    {musammiList.filter((m) => Number(m.id) !== Number(musammi.id)).map((m) => (
                      <option key={m.id} value={m.id}>{m.nama}</option>
                    ))}
                  </select>
                )}
                {badal.on && !nilai('m') && <span className="text-sm sm:text-[11px] text-amber-700">Isi juga status musammi' utama.</span>}
              </div>
            </div>
          ) : (
            <div className="px-4 py-2 text-sm sm:text-xs text-amber-700 bg-amber-50">Halaqah ini belum punya musammi' utama.</div>
          )}

          {/* Santri */}
          {roster.length === 0 && <div className="px-4 py-4 text-sm sm:text-xs text-slate-500">Belum ada santri di halaqah ini pada tanggal tersebut.</div>}
          {roster.map((s) => {
            const rec = santriRecords.get(Number(s.id));
            const k = `s:${s.id}`;
            const dirty = draft[k] !== undefined && draft[k] !== existing[k];
            return (
              <div key={s.id} className={`px-4 py-2.5 ${dirty ? 'bg-blue-50/40' : ''}`}>
                <div className="flex items-baseline justify-between gap-2 mb-1.5">
                  <span className="text-sm font-medium text-slate-800 truncate">{s.nama}</span>
                  <span className="text-sm sm:text-[11px] text-slate-400 shrink-0">
                    {rec?.markedByName ? `oleh ${rec.markedByName} ${jam(rec.updatedAt)}` : s.kelas && s.kelas !== '-' ? s.kelas : ''}
                  </span>
                </div>
                <StatusChips k={k} />
              </div>
            );
          })}

          <footer className="sticky bottom-0 bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-2 rounded-b-xl">
            <span className="text-sm sm:text-[11px] text-slate-500">
              {isPast ? 'Tanggal sudah lewat: perubahan catatan tersimpan = koreksi Admin dengan alasan.' : 'Perubahan hari ini bisa diperbarui Admin maupun Musammi\'.'}
            </span>
            <div className="flex items-center gap-2">
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
                className="inline-flex flex-1 sm:flex-none justify-center items-center gap-1.5 px-4 py-3 sm:py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-40"
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
