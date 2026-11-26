
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, eachMonthOfInterval, startOfMonth, endOfMonth } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

import { MasterEvaluationPeriod, AppSetting } from '../types';

export const getActiveSemesterDateRange = (appSettings: AppSetting[], academicYearId?: number, semester?: string) => {
    if (!academicYearId || !semester) return { startDate: null, endDate: null };
    const setting = appSettings.find(s => s.key === `SEMESTER_DATES_${academicYearId}`);
    if (setting && setting.value) {
        try {
            const parsed = JSON.parse(setting.value);
            if (parsed[semester]) {
                return { startDate: parsed[semester].startDate || null, endDate: parsed[semester].endDate || null };
            }
        } catch (e) {}
    }
    return { startDate: null, endDate: null };
};

export const generateMonthsFromDateRange = (startDateStr: string | null, endDateStr: string | null) => {
    if (!startDateStr || !endDateStr) return [];
    try {
        const start = new Date(startDateStr);
        const end = new Date(endDateStr);
        if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return [];
        
        const months = eachMonthOfInterval({ start, end });
        return months.map((date, index) => {
            return {
                id: format(date, 'yyyy-MM'),
                ke: index + 1,
                bulan: format(date, 'MMMM yyyy', { locale: localeId })
            };
        });
    } catch (e) {
        return [];
    }
};

/**
 * Nama periode untuk tampilan. Fase 4: periode dari tabel evaluation_periods
 * (hook useSupabaseData → periodeEvaluasi); id = UUID periode.
 */
export const formatPeriodName = (periodId: string, periods: MasterEvaluationPeriod[] = []) => {
    const period = periods.find(p => p.id === periodId);
    if (period?.name) return period.name;
    if (period?.startDate) {
        const d = new Date(period.startDate);
        if (!isNaN(d.getTime())) {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
            return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
        }
    }
    return periodId;
};

// Generic export to Excel
export const exportToExcel = (data: any[], fileName: string) => {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Laporan');
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
};

// Generic export to PDF
export const exportToPDF = (
  title: string,
  columns: string[],
  rows: any[][],
  fileName: string
) => {
  const doc = new jsPDF();
  
  doc.setFontSize(16);
  doc.text(title, 14, 15);
  doc.setFontSize(10);
  doc.text(`Dicetak pada: ${new Date().toLocaleDateString('id-ID')}`, 14, 22);

  autoTable(doc, {
    head: [columns],
    body: rows,
    startY: 28,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' }, // Blue secondary color
    alternateRowStyles: { fillColor: [248, 250, 252] }, // Light slate
    theme: 'grid'
  });

  doc.save(`${fileName}.pdf`);
};

export const parseSpreadsheet = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const arrayBuffer = event.target?.result as ArrayBuffer;
                const wb = XLSX.read(arrayBuffer, { type: 'array' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
                
                if (!data || data.length === 0) {
                    resolve([]);
                    return;
                }

                // Clean headers: trim whitespace and lowercase for consistent matching
                const headers = (data[0] as string[]).map(h => h?.toString().trim().toLowerCase() || '');
                
                const jsonData = data.slice(1).map((row: any) => {
                    const rowData: {[key: string]: any} = {};
                    // Only map if row has content
                    if (row && row.length > 0) {
                        headers.forEach((header, index) => {
                            if(header) {
                                rowData[header] = row[index];
                            }
                        });
                        return rowData;
                    }
                    return null;
                }).filter(r => r !== null); // Remove empty rows

                resolve(jsonData);
            } catch (e) {
                reject(e);
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
};

export const getPredikat = (nilai: number | string | null | undefined, predikatList: { label: string, minScore: number }[]) => {
    if (nilai === null || nilai === undefined || nilai === '') return '-';
    const num = Number(nilai);
    if (isNaN(num)) return '-';
    
    // Make sure predikatList is sorted descending by minScore just in case
    const sorted = [...predikatList].sort((a, b) => b.minScore - a.minScore);
    
    for (const p of sorted) {
        if (num >= p.minScore) {
            return p.label;
        }
    }
    return '-';
};

/**
 * Sanitizes rich-text HTML strings (e.g. from ReactQuill) before rendering via dangerouslySetInnerHTML
 * to prevent Stored Cross-Site Scripting (XSS).
 */
export const sanitizeHtml = (dirtyHtml: string | null | undefined): string => {
    if (!dirtyHtml) return '';
    if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
        return dirtyHtml
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
    }

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(dirtyHtml, 'text/html');
        const forbiddenTags = ['script', 'iframe', 'object', 'embed', 'form', 'meta', 'link', 'style', 'base'];
        forbiddenTags.forEach(tag => {
            doc.querySelectorAll(tag).forEach(el => el.remove());
        });

        const allElements = doc.body.querySelectorAll('*');
        allElements.forEach(el => {
            Array.from(el.attributes).forEach(attr => {
                const attrName = attr.name.toLowerCase();
                const attrVal = (attr.value || '').trim().toLowerCase();
                if (attrName.startsWith('on')) {
                    el.removeAttribute(attr.name);
                } else if (
                    (attrName === 'href' || attrName === 'src' || attrName === 'xlink:href' || attrName === 'action') &&
                    (attrVal.startsWith('javascript:') || attrVal.startsWith('vbscript:') || attrVal.startsWith('data:text/html'))
                ) {
                    el.removeAttribute(attr.name);
                }
            });
        });

        return doc.body.innerHTML;
    } catch {
        return '';
    }
};

