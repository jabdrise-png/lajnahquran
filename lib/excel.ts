/**
 * Fase 7 · Excel tanpa `xlsx` 0.18.5 (punya celah keamanan & tidak diperbarui di npm).
 * Memakai `exceljs`, dimuat hanya saat ekspor/impor (tidak ikut muat awal aplikasi).
 *  - unduhExcel    : satu/lebih lembar dari array objek (kolom = kunci objek).
 *  - bacaBaris     : baris mentah (array of array) dari .xlsx atau .csv.
 *  - barisKeObjek  : baris → objek dengan judul kolom huruf kecil & tanpa spasi tepi.
 * File .xls lama (format biner Excel 97–2003) tidak didukung: simpan ulang sebagai .xlsx/.csv.
 */

export interface LembarExcel {
  nama: string;
  data: Record<string, any>[];
  /** Lebar kolom (karakter), urut sesuai kolom. */
  lebar?: number[];
}

const kolomDari = (data: Record<string, any>[]) => {
  const k: string[] = [];
  for (const baris of data) for (const key of Object.keys(baris || {})) if (!k.includes(key)) k.push(key);
  return k;
};

/** Nilai sel exceljs → nilai sederhana (teks/angka/tanggal ISO). */
export function nilaiSel(v: any): any {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date) return isNaN(v.getTime()) ? undefined : v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if ('result' in v) return nilaiSel(v.result);
    if ('text' in v) return v.text;
    if ('error' in v) return undefined;
    return String(v);
  }
  return v;
}

/** Pembaca CSV sederhana (pemisah , atau ; otomatis, kutip ganda). */
export function bacaCsv(teks: string): any[][] {
  const t = teks.replace(/^﻿/, '');
  const baris1 = t.split(/\r?\n/, 1)[0] || '';
  const pemisah = (baris1.match(/;/g) || []).length > (baris1.match(/,/g) || []).length ? ';' : ',';
  const hasil: any[][] = [];
  let baris: any[] = [];
  let sel = '';
  let kutip = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (kutip) {
      if (c === '"') {
        if (t[i + 1] === '"') { sel += '"'; i++; } else kutip = false;
      } else sel += c;
    } else if (c === '"') kutip = true;
    else if (c === pemisah) { baris.push(sel); sel = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      baris.push(sel); hasil.push(baris); baris = []; sel = '';
    } else sel += c;
  }
  if (sel !== '' || baris.length) { baris.push(sel); hasil.push(baris); }
  return hasil
    .map((b) => b.map((x) => (x === '' ? undefined : /^-?\d+(\.\d+)?$/.test(x) ? Number(x) : x)))
    .filter((b) => b.some((x) => x !== undefined && x !== ''));
}

export function barisKeObjek(rows: any[][]): Record<string, any>[] {
  if (!rows.length) return [];
  const judul = (rows[0] || []).map((h) => (h === undefined || h === null ? '' : String(h).trim().toLowerCase()));
  return rows.slice(1)
    .filter((r) => r && r.some((x) => x !== undefined && x !== null && x !== ''))
    .map((r) => {
      const o: Record<string, any> = {};
      judul.forEach((h, i) => { if (h) o[h] = r[i]; });
      return o;
    });
}

export async function bacaBaris(file: File | Blob & { name?: string }): Promise<any[][]> {
  const nama = String((file as any).name || '').toLowerCase();
  if (nama.endsWith('.csv') || (file as any).type === 'text/csv') {
    return bacaCsv(await file.text());
  }
  if (nama.endsWith('.xls')) {
    throw new Error('Format .xls lama tidak didukung. Buka di Excel lalu simpan sebagai .xlsx atau .csv.');
  }
  const ExcelJS: any = (await import('exceljs')).default ?? (await import('exceljs'));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: any[][] = [];
  ws.eachRow({ includeEmpty: false }, (row: any) => {
    const vals: any[] = [];
    row.eachCell({ includeEmpty: true }, (cell: any, col: number) => { vals[col - 1] = nilaiSel(cell.value); });
    rows.push(vals);
  });
  return rows;
}

export async function buatWorkbook(lembar: LembarExcel[]): Promise<any> {
  const ExcelJS: any = (await import('exceljs')).default ?? (await import('exceljs'));
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Lajnah Quran';
  for (const l of lembar) {
    const ws = wb.addWorksheet(l.nama.slice(0, 31) || 'Lembar');
    const kolom = kolomDari(l.data);
    ws.columns = kolom.map((k, i) => ({
      header: k, key: k,
      width: l.lebar?.[i] ?? Math.min(40, Math.max(10, k.length + 2, ...l.data.slice(0, 200).map((b) => String(b?.[k] ?? '').length + 2))),
    }));
    for (const b of l.data) ws.addRow(kolom.map((k) => b?.[k] ?? null));
    ws.getRow(1).font = { bold: true };
  }
  return wb;
}

export async function unduhExcel(lembar: LembarExcel[], namaFile: string): Promise<void> {
  const wb = await buatWorkbook(lembar);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = namaFile.toLowerCase().endsWith('.xlsx') ? namaFile : `${namaFile}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
