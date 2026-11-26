/**
 * Fase 6 · PDF laporan mudir (bulanan per periode & semester).
 * Data dari lib/laporanMudir.ts (Rekap Periode + komponen raport server). Dibuat di browser (jsPDF).
 */
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { fmt, type BarisHalaqah, type BarisSantri, type RingkasanLembaga } from './laporanMudir';

export interface DataPdfMudir {
  lembaga: string;
  judul: string;          // "Laporan Bulanan" / "Laporan Semester"
  subjudul: string;       // "Periode November 2026 (1–30 November 2026)"
  ringkas: RingkasanLembaga;
  perHalaqah: BarisHalaqah[];
  perSantri?: BarisSantri[] | null;
  ujian?: { santri: number; lengkap: number; terbit: number; sudah_ujian_semester: number; rata_nilai_semester: number | null; rata_nilai_akhir: number | null } | null;
  catatan?: string[];
}

const BIRU: [number, number, number] = [30, 64, 175];

/** Judul kolom mengikuti perataan isi kolom (angka rata kanan). */
const ratakanJudul = (kolom: Record<number, any>) => (data: any) => {
  if (data.section === 'head' && kolom[data.column.index]?.halign) data.cell.styles.halign = kolom[data.column.index].halign;
};

const KOLOM_HALAQAH: Record<number, any> = { 0: { cellWidth: 10, halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'center' } };
const KOLOM_SANTRI: Record<number, any> = { 0: { cellWidth: 10, halign: 'center' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } };

export function buatPdfMudir(d: DataPdfMudir): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const lebar = doc.internal.pageSize.getWidth();
  const dicetak = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(d.lembaga || 'Lembaga', 14, 15);
  doc.setFontSize(12);
  doc.text(`${d.judul} — Rekap Tahfidz`, 14, 22);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(d.subjudul, 14, 28);
  doc.text(`Dicetak ${dicetak}`, lebar - 14, 15, { align: 'right' });
  doc.setDrawColor(...BIRU); doc.setLineWidth(0.6); doc.line(14, 31, lebar - 14, 31);

  const r = d.ringkas;
  autoTable(doc, {
    startY: 35,
    head: [['Ringkasan lembaga', '']],
    body: [
      ['Jumlah periode', String(r.periode)],
      ['Halaqah', String(r.halaqah)],
      ['Santri dalam rekap', String(r.santri)],
      ['Total ziyadah', `${fmt(r.ziyadah_halaman)} halaman (${fmt(r.ziyadah_juz)} juz)`],
      ['Rata-rata kehadiran', fmt(r.kehadiran, '%')],
      ['Rata-rata total hafalan', `${fmt(r.rata_total_juz)} juz`],
      ['Form periode terkirim', `${r.form_terkirim} dari ${r.form_total}`],
      ...(d.ujian ? [
        ['Ujian semester sudah ada nilai', `${d.ujian.sudah_ujian_semester} dari ${d.ujian.santri} santri`],
        ['Rata-rata nilai ujian semester', fmt(d.ujian.rata_nilai_semester)],
        ['Raport lengkap / terbit', `${d.ujian.lengkap} / ${d.ujian.terbit}`],
        ['Rata-rata nilai akhir raport', fmt(d.ujian.rata_nilai_akhir)],
      ] : []),
    ],
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 1.6 },
    headStyles: { fillColor: BIRU },
    columnStyles: { 0: { cellWidth: 70, fontStyle: 'bold' }, 1: { cellWidth: 90 } },
    tableWidth: 160,
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 6,
    head: [['No', 'Halaqah', "Musammi'", 'Santri', 'Ziyadah (hal)', 'Rata murojaah (hal)', 'Kehadiran', 'Rata total hafalan (juz)', 'Form terkirim']],
    body: d.perHalaqah.map((h, i) => [
      i + 1, h.halaqah, h.musammi, h.santri, fmt(h.ziyadah), fmt(h.rata_murojaah), fmt(h.kehadiran, '%'), fmt(h.rata_total_juz),
      `${h.form_terkirim}/${h.form_total}`,
    ]),
    theme: 'striped',
    styles: { fontSize: 8.5, cellPadding: 1.5 },
    headStyles: { fillColor: BIRU },
    columnStyles: KOLOM_HALAQAH,
    didParseCell: ratakanJudul(KOLOM_HALAQAH),
  });

  if (d.perSantri?.length) {
    doc.addPage();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('Rincian per santri', 14, 15);
    autoTable(doc, {
      startY: 19,
      head: [['No', 'Nama', 'NIS', 'Kelas', 'Halaqah', 'Ziyadah (hal)', 'Murojaah (hal)', 'Kehadiran', 'Total hafalan (juz)', 'Kelancaran']],
      body: d.perSantri.map((s, i) => [
        i + 1, s.nama, s.nis, s.kelas, s.halaqah, fmt(s.ziyadah), fmt(s.murojaah), fmt(s.kehadiran, '%'), fmt(s.total_juz), s.kelancaran || '-',
      ]),
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 1.3 },
      headStyles: { fillColor: BIRU },
      columnStyles: KOLOM_SANTRI,
      didParseCell: ratakanJudul(KOLOM_SANTRI),
    });
  }

  if (d.catatan?.length) {
    let y = (doc as any).lastAutoTable.finalY + 6;
    if (y > doc.internal.pageSize.getHeight() - 20) { doc.addPage(); y = 15; }
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8);
    d.catatan.forEach((c, i) => doc.text(`• ${c}`, 14, y + i * 4));
  }

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120);
    doc.text(`${d.lembaga} · ${d.judul} · halaman ${i}/${n}`, lebar / 2, doc.internal.pageSize.getHeight() - 7, { align: 'center' });
    doc.setTextColor(0);
  }
  return doc;
}
