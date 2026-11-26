/**
 * Fase 3 · satu layar input setoran yang ringkas di HP (target < 15 detik per santri).
 *  1. Pilih santri (hanya yang boleh setor bila sudah diabsen — BUG-12)
 *  2. Pilih jenis (bawaan mengikuti waktu halaqah)
 *  3. Rentang surat:ayat — titik awal otomatis dari setoran terakhir sesuai ARAH HAFALAN santri;
 *     setoran Rasib terakhir diulang pada rentang yang sama
 *  4. Halaman otomatis dari Mushaf Madinah 15 baris
 *  5. Khoto kabir & shoghir -> predikat otomatis dari Tabel Kelancaran (Rasib = ulang)
 *  6. Simpan -> setoran langsung sah, pesan Telegram ke wali (bila diaktifkan), lanjut ke santri berikutnya
 * Mode koreksi (Admin): isi diubah dan wajib alasan.
 * Server menghitung ulang halaman & predikat; nilai di layar hanya pratinjau.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Save, BookOpen } from 'lucide-react';
import type { Halaqah } from '../../types';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { calculateHalamanSetoran, SURAHS_DATA } from '../../lib/quranPageMap';
import { hitungPredikat } from '../../lib/kelancaran';
import { titikAwalBerikutnya, saranAkhir, labelArah, type ArahHafalan } from '../../lib/arahHafalan';
import { rosterPadaTanggal, hariIni } from '../../lib/sesiHalaqah';
import { bolehSetor, findStatus, type SetoranRow } from '../../lib/v2Adapter';
import { tampilkanError } from '../../lib/pesanError';
import { NotificationStore } from '../../lib/NotificationStore';
import { sendCustomTelegramMessage } from '../../lib/telegram';
import { buatPesanSetoran } from '../../lib/notifSetoran';
import AlasanDialog from '../ui/AlasanDialog';

interface Props {
  halaqahOptions: Halaqah[];
  initialHalaqahId?: number | null;
  date?: string;
  slot?: string;
  /** Kunci pilihan halaqah/tanggal/waktu (dipakai di halaman Sesi Halaqah) */
  lockContext?: boolean;
  /** Mode koreksi oleh Admin */
  editEntry?: SetoranRow | null;
  onDone?: () => void;
}

const Stepper: React.FC<{ label: string; value: number; onChange: (n: number) => void }> = ({ label, value, onChange }) => (
  <div className="flex-1">
    <div className="text-[11px] font-semibold text-slate-600 mb-1">{label}</div>
    <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white">
      <button type="button" aria-label={`Kurangi ${label}`} onClick={() => onChange(Math.max(0, value - 1))} className="px-3 py-2.5 text-slate-600 active:bg-slate-100"><Minus size={16} /></button>
      <input type="number" inputMode="numeric" min={0} value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="w-full text-center text-lg font-bold border-0 focus:ring-0 py-1.5" />
      <button type="button" aria-label={`Tambah ${label}`} onClick={() => onChange(value + 1)} className="px-3 py-2.5 text-slate-600 active:bg-slate-100"><Plus size={16} /></button>
    </div>
  </div>
);

const FormSetoranRingkas: React.FC<Props> = ({ halaqahOptions, initialHalaqahId, date: dateProp, slot: slotProp, lockContext, editEntry, onDone }) => {
  const {
    allSantri, setoranHarian, attendance, attendanceStatuses, recitationKinds, sessionSlots, fluencyRules,
    simpanSetoran, appSettings,
  } = useSupabaseData();
  const today = hariIni();
  const isEdit = Boolean(editEntry);

  const [halaqahId, setHalaqahId] = useState<number | null>(editEntry?.halaqah_id ?? initialHalaqahId ?? halaqahOptions[0]?.id ?? null);
  const [date, setDate] = useState(editEntry?.tanggal || dateProp || today);
  const halaqah = halaqahOptions.find((h) => h.id === halaqahId) || null;
  const slotOptions = useMemo(() => {
    const w = (halaqah?.waktu || []).map(String);
    return w.length ? w : sessionSlots.filter((s) => s.is_active).map((s) => s.code);
  }, [halaqah, sessionSlots]);
  const [slot, setSlot] = useState(editEntry?.waktu || slotProp || '');
  useEffect(() => { if (!isEdit && !lockContext && (!slot || !slotOptions.includes(slot))) setSlot(slotOptions[0] || ''); }, [slotOptions]); // eslint-disable-line
  useEffect(() => { if (lockContext && slotProp) setSlot(slotProp); }, [slotProp, lockContext]);
  useEffect(() => { if (lockContext && dateProp) setDate(dateProp); }, [dateProp, lockContext]);
  useEffect(() => { if (lockContext && initialHalaqahId) setHalaqahId(initialHalaqahId); }, [initialHalaqahId, lockContext]);

  const roster = useMemo(() => (halaqah ? rosterPadaTanggal(halaqah, date, allSantri) : []), [halaqah, date, allSantri]);
  const statusOf = (santriId: number) =>
    attendance.find((a) => a.peran === 'Santri' && Number(a.personId) === santriId && a.date === date && a.waktu === slot)?.status as string | undefined;
  const setoranHariIni = (santriId: number) =>
    setoranHarian.filter((r) => r.santri_id === santriId && r.tanggal === date && r.waktu === slot).length;

  const [santriId, setSantriId] = useState<number | null>(editEntry?.santri_id ?? null);
  const kinds = recitationKinds.filter((k) => k.is_active);
  const defaultKind = sessionSlots.find((s) => s.code === slot)?.default_kind_code || kinds[0]?.code || 'ziyadah';
  const [kind, setKind] = useState<string>(editEntry?.kind || defaultKind);
  useEffect(() => { if (!isEdit) setKind(defaultKind); }, [defaultKind, isEdit]);

  const [s1, setS1] = useState<number>(editEntry?.surah_start_no || 114);
  const [a1, setA1] = useState<number>(Number(editEntry?.ayat_mulai) || 1);
  const [s2, setS2] = useState<number>(editEntry?.surah_end_no || 114);
  const [a2, setA2] = useState<number>(Number(editEntry?.ayat_selesai) || 1);
  const [kabir, setKabir] = useState<number>(editEntry?.kesalahan_kabir || 0);
  const [shoghir, setShoghir] = useState<number>(editEntry?.kesalahan_shoghir || 0);
  const [catatan, setCatatan] = useState<string>(editEntry?.keterangan || '');
  const [saving, setSaving] = useState(false);
  // Kunci idempotensi per percobaan simpan: kirim ulang setelah jaringan putus tidak membuat setoran ganda.
  const idemKey = useRef<string | null>(null);
  const [askReason, setAskReason] = useState(false);

  const santri = allSantri.find((s) => Number(s.id) === santriId) || roster.find((s) => Number(s.id) === santriId);
  const arah: ArahHafalan = ((santri as any)?.arah_hafalan === 'maju' ? 'maju' : 'mundur');
  const kindRef = kinds.find((k) => k.code === kind) || recitationKinds.find((k) => k.code === kind);

  // Titik awal otomatis
  useEffect(() => {
    idemKey.current = null;
    if (isEdit || !santriId) return;
    const riwayat = setoranHarian
      .filter((r) => r.santri_id === santriId && (kindRef?.adds_memorization ? recitationKinds.find((k) => k.code === r.kind)?.adds_memorization : r.kind === kind))
      .sort((a, b) => (b.tanggal + b.created_at).localeCompare(a.tanggal + a.created_at));
    const last = riwayat[0];
    if (last?.is_repeat && last.surah_start_no && last.surah_end_no) {
      // Rasib: ulang rentang yang sama
      setS1(last.surah_start_no); setA1(Number(last.ayat_mulai) || 1); setS2(last.surah_end_no); setA2(Number(last.ayat_selesai) || 1);
      return;
    }
    const awal = titikAwalBerikutnya(
      last ? { surah_start_no: last.surah_start_no, ayah_start: Number(last.ayat_mulai) || 1, surah_end_no: last.surah_end_no, ayah_end: Number(last.ayat_selesai) || 1 } : null,
      arah
    );
    const akhir = saranAkhir(awal, 5);
    setS1(awal.surah); setA1(awal.ayah); setS2(akhir.surah); setA2(akhir.ayah);
    setKabir(0); setShoghir(0); setCatatan('');
  }, [santriId, kind]); // eslint-disable-line

  const halaman = useMemo(() => calculateHalamanSetoran(s1, a1, s2, a2)?.halaman ?? 0, [s1, a1, s2, a2]);
  const pred = hitungPredikat(fluencyRules, kabir, shoghir);
  const maxA = (s: number) => SURAHS_DATA[s - 1]?.totalAyah || 1;
  const lastAtt = santriId ? statusOf(santriId) : undefined;
  const santriBolehSetor = !lastAtt || bolehSetor(lastAtt, attendanceStatuses);

  const nextSantri = () => {
    const idx = roster.findIndex((s) => Number(s.id) === santriId);
    const next = [...roster.slice(idx + 1), ...roster.slice(0, idx + 1)]
      .find((s) => bolehSetor(statusOf(Number(s.id)), attendanceStatuses) && setoranHariIni(Number(s.id)) === 0 && Number(s.id) !== santriId);
    setSantriId(next ? Number(next.id) : null);
  };

  const kirimTelegram = async (result: any) => {
    try {
      if (appSettings.find((s) => s.key === 'SETORAN_TELEGRAM_NOTIF_ENABLE')?.value !== 'true') return;
      const chatId = (santri as any)?.telegram_chat_id;
      if (!chatId) return;
      const template = appSettings.find((s) => s.key === 'SETORAN_TELEGRAM_NOTIF_TEMPLATE')?.value;
      const n1 = SURAHS_DATA[s1 - 1]?.name, n2 = SURAHS_DATA[s2 - 1]?.name;
      await sendCustomTelegramMessage('', chatId, buatPesanSetoran(template, {
        nama_santri: santri?.nama || '', halaqah: halaqah?.nama || '', tanggal: date, waktu: slot,
        skema: kindRef?.name || kind, surat: s1 === s2 ? n1 : `${n1} - ${n2}`, ayat: s1 === s2 ? `${a1}-${a2}` : `${a1} - ${a2}`,
        jumlah_halaman: result?.calculated_pages ?? halaman, khoto_kabir: kabir, khoto_shoghir: shoghir,
        nilai: result?.predicate || pred.predicate, ulang: Boolean(result?.is_repeat ?? pred.isRepeat), keterangan: catatan,
      }), santri?.id);
    } catch (e) {
      console.warn('Notifikasi Telegram gagal', e);
    }
  };

  const simpan = async (reason?: string) => {
    if (!halaqah || !santriId || !slot) {
      NotificationStore.addNotification('Pilih halaqah, waktu, dan santri dulu.', 'error');
      return;
    }
    if (a1 > maxA(s1) || a2 > maxA(s2)) {
      NotificationStore.addNotification('Nomor ayat melebihi jumlah ayat surat.', 'error');
      return;
    }
    setSaving(true);
    try {
      const result = await simpanSetoran({
        p_santri_id: santriId, p_halaqah_id: halaqah.id, p_recitation_date: date, p_session_slot: slot, p_kind: kind,
        p_surah_start_no: s1, p_ayah_start: a1, p_surah_end_no: s2, p_ayah_end: a2,
        p_calculated_pages: halaman, p_minor_mistakes: shoghir, p_major_mistakes: kabir,
        p_predicate: null, p_notes: catatan.trim() || null, p_status: null,
        p_idempotency_key: isEdit ? null : (idemKey.current ||= `setoran_${santriId}_${date}_${slot}_${Date.now()}`),
        p_existing_entry_id: editEntry?.v2_id || null, p_session_id: null, p_reason: reason || null,
      });
      NotificationStore.addNotification(
        `${santri?.nama}: ${result?.predicate || pred.predicate}${result?.is_repeat ? ' — diulang' : ''} · ${result?.calculated_pages ?? halaman} hal.`,
        'success'
      );
      setAskReason(false);
      idemKey.current = null;
      if (isEdit) {
        onDone?.();
        return;
      }
      kirimTelegram(result);
      nextSantri();
    } catch (e) {
      tampilkanError(e, 'Gagal menyimpan setoran');
    } finally {
      setSaving(false);
    }
  };

  const chip = (active: boolean, disabled?: boolean) =>
    `px-3 py-2 rounded-lg border text-sm font-semibold ${disabled ? 'opacity-40 cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
      : active ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`;

  return (
    <div className="space-y-4">
      {/* Konteks */}
      {!lockContext && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select value={halaqahId ?? ''} disabled={isEdit} onChange={(e) => { setHalaqahId(Number(e.target.value)); setSantriId(null); }}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
            {halaqahOptions.map((h) => <option key={h.id} value={h.id}>{h.nama}</option>)}
          </select>
          <input type="date" value={date} max={today} disabled={isEdit} onChange={(e) => setDate(e.target.value || today)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" />
          <select value={slot} disabled={isEdit} onChange={(e) => setSlot(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
            {slotOptions.map((w) => <option key={w} value={w}>{sessionSlots.find((s) => s.code === w)?.name || w}</option>)}
          </select>
        </div>
      )}

      {/* 1. Santri */}
      <div>
        <div className="text-xs font-semibold text-slate-600 mb-1.5">Santri</div>
        {isEdit ? (
          <div className="text-sm font-semibold text-slate-800">{santri?.nama || `Santri ${santriId}`}</div>
        ) : (
          <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
            {roster.length === 0 && <span className="text-xs text-slate-500">Belum ada santri di halaqah ini.</span>}
            {roster.map((s) => {
              const st = statusOf(Number(s.id));
              const boleh = bolehSetor(st, attendanceStatuses);
              const n = setoranHariIni(Number(s.id));
              return (
                <button key={s.id} type="button" disabled={!boleh} onClick={() => setSantriId(Number(s.id))}
                  title={!boleh ? `Tercatat ${st}: tidak bisa setor` : undefined} className={chip(santriId === Number(s.id), !boleh)}>
                  {s.nama}
                  {st && <span className="ml-1 text-[10px] font-normal opacity-80">({findStatus(attendanceStatuses, st)?.name || st})</span>}
                  {n > 0 && <span className="ml-1 text-[10px] font-bold">✓{n}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {santriId && (
        <>
          {!santriBolehSetor && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              Santri tercatat "{lastAtt}" pada waktu ini sehingga tidak bisa setor. Ubah absensinya dulu bila keliru.
            </div>
          )}

          {/* 2. Jenis */}
          <div>
            <div className="text-xs font-semibold text-slate-600 mb-1.5">Jenis setoran</div>
            <div className="flex flex-wrap gap-1.5">
              {kinds.map((k) => (
                <button key={k.code} type="button" onClick={() => setKind(k.code)} className={chip(kind === k.code)}>{k.name}</button>
              ))}
            </div>
          </div>

          {/* 3. Rentang */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600 mb-1.5">
              <span>Rentang hafalan</span>
              <span className="font-normal text-slate-400">{labelArah(arah)}</span>
            </div>
            <div className="grid grid-cols-[1fr_5rem] gap-2 items-center">
              <select value={s1} onChange={(e) => { const v = Number(e.target.value); setS1(v); setA1(1); if (v > s2 || arah === 'mundur') { setS2(v); setA2(Math.min(maxA(v), 5)); } }}
                className="border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white" aria-label="Surat mulai">
                {SURAHS_DATA.map((s) => <option key={s.id} value={s.id}>{s.id}. {s.name}</option>)}
              </select>
              <input type="number" inputMode="numeric" min={1} max={maxA(s1)} value={a1} aria-label="Ayat mulai"
                onChange={(e) => setA1(Math.min(maxA(s1), Math.max(1, Number(e.target.value) || 1)))}
                className="border border-slate-300 rounded-lg px-2 py-2 text-sm text-center" />
              <select value={s2} onChange={(e) => { const v = Number(e.target.value); setS2(v); setA2(Math.min(maxA(v), v === s1 ? Math.max(a1, a2) : a2)); }}
                className="border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white" aria-label="Surat selesai">
                {SURAHS_DATA.map((s) => <option key={s.id} value={s.id}>{s.id}. {s.name}</option>)}
              </select>
              <input type="number" inputMode="numeric" min={1} max={maxA(s2)} value={a2} aria-label="Ayat selesai"
                onChange={(e) => setA2(Math.min(maxA(s2), Math.max(1, Number(e.target.value) || 1)))}
                className="border border-slate-300 rounded-lg px-2 py-2 text-sm text-center" />
            </div>
            <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-slate-600">
              <BookOpen size={13} /> {halaman} halaman (Mushaf Madinah 15 baris)
            </div>
          </div>

          {/* 4. Khoto & predikat */}
          <div className="flex gap-3">
            <Stepper label="Khoto kabir" value={kabir} onChange={setKabir} />
            <Stepper label="Khoto shoghir" value={shoghir} onChange={setShoghir} />
          </div>
          <div className={`rounded-lg px-3 py-2 text-sm font-semibold flex items-center justify-between ${pred.isRepeat ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
            <span>Predikat: {pred.predicate}</span>
            <span className="text-xs font-normal">{pred.isRepeat ? 'Ulang — tidak menambah hafalan' : 'Lanjut'}</span>
          </div>

          <details className="text-sm">
            <summary className="text-xs text-slate-500 cursor-pointer">Catatan (opsional)</summary>
            <textarea rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-lg p-2 text-sm" />
          </details>

          <button
            type="button"
            disabled={saving || !santriBolehSetor || !slot}
            onClick={() => (isEdit ? setAskReason(true) : simpan())}
            className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-base font-bold disabled:opacity-40"
          >
            <Save size={18} /> {saving ? 'Menyimpan…' : isEdit ? 'Simpan koreksi' : 'Simpan setoran'}
          </button>
        </>
      )}

      <AlasanDialog
        isOpen={askReason}
        title="Koreksi setoran"
        description="Koreksi setoran yang sudah tersimpan dicatat di riwayat revisi dan log audit."
        confirmLabel="Simpan koreksi"
        busy={saving}
        onCancel={() => setAskReason(false)}
        onConfirm={(alasan) => simpan(alasan)}
      />
    </div>
  );
};

export default FormSetoranRingkas;
