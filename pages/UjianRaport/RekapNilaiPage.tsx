/**
 * Fase 5 · Buku Nilai & Raport (spesifikasi 8).
 *  - Raport per semester, 3 komponen: ujian semester, rata-rata ujian bulanan, kehadiran;
 *    bobot lembaga total 100% (Pengaturan Nilai). Silabus Hafalan dihapus.
 *  - Komponen & nilai akhir dihitung SERVER (rpc_komponen_raport); raport TIDAK bisa terbit bila
 *    ada komponen kurang — daftar kekurangan ditampilkan per santri.
 *  - Terbit = snapshot immutable + kode verifikasi; revisi lewat amandemen beralasan (dijaga server).
 *  - Cetak: tanda tangan digital Ketua Lajnah + ruang tanda tangan wali; raport terbit dicetak dari snapshot.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Download, Eye, FileCheck2, Printer, RefreshCw, Search } from 'lucide-react';
import RaportDocument, { type DataRaport } from '../../components/RaportDocument';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { supabase } from '../../lib/supabaseClient';
import { normalizeRole } from '../../lib/permissions';
import { NotificationStore } from '../../lib/NotificationStore';
import { tampilkanError, pesanErrorRamah } from '../../lib/pesanError';
import { exportToExcel } from '../../lib/utils';
import { PageHeader, LoadingState, EmptyState, StatCard } from '../../components/ui/SaaSPrimitives';
import { useMintaAlasan } from '../../components/ui/AlasanDialog';
import { tampilNilai, type KomponenRaport } from '../../lib/ujian';

const inputCls = 'bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

interface RaportTerbit {
  id: string; santri_id: number; version_no: number; status: string; final_score: number | null; predikat: string | null;
  verification_code: string; published_at: string; snapshot_json: any;
}

const RekapNilaiPage: React.FC = () => {
  const {
    santri, halaqah, studentProgress, periodeEvaluasi, classTargets, selectedAcademicYear, userProfile, loading, orgName,
    masterMarhalahs, pengaturanRaport, komponenRaport, terbitkanRaport, getOrgId, examAttempts,
  } = useSupabaseData();
  const role = normalizeRole(userProfile?.role);
  const isAdmin = role === 'admin' || role === 'superadmin';
  const semester: string = selectedAcademicYear?.active_semester || 'Ganjil';

  const [komponen, setKomponen] = useState<Record<number, KomponenRaport>>({});
  const [terbit, setTerbit] = useState<Record<number, RaportTerbit>>({});
  const [memuat, setMemuat] = useState(false);
  const [filterMarhalah, setFilterMarhalah] = useState('all');
  const [filterStatus, setFilterStatus] = useState<'semua' | 'lengkap' | 'kurang' | 'terbit' | 'berubah'>('semua');
  const [cari, setCari] = useState('');
  const [pilih, setPilih] = useState<Set<number>>(new Set<number>());
  const [proses, setProses] = useState<string | null>(null);
  const [pratinjau, setPratinjau] = useState(false);
  const [dialogAlasan, mintaAlasan] = useMintaAlasan();

  const muat = useCallback(async () => {
    if (!selectedAcademicYear?.id) return;
    setMemuat(true);
    try {
      const [k, rc] = await Promise.all([
        komponenRaport(null),
        (async () => {
          const orgId = await getOrgId();
          const { data, error } = await (supabase as any).from('report_cards').select('*')
            .eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id).eq('semester_name', semester)
            .eq('status', 'published');
          if (error) throw error;
          return (data as any[]) || [];
        })(),
      ]);
      setKomponen(Object.fromEntries(k.map((x: KomponenRaport) => [x.santri_id, x])));
      setTerbit(Object.fromEntries(rc.map((r) => [Number(r.santri_id), { ...r, santri_id: Number(r.santri_id), final_score: r.final_score === null ? null : Number(r.final_score) }])));
    } catch (e) {
      tampilkanError(e, 'Gagal memuat komponen raport');
    } finally {
      setMemuat(false);
    }
  }, [selectedAcademicYear?.id, semester, komponenRaport, getOrgId]);
  // Muat ulang saat nilai ujian berubah (setelah simpan di halaman lain / fetchData)
  useEffect(() => { muat(); }, [muat, examAttempts]);

  // ---------- Info hafalan (dari Rekap Periode) & target ----------
  const infoHafalan = useCallback((s: any) => {
    const urutan = new Map<string, number>(periodeEvaluasi.map((p, i: number) => [p.id, i] as [string, number]));
    const terbaru = (type: string) => studentProgress
      .filter((p) => p.santri_id === s.id && p.progress_type === type)
      .sort((a, b) => (urutan.get(b.month_key) ?? -1) - (urutan.get(a.month_key) ?? -1))[0]?.value;
    const juz = (v?: string) => (v === undefined || v === '' ? undefined : `${Number(v)} juz`);
    const depan = juz(terbaru('Hafalan Depan'));
    const belakang = juz(terbaru('Hafalan Belakang'));
    const target = (classTargets || []).find((t) => (t.semester === semester || !t.semester) && t.marhalah === s.marhalah && t.kelas === s.kelas);
    return {
      target_hafalan: target?.target_hafalan ? `${target.target_hafalan} juz` : undefined,
      hafalan_depan: depan ? `${depan}${terbaru('Surat Ayat Depan') ? ` (${terbaru('Surat Ayat Depan')})` : ''}` : undefined,
      hafalan_belakang: belakang ? `${belakang}${terbaru('Surat Ayat Belakang') ? ` (${terbaru('Surat Ayat Belakang')})` : ''}` : undefined,
      total_hafalan: juz(terbaru('Total Hafalan')),
    };
  }, [studentProgress, periodeEvaluasi, classTargets, semester]);

  // ---------- Baris ----------
  const halaqahSantri = useMemo(() => {
    const m = new Map<number, string>();
    halaqah.forEach((h) => (h.santri || []).forEach((s) => m.set(Number(s.id), h.nama)));
    return m;
  }, [halaqah]);
  const baris = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return santri
      .filter((s) => komponen[s.id])
      .filter((s) => filterMarhalah === 'all' || s.marhalah === filterMarhalah)
      .filter((s) => !q || s.nama.toLowerCase().includes(q))
      .map((s) => {
        const k = komponen[s.id];
        const rc = terbit[s.id];
        const berubah = Boolean(rc && k.lengkap && Number(rc.final_score) !== Number(k.nilai_akhir));
        return { s, k, rc, berubah };
      })
      .filter(({ k, rc, berubah }) => filterStatus === 'semua'
        || (filterStatus === 'lengkap' && k.lengkap && !rc) || (filterStatus === 'kurang' && !k.lengkap)
        || (filterStatus === 'terbit' && rc) || (filterStatus === 'berubah' && berubah))
      .sort((a, b) => (a.s.kelas || '').localeCompare(b.s.kelas || '') || a.s.nama.localeCompare(b.s.nama));
  }, [santri, komponen, terbit, filterMarhalah, filterStatus, cari]);
  const ringkas = useMemo(() => {
    const semua = santri.filter((s) => komponen[s.id]);
    return {
      total: semua.length,
      lengkap: semua.filter((s) => komponen[s.id].lengkap).length,
      terbit: semua.filter((s) => terbit[s.id]).length,
    };
  }, [santri, komponen, terbit]);

  // ---------- Terbit & amandemen ----------
  const terbitkan = async (target: number[], alasan: string | null) => {
    let ok = 0; const gagal: string[] = [];
    setProses(`Menerbitkan 0/${target.length}…`);
    for (const [i, sid] of target.entries()) {
      const s = santri.find((x) => x.id === sid);
      try {
        const r: any = await terbitkanRaport(sid, infoHafalan(s), alasan);
        if (!r?.is_duplicate_prevented) ok++;
      } catch (e) { gagal.push(`${s?.nama || sid}: ${pesanErrorRamah(e)}`); }
      setProses(`Menerbitkan ${i + 1}/${target.length}…`);
    }
    setProses(null);
    await muat();
    if (ok) NotificationStore.addNotification(`${ok} raport diterbitkan.`, 'success');
    if (!ok && !gagal.length) NotificationStore.addNotification('Tidak ada perubahan: raport sudah terbit dengan nilai yang sama.', 'info');
    if (gagal.length) NotificationStore.addNotification(`${gagal.length} gagal — ${gagal.slice(0, 2).join(' · ')}`, 'error');
  };
  const terbitkanPilihan = async () => {
    const target = Array.from<number>(pilih).filter((sid) => komponen[sid]?.lengkap && !terbit[sid]);
    const kurang = Array.from<number>(pilih).filter((sid) => !komponen[sid]?.lengkap).length;
    if (!target.length) {
      NotificationStore.addNotification(kurang ? `${kurang} santri terpilih belum lengkap komponennya.` : 'Pilih santri yang lengkap dan belum terbit. Raport terbit yang berubah memakai Amandemen.', 'info');
      return;
    }
    if (!window.confirm(`Terbitkan ${target.length} raport? Raport terbit tidak bisa diubah kecuali lewat amandemen.${kurang ? ` (${kurang} santri belum lengkap dilewati)` : ''}`)) return;
    await terbitkan(target, null);
    setPilih(new Set());
  };
  const amandemen = async (sid: number) => {
    const s = santri.find((x) => x.id === sid);
    const alasan = await mintaAlasan({ title: `Amandemen raport ${s?.nama || ''}`, description: `Raport v${terbit[sid]?.version_no} tetap tersimpan; versi baru diterbitkan dengan nilai terkini.`, confirmLabel: 'Terbitkan amandemen' });
    if (alasan === null) return;
    await terbitkan([sid], alasan);
  };

  // ---------- Data cetak ----------
  const dataCetak = (sid: number): DataRaport | null => {
    const s = santri.find((x) => x.id === sid);
    const rc = terbit[sid];
    const k: KomponenRaport | undefined = rc?.snapshot_json?.komponen ?? komponen[sid];
    if (!s || !k) return null;
    const snap = rc?.snapshot_json;
    return {
      santri: { id: s.id, nama: snap?.santri_nama || s.nama, marhalah: s.marhalah, kelas: s.kelas, marhalah_id: (s as any).marhalah_id, kelas_id: (s as any).kelas_id },
      juz: (k.semester?.juz || []).map((j) => ({ juz: Number(j.juz), kabir: Number(j.kabir), shoghir: Number(j.shoghir), nilai: j.nilai === undefined ? null : Number(j.nilai) })),
      bulanan: (k.bulanan?.daftar || []).map((b) => ({ ke: Number(b.ke), label: b.label, nilai: b.nilai === null ? null : Number(b.nilai) })),
      nilaiSemester: k.semester?.nilai ?? null,
      rataBulanan: k.bulanan?.rata_rata ?? null,
      kehadiran: k.kehadiran?.persen ?? null,
      bobot: { semester: Number(k.bobot?.semester), bulanan: Number(k.bobot?.bulanan), kehadiran: Number(k.bobot?.kehadiran) },
      nilaiAkhir: rc ? rc.final_score : k.nilai_akhir,
      predikat: rc ? rc.predikat : k.predikat,
      catatan: k.catatan,
      info: snap?.info ?? infoHafalan(s),
      terbit: rc ? { versi: rc.version_no, kode: rc.verification_code, tanggal: rc.published_at } : null,
    };
  };
  const cetakList = Array.from<number>(pilih).map(dataCetak).filter(Boolean) as DataRaport[];
  const ttd = {
    nama: pengaturanRaport.ketua_lajnah_nama, jabatan: pengaturanRaport.ketua_lajnah_jabatan,
    kota: pengaturanRaport.kota_terbit, gambar: pengaturanRaport.ttd_image,
  };
  const verifyUrl = typeof window !== 'undefined' ? `${window.location.origin}/verify` : undefined;
  const cetak = () => {
    if (!cetakList.length) { NotificationStore.addNotification('Pilih santri yang akan dicetak.', 'info'); return; }
    window.print();
  };

  const ekspor = () => exportToExcel(baris.map(({ s, k, rc }, i) => ({
    No: i + 1, ID: s.id, NIS: s.kode || '', Nama: s.nama, Kelas: s.kelas, Halaqah: halaqahSantri.get(s.id) || '',
    'Ujian Semester': k.semester?.nilai ?? '', 'Rata-rata Ujian Bulanan': k.bulanan.rata_rata ?? '', 'Kehadiran (%)': k.kehadiran.persen ?? '',
    'Nilai Akhir': k.nilai_akhir ?? '', Predikat: k.predikat || '', Kekurangan: k.kekurangan.join('; '),
    'Status Raport': rc ? `Terbit v${rc.version_no}` : 'Belum terbit', 'Kode Verifikasi': rc?.verification_code || '',
  })), `Buku_Nilai_${semester}_${selectedAcademicYear?.name || ''}`.replace(/[\s/]+/g, '_'));

  if (loading) return <LoadingState label="Memuat buku nilai…" />;

  const semuaTerpilih = baris.length > 0 && baris.every(({ s }) => pilih.has(s.id));
  const bobot = pengaturanRaport;

  return (
    <div className="space-y-5 pb-12 print:p-0 print:space-y-0">
      {dialogAlasan}
      <div className="print:hidden space-y-5">
        <PageHeader
          title="Buku Nilai & Raport"
          description={`Semester ${semester} ${selectedAcademicYear?.name || ''} · Bobot: ujian semester ${bobot.bobot_semester}% · ujian bulanan ${bobot.bobot_bulanan}% · kehadiran ${bobot.bobot_kehadiran}%`}
          actions={
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={muat} className="btn btn-secondary"><RefreshCw size={15} /> Muat ulang</button>
              <button type="button" onClick={ekspor} className="btn btn-secondary"><Download size={15} /> Ekspor</button>
              <button type="button" onClick={() => setPratinjau(true)} disabled={!pilih.size} className="btn btn-secondary"><Eye size={15} /> Pratinjau ({pilih.size})</button>
              <button type="button" onClick={cetak} disabled={!pilih.size} className="btn btn-secondary"><Printer size={15} /> Cetak ({pilih.size})</button>
              {isAdmin && <button type="button" onClick={terbitkanPilihan} disabled={!pilih.size || Boolean(proses)} className="btn btn-primary"><FileCheck2 size={15} /> Terbitkan ({pilih.size})</button>}
            </div>
          }
        />

        {!pengaturanRaport.ketua_lajnah_nama && isAdmin && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> Nama & tanda tangan Ketua Lajnah belum diatur. Atur di Ujian &amp; Raport &gt; Pengaturan Nilai agar tercetak di raport.
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Total santri" value={ringkas.total} />
          <StatCard label="Siap terbit" value={ringkas.lengkap} tone="success" />
          <StatCard label="Sudah terbit" value={ringkas.terbit} tone="primary" meta={proses || undefined} />
        </div>

        <div className="panel-filter"><div className="grid-filter sm:grid-cols-3 lg:grid-cols-3">
          <label className="kontrol-label"><span>Marhalah</span><select className="kontrol-dalam" value={filterMarhalah} onChange={(e) => setFilterMarhalah(e.target.value)}>
              <option value="all">Semua</option>
              {(masterMarhalahs || []).map((m) => <option key={m.id} value={m.nama}>{m.nama}</option>)}
            </select></label>
          <label className="kontrol-label"><span>Status</span><select className="kontrol-dalam" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)}>
              <option value="semua">Semua</option>
              <option value="kurang">Belum lengkap</option>
              <option value="lengkap">Siap terbit</option>
              <option value="terbit">Sudah terbit</option>
              <option value="berubah">Terbit tapi nilai berubah</option>
            </select></label>
          <label className="kontrol-label"><span>Cari</span><input className="kontrol-dalam" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Nama santri…" /></label>
        </div></div>

        {memuat && !Object.keys(komponen).length ? <LoadingState rows={4} label="Menghitung komponen raport…" /> : baris.length === 0 ? (
          <EmptyState title="Tidak ada santri" description="Tidak ada santri yang cocok dengan filter, atau Anda belum menjadi penguji pada semester ini." />
        ) : (
          <div className="wadah-tabel overflow-x-auto">
            <table className="tabel tabel-kartu">
              <thead>
                <tr>
                  <th className="w-8"><input type="checkbox" checked={semuaTerpilih} onChange={() => setPilih(semuaTerpilih ? new Set() : new Set(baris.map(({ s }) => s.id)))} /></th>
                  <th className="text-left">Santri</th>
                  <th className="text-right">Semester</th>
                  <th className="text-right">Bulanan</th>
                  <th className="text-right">Hadir</th>
                  <th className="text-right">Nilai akhir</th>
                  <th className="text-left">Kelengkapan</th>
                  <th className="text-left">Raport</th>
                </tr>
              </thead>
              <tbody>
                {baris.map(({ s, k, rc, berubah }) => (
                  <tr key={s.id} className={pilih.has(s.id) ? 'bg-blue-50/40' : ''}>
                    <td><input type="checkbox" checked={pilih.has(s.id)} onChange={() => setPilih((p) => { const n = new Set(p); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })} /></td>
                    <td><div className="font-semibold text-slate-800">{s.nama}</div><div className="text-2xs text-slate-400">{s.kelas || '-'} · {halaqahSantri.get(s.id) || '-'}</div></td>
                    <td data-label="Semester" className="text-right tabular-nums">{tampilNilai(k.semester?.nilai)}{k.semester?.is_remedial ? <span className="text-2xs text-slate-400"> R</span> : null}</td>
                    <td data-label="Bulanan" className="text-right tabular-nums">{k.bobot.bulanan > 0 ? tampilNilai(k.bulanan.rata_rata) : '-'}<div className="text-2xs text-slate-400">{k.bulanan.jumlah_nilai}/{k.bulanan.jumlah_ujian}</div></td>
                    <td data-label="Hadir" className="text-right tabular-nums">{k.kehadiran.persen !== null ? `${tampilNilai(k.kehadiran.persen)}%` : '-'}</td>
                    <td data-label="Nilai akhir" className="text-right"><b className="tabular-nums">{tampilNilai(k.nilai_akhir)}</b>{k.predikat && <div className="text-2xs text-slate-500">{k.predikat}</div>}</td>
                    <td data-label="Kelengkapan" className="text-xs">
                      {k.lengkap ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={13} /> Lengkap</span>
                        : <ul className="text-red-700 list-disc pl-4">{k.kekurangan.map((x) => <li key={x}>{x}</li>)}</ul>}
                      {k.peringatan.length > 0 && <div className="text-amber-700 mt-0.5">{k.peringatan.join('; ')}</div>}
                    </td>
                    <td data-label="Raport" className="text-xs whitespace-nowrap">
                      {rc ? (
                        <div>
                          <span className="font-semibold text-blue-700">Terbit v{rc.version_no}</span> <span className="text-slate-400">{rc.verification_code}</span>
                          {berubah && <div className="text-amber-700">Nilai berubah ({tampilNilai(rc.final_score)} → {tampilNilai(k.nilai_akhir)})</div>}
                          {isAdmin && berubah && <button type="button" className="font-semibold text-amber-700 underline" onClick={() => amandemen(s.id)}>Amandemen</button>}
                        </div>
                      ) : <span className="text-slate-400">Belum terbit</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tampilan cetak */}
      <div className="hidden print:block">
        {cetakList.map((d, i) => (
          <div key={d.santri.id} className="raport-print-wrapper" style={{ pageBreakAfter: i === cetakList.length - 1 ? 'auto' : 'always' }}>
            <RaportDocument d={d} semester={semester} tahunAjaran={selectedAcademicYear?.name || ''} orgName={orgName} ttd={ttd} verifyUrl={verifyUrl} />
          </div>
        ))}
      </div>

      {pratinjau && createPortal(
        <div className="fixed inset-0 z-[999999] bg-slate-800/90 overflow-y-auto p-4 sm:p-8 print:hidden">
          <div className="fixed top-4 right-4 z-[1000000] flex gap-2">
            <button type="button" onClick={() => { setPratinjau(false); setTimeout(cetak, 100); }} className="btn btn-primary"><Printer size={16} /> Cetak</button>
            <button type="button" onClick={() => setPratinjau(false)} className="bg-white text-slate-700 px-4 py-2 rounded-lg font-bold shadow-lg">Tutup</button>
          </div>
          <div className="flex flex-col gap-8 items-center mt-12">
            {cetakList.map((d) => (
              <div key={d.santri.id} className="shadow-2xl bg-white">
                <RaportDocument d={d} semester={semester} tahunAjaran={selectedAcademicYear?.name || ''} orgName={orgName} ttd={ttd} verifyUrl={verifyUrl} />
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default RekapNilaiPage;
