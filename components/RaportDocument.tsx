/**
 * Fase 5 · Dokumen raport (tata letak mengikuti raport lama).
 * 3 komponen: ujian semester (per juz), rata-rata ujian bulanan, kehadiran — bobot lembaga (total 100%).
 * Tanda tangan digital Ketua Lajnah + ruang tanda tangan wali santri. Raport yang sudah terbit
 * dicetak dari snapshot (kode verifikasi tercetak); yang belum terbit diberi tanda DRAF.
 */
import { MarhalahLabel, KelasLabel } from './Labels';

export interface DataRaport {
  santri: { id: number; nama: string; marhalah?: string; kelas?: string; marhalah_id?: string; kelas_id?: string };
  juz: { juz: number; kabir: number; shoghir: number; nilai?: number | null }[];
  bulanan: { ke: number; label?: string; nilai: number | null }[];
  nilaiSemester: number | null;
  rataBulanan: number | null;
  kehadiran: number | null;
  bobot: { semester: number; bulanan: number; kehadiran: number };
  nilaiAkhir: number | null;
  predikat: string | null;
  catatan?: string | null;
  info?: { target_hafalan?: string; hafalan_depan?: string; hafalan_belakang?: string; total_hafalan?: string };
  terbit?: { versi: number; kode: string; tanggal: string } | null;
}

export interface TandaTanganRaport {
  nama?: string | null;
  jabatan?: string | null;
  kota?: string | null;
  gambar?: string | null;
}

const angka = (v: number | null | undefined, persen = false) =>
  v === null || v === undefined || !Number.isFinite(Number(v)) ? '-' : `${String(Math.round(Number(v) * 100) / 100)}${persen ? '%' : ''}`;

const tanggalIndonesia = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

const RaportDocument = ({ d, semester, tahunAjaran, orgName, ttd, verifyUrl }: {
    d: DataRaport; semester: string; tahunAjaran: string; orgName: string; ttd: TandaTanganRaport; verifyUrl?: string;
}) => {
    const juzList = [...d.juz].sort((a, b) => a.juz - b.juz);
    const half = Math.ceil(juzList.length / 2);
    const leftJuz = juzList.slice(0, half);
    const rightJuz = juzList.slice(half);
    const draf = !d.terbit;

    return (
        <div className="raport-doc">
            <style>{`
                .raport-doc {
                    font-family: Arial, Helvetica, sans-serif;
                    font-size: 13px;
                    color: #000000;
                    width: 210mm;
                    min-height: 297mm;
                    margin: 0 auto;
                    background: #ffffff;
                    box-sizing: border-box;
                    padding: 0.5cm;
                }
                .raport-doc table {
                    border-collapse: collapse;
                    table-layout: fixed;
                    width: 100%;
                }
                .raport-doc col {
                    width: 12.5%;
                }
                .raport-doc td {
                    height: 21px;
                    padding: 2px 3px;
                    vertical-align: bottom;
                    white-space: nowrap;
                    overflow: hidden;
                }
                .raport-doc .rpt-border {
                    border: 1px solid #000000;
                }
                .raport-doc .rpt-border-top {
                    border-top: 1px solid #000000;
                }
                .raport-doc .rpt-center {
                    text-align: center;
                }
                .raport-doc .rpt-bold {
                    font-weight: bold;
                }
                .raport-doc .rpt-middle {
                    vertical-align: middle;
                }
                .raport-doc .rpt-top-left {
                    vertical-align: top;
                    text-align: left;
                }
                @page {
                    size: A4 portrait;
                    margin: 0 5mm;
                }
                @media print {
                    html, body {
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    .raport-doc {
                        margin: 0 auto !important;
                        width: 100% !important;
                        padding: 0 !important;
                        page-break-after: always !important;
                        break-after: page !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .raport-print-wrapper:last-child .raport-doc,
                    .raport-doc:last-child {
                        page-break-after: auto !important;
                        break-after: auto !important;
                    }
                }
            `}</style>

            <table>
                <colgroup>
                    <col /><col /><col /><col /><col /><col /><col /><col />
                </colgroup>
                <tbody>
                    {/* Row kosong paling atas, sesuai template asli */}
                    <tr><td colSpan={8}></td></tr>

                    {/* Header */}
                    <tr><td colSpan={8} className="rpt-border rpt-center rpt-middle rpt-bold">LAPORAN HASIL UJIAN HIFDZUL QUR'AN{draf ? ' — DRAF' : ''}</td></tr>
                    <tr><td colSpan={8} className="rpt-border rpt-center rpt-middle rpt-bold">SEMESTER {(semester || 'Ganjil').toUpperCase().replace('GANJIL', 'GASAL')} TAHUN AJARAN {tahunAjaran || ''}</td></tr>
                    <tr><td colSpan={8} className="rpt-border rpt-center rpt-middle rpt-bold">{orgName ? orgName.toUpperCase() : "LEMBAGA TAHFIDZUL QUR'AN"}</td></tr>

                    <tr><td colSpan={8}></td></tr>

                    {/* Identitas */}
                    <tr>
                        <td className="rpt-border rpt-bold">Nama:</td>
                        <td colSpan={7} className="rpt-border">{d.santri.nama}</td>
                    </tr>
                    <tr>
                        <td className="rpt-border rpt-bold">Kelas:</td>
                        <td colSpan={7} className="rpt-border"><MarhalahLabel text={d.santri.marhalah as any} id={d.santri.marhalah_id} /> <KelasLabel text={d.santri.kelas as any} id={d.santri.kelas_id} /></td>
                    </tr>

                    <tr><td colSpan={8}></td></tr>

                    {/* Ujian bulanan */}
                    {d.bulanan.map((b) => (
                        <tr key={`bln-${b.ke}`}>
                            <td colSpan={6} className="rpt-border">Ujian Bulanan Ke-{b.ke}{b.label && !/^Ujian Bulanan/i.test(b.label) ? ` (${b.label})` : ''}</td>
                            <td colSpan={2} className="rpt-border rpt-center">{angka(b.nilai)}</td>
                        </tr>
                    ))}
                    {d.bulanan.length > 0 && <tr><td colSpan={8}></td></tr>}

                    {/* Ujian semester per juz */}
                    <tr>
                        <td rowSpan={2} className="rpt-border rpt-center rpt-middle rpt-bold">Juz</td>
                        <td colSpan={2} className="rpt-border rpt-center rpt-middle rpt-bold">Kesalahan</td>
                        <td rowSpan={2} className="rpt-border rpt-center rpt-middle rpt-bold">Nilai</td>
                        <td rowSpan={2} className="rpt-border rpt-center rpt-middle rpt-bold">Juz</td>
                        <td colSpan={2} className="rpt-border rpt-center rpt-middle rpt-bold">Kesalahan</td>
                        <td rowSpan={2} className="rpt-border rpt-center rpt-middle rpt-bold">Nilai</td>
                    </tr>
                    <tr>
                        <td className="rpt-border rpt-center rpt-middle rpt-bold">Kabir</td>
                        <td className="rpt-border rpt-center rpt-middle rpt-bold">Shogir</td>
                        <td className="rpt-border rpt-center rpt-middle rpt-bold">Kabir</td>
                        <td className="rpt-border rpt-center rpt-middle rpt-bold">Shogir</td>
                    </tr>
                    {leftJuz.length > 0 ? leftJuz.map((l, i) => {
                        const r = rightJuz[i];
                        return (
                            <tr key={`juz-${l.juz}`}>
                                <td className="rpt-border rpt-center">Juz {l.juz}</td>
                                <td className="rpt-border rpt-center">{l.kabir}</td>
                                <td className="rpt-border rpt-center">{l.shoghir}</td>
                                <td className="rpt-border rpt-center">{angka(l.nilai)}</td>
                                <td className="rpt-border rpt-center">{r ? `Juz ${r.juz}` : ''}</td>
                                <td className="rpt-border rpt-center">{r ? r.kabir : ''}</td>
                                <td className="rpt-border rpt-center">{r ? r.shoghir : ''}</td>
                                <td className="rpt-border rpt-center">{r ? angka(r.nilai) : ''}</td>
                            </tr>
                        );
                    }) : (
                        <tr><td colSpan={8} className="rpt-border rpt-center" style={{ whiteSpace: 'normal', fontStyle: 'italic', fontSize: '11px' }}>Belum ada nilai ujian semester</td></tr>
                    )}
                    <tr>
                        <td colSpan={6} className="rpt-border rpt-bold">RATA-RATA NILAI UJIAN SEMESTER</td>
                        <td colSpan={2} className="rpt-border rpt-center rpt-bold">{angka(d.nilaiSemester)}</td>
                    </tr>

                    <tr><td colSpan={8}></td></tr>

                    {/* Rekapitulasi: 3 komponen raport + hafalan */}
                    <tr>
                        <td colSpan={2} className="rpt-border">Ujian semester ({d.bobot.semester}%)</td>
                        <td colSpan={2} className="rpt-border rpt-center">{angka(d.nilaiSemester)}</td>
                        <td colSpan={2} className="rpt-border">Target hafalan</td>
                        <td colSpan={2} className="rpt-border rpt-center">{d.info?.target_hafalan || '-'}</td>
                    </tr>
                    <tr>
                        <td colSpan={2} className="rpt-border">Rata-rata ujian bulanan ({d.bobot.bulanan}%)</td>
                        <td colSpan={2} className="rpt-border rpt-center">{d.bobot.bulanan > 0 ? angka(d.rataBulanan) : '-'}</td>
                        <td colSpan={2} className="rpt-border">Hafalan depan</td>
                        <td colSpan={2} className="rpt-border rpt-center">{d.info?.hafalan_depan || '-'}</td>
                    </tr>
                    <tr>
                        <td colSpan={2} className="rpt-border">Tingkat kehadiran ({d.bobot.kehadiran}%)</td>
                        <td colSpan={2} className="rpt-border rpt-center">{d.bobot.kehadiran > 0 || d.kehadiran !== null ? angka(d.kehadiran, true) : '-'}</td>
                        <td colSpan={2} className="rpt-border">Hafalan belakang</td>
                        <td colSpan={2} className="rpt-border rpt-center">{d.info?.hafalan_belakang || '-'}</td>
                    </tr>
                    <tr>
                        <td colSpan={4} className="rpt-border"></td>
                        <td colSpan={2} className="rpt-border">Total hafalan</td>
                        <td colSpan={2} className="rpt-border rpt-center">{d.info?.total_hafalan || '-'}</td>
                    </tr>
                    <tr>
                        <td colSpan={4} className="rpt-border rpt-bold">NILAI AKHIR RAPORT TAHFIDZ</td>
                        <td colSpan={4} className="rpt-border rpt-center rpt-bold">{angka(d.nilaiAkhir)} {d.predikat ? `(${d.predikat.toUpperCase()})` : ''}</td>
                    </tr>

                    <tr><td colSpan={8}></td></tr>

                    {/* Catatan */}
                    <tr>
                        <td colSpan={8} rowSpan={4} className="rpt-border rpt-top-left" style={{ whiteSpace: 'pre-wrap', height: '110px' }}>
                            <span className="rpt-bold">Catatan:</span><br />
                            <div style={{ marginTop: '4px', fontWeight: 'normal' }}>{d.catatan || ''}</div>
                        </td>
                    </tr>
                    <tr></tr>
                    <tr></tr>
                    <tr></tr>

                    {/* Tempat & tanggal */}
                    <tr><td colSpan={8}></td></tr>
                    <tr>
                        <td colSpan={5}></td>
                        <td colSpan={3} className="rpt-center">{ttd.kota ? `${ttd.kota}, ` : ''}{tanggalIndonesia(d.terbit?.tanggal)}</td>
                    </tr>
                    <tr>
                        <td colSpan={1}></td>
                        <td colSpan={2} className="rpt-center">Wali Santri,</td>
                        <td colSpan={2}></td>
                        <td colSpan={2} className="rpt-center">{ttd.jabatan || 'Ketua Lajnah'},</td>
                        <td colSpan={1}></td>
                    </tr>
                    {/* Ruang tanda tangan */}
                    <tr><td colSpan={8}></td></tr>
                    <tr><td colSpan={8}></td></tr>
                    <tr><td colSpan={8}></td></tr>
                    <tr>
                        <td colSpan={1}></td>
                        <td colSpan={2} className="rpt-border-top rpt-center">( ........................................ )</td>
                        <td colSpan={2}></td>
                        <td colSpan={2} className="rpt-border-top rpt-center" style={{ position: 'relative', overflow: 'visible' }}>
                            {ttd.gambar && !draf && (
                                <img src={ttd.gambar} alt="Tanda tangan Ketua Lajnah"
                                    style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', height: '90px', maxWidth: '200px', marginBottom: '-6px', objectFit: 'contain', mixBlendMode: 'multiply' }} />
                            )}
                            {ttd.nama || '........................................'}
                        </td>
                        <td colSpan={1}></td>
                    </tr>
                    <tr><td colSpan={8}></td></tr>
                    <tr>
                        <td colSpan={8} className="rpt-center" style={{ fontSize: '10px', color: '#475569', whiteSpace: 'normal' }}>
                            {d.terbit
                                ? `Raport resmi v${d.terbit.versi} · Kode verifikasi: ${d.terbit.kode}${verifyUrl ? ` · cek keaslian di ${verifyUrl}` : ''}`
                                : 'DRAF — belum diterbitkan, tidak berlaku sebagai raport resmi'}
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
};

export default RaportDocument;
