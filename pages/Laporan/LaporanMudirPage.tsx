/**
 * Fase 6 · Laporan Mudir (Admin) — PDF rekap lembaga dari Rekap Periode.
 *  - Bulanan: satu periode evaluasi (periode lembaga umumnya bulanan).
 *  - Semester: semua periode dalam tanggal semester aktif + ringkasan ujian & raport (komponen server).
 * Pratinjau di layar = isi PDF.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { supabase } from '../../lib/supabaseClient';
import { NotificationStore } from '../../lib/NotificationStore';
import { tampilkanError } from '../../lib/pesanError';
import { PageHeader, LoadingState, EmptyState } from '../../components/ui/SaaSPrimitives';
import { periodeDalamRentang, rekapLembaga, ringkasUjian, fmt } from '../../lib/laporanMudir';
import { buatPdfMudir } from '../../lib/laporanMudirPdf';

const tgl = (d?: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-');

const LaporanMudirPage: React.FC = () => {
  const {
    loading, evaluationPeriods, periodRecaps, periodForms, halaqah, allSantri, orgName, selectedAcademicYear,
    activeSemesterDates, komponenRaport, getOrgId,
  } = useSupabaseData();
  const semester: string = selectedAcademicYear?.active_semester || 'Ganjil';
  const [jenis, setJenis] = useState<'bulanan' | 'semester'>('bulanan');
  const [periodeId, setPeriodeId] = useState('');
  const [rincian, setRincian] = useState(true);
  const [ujian, setUjian] = useState<ReturnType<typeof ringkasUjian> | null>(null);
  const [memuatUjian, setMemuatUjian] = useState(false);

  const daftarPeriode = useMemo(() => [...(evaluationPeriods as any[])].filter((p) => !p.needs_review)
    .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date))), [evaluationPeriods]);
  useEffect(() => {
    if (!periodeId && daftarPeriode.length) {
      const hariIni = new Date().toISOString().slice(0, 10);
      const selesai = daftarPeriode.find((p) => p.end_date < hariIni) || daftarPeriode[0];
      setPeriodeId(selesai.id);
    }
  }, [daftarPeriode, periodeId]);

  const periodeDipakai = useMemo(() => {
    if (jenis === 'bulanan') return daftarPeriode.filter((p) => p.id === periodeId);
    return periodeDalamRentang(daftarPeriode as any, activeSemesterDates?.startDate || null, activeSemesterDates?.endDate || null);
  }, [jenis, periodeId, daftarPeriode, activeSemesterDates]);

  const data = useMemo(() => rekapLembaga({
    periode: periodeDipakai as any, recaps: periodRecaps as any, forms: periodForms as any,
    halaqah: halaqah as any, santri: allSantri as any,
  }), [periodeDipakai, periodRecaps, periodForms, halaqah, allSantri]);

  // Ringkasan ujian & raport (semester) dari server
  useEffect(() => {
    if (jenis !== 'semester') { setUjian(null); return; }
    let batal = false;
    (async () => {
      setMemuatUjian(true);
      try {
        const orgId = await getOrgId();
        const [k, rc] = await Promise.all([
          komponenRaport(null),
          (supabase as any).from('report_cards').select('id', { count: 'exact', head: true })
            .eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear?.id).eq('semester_name', semester).eq('status', 'published'),
        ]);
        if (!batal) setUjian(ringkasUjian(k as any, rc?.count || 0));
      } catch (e) {
        if (!batal) { setUjian(null); tampilkanError(e, 'Ringkasan ujian tidak bisa dimuat'); }
      } finally { if (!batal) setMemuatUjian(false); }
    })();
    return () => { batal = true; };
  }, [jenis, komponenRaport, getOrgId, selectedAcademicYear?.id, semester]);

  const judul = jenis === 'bulanan' ? 'Laporan Bulanan' : `Laporan Semester ${semester}`;
  const subjudul = jenis === 'bulanan'
    ? (periodeDipakai[0] ? `${/^periode\b/i.test(periodeDipakai[0].name) ? '' : 'Periode '}${periodeDipakai[0].name} (${tgl(periodeDipakai[0].start_date)} – ${tgl(periodeDipakai[0].end_date)})` : '-')
    : `Tahun ajaran ${selectedAcademicYear?.name || '-'} · ${activeSemesterDates?.startDate ? `${tgl(activeSemesterDates.startDate)} – ${tgl(activeSemesterDates.endDate)}` : 'tanggal semester belum diatur'} · ${periodeDipakai.length} periode`;
  const catatan = [
    'Sumber: Rekap Periode (Mode Harian dihitung otomatis dari setoran & absensi; Mode Rekap diisi musammi\').',
    ...(jenis === 'semester' ? ['Semester: ziyadah & murojaah dijumlah; kehadiran = total hadir / total sesi; total hafalan & kelancaran dari periode terakhir.'] : []),
    ...(data.ringkas.form_terkirim < data.ringkas.form_total ? [`${data.ringkas.form_total - data.ringkas.form_terkirim} form periode belum terkirim — angkanya bisa masih berubah.`] : []),
  ];

  const unduh = () => {
    if (!periodeDipakai.length) { NotificationStore.addNotification(jenis === 'bulanan' ? 'Pilih periode dulu.' : 'Tidak ada periode dalam semester ini.', 'error'); return; }
    try {
      const doc = buatPdfMudir({ lembaga: orgName || 'Lembaga', judul, subjudul, ringkas: data.ringkas, perHalaqah: data.perHalaqah, perSantri: rincian ? data.perSantri : null, ujian, catatan });
      const nama = jenis === 'bulanan' ? periodeDipakai[0].name : `Semester_${semester}_${selectedAcademicYear?.name || ''}`;
      doc.save(`Laporan_Mudir_${nama}`.replace(/[\s/\\]+/g, '_') + '.pdf');
    } catch (e) { tampilkanError(e, 'Gagal membuat PDF'); }
  };

  if (loading && !daftarPeriode.length) return <LoadingState label="Memuat Laporan Mudir…" />;
  const r = data.ringkas;

  return (
    <div className="space-y-5 pb-12">
      <PageHeader
        title="Laporan Mudir"
        description="PDF rekap lembaga dari Rekap Periode: bulanan (per periode) atau semester (dengan ringkasan ujian & raport)."
        actions={<button type="button" onClick={unduh} disabled={!periodeDipakai.length}
          className="btn btn-primary"><Download size={15} /> Unduh PDF</button>}
      />
      <div className="panel-filter">
        <div className={`grid-filter ${jenis === 'bulanan' ? 'sm:grid-cols-3 lg:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-2'}`}>
          <label className="kontrol-label">
            <span>Jenis</span>
            <select className="kontrol-dalam" value={jenis} onChange={(e) => setJenis(e.target.value as any)}>
              <option value="bulanan">Bulanan (per periode)</option>
              <option value="semester">Semester {semester}</option>
            </select>
          </label>
          {jenis === 'bulanan' && (
            <label className="kontrol-label">
              <span>Periode</span>
              <select className="kontrol-dalam" value={periodeId} onChange={(e) => setPeriodeId(e.target.value)}>
                {daftarPeriode.map((p) => <option key={p.id} value={p.id}>{p.name} ({tgl(p.start_date)} – {tgl(p.end_date)})</option>)}
              </select>
            </label>
          )}
          <label className="kontrol flex items-center gap-2.5 cursor-pointer select-none">
            <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" checked={rincian} onChange={(e) => setRincian(e.target.checked)} />
            <span className="truncate text-sm font-medium text-slate-700">Sertakan rincian per santri</span>
          </label>
        </div>
      </div>

      {!periodeDipakai.length ? (
        <EmptyState title="Belum ada periode" description={jenis === 'bulanan' ? 'Buat periode evaluasi di Target & Periode Evaluasi.' : 'Tidak ada periode evaluasi dalam tanggal semester aktif. Periksa tanggal semester dan periode.'} />
      ) : (
        <div className="card p-5 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <FileText size={18} />
            </div>
            <div><div className="font-bold text-slate-900">{orgName} · {judul}</div><div className="text-xs text-slate-500 mt-0.5">{subjudul}</div></div>
          </div>
          <div className={`grid grid-cols-2 ${jenis === 'semester' ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-3`}>
            {[
              ['Halaqah', String(r.halaqah)], ['Santri', String(r.santri)],
              ['Total ziyadah', `${fmt(r.ziyadah_halaman)} hal · ${fmt(r.ziyadah_juz)} juz`], ['Rata kehadiran', fmt(r.kehadiran, '%')],
              ['Rata total hafalan', `${fmt(r.rata_total_juz)} juz`], ['Form terkirim', `${r.form_terkirim}/${r.form_total}`],
              ...(jenis === 'semester' ? [
                ['Ujian semester', memuatUjian ? '…' : ujian ? `${ujian.sudah_ujian_semester}/${ujian.santri} · rata ${fmt(ujian.rata_nilai_semester)}` : '-'],
                ['Raport lengkap / terbit', memuatUjian ? '…' : ujian ? `${ujian.lengkap} / ${ujian.terbit}` : '-'],
              ] : []),
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-2.5"><div className="text-xs text-slate-500">{k}</div><div className="text-sm font-bold text-slate-800 tabular-nums mt-0.5">{v}</div></div>
            ))}
          </div>
          <div className="wadah-tabel overflow-x-auto">
            <table className="tabel tabel-kartu">
              <thead><tr>
                <th className="text-left">Halaqah</th><th className="text-left">Musammi'</th><th className="text-right">Santri</th>
                <th className="text-right">Ziyadah (hal)</th><th className="text-right">Rata murojaah</th><th className="text-right">Kehadiran</th>
                <th className="text-right">Rata total (juz)</th><th className="text-center">Form</th>
              </tr></thead>
              <tbody>
                {data.perHalaqah.map((h) => (
                  <tr key={h.halaqah_id}>
                    <td data-label="Halaqah" className="font-semibold text-slate-800">{h.halaqah}</td>
                    <td data-label="Musammi'" className="text-slate-600">{h.musammi}</td>
                    <td data-label="Santri" className="text-right tabular-nums">{h.santri}</td>
                    <td data-label="Ziyadah (hal)" className="text-right tabular-nums">{fmt(h.ziyadah)}</td>
                    <td data-label="Rata murojaah" className="text-right tabular-nums">{fmt(h.rata_murojaah)}</td>
                    <td data-label="Kehadiran" className="text-right tabular-nums">{fmt(h.kehadiran, '%')}</td>
                    <td data-label="Rata total (juz)" className="text-right tabular-nums">{fmt(h.rata_total_juz)}</td>
                    <td data-label="Form" className={`text-center tabular-nums font-semibold ${h.form_terkirim < h.form_total ? 'text-amber-700' : 'text-emerald-700'}`}>{h.form_terkirim}/{h.form_total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-1">
            {catatan.map((c) => <p key={c} className="text-xs text-slate-500">• {c}</p>)}
          </div>
        </div>
      )}
    </div>
  );
};

export default LaporanMudirPage;
