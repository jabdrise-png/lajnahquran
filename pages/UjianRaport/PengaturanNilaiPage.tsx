/**
 * Fase 5 · Pengaturan Nilai (Admin).
 *  1. Rubrik penilaian: nilai awal per juz, pengurang khoto kabir/shoghir, nilai minimum, KKM, skala predikat.
 *     Disimpan berversi (rpc_save_rubric_version); nilai ujian lama tetap memakai rubrik saat itu.
 *  2. Raport: bobot 3 komponen (total 100%), nama/jabatan Ketua Lajnah, kota, tanda tangan digital.
 *  3. Penguji: musammi' penguji per halaqah untuk semester aktif ("halaqah ujian").
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Save, Trash2, Upload } from 'lucide-react';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { supabase } from '../../lib/supabaseClient';
import { NotificationStore } from '../../lib/NotificationStore';
import { tampilkanError } from '../../lib/pesanError';
import { PageHeader, LoadingState } from '../../components/ui/SaaSPrimitives';
import { cekBobot, nilaiJuz, predikatNilai, type Rubrik } from '../../lib/ujian';

const inputCls = 'w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
const Kartu: React.FC<{ judul: string; ket: string; children: React.ReactNode; aksi?: React.ReactNode }> = ({ judul, ket, children, aksi }) => (
  <section className="rounded-xl border border-slate-200 bg-white">
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
      <div><h2 className="text-base font-bold text-slate-900">{judul}</h2><p className="text-xs text-slate-500 mt-0.5">{ket}</p></div>
      {aksi}
    </div>
    <div className="p-5 space-y-4">{children}</div>
  </section>
);

const PengaturanNilaiPage: React.FC = () => {
  const {
    loading, rubrikAktif, pengaturanRaport, pengujiUjian, halaqah, musammi, selectedAcademicYear, getOrgId, fetchData,
    simpanPengaturanRaport, tambahPenguji, hapusPenguji,
  } = useSupabaseData();
  const semester: string = selectedAcademicYear?.active_semester || 'Ganjil';

  // ---------- Rubrik ----------
  const [rubrik, setRubrik] = useState<Rubrik>(rubrikAktif);
  const [catatanVersi, setCatatanVersi] = useState('');
  const [predBaru, setPredBaru] = useState({ label: '', min: '' });
  const [sim, setSim] = useState({ kabir: 1, shoghir: 2 });
  const [simpanRubrikBusy, setSimpanRubrikBusy] = useState(false);
  useEffect(() => { setRubrik(rubrikAktif); }, [rubrikAktif]);

  const simpanRubrik = async () => {
    if (rubrik.min_score > rubrik.initial_score) { NotificationStore.addNotification('Nilai minimum tidak boleh melebihi nilai awal.', 'error'); return; }
    if (!rubrik.predicates.length) { NotificationStore.addNotification('Skala predikat minimal satu.', 'error'); return; }
    setSimpanRubrikBusy(true);
    try {
      const orgId = await getOrgId();
      const { error } = await (supabase as any).rpc('rpc_save_rubric_version', {
        p_org_id: orgId, p_academic_year_id: selectedAcademicYear?.id || null, p_semester: semester,
        p_name: catatanVersi.trim() ? `Rubrik — ${catatanVersi.trim()}` : `Rubrik Penilaian (${selectedAcademicYear?.name || ''})`,
        p_initial_score: rubrik.initial_score, p_deduction_minor: rubrik.deduction_minor, p_deduction_major: rubrik.deduction_major,
        p_min_score: rubrik.min_score, p_passing_score: rubrik.passing_score,
        p_predicates: [...rubrik.predicates].sort((a, b) => b.minScore - a.minScore),
        p_reason: catatanVersi.trim() || 'Pembaruan rubrik penilaian',
      });
      if (error) throw error;
      setCatatanVersi('');
      await fetchData();
      NotificationStore.addNotification('Rubrik penilaian disimpan. Nilai ujian yang sudah ada tidak berubah.', 'success');
    } catch (e) { tampilkanError(e, 'Gagal menyimpan rubrik'); } finally { setSimpanRubrikBusy(false); }
  };

  // ---------- Raport ----------
  const [raport, setRaport] = useState(pengaturanRaport);
  useEffect(() => { setRaport(pengaturanRaport); }, [pengaturanRaport]);
  const errBobot = cekBobot(raport);
  const [simpanRaportBusy, setSimpanRaportBusy] = useState(false);
  const simpanRaport = async () => {
    if (errBobot) { NotificationStore.addNotification(errBobot, 'error'); return; }
    setSimpanRaportBusy(true);
    try {
      await simpanPengaturanRaport({
        bobot_semester: Number(raport.bobot_semester), bobot_bulanan: Number(raport.bobot_bulanan), bobot_kehadiran: Number(raport.bobot_kehadiran),
        ketua_lajnah_nama: raport.ketua_lajnah_nama, ketua_lajnah_jabatan: raport.ketua_lajnah_jabatan || 'Ketua Lajnah',
        kota_terbit: raport.kota_terbit, ttd_image: raport.ttd_image,
      });
      NotificationStore.addNotification('Pengaturan raport disimpan.', 'success');
    } catch (e) { tampilkanError(e, 'Gagal menyimpan pengaturan raport'); } finally { setSimpanRaportBusy(false); }
  };
  const unggahTtd = (file: File) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { NotificationStore.addNotification('Gunakan gambar PNG/JPG/WebP (PNG latar transparan disarankan).', 'error'); return; }
    if (file.size > 280 * 1024) { NotificationStore.addNotification('Ukuran gambar maksimal 280 KB.', 'error'); return; }
    const r = new FileReader();
    r.onload = () => setRaport((x) => ({ ...x, ttd_image: String(r.result) }));
    r.readAsDataURL(file);
  };

  // ---------- Penguji ----------
  const [penguji, setPenguji] = useState({ halaqah: '', musammi: '', jenis: 'semua' as 'semua' | 'bulanan' | 'semester' });
  const pengujiSemester = useMemo(() => pengujiUjian.filter((p) => p.semester === semester), [pengujiUjian, semester]);
  const namaHalaqah = (id: number) => halaqah.find((h) => Number(h.id) === Number(id))?.nama || `#${id}`;
  const namaMusammi = (id: number) => musammi.find((m) => Number(m.id) === Number(id))?.nama || `#${id}`;

  if (loading) return <LoadingState label="Memuat pengaturan nilai…" />;
  const contohNilai = nilaiJuz(rubrik, sim.kabir, sim.shoghir);

  return (
    <div className="space-y-6 pb-12 max-w-5xl">
      <PageHeader title="Pengaturan Nilai" description={`Rubrik ujian, bobot raport, tanda tangan Ketua Lajnah, dan penguji · Semester ${semester} ${selectedAcademicYear?.name || ''}`} />

      <Kartu judul="Rubrik Penilaian Ujian" ket={`Versi aktif: v${rubrikAktif.version_no ?? '-'} ${rubrikAktif.name ? `· ${rubrikAktif.name}` : ''}. Nilai juz = nilai awal − kabir × pengurang kabir − shoghir × pengurang shoghir (tidak di bawah nilai minimum).`}
        aksi={<button type="button" disabled={simpanRubrikBusy} onClick={simpanRubrik} className="btn btn-primary"><Save size={15} /> Simpan rubrik</button>}>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {([['initial_score', 'Nilai awal / juz'], ['deduction_major', 'Pengurang kabir'], ['deduction_minor', 'Pengurang shoghir'], ['min_score', 'Nilai minimum / juz'], ['passing_score', 'KKM (lulus)']] as const).map(([k, l]) => (
            <label key={k} className="text-xs font-semibold text-slate-600">{l}
              <input type="number" step="any" min={0} max={100} className={`${inputCls} mt-1`} value={rubrik[k]} onChange={(e) => setRubrik({ ...rubrik, [k]: Number(e.target.value) })} />
            </label>
          ))}
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-600 mb-1.5">Skala predikat (dipakai ujian bulanan, ujian semester, dan raport)</div>
          <div className="flex flex-wrap gap-2">
            {[...rubrik.predicates].sort((a, b) => b.minScore - a.minScore).map((p) => (
              <span key={p.label} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                {p.label} ≥ {p.minScore}
                <button type="button" title="Hapus" className="text-slate-400 hover:text-red-600" onClick={() => setRubrik({ ...rubrik, predicates: rubrik.predicates.filter((x) => x.label !== p.label) })}>×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2 mt-2 max-w-md">
            <input className={inputCls} placeholder="Predikat" value={predBaru.label} onChange={(e) => setPredBaru({ ...predBaru, label: e.target.value })} />
            <input type="number" className={`${inputCls.replace('w-full', 'w-28')}`} placeholder="Min" value={predBaru.min} onChange={(e) => setPredBaru({ ...predBaru, min: e.target.value })} />
            <button type="button" disabled={!predBaru.label.trim() || predBaru.min === ''} className="px-3 rounded-lg bg-slate-800 text-white disabled:opacity-50"
              onClick={() => { setRubrik({ ...rubrik, predicates: [...rubrik.predicates.filter((x) => x.label !== predBaru.label.trim()), { label: predBaru.label.trim(), minScore: Number(predBaru.min) }] }); setPredBaru({ label: '', min: '' }); }}><Plus size={14} /></button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <span className="font-semibold text-slate-600">Coba:</span> kabir
          <input type="number" min={0} className={`${inputCls.replace('w-full', 'w-20')}`} value={sim.kabir} onChange={(e) => setSim({ ...sim, kabir: Number(e.target.value) || 0 })} /> shoghir
          <input type="number" min={0} className={`${inputCls.replace('w-full', 'w-20')}`} value={sim.shoghir} onChange={(e) => setSim({ ...sim, shoghir: Number(e.target.value) || 0 })} />
          → nilai juz <b>{contohNilai}</b> ({predikatNilai(rubrik, contohNilai)}{contohNilai < rubrik.passing_score ? ', perlu remedial' : ''})
        </div>
        <label className="block text-xs font-semibold text-slate-600 max-w-md">Catatan versi (opsional)
          <input className={`${inputCls} mt-1`} value={catatanVersi} onChange={(e) => setCatatanVersi(e.target.value)} placeholder="mis. Pengurang shoghir dinaikkan" />
        </label>
      </Kartu>

      <Kartu judul="Raport" ket="Raport per semester terdiri dari 3 komponen dengan bobot total 100%. Raport tidak bisa terbit bila komponen berbobot > 0 masih kosong."
        aksi={<button type="button" disabled={simpanRaportBusy || Boolean(errBobot)} onClick={simpanRaport} className="btn btn-primary"><Save size={15} /> Simpan raport</button>}>
        <div className="grid grid-cols-3 gap-3 max-w-xl">
          {([['bobot_semester', 'Ujian semester (%)'], ['bobot_bulanan', 'Rata-rata ujian bulanan (%)'], ['bobot_kehadiran', 'Kehadiran (%)']] as const).map(([k, l]) => (
            <label key={k} className="text-xs font-semibold text-slate-600">{l}
              <input type="number" min={0} max={100} step="any" className={`${inputCls} mt-1`} value={raport[k]} onChange={(e) => setRaport({ ...raport, [k]: Number(e.target.value) })} />
            </label>
          ))}
        </div>
        <p className={`text-xs ${errBobot ? 'text-red-700' : 'text-emerald-700'}`}>{errBobot || `Total ${Number(raport.bobot_semester) + Number(raport.bobot_bulanan) + Number(raport.bobot_kehadiran)}% ✓`}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-xs font-semibold text-slate-600">Nama Ketua Lajnah
            <input className={`${inputCls} mt-1`} value={raport.ketua_lajnah_nama || ''} onChange={(e) => setRaport({ ...raport, ketua_lajnah_nama: e.target.value })} />
          </label>
          <label className="text-xs font-semibold text-slate-600">Jabatan
            <input className={`${inputCls} mt-1`} value={raport.ketua_lajnah_jabatan || ''} onChange={(e) => setRaport({ ...raport, ketua_lajnah_jabatan: e.target.value })} />
          </label>
          <label className="text-xs font-semibold text-slate-600">Kota (di atas tanggal raport)
            <input className={`${inputCls} mt-1`} value={raport.kota_terbit || ''} onChange={(e) => setRaport({ ...raport, kota_terbit: e.target.value })} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="h-24 w-56 rounded-lg border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden">
            {raport.ttd_image ? <img src={raport.ttd_image} alt="Tanda tangan Ketua Lajnah" className="max-h-full max-w-full object-contain mix-blend-multiply" /> : <span className="text-xs text-slate-400">Belum ada tanda tangan</span>}
          </div>
          <div className="space-y-2">
            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 cursor-pointer">
              <Upload size={15} /> Unggah tanda tangan
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && unggahTtd(e.target.files[0])} />
            </label>
            {raport.ttd_image && <button type="button" className="block text-xs font-semibold text-red-600" onClick={() => setRaport({ ...raport, ttd_image: null })}>Hapus tanda tangan</button>}
            <p className="text-2xs text-slate-400 max-w-xs">PNG latar transparan, maks. 280 KB. Tanda tangan tersimpan di server lembaga (bukan di perangkat ini) dan hanya tercetak pada raport yang sudah terbit.</p>
          </div>
        </div>
      </Kartu>

      <Kartu judul={`Penguji Ujian · Semester ${semester}`} ket="Selain musammi' halaqahnya sendiri, Admin dapat menugaskan musammi' lain sebagai penguji untuk seluruh santri satu halaqah (halaqah ujian).">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
          <label className="text-xs font-semibold text-slate-600">Halaqah
            <select className={`${inputCls} mt-1`} value={penguji.halaqah} onChange={(e) => setPenguji({ ...penguji, halaqah: e.target.value })}>
              <option value="">— pilih —</option>
              {halaqah.filter((h) => !h.is_archived).map((h) => <option key={h.id} value={h.id}>{h.nama}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Musammi' penguji
            <select className={`${inputCls} mt-1`} value={penguji.musammi} onChange={(e) => setPenguji({ ...penguji, musammi: e.target.value })}>
              <option value="">— pilih —</option>
              {musammi.map((m) => <option key={m.id} value={m.id}>{m.nama}{m.user_id ? '' : ' (belum punya akun)'}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Ujian
            <select className={`${inputCls} mt-1`} value={penguji.jenis} onChange={(e) => setPenguji({ ...penguji, jenis: e.target.value as any })}>
              <option value="semua">Bulanan & semester</option><option value="bulanan">Bulanan saja</option><option value="semester">Semester saja</option>
            </select>
          </label>
          <button type="button" disabled={!penguji.halaqah || !penguji.musammi} className="btn btn-primary justify-center"
            onClick={async () => {
              try { await tambahPenguji(Number(penguji.halaqah), Number(penguji.musammi), penguji.jenis); setPenguji({ halaqah: '', musammi: '', jenis: 'semua' }); NotificationStore.addNotification('Penguji ditambahkan.', 'success'); }
              catch (e) { tampilkanError(e, 'Gagal menambah penguji'); }
            }}><Plus size={15} /> Tambah</button>
        </div>
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {pengujiSemester.length === 0 && <p className="px-3 py-3 text-sm text-slate-400">Belum ada penugasan. Musammi' tetap bisa menguji santri halaqahnya sendiri.</p>}
          {pengujiSemester.map((p) => (
            <div key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="flex-1"><b>{namaMusammi(p.musammi_id)}</b> menguji <b>{namaHalaqah(p.halaqah_id)}</b> <span className="text-slate-400">· {p.exam_type === 'semua' ? 'bulanan & semester' : p.exam_type}</span></span>
              <button type="button" title="Hapus" className="text-slate-400 hover:text-red-600" onClick={() => hapusPenguji(p.id).catch((e) => tampilkanError(e, 'Gagal menghapus penguji'))}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </Kartu>
    </div>
  );
};

export default PengaturanNilaiPage;
