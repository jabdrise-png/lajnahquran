/**
 * Fase 5 · Ujian Semester & Remedial (spesifikasi 8).
 *  - Input khoto kabir & shoghir PER JUZ; nilai juz & nilai akhir dihitung otomatis dari rubrik
 *    lembaga (nilai awal − khoto, tidak di bawah nilai minimum) — server menghitung ulang.
 *  - Remedial = percobaan baru; nilai lama tetap tercatat. Raport memakai nilai tertinggi.
 *  - Koreksi salah input = Admin + alasan. Catatan raport per santri.
 */
import React, { useMemo, useRef, useState } from 'react';
import { Download, History, Pencil, RotateCcw, Save, Search, Upload } from 'lucide-react';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { normalizeRole } from '../../lib/permissions';
import { PageHeader, LoadingState, EmptyState } from '../../components/ui/SaaSPrimitives';
import Modal from '../../components/Modal';
import { useMintaAlasan } from '../../components/ui/AlasanDialog';
import { NotificationStore } from '../../lib/NotificationStore';
import { tampilkanError, pesanErrorRamah } from '../../lib/pesanError';
import { exportToExcel, parseSpreadsheet } from '../../lib/utils';
import {
  halaqahPenguji, nilaiJuzInput, nilaiSemester, percobaanTerakhir, parseDaftarJuz, percobaanRaport, predikatNilai, riwayatPercobaan,
  ringkasDaftarJuz, tampilNilai, type JuzKhoto,
} from '../../lib/ujian';

type Mode = 'baru' | 'remedial' | 'koreksi';
type Tab = 'nilai' | 'remedial' | 'catatan';
const inputCls = 'w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-slate-50';

const UjianSemesterPage: React.FC = () => {
  const {
    halaqah, musammi, userProfile, loading, selectedAcademicYear, examAttempts, rubrikAktif, pengujiUjian, catatanRaport,
    simpanUjian, simpanCatatanRaport, fetchData,
  } = useSupabaseData();
  const role = normalizeRole(userProfile?.role);
  const isAdmin = role === 'admin' || role === 'superadmin';
  const semester: string = selectedAcademicYear?.active_semester || 'Ganjil';
  const [tab, setTab] = useState<Tab>('nilai');
  const [filterHalaqah, setFilterHalaqah] = useState('all');
  const [cari, setCari] = useState('');

  const myMusammiIds = useMemo(
    () => musammi.filter((m: any) => userProfile?.id && m.user_id === userProfile.id).map((m: any) => Number(m.id)),
    [musammi, userProfile?.id]
  );
  const boleh = useMemo(() => halaqahPenguji(halaqah, {
    isAdmin, userId: userProfile?.id, myMusammiIds, penguji: pengujiUjian, semester, jenis: 'semester',
  }), [halaqah, isAdmin, userProfile?.id, myMusammiIds, pengujiUjian, semester]);
  const baris = useMemo(() => {
    const q = cari.trim().toLowerCase();
    const out: { s: any; h: any }[] = [];
    halaqah.filter((h) => boleh.has(Number(h.id)) && !h.is_archived && (filterHalaqah === 'all' || String(h.id) === filterHalaqah))
      .sort((a, b) => (a.no_urut || 999) - (b.no_urut || 999) || a.nama.localeCompare(b.nama))
      .forEach((h) => [...(h.santri || [])].sort((a, b) => a.nama.localeCompare(b.nama))
        .forEach((s) => { if (!q || s.nama.toLowerCase().includes(q)) out.push({ s, h }); }));
    return out;
  }, [halaqah, boleh, filterHalaqah, cari]);
  // Nilai yang masuk raport = percobaan dengan nilai tertinggi (sama dengan server)
  const nilaiRaport = (sid: number) => percobaanRaport(examAttempts, sid, 'semester', null);
  const jumlahSah = (sid: number) => riwayatPercobaan(examAttempts, sid, 'semester', null).filter((a) => a.status === 'valid').length;
  const catatanDari = (sid: number) => catatanRaport.find((c: any) => Number(c.santri_id) === sid && c.semester === semester)?.catatan || '';
  const tampil = tab === 'remedial' ? baris.filter(({ s }) => { const t = nilaiRaport(s.id); return t && t.passed === false; }) : baris;

  // ---------- Modal input nilai ----------
  const [dialogAlasan, mintaAlasan] = useMintaAlasan();
  type IsianJuz = { kabir: string; shoghir: string; custom: string };
  const [form, setForm] = useState<{ s: any; mode: Mode; materi: string; juz: Record<number, IsianJuz>; catatan: string } | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const buka = (s: any, mode: Mode) => {
    // Koreksi mengganti percobaan TERAKHIR (sama dengan server); remedial memakai materi nilai raport
    const t = mode === 'koreksi' ? percobaanTerakhir(examAttempts, s.id, 'semester', null) : nilaiRaport(s.id);
    const juz: Record<number, IsianJuz> = {};
    const sumber = mode === 'koreksi' || mode === 'remedial' ? t?.juz_scores || [] : [];
    sumber.forEach((j) => {
      juz[j.juz] = mode === 'koreksi'
        ? { kabir: String(j.kabir), shoghir: String(j.shoghir), custom: j.custom && j.nilai !== undefined ? String(j.nilai) : '' }
        : { kabir: '', shoghir: '', custom: '' };
    });
    setForm({ s, mode, materi: t?.materi_juz || ringkasDaftarJuz(sumber.map((j) => j.juz)), juz, catatan: catatanDari(s.id) });
  };
  const daftarJuz = form ? parseDaftarJuz(form.materi) : [];
  const juzIsi: JuzKhoto[] = form ? daftarJuz.map((j) => ({ juz: j, kabir: Number(form.juz[j]?.kabir || 0), shoghir: Number(form.juz[j]?.shoghir || 0),
    nilai_custom: (form.juz[j]?.custom ?? '').trim() === '' ? null : Number(form.juz[j].custom.replace(',', '.')) })) : [];
  const preview = nilaiSemester(rubrikAktif, juzIsi);

  const simpan = async () => {
    if (!form) return;
    if (daftarJuz.length === 0) { NotificationStore.addNotification('Isi materi juz dulu (mis. 1-5 atau 30).', 'error'); return; }
    if (juzIsi.some((j) => !Number.isInteger(j.kabir) || !Number.isInteger(j.shoghir) || j.kabir < 0 || j.shoghir < 0)) {
      NotificationStore.addNotification('Jumlah khoto harus bilangan bulat ≥ 0.', 'error'); return;
    }
    if (juzIsi.some((j) => j.nilai_custom !== null && j.nilai_custom !== undefined && !(Number.isFinite(j.nilai_custom) && j.nilai_custom >= 0 && j.nilai_custom <= 100))) {
      NotificationStore.addNotification('Nilai custom harus 0–100.', 'error'); return;
    }
    let alasan: string | null = null;
    if (form.mode === 'koreksi') {
      alasan = await mintaAlasan({ title: 'Alasan koreksi nilai semester', description: 'Nilai lama dibatalkan (tetap tercatat) dan diganti.' });
      if (alasan === null) return;
    }
    setMenyimpan(true);
    try {
      const r: any = await simpanUjian({ santriId: form.s.id, jenis: 'semester', juz: juzIsi, materiJuz: ringkasDaftarJuz(daftarJuz), mode: form.mode, alasan }, { refresh: false });
      if (form.catatan !== catatanDari(form.s.id)) await simpanCatatanRaport(form.s.id, form.catatan, { refresh: false });
      await fetchData();
      NotificationStore.addNotification(`${form.s.nama}: ${tampilNilai(r?.final_score)} (${r?.predikat})${form.mode === 'remedial' ? ' — remedial tersimpan, nilai lama tetap di riwayat' : ''}.`, 'success');
      setForm(null);
    } catch (e) { tampilkanError(e, 'Gagal menyimpan nilai semester'); } finally { setMenyimpan(false); }
  };

  // ---------- Catatan raport massal ----------
  const [catatanDraf, setCatatanDraf] = useState<Record<number, string>>({});
  const simpanCatatanMassal = async () => {
    const isi = Object.entries(catatanDraf);
    let ok = 0; const gagal: string[] = [];
    for (const [sid, c] of isi) {
      try { await simpanCatatanRaport(Number(sid), c, { refresh: false }); ok++; }
      catch (e) { gagal.push(pesanErrorRamah(e)); }
    }
    await fetchData();
    setCatatanDraf({});
    if (ok) NotificationStore.addNotification(`${ok} catatan raport tersimpan.`, 'success');
    if (gagal.length) NotificationStore.addNotification(`${gagal.length} gagal: ${gagal[0]}`, 'error');
  };

  // ---------- Riwayat ----------
  const [riwayatSid, setRiwayatSid] = useState<number | null>(null);
  const riwayat = riwayatSid ? riwayatPercobaan(examAttempts, riwayatSid, 'semester', null) : [];

  // ---------- Ekspor / impor ----------
  const ekspor = () => exportToExcel(baris.flatMap(({ s, h }) => {
    const t = nilaiRaport(s.id);
    const dasar = { ID: s.id, NIS: s.kode || '', Nama: s.nama, Kelas: s.kelas, Halaqah: h.nama };
    if (!t || !t.juz_scores.length) return [{ ...dasar, Juz: '', Kabir: '', Shoghir: '', 'Nilai Custom': '', 'Nilai Juz': '', 'Nilai Akhir': '', Predikat: '' }];
    return t.juz_scores.map((j) => ({ ...dasar, Juz: j.juz, Kabir: j.kabir, Shoghir: j.shoghir, 'Nilai Custom': j.custom ? j.nilai ?? '' : '', 'Nilai Juz': j.nilai ?? '', 'Nilai Akhir': t.final_score ?? '', Predikat: t.predikat || '' }));
  }), `Ujian_Semester_${semester}_${selectedAcademicYear?.name || ''}`.replace(/[\s/]+/g, '_'));
  const fileRef = useRef<HTMLInputElement>(null);
  const impor = async (file: File) => {
    try {
      const data: any[] = await parseSpreadsheet(file);
      const per = new Map<number, JuzKhoto[]>();
      for (const row of data) {
        const key = (k: string) => row[Object.keys(row).find((x) => x.toLowerCase().trim() === k) || ''];
        const id = Number(key('id'));
        const juz = Number(key('juz'));
        if (!id || !(juz >= 1 && juz <= 30) || !baris.some(({ s }) => s.id === id)) continue;
        const list = per.get(id) || [];
        const cust = key('nilai custom');
        list.push({ juz, kabir: Number(key('kabir')) || 0, shoghir: Number(key('shoghir')) || 0,
          nilai_custom: cust === undefined || cust === null || String(cust).trim() === '' ? null : Number(cust) });
        per.set(id, list);
      }
      if (!per.size) { NotificationStore.addNotification('Tidak ada baris yang cocok (kolom ID, Juz, Kabir, Shoghir, Nilai Custom opsional).', 'error'); return; }
      if (!window.confirm(`Simpan nilai semester untuk ${per.size} santri dari file? Santri yang sudah punya nilai disimpan sebagai remedial.`)) return;
      let ok = 0; const gagal: string[] = [];
      for (const [sid, juz] of per) {
        try { await simpanUjian({ santriId: sid, jenis: 'semester', juz, mode: nilaiRaport(sid) ? 'remedial' : 'baru' }, { refresh: false }); ok++; }
        catch (e) { gagal.push(pesanErrorRamah(e)); }
      }
      await fetchData();
      NotificationStore.addNotification(`${ok} santri tersimpan${gagal.length ? `, ${gagal.length} gagal (${gagal[0]})` : ''}.`, gagal.length ? 'error' : 'success');
    } catch (e) { tampilkanError(e, 'Gagal membaca file'); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  };

  if (loading) return <LoadingState label="Memuat ujian semester…" />;

  const tabBtn = (t: Tab, teks: string) => (
    <button type="button" onClick={() => setTab(t)} className={`tab ${tab === t ? 'tab-aktif' : ''}`}>{teks}</button>
  );

  return (
    <div className="space-y-5 pb-12">
      {dialogAlasan}
      <PageHeader
        title="Ujian Semester"
        description={`Khoto per juz → nilai otomatis (nilai awal ${rubrikAktif.initial_score} − kabir×${rubrikAktif.deduction_major} − shoghir×${rubrikAktif.deduction_minor}, minimum ${rubrikAktif.min_score}) · KKM ${rubrikAktif.passing_score} · Semester ${semester}`}
        actions={
          <div className="flex gap-2">
            <button type="button" onClick={ekspor} className="btn btn-secondary"><Download size={15} /> Ekspor</button>
            <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-secondary"><Upload size={15} /> Impor</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && impor(e.target.files[0])} />
          </div>
        }
      />
      <div className="panel-filter"><div className="grid-filter">
        <label className="kontrol-label"><span>Halaqah</span><select className="kontrol-dalam" value={filterHalaqah} onChange={(e) => setFilterHalaqah(e.target.value)}>
            <option value="all">Semua yang saya uji</option>
            {halaqah.filter((h) => boleh.has(Number(h.id)) && !h.is_archived).map((h) => <option key={h.id} value={String(h.id)}>{h.nama}</option>)}
          </select></label>
        <label className="kontrol-label"><span>Cari</span><input className="kontrol-dalam" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Nama santri…" /></label>
      </div></div>
      <div className="tabs">
        {tabBtn('nilai', 'Nilai')}
        {tabBtn('remedial', `Perlu remedial (${baris.filter(({ s }) => nilaiRaport(s.id)?.passed === false).length})`)}
        {tabBtn('catatan', 'Catatan raport')}
      </div>

      {tampil.length === 0 && <EmptyState title={tab === 'remedial' ? 'Tidak ada santri di bawah KKM' : 'Tidak ada santri'} description={tab === 'remedial' ? 'Semua nilai semester sudah memenuhi KKM.' : 'Anda belum menjadi penguji halaqah mana pun pada semester ini.'} />}

      {tab !== 'catatan' && tampil.length > 0 && (
        <div className="wadah-tabel overflow-x-auto">
          <table className="tabel tabel-kartu">
            <thead>
              <tr><th className="text-left">Santri</th><th className="text-left">Materi (juz)</th><th className="text-right">Nilai</th><th className="text-left">Predikat</th><th className="text-right">Aksi</th></tr>
            </thead>
            <tbody>
              {tampil.map(({ s, h }) => {
                const t = nilaiRaport(s.id);
                return (
                  <tr key={s.id}>
                    <td><div className="font-semibold text-slate-800">{s.nama}</div>
                      <div className="text-2xs text-slate-400">{h.nama} · {s.kelas || '-'}{t ? ` · percobaan ${t.attempt_no}${t.is_remedial ? ' (remedial)' : ''}${jumlahSah(s.id) > 1 ? ` · tertinggi dari ${jumlahSah(s.id)} percobaan` : ''}` : ''}{t?.source === 'migrasi' ? ' · data lama' : ''}</div></td>
                    <td data-label="Materi (juz)" className="text-slate-600">{t?.materi_juz || '-'}</td>
                    <td data-label="Nilai" className="text-right font-semibold tabular-nums">{tampilNilai(t?.final_score)}</td>
                    <td data-label="Predikat">{t ? <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${t.passed === false ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{t.predikat}{t.passed === false ? ' · perlu remedial' : ''}</span> : <span className="text-slate-300">-</span>}</td>
                    <td data-label="Aksi" className="text-right whitespace-nowrap">
                      {!t && <button type="button" className="text-xs font-semibold text-blue-700" onClick={() => buka(s, 'baru')}>Input nilai</button>}
                      {t && <button type="button" className="text-xs font-semibold text-blue-700 mr-3 inline-flex items-center gap-1" onClick={() => buka(s, 'remedial')}><RotateCcw size={12} /> Remedial</button>}
                      {t && isAdmin && <button type="button" className="text-xs font-semibold text-amber-700 mr-3 inline-flex items-center gap-1" onClick={() => buka(s, 'koreksi')}><Pencil size={12} /> Koreksi</button>}
                      {t && <button type="button" title="Riwayat" className="text-slate-400 hover:text-slate-700" onClick={() => setRiwayatSid(s.id)}><History size={14} /></button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'catatan' && baris.length > 0 && (
        <div className="space-y-2">
          {baris.map(({ s, h }) => (
            <label key={s.id} className="block rounded-xl border border-slate-200 bg-white p-3 text-xs font-semibold text-slate-600">
              {s.nama} <span className="font-normal text-slate-400">· {h.nama}</span>
              <textarea rows={2} className={`${inputCls} mt-1`} value={catatanDraf[s.id] ?? catatanDari(s.id)} placeholder="Catatan untuk raport…"
                onChange={(e) => setCatatanDraf((d) => ({ ...d, [s.id]: e.target.value }))} />
            </label>
          ))}
          <div className="flex justify-end">
            <button type="button" disabled={Object.keys(catatanDraf).length === 0} onClick={simpanCatatanMassal} className="btn btn-primary"><Save size={15} /> Simpan catatan</button>
          </div>
        </div>
      )}

      <Modal isOpen={Boolean(form)} onClose={() => setForm(null)} title={form ? `${form.mode === 'remedial' ? 'Remedial' : form.mode === 'koreksi' ? 'Koreksi nilai' : 'Nilai ujian semester'} · ${form.s.nama}` : ''} maxWidth="lg">
        {form && (
          <div className="space-y-3 text-sm">
            <label className="block text-xs font-semibold text-slate-600">Materi juz (mis. 1-5, 30)
              <input className={`${inputCls} mt-1`} value={form.materi} onChange={(e) => setForm({ ...form, materi: e.target.value })} />
            </label>
            {daftarJuz.length > 0 && (
              <div className="wadah-tabel">
                <table className="tabel tabel-kartu">
                  <thead><tr><th className="text-left">Juz</th><th className="text-left">Kabir</th><th className="text-left">Shoghir</th><th className="text-left" title="Kosongkan untuk memakai hitungan rubrik">Nilai custom</th><th className="text-right">Nilai</th></tr></thead>
                  <tbody>
                    {daftarJuz.map((j) => (
                      <tr key={j}>
                        <td className="font-semibold">Juz {j}</td>
                        {(['kabir', 'shoghir'] as const).map((k) => (
                          <td key={k} data-label={k === 'kabir' ? 'Kabir' : 'Shoghir'}><input type="number" min={0} step={1} inputMode="numeric" className={`${inputCls.replace('w-full', 'w-20')}`}
                            value={form.juz[j]?.[k] ?? ''} placeholder="0"
                            onChange={(e) => setForm({ ...form, juz: { ...form.juz, [j]: { kabir: form.juz[j]?.kabir ?? '', shoghir: form.juz[j]?.shoghir ?? '', custom: form.juz[j]?.custom ?? '', [k]: e.target.value } } })} /></td>
                        ))}
                        <td data-label="Nilai custom"><input type="number" min={0} max={100} step="any" inputMode="decimal" className={`${inputCls.replace('w-full', 'w-24')}`}
                          value={form.juz[j]?.custom ?? ''} placeholder="otomatis"
                          onChange={(e) => setForm({ ...form, juz: { ...form.juz, [j]: { kabir: form.juz[j]?.kabir ?? '', shoghir: form.juz[j]?.shoghir ?? '', custom: e.target.value } } })} /></td>
                        <td data-label="Nilai" className="text-right tabular-nums">{tampilNilai(nilaiJuzInput(rubrikAktif, juzIsi.find((x) => x.juz === j) || { juz: j, kabir: 0, shoghir: 0 }))}{(form.juz[j]?.custom ?? '').trim() !== '' && <span className="ml-1 text-2xs text-amber-700">custom</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-slate-600">Nilai akhir (rata-rata juz)</span>
              <b>{tampilNilai(preview)} {preview !== null ? `· ${predikatNilai(rubrikAktif, preview)}` : ''}</b>
            </div>
            <label className="block text-xs font-semibold text-slate-600">Catatan raport
              <textarea rows={2} className={`${inputCls} mt-1`} value={form.catatan} onChange={(e) => setForm({ ...form, catatan: e.target.value })} />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className="px-4 py-2 rounded-lg border border-slate-300 font-semibold text-slate-700">Batal</button>
              <button type="button" disabled={menyimpan} onClick={simpan} className="btn btn-primary">{menyimpan ? 'Menyimpan…' : 'Simpan'}</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={riwayatSid !== null} onClose={() => setRiwayatSid(null)} title="Riwayat nilai semester" maxWidth="md">
        <div className="space-y-2 text-sm">
          {riwayat.map((a) => (
            <div key={a.id} className={`rounded-lg border p-2.5 ${a.status === 'voided' ? 'bg-slate-50 text-slate-400' : 'border-slate-200'}`}>
              <div className="flex justify-between"><b className={a.status === 'voided' ? 'line-through' : ''}>Percobaan {a.attempt_no}{a.is_remedial ? ' · remedial' : ''}</b><span>{tampilNilai(a.final_score)} · {a.predikat}</span></div>
              <div className="text-xs">{a.created_at ? new Date(a.created_at).toLocaleString('id-ID') : ''} · juz {a.materi_juz || '-'}{a.source === 'migrasi' ? ' · data lama' : ''}</div>
              {a.juz_scores.length > 0 && <div className="text-xs text-slate-500">{a.juz_scores.map((j) => `J${j.juz}: ${j.kabir}/${j.shoghir} → ${tampilNilai(j.nilai)}${j.custom ? " (custom)" : ""}`).join(' · ')}</div>}
              {a.status === 'voided' && <div className="text-xs">Dibatalkan: {a.void_reason}</div>}
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
};

export default UjianSemesterPage;
