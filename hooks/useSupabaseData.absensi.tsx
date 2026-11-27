// Dipisah dari useSupabaseData.tsx (Fase 8 bagian 2).
import React, { useState, useEffect, useCallback, useRef, createContext, useContext, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Santri, Musammi, Halaqah, AttendanceRecord, HalaqahType, Waktu, StudentProgress, ProgressType, WaliKelas, ClassTarget, StudentEvaluation, EvaluationSetting, AppSetting, MasterKelas } from '../types';
import { Marhalah, Peran, AttendanceStatus } from '../types';
import { useAcademicYear } from '../lib/AcademicYearContext';
import { SupportSessionStore, resolveTenantContext, bersihkanCacheKonteks } from '../lib/permissions';
import { DEFAULT_FLUENCY_RULES, type FluencyRule } from '../lib/kelancaran';
import {
    normalisasiRekap, normalisasiField, periodeKeLegacy, periodeTahunAjaran,
    rekapKeStudentProgress, rekapKeStudentEvaluation, fieldKeEvaluationSettings,
    fieldKePertanyaanHalaqah, formKeHalaqahEvaluation,
    type EvaluationPeriod, type PeriodFormField, type PeriodRecap, type PeriodForm,
} from '../lib/rekapAdapter';
import {
    normalisasiRubrik, normalisasiPercobaan, RUBRIK_BAWAAN, PENGATURAN_RAPORT_BAWAAN,
    type Rubrik, type PercobaanUjian, type PeriodeUjianBulanan, type PengaturanRaport,
} from '../lib/ujian';
import { NotificationStore } from '../lib/NotificationStore';
import {
    recitationToSetoranRow, setoranInputToRpcArgs, attendanceToLegacy, attendanceInputToRpcRecords, isUuid,
    DEFAULT_KINDS, DEFAULT_STATUSES,
    type RecitationKind, type AttendanceStatusRef, type SessionSlotRef, type HalaqahTypeRef, type SetoranRow,
} from '../lib/v2Adapter';


// ---------------------------------------------------------------------------------------------
// Fase 7 · data per halaman. Saat dibuka, aplikasi hanya memuat absensi & setoran 14 hari terakhir
// (+ setoran terakhir per santri lewat rpc_setoran_terakhir) — cepat di HP. Riwayat penuh (absensi
// semester, semua setoran) dimuat oleh halaman yang membutuhkannya (useRiwayat / muatRiwayat).
// Semua tabel besar diambil per 1.000 baris (batas baris Supabase), jadi tidak ada data terpotong.
// ---------------------------------------------------------------------------------------------
export const JENDELA_OPERASIONAL_HARI = 14;
export const tanggalLokal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const awalJendelaOperasional = (hariIni: Date = new Date()) => {
    const d = new Date(hariIni);
    d.setDate(d.getDate() - JENDELA_OPERASIONAL_HARI);
    return tanggalLokal(d);
};

/** Ambil semua baris per 1.000 (urutan WAJIB stabil di `buat`). */
export async function ambilBertahap(buat: (dari: number, sampai: number) => any, batasBaris = 200000): Promise<{ data: any[]; error: any }> {
    const semua: any[] = [];
    for (let dari = 0; dari < batasBaris; dari += 1000) {
        const { data, error } = await buat(dari, dari + 999);
        if (error) return { data: semua, error };
        semua.push(...(data || []));
        if (!data || data.length < 1000) break;
    }
    return { data: semua, error: null };
}

/** Nama/marhalah/kelas untuk baris absensi bentuk lama. */
export function beriNamaAbsensi(rows: any[], k: { santriAktif: any[]; semuaSantri: any[]; musammiList: any[]; musammiData: any[] }): AttendanceRecord[] {
    return (rows || [])
        .map((a: any): AttendanceRecord | null => {
            let person: any = null;
            if (a.peran === 'Santri' || a.peran === Peran.Santri) {
                person = k.santriAktif.find((p) => p.id === a.personId)
                    || k.semuaSantri.find((p) => p.id === a.personId);
            } else {
                person = k.musammiList.find((p) => p.id === a.personId)
                    || (k.musammiData || []).find((p) => p.id === a.personId);
            }
            const nama = person?.nama || (a.peran === 'Santri' ? `Santri (${a.personId})` : `Musammi (${a.personId})`);
            return {
                ...a,
                id: a.id,
                date: a.date,
                waktu: a.waktu as Waktu,
                personId: a.personId,
                nama,
                marhalah: (person?.marhalah || '-') as any,
                kelas: person?.kelas || '-',
                peran: a.peran as Peran,
                status: a.status as AttendanceStatus,
                halaqahId: a.halaqahId,
            };
        })
        .filter((a): a is AttendanceRecord => a !== null);
}

export interface KonteksAbsensi {
    orgId: string; yearId: number; semMulai: string | null; semSelesai: string | null;
    statusesList: AttendanceStatusRef[]; kindsList: RecitationKind[];
    santriAktif: any[]; semuaSantri: any[]; musammiList: any[]; musammiData: any[];
}

/** Absensi santri & musammi' + setoran sesuai lingkup ('jendela' = 14 hari + terakhir per santri; 'lengkap' = semester/semua). */
export async function ambilAbsensiSetoran(k: Pick<KonteksAbsensi, 'orgId' | 'yearId' | 'semMulai' | 'semSelesai'>, lengkap: boolean, catatGalat: (tabel: string, e: any) => void) {
    const sb: any = supabase;
    const mulai = awalJendelaOperasional();
    const adaSemester = Boolean(k.semMulai && k.semSelesai);
    const join = lengkap && !adaSemester ? ', halaqah_sessions!inner(academic_year_id)' : '';
    const saring = (q: any, kol: string) => {
        if (!lengkap) return q.gte(kol, mulai);
        return adaSemester ? q.gte(kol, k.semMulai).lte(kol, k.semSelesai) : q.eq('halaqah_sessions.academic_year_id', k.yearId);
    };
    const tabel = async (nama: string, buat: (dari: number, sampai: number) => any) => {
        const r = await ambilBertahap(buat);
        if (r.error) catatGalat(nama, r.error);
        return r.data;
    };
    const [santriAtt, musammiAtt, setoran, terakhir] = await Promise.all([
        tabel('attendance_records', (a, b) => saring(sb.from('attendance_records').select('*' + join).eq('organization_id', k.orgId), 'attendance_date')
            .order('attendance_date', { ascending: true }).order('id', { ascending: true }).range(a, b)),
        tabel('musammi_attendance_records', (a, b) => saring(sb.from('musammi_attendance_records').select('*' + join).eq('organization_id', k.orgId), 'attendance_date')
            .order('attendance_date', { ascending: true }).order('id', { ascending: true }).range(a, b)),
        tabel('recitation_entries', (a, b) => {
            let q = sb.from('recitation_entries').select('*').eq('organization_id', k.orgId).neq('status', 'voided');
            if (!lengkap) q = q.gte('recitation_date', mulai);
            return q.order('recitation_date', { ascending: true }).order('id', { ascending: true }).range(a, b);
        }),
        lengkap ? Promise.resolve([] as any[]) : tabel('rpc_setoran_terakhir', (a, b) => sb.rpc('rpc_setoran_terakhir', { p_org: k.orgId }).range(a, b)),
    ]);
    // Gabung setoran jendela + setoran terakhir per santri (tanpa duplikat), urut tanggal naik
    const peta = new Map<string, any>();
    for (const r of [...(terakhir || []), ...(setoran || [])]) peta.set(String(r.id), r);
    const gabung = [...peta.values()].sort((x, y) =>
        String(x.recitation_date).localeCompare(String(y.recitation_date)) || String(x.created_at || '').localeCompare(String(y.created_at || '')));
    return { santriAtt, musammiAtt, setoran: gabung };
}
