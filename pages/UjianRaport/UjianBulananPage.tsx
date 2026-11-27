/**
 * Fase 5 · Ujian Bulanan (spesifikasi 8).
 *  - Input: nilai akhir 0–100 + materi juz, per "Ujian Bulanan ke-n" pada semester aktif.
 *  - Penguji: Admin, musammi' halaqah santri, atau musammi' penguji yang ditugaskan.
 *  - Remedial = percobaan baru (nilai lama tetap tercatat). Koreksi salah input = Admin + alasan.
 *  - Predikat & lulus (KKM) dari rubrik penilaian lembaga; server menghitung ulang.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, History, Pencil, Plus, RotateCcw, Save, Search, Send, Settings2, Trash2, Upload } from 'lucide-react';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { normalizeRole } from '../../lib/permissions';
import { PageHeader, LoadingState, EmptyState } from '../../components/ui/SaaSPrimitives';
import Modal from '../../components/Modal';
import { useMintaAlasan } from '../../components/ui/AlasanDialog';
import { NotificationStore } from '../../lib/NotificationStore';
import { tampilkanError, pesanErrorRamah } from '../../lib/pesanError';
import { exportToExcel, parseSpreadsheet } from '../../lib/utils';
import { sendCustomTelegramMessage } from '../../lib/telegram';
import {
  halaqahPenguji, percobaanRaport, percobaanTerakhir, predikatNilai, riwayatPercobaan, tampilNilai, type PercobaanUjian,
} from '../../lib/ujian';

type Mode = 'baru' | 'remedial' | 'koreksi';
interface Draf { nilai: string; materi: string; mode: Mode }

const TEMPLATE_BAWAAN = `LAPORAN HASIL UJIAN BULANAN

Nama Santri: {{nama}}
Kelas: {{kelas}}
Ujian: {{periode}}
Materi (Juz): {{materi}}
Nilai: {{nilai}}
Predikat: {{predikat}}

Semoga pencapaian ananda terus meningkat dan membawa keberkahan.`;

const inputCls = 'w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-500';

const UjianBulananPage: React.FC = () => {
  const {
    santri, halaqah, musammi, userProfile, loading, selectedAcademicYear, appSettings, saveAppSetting,
    examAttempts, periodeUjianBulanan, rubrikAktif, pengujiUjian,
    simpanUjian, simpanPeriodeUjian, hapusPeriodeUjian, fetchData,
  } = useSupabaseData();
  const role = normalizeRole(userProfile?.role);
  const isAdmin = role === 'admin' || role === 'superadmin';
  const semester: string = selectedAcademicYear?.active_semester || 'Ganjil';

  const periodeList = useMemo(
    () => periodeUjianBulanan.filter((p) => p.semester === semester).sort((a, b) => a.ke - b.ke),
    [periodeUjianBulanan, semester]
  );
  const [periodId, setPeriodId] = useState('');
  useEffect(() => {
    if (periodeList.length && !periodeList.some((p) => p.id === periodId)) setPeriodId(periodeList[periodeList.length - 1].id);
  }, [periodeList, periodId]);
  const periode = periodeList.find((p) => p.id === periodId);

  const myMusammiIds = useMemo(
    () => musammi.filter((m) => userProfile?.id && m.user_id === userProfile.id).map((m) => Number(m.id)),
    [musammi, userProfile?.id]
  );
  const boleh = useMemo(() => halaqahPenguji(halaqah, {
    isAdmin, userId: userProfile?.id, myMusammiIds, penguji: pengujiUjian, semester, jenis: 'bulanan',
  }), [halaqah, isAdmin, userProfile?.id, myMusammiIds, pengujiUjian, semester]);

  const [filterHalaqah, setFilterHalaqah] = useState('all');
  const [cari, setCari] = useState('');
  const baris = useMemo(() => {
    const q = cari.trim().toLowerCase();
    const out: { s: any; h: any }[] = [];
    halaqah.filter((h) => boleh.has(Number(h.id)) && !h.is_archived && (filterHalaqah === 'all' || String(h.id) === filterHalaqah))
      .sort((a, b) => (a.no_urut || 999) - (b.no_urut || 999) || a.nama.localeCompare(b.nama))
      .forEach((h) => [...(h.santri || [])].sort((a, b) => a.nama.localeCompare(b.nama))
        .forEach((s) => { if (!q || s.nama.toLowerCase().includes(q)) out.push({ s, h }); }));
    return out;
  }, [halaqah, boleh, filterHalaqah, cari]);

  const [draf, setDraf] = useState<Record<number, Draf>>({});
  useEffect(() => { setDraf({}); }, [periodId]);
  // Nilai yang masuk raport = percobaan dengan nilai tertinggi (sama dengan server)
  const nilaiRaport = (sid: number) => percobaanRaport(examAttempts, sid, 'monthly', periodId || null);
  const jumlahSah = (sid: number) => riwayatPercobaan(examAttempts, sid, 'monthly', periodId || null).filter((a) => a.status === 'valid').length;
  const ubah = (sid: number, patch: Partial<Draf>) =>
    setDraf((d) => ({ ...d, [sid]: { nilai: d[sid]?.nilai ?? '', materi: d[sid]?.materi ?? (nilaiRaport(sid)?.materi_juz || ''), mode: d[sid]?.mode ?? 'baru', ...patch } }));
  const mulai = (sid: number, mode: Mode) => {
    // Koreksi mengganti percobaan TERAKHIR (sama dengan server)
    const t = mode === 'koreksi' ? percobaanTerakhir(examAttempts, sid, 'monthly', periodId || null) : nilaiRaport(sid);
    setDraf((d) => ({ ...d, [sid]: { nilai: mode === 'koreksi' ? String(t?.final_score ?? '') : '', materi: t?.materi_juz || '', mode } }));
  };

  const [dialogAlasan, mintaAlasan] = useMintaAlasan();
  const [menyimpan, setMenyimpan] = useState(false);
  const isiDraf = (Object.entries(draf) as [string, Draf][]).filter(([, d]) => d.nilai.trim() !== '');

  const simpan = async () => {
    if (!periodId) { NotificationStore.addNotification('Pilih ujian bulanan dulu.', 'error'); return; }
    const salah = isiDraf.find(([, d]) => !(Number(d.nilai.replace(',', '.')) >= 0 && Number(d.nilai.replace(',', '.')) <= 100));
    if (salah) { NotificationStore.addNotification('Nilai harus angka 0–100.', 'error'); return; }
    let alasan: string | null = null;
    if (isiDraf.some(([, d]) => d.mode === 'koreksi')) {
      alasan = await mintaAlasan({ title: 'Alasan koreksi nilai', description: 'Nilai lama dibatalkan (tetap tercatat) dan diganti nilai baru.' });
      if (alasan === null) return;
    }
    setMenyimpan(true);
    let ok = 0;
    const gagal: number[] = [];
    const pesan: string[] = [];
    for (const [sid, d] of isiDraf) {
      try {
        await simpanUjian({ santriId: Number(sid), jenis: 'bulanan', periodId, nilai: Number(d.nilai.replace(',', '.')),
          materiJuz: d.materi.trim() || null, mode: d.mode, alasan }, { refresh: false });
        ok++;
      } catch (e) {
        gagal.push(Number(sid));
        pesan.push(`${santri.find((s) => s.id === Number(sid))?.nama || sid}: ${pesanErrorRamah(e)}`);
      }
    }
    await fetchData();
    setMenyimpan(false);
    // Baris yang gagal tetap di draf agar bisa diperbaiki
    setDraf((x) => Object.fromEntries(Object.entries(x).filter(([sid]) => gagal.includes(Number(sid)))));
    if (ok) NotificationStore.addNotification(`${ok} nilai ujian bulanan tersimpan.`, 'success');
    if (pesan.length) NotificationStore.addNotification(`${pesan.length} gagal disimpan — ${pesan.slice(0, 3).join(' · ')}`, 'error');
  };

  // ---------- Riwayat ----------
  const [riwayatSid, setRiwayatSid] = useState<number | null>(null);
  const riwayat: PercobaanUjian[] = riwayatSid ? riwayatPercobaan(examAttempts, riwayatSid, 'monthly', periodId || null) : [];

  // ---------- Kelola ujian bulanan (Admin) ----------
  const [kelola, setKelola] = useState(false);
  const [labelBaru, setLabelBaru] = useState('');
  const tambahPeriode = async () => {
    try {
      const ke = Math.max(0, ...periodeList.map((p) => p.ke)) + 1;
      await simpanPeriodeUjian({ ke, label: labelBaru.trim() || `Ujian Bulanan ke-${ke}` });
      setLabelBaru('');
      NotificationStore.addNotification('Ujian bulanan ditambahkan.', 'success');
    } catch (e) { tampilkanError(e, 'Gagal menambah ujian bulanan'); }
  };

  // ---------- Ekspor / impor ----------
  const ekspor = () => exportToExcel(baris.map(({ s, h }, i) => {
    const t = nilaiRaport(s.id);
    return { No: i + 1, ID: s.id, NIS: s.kode || '', Nama: s.nama, Kelas: s.kelas, Halaqah: h.nama, 'Materi (Juz)': t?.materi_juz || '',
      Nilai: t?.final_score ?? '', Predikat: t?.predikat || '', Percobaan: t?.attempt_no ?? '' };
  }), `Ujian_Bulanan_${(periode?.label || 'periode').replace(/\s+/g, '_')}`);
  const fileRef = useRef<HTMLInputElement>(null);
  const impor = async (file: File) => {
    try {
      const data: any[] = await parseSpreadsheet(file);
      let n = 0;
      const next = { ...draf };
      for (const row of data) {
        const key = (k: string) => row[Object.keys(row).find((x) => x.toLowerCase().trim() === k) || ''];
        const id = Number(key('id')) || baris.find(({ s }) => s.kode && String(s.kode) === String(key('nis') ?? ''))?.s.id;
        const nilai = key('nilai');
        if (!id || nilai === undefined || nilai === '' || !baris.some(({ s }) => s.id === id)) continue;
        const t = nilaiRaport(id);
        next[id] = { nilai: String(nilai), materi: String(key('materi (juz)') ?? key('materi') ?? t?.materi_juz ?? ''), mode: t ? 'remedial' : 'baru' };
        n++;
      }
      setDraf(next);
      NotificationStore.addNotification(n ? `${n} baris dimuat. Periksa lalu klik Simpan (santri yang sudah punya nilai dimuat sebagai remedial).` : 'Tidak ada baris yang cocok (kolom ID/NIS dan Nilai).', n ? 'info' : 'error');
    } catch (e) { tampilkanError(e, 'Gagal membaca file'); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  };

  // ---------- Telegram ke wali ----------
  const templateKey = `UB_TELEGRAM_TEMPLATE_${selectedAcademicYear?.id}_${semester}`;
  const template = appSettings.find((s) => s.key === templateKey)?.value || TEMPLATE_BAWAAN;
  const [kirimBuka, setKirimBuka] = useState(false);
  const [templateDraf, setTemplateDraf] = useState(template);
  const [mengirim, setMengirim] = useState(false);
  const siapKirim = baris.filter(({ s }) => s.telegram_chat_id && nilaiRaport(s.id));
  const kirim = async () => {
    setMengirim(true);
    let ok = 0;
    try {
      if (templateDraf !== template) await saveAppSetting(templateKey, templateDraf);
      for (const { s } of siapKirim) {
        const t = nilaiRaport(s.id)!;
        const pesan = templateDraf.replace(/{{nama}}/g, s.nama).replace(/{{kelas}}/g, s.kelas || '-').replace(/{{periode}}/g, periode?.label || '-')
          .replace(/{{materi}}/g, t.materi_juz || '-').replace(/{{nilai}}/g, tampilNilai(t.final_score)).replace(/{{predikat}}/g, t.predikat || '-');
        if (await sendCustomTelegramMessage('', s.telegram_chat_id, pesan, s.id)) ok++;
      }
      NotificationStore.addNotification(`${ok} dari ${siapKirim.length} pesan terkirim.`, ok ? 'success' : 'error');
      setKirimBuka(false);
    } catch (e) { tampilkanError(e, 'Gagal mengirim pesan'); } finally { setMengirim(false); }
  };

  if (loading) return <LoadingState label="Memuat ujian bulanan…" />;

  return (
    <div className="space-y-5 pb-12">
      {dialogAlasan}
      <PageHeader
        title="Ujian Bulanan"
        description={`Nilai akhir 0–100 dan materi juz · Semester ${semester} ${selectedAcademicYear?.name || ''} · KKM ${rubrikAktif.passing_score}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {isAdmin && <button type="button" onClick={() => setKelola(true)} className="btn btn-secondary"><Settings2 size={15} /> Kelola ujian</button>}
            <button type="button" onClick={ekspor} disabled={!periodId} className="btn btn-secondary"><Download size={15} /> Ekspor</button>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={!periodId} className="btn btn-secondary"><Upload size={15} /> Impor</button>
            <button type="button" onClick={() => { setTemplateDraf(template); setKirimBuka(true); }} disabled={!periodId} className="btn btn-secondary"><Send size={15} /> Kirim ke wali</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && impor(e.target.files[0])} />
          </div>
        }
      />

      <div className="panel-filter"><div className="grid-filter">
        <label className="kontrol-label"><span>Ujian</span><select className="kontrol-dalam" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
            {periodeList.length === 0 && <option value="">Belum ada ujian bulanan</option>}
            {periodeList.map((p) => <option key={p.id} value={p.id}>Ke-{p.ke} · {p.label}</option>)}
          </select></label>
        <label className="kontrol-label"><span>Halaqah</span><select className="kontrol-dalam" value={filterHalaqah} onChange={(e) => setFilterHalaqah(e.target.value)}>
            <option value="all">Semua yang saya uji</option>
            {halaqah.filter((h) => boleh.has(Number(h.id)) && !h.is_archived).map((h) => <option key={h.id} value={String(h.id)}>{h.nama}</option>)}
          </select></label>
        <label className="kontrol-label"><span>Cari</span><input className="kontrol-dalam" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Nama santri…" /></label>
      </div></div>

      {periodeList.length === 0 && (
        <EmptyState title="Belum ada ujian bulanan" description={isAdmin ? 'Klik "Kelola ujian" untuk menambah Ujian Bulanan ke-1.' : 'Minta Admin menambah ujian bulanan untuk semester ini.'} />
      )}
      {periodId && baris.length === 0 && <EmptyState title="Tidak ada santri" description="Anda belum menjadi penguji halaqah mana pun pada semester ini." />}

      {periodId && baris.length > 0 && (
        <div className="wadah-tabel overflow-x-auto">
          <table className="tabel tabel-kartu">
            <thead>
              <tr>
                <th className="text-left">Santri</th>
                <th className="text-left w-40">Materi (juz)</th>
                <th className="text-left w-28">Nilai</th>
                <th className="text-left">Predikat</th>
                <th className="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {baris.map(({ s, h }) => {
                const t = nilaiRaport(s.id);
                const d = draf[s.id];
                const edit = !t || Boolean(d && d.mode !== 'baru');
                const nilaiPrev = d && d.nilai !== '' ? Number(d.nilai.replace(',', '.')) : null;
                const pred = nilaiPrev !== null ? predikatNilai(rubrikAktif, nilaiPrev) : t?.predikat;
                const lulus = (nilaiPrev ?? t?.final_score ?? null) === null ? null : (nilaiPrev ?? t!.final_score!) >= rubrikAktif.passing_score;
                return (
                  <tr key={s.id} className={d ? 'bg-blue-50/30' : ''}>
                    <td>
                      <div className="font-semibold text-slate-800">{s.nama}</div>
                      <div className="text-2xs text-slate-400">{h.nama} · {s.kelas || '-'}{t ? ` · percobaan ${t.attempt_no}${t.is_remedial ? ' (remedial)' : ''}${jumlahSah(s.id) > 1 ? ` · tertinggi dari ${jumlahSah(s.id)} percobaan` : ''}` : ''}</div>
                    </td>
                    <td data-label="Materi (juz)">
                      {edit ? <input className={inputCls} value={d?.materi ?? t?.materi_juz ?? ''} placeholder="mis. 30" onChange={(e) => ubah(s.id, { materi: e.target.value })} />
                        : <span className="text-slate-600">{t?.materi_juz || '-'}</span>}
                    </td>
                    <td data-label="Nilai">
                      {edit ? <input className={inputCls} inputMode="decimal" value={d?.nilai ?? ''} placeholder={d?.mode === 'remedial' ? 'remedial' : '0–100'} onChange={(e) => ubah(s.id, { nilai: e.target.value })} />
                        : <span className="font-semibold text-slate-800">{tampilNilai(t?.final_score)}</span>}
                    </td>
                    <td data-label="Predikat">
                      {pred ? <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${lulus ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{pred}{lulus === false ? ' · perlu remedial' : ''}</span> : <span className="text-slate-300">-</span>}
                    </td>
                    <td data-label="Aksi" className="text-right whitespace-nowrap">
                      {t && !d && (
                        <>
                          <button type="button" className="text-xs font-semibold text-blue-700 mr-3 inline-flex items-center gap-1" onClick={() => mulai(s.id, 'remedial')}><RotateCcw size={12} /> Remedial</button>
                          {isAdmin && <button type="button" className="text-xs font-semibold text-amber-700 mr-3 inline-flex items-center gap-1" onClick={() => mulai(s.id, 'koreksi')}><Pencil size={12} /> Koreksi</button>}
                        </>
                      )}
                      {d && t && <button type="button" className="text-xs font-semibold text-slate-500 mr-3" onClick={() => setDraf((x) => { const y = { ...x }; delete y[s.id]; return y; })}>Batal</button>}
                      {t && <button type="button" title="Riwayat" className="text-slate-400 hover:text-slate-700" onClick={() => setRiwayatSid(s.id)}><History size={14} /></button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {periodId && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur pl-4 pr-20 py-3 flex items-center justify-end gap-2 lg:pl-72">
          <span className="mr-auto text-xs text-slate-500 hidden sm:inline">{isiDraf.length ? `${isiDraf.length} nilai belum disimpan` : 'Isi nilai lalu Simpan'}</span>
          <button type="button" disabled={menyimpan || isiDraf.length === 0} onClick={simpan}
            className="btn btn-primary whitespace-nowrap">
            <Save size={15} /> {menyimpan ? 'Menyimpan…' : 'Simpan nilai'}
          </button>
        </div>
      )}

      <Modal isOpen={riwayatSid !== null} onClose={() => setRiwayatSid(null)} title="Riwayat nilai" maxWidth="md">
        <div className="space-y-2 text-sm">
          {riwayat.map((a) => (
            <div key={a.id} className={`rounded-lg border p-2.5 ${a.status === 'voided' ? 'border-slate-200 bg-slate-50 text-slate-400 line-through' : 'border-slate-200'}`}>
              <div className="flex justify-between"><b>Percobaan {a.attempt_no}{a.is_remedial ? ' · remedial' : ''}</b><span>{tampilNilai(a.final_score)} · {a.predikat}</span></div>
              <div className="text-xs">{a.created_at ? new Date(a.created_at).toLocaleString('id-ID') : ''} · materi {a.materi_juz || '-'}{a.source === 'migrasi' ? ' · data lama' : ''}</div>
              {a.status === 'voided' && <div className="text-xs no-underline">Dibatalkan: {a.void_reason}</div>}
            </div>
          ))}
        </div>
      </Modal>

      <Modal isOpen={kelola} onClose={() => setKelola(false)} title={`Ujian bulanan · Semester ${semester}`} maxWidth="md">
        <div className="space-y-3">
          {periodeList.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 w-12">Ke-{p.ke}</span>
              <input className={inputCls} defaultValue={p.label}
                onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== p.label && simpanPeriodeUjian({ id: p.id, ke: p.ke, label: e.target.value }).catch((er) => tampilkanError(er, 'Gagal menyimpan'))} />
              <button type="button" title="Hapus" className="text-slate-400 hover:text-red-600" onClick={() => {
                if (window.confirm(`Hapus ${p.label}?`)) hapusPeriodeUjian(p.id).catch((er) => tampilkanError(er, 'Gagal menghapus'));
              }}><Trash2 size={14} /></button>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
            <input className={inputCls} placeholder={`Ujian Bulanan ke-${Math.max(0, ...periodeList.map((p) => p.ke)) + 1} (mis. Agustus)`} value={labelBaru} onChange={(e) => setLabelBaru(e.target.value)} />
            <button type="button" onClick={tambahPeriode} className="btn btn-primary"><Plus size={14} /> Tambah</button>
          </div>
          <p className="text-2xs text-slate-400">Ujian bulanan yang sudah berisi nilai tidak bisa dihapus.</p>
        </div>
      </Modal>

      <Modal isOpen={kirimBuka} onClose={() => setKirimBuka(false)} title="Kirim hasil ke wali (Telegram)" maxWidth="lg">
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">{siapKirim.length} santri punya nilai dan Telegram wali. Placeholder: {'{{nama}} {{kelas}} {{periode}} {{materi}} {{nilai}} {{predikat}}'}</p>
          <textarea rows={9} className={`${inputCls} font-mono text-xs`} value={templateDraf} onChange={(e) => setTemplateDraf(e.target.value)} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setKirimBuka(false)} className="px-4 py-2 rounded-lg border border-slate-300 font-semibold text-slate-700">Batal</button>
            <button type="button" disabled={mengirim || siapKirim.length === 0} onClick={kirim} className="btn btn-primary">{mengirim ? 'Mengirim…' : `Kirim ${siapKirim.length} pesan`}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default UjianBulananPage;
