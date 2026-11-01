import React from 'react';
import { MarhalahLabel, KelasLabel } from './Labels';

export const calculateJuzScore = (shogir: number = 0, kabir: number = 0, settings: any): number => {
    const nilaiAwal = Number(settings?.nilaiAwalJuz) || 100;
    const pengurangShogir = Number(settings?.pengurangShogir) || 1.25;
    const pengurangKabir = Number(settings?.pengurangKabir) || 5;
    const minNilai = Number(settings?.minNilaiJuz) || 50;
    const score = nilaiAwal - (shogir * pengurangShogir) - (kabir * pengurangKabir);
    return Math.max(minNilai, score);
};

export const getPredikat = (nilai: number, globalPredikat: { label: string; minScore: number }[]) => {
    if (!globalPredikat || globalPredikat.length === 0) {
        if (nilai >= 90) return 'MUMTAZ';
        if (nilai >= 80) return 'JAYYID JIDDAN';
        if (nilai >= 70) return 'JAYYID';
        if (nilai >= 60) return 'MAQBUL';
        return 'RASIB';
    }
    const match = globalPredikat.find(p => nilai >= p.minScore);
    return match ? match.label.toUpperCase() : globalPredikat[globalPredikat.length - 1].label.toUpperCase();
};

export const parseJuzList = (materi: string): number[] => {
    const result = new Set<number>();
    if (!materi) return [];
    const parts = materi.split(',').map(p => p.trim());
    for (const part of parts) {
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(Number);
            if (!isNaN(start) && !isNaN(end)) {
                const s = Math.min(start, end);
                const e = Math.max(start, end);
                for (let i = Math.max(1, s); i <= Math.min(100, e); i++) {
                    result.add(i);
                }
            }
        } else {
            const val = Number(part);
            if (!isNaN(val) && val >= 1 && val <= 100) {
                result.add(val);
            }
        }
    }
    return Array.from(result).sort((a, b) => a - b);
};

const RaportDocument = ({ d, selectedSemester, selectedAcademicYear, orgName, orgLogo, settings, signatureImage }: any) => {
    const juzList = parseJuzList(d.materiSem);

    const half = Math.ceil(juzList.length / 2);
    const leftJuz = juzList.slice(0, half);
    const rightJuz = juzList.slice(half);

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
                    <tr><td colSpan={8} className="rpt-border rpt-center rpt-middle rpt-bold">LAPORAN HASIL UJIAN HIFDZUL QUR'AN</td></tr>
                    <tr><td colSpan={8} className="rpt-border rpt-center rpt-middle rpt-bold">SEMESTER {selectedSemester ? selectedSemester.toUpperCase().replace('GANJIL', 'GASAL') : 'GASAL'} TAHUN AJARAN {selectedAcademicYear?.name || ''}</td></tr>
                    <tr><td colSpan={8} className="rpt-border rpt-center rpt-middle rpt-bold">{orgName ? orgName.toUpperCase() : "LEMBAGA TAHFIDZUL QUR'AN"}</td></tr>

                    <tr><td colSpan={8}></td></tr>

                    {/* Student Info */}
                    <tr>
                        <td className="rpt-border rpt-bold">Nama:</td>
                        <td colSpan={7} className="rpt-border">{d.santri.nama}</td>
                    </tr>
                    <tr>
                        <td className="rpt-border rpt-bold">Kelas:</td>
                        <td colSpan={7} className="rpt-border"><MarhalahLabel text={d.santri.marhalah} id={d.santri.marhalah_id} /> <KelasLabel text={d.santri.kelas} id={d.santri.kelas_id} /></td>
                    </tr>

                    <tr><td colSpan={8}></td></tr>

                    {/* Ujian Bulanan */}
                    {d.blns.map((b: any, i: number) => (
                        <tr key={`bln-${i}`}>
                            <td colSpan={6} className="rpt-border">Ujian Bulanan Ke-{b.ke}</td>
                            <td colSpan={2} className="rpt-border rpt-center">{b.nilai !== null ? (Number.isInteger(b.nilai) ? b.nilai : b.nilai.toFixed(2)) : '-'}</td>
                        </tr>
                    ))}

                    {d.blns.length > 0 && <tr><td colSpan={8}></td></tr>}

                    {/* Juz Headers */}
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

                    {/* Juz Data */}
                    {leftJuz.length > 0 ? (
                        leftJuz.map((juzL: number, index: number) => {
                            const juzR = rightJuz[index];

                            const sL = d.us?.khoto_shogir?.[juzL] || 0;
                            const kL = d.us?.khoto_kabir?.[juzL] || 0;
                            const isCustomL = d.us?.is_custom_nilai?.[juzL];
                            const customL = d.us?.custom_nilai?.[juzL] || 0;
                            const scoreL = isCustomL ? customL : calculateJuzScore(sL, kL, settings);
                            
                            let sR = 0, kR = 0, scoreR: number | null = null;
                            if (juzR !== undefined) {
                                sR = d.us?.khoto_shogir?.[juzR] || 0;
                                kR = d.us?.khoto_kabir?.[juzR] || 0;
                                const isCustomR = d.us?.is_custom_nilai?.[juzR];
                                const customR = d.us?.custom_nilai?.[juzR] || 0;
                                scoreR = isCustomR ? customR : calculateJuzScore(sR, kR, settings);
                            }

                            return (
                                <tr key={`juz-${index}`}>
                                    <td className="rpt-border rpt-center">Juz {juzL}</td>
                                    <td className="rpt-border rpt-center">{kL}</td>
                                    <td className="rpt-border rpt-center">{sL}</td>
                                    <td className="rpt-border rpt-center">{scoreL.toFixed(0) === scoreL.toString() ? scoreL : scoreL.toFixed(2)}</td>

                                    <td className="rpt-border rpt-center">{juzR !== undefined ? `Juz ${juzR}` : ''}</td>
                                    <td className="rpt-border rpt-center">{juzR !== undefined ? kR : ''}</td>
                                    <td className="rpt-border rpt-center">{juzR !== undefined ? sR : ''}</td>
                                    <td className="rpt-border rpt-center">{scoreR !== null ? (scoreR.toFixed(0) === scoreR.toString() ? scoreR : scoreR.toFixed(2)) : ''}</td>
                                </tr>
                            );
                        })
                    ) : (
                        <tr>
                            <td colSpan={8} className="rpt-border rpt-center" style={{ whiteSpace: 'normal', fontStyle: 'italic', fontSize: '11px' }}>Belum ada materi / nilai semester</td>
                        </tr>
                    )}

                    {/* RATA-RATA NILAI */}
                    <tr>
                        <td colSpan={6} className="rpt-border rpt-bold">RATA-RATA NILAI</td>
                        <td colSpan={2} className="rpt-border rpt-center rpt-bold">{d.valSem !== null ? (Number.isInteger(d.valSem) ? d.valSem : d.valSem.toFixed(2)) : '-'}</td>
                    </tr>

                    <tr><td colSpan={8}></td></tr>

                    {/* Rekapitulasi Akhir */}
                    <tr>
                        <td colSpan={2} className="rpt-border">Nilai Pencapaian Hafalan</td>
                        <td colSpan={2} className="rpt-border rpt-center">{settings?.pctSilabus === 0 ? '-' : (d.nilaiSilabus !== null ? d.nilaiSilabus.toFixed(2) : '-')}</td>
                        <td colSpan={2} className="rpt-border">Target hafalan</td>
                        <td colSpan={2} className="rpt-border rpt-center">{d.targetHafalan || '-'}</td>
                    </tr>
                    <tr>
                        <td colSpan={2} className="rpt-border">Rata-rata ujian bulanan</td>
                        <td colSpan={2} className="rpt-border rpt-center">{settings?.pctBulanan === 0 ? '-' : (d.avgBln !== null ? d.avgBln.toFixed(2) : '-')}</td>
                        <td colSpan={2} className="rpt-border">Hafalan depan</td>
                        <td colSpan={2} className="rpt-border rpt-center">{d.hafalanDepan || '-'}</td>
                    </tr>
                    <tr>
                        <td colSpan={2} className="rpt-border">Ujian semester</td>
                        <td colSpan={2} className="rpt-border rpt-center">{settings?.pctSemester === 0 ? '-' : (d.valSem !== null ? d.valSem.toFixed(2) : '-')}</td>
                        <td colSpan={2} className="rpt-border">Hafalan Belakang</td>
                        <td colSpan={2} className="rpt-border rpt-center">{d.hafalanBelakang || '-'}</td>
                    </tr>
                    <tr>
                        <td colSpan={2} className="rpt-border">Tingkat Kehadiran</td>
                        <td colSpan={2} className="rpt-border rpt-center">{settings?.pctKehadiran === 0 ? '-' : (d.pctKehadiran !== null ? d.pctKehadiran.toFixed(2) + '%' : '-')}</td>
                        <td colSpan={2} className="rpt-border">Total hafalan</td>
                        <td colSpan={2} className="rpt-border rpt-center">{d.totalHafalan || '-'}</td>
                    </tr>

                    {/* NILAI AKHIR RAPORT TAHFIDZ */}
                    <tr>
                        <td colSpan={4} className="rpt-border rpt-bold">NILAI AKHIR RAPORT TAHFIDZ</td>
                        <td colSpan={4} className="rpt-border rpt-center rpt-bold">{d.finalScore !== null ? d.finalScore.toFixed(2) : '-'} {d.predikat ? `(${d.predikat})` : ''}</td>
                    </tr>

                    <tr><td colSpan={8}></td></tr>

                    {/* Catatan Box */}
                    <tr>
                        <td colSpan={8} rowSpan={4} className="rpt-border rpt-top-left" style={{ whiteSpace: 'pre-wrap', height: '120px' }}>
        <span className="rpt-bold">Catatan:</span><br/>
        <div style={{ marginTop: '4px', fontWeight: 'normal' }}>{d.us?.catatan || ''}</div>
    </td>
                    </tr>
                    <tr></tr>
                    <tr></tr>
                    <tr></tr>

                    {/* Ruang kosong sebelum tanda tangan */}
                    <tr><td colSpan={8}></td></tr>
                    <tr><td colSpan={8}></td></tr>
                    <tr><td colSpan={8}></td></tr>
                    <tr><td colSpan={8}></td></tr>
                    <tr><td colSpan={8}></td></tr>

                    {/* Signatures */}
                    <tr>
                        <td colSpan={1}></td>
                        <td colSpan={2} className="rpt-border-top rpt-center" style={{ position: 'relative', overflow: 'visible' }}>
                            {signatureImage && (
                                <img
                                    src={signatureImage}
                                    alt="Tanda Tangan Lajnah"
                                    style={{
                                        position: 'absolute',
                                        bottom: '100%',
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        height: '110px',
                                        maxWidth: '200px',
                                        marginBottom: '-8px',
                                        objectFit: 'contain',
                                        mixBlendMode: 'multiply'
                                    }}
                                />
                            )}
                            Lajnah Al-quran
                        </td>
                        <td colSpan={2}></td>
                        <td colSpan={2} className="rpt-border-top rpt-center">Wali Santri</td>
                        <td colSpan={1}></td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
};

export default RaportDocument;
