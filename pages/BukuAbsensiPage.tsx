import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useSupabaseData, useRiwayat } from '../hooks/useSupabaseData';
import ActionDropdown from '../components/ActionDropdown';
import Modal from '../components/Modal';
import { supabase } from '../lib/supabaseClient';
import { NotificationStore } from '../lib/NotificationStore';
import { format, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import {
  Printer,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  Check
} from 'lucide-react';
import type { Page, Peran, Waktu } from '../types';
import { useBukuAbsensiPageLogika, type BukuAbsensiPageLogika, type BukuAbsensiPageProps, type StudentRow } from './BukuAbsensiPage.logika';

export * from './BukuAbsensiPage.logika';

export const BukuAbsensiPage: React.FC<BukuAbsensiPageProps> = (props) => {
  const s = useBukuAbsensiPageLogika(props);
  const { onNavigate, halaqah, santri, attendance, addAttendanceRecords, userProfile, globalWaktuHalaqah, globalAttendanceStatus, masterMarhalahs, orgName, orgLogo, loading, isAdminUser, correctionTarget, setCorrectionTarget, isSavingCorrection, setIsSavingCorrection, handleSaveCorrection, startDate, setStartDate, endDate, setEndDate, daysInRange, availableWaktuList, selectedWaktuSessions, setSelectedWaktuSessions, isWaktuDropdownOpen, setIsWaktuDropdownOpen, waktuDropdownRef, toggleWaktuSession, handleSelectAllWaktu, activeWaktuSessions, filterMarhalah, setFilterMarhalah, filterKelas, setFilterKelas, filterJenisHalaqah, setFilterJenisHalaqah, filterPeran, setFilterPeran, searchQuery, setSearchQuery, permittedHalaqah, availableMarhalahList, availableJenisHalaqahList, availableKelasList, handleResetFilters, isAnyFilterActive, sortField, setSortField, sortDirection, setSortDirection, handleSort, attendanceLookup, studentRows, renderStatusCell, calculateStudentSummary, handlePrint } = s;

  return (
    <div className="space-y-6 print:space-y-4">
      {/* =====================================================================
          HEADER HALAMAN
      ===================================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Buku Absensi</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Rekapitulasi kehadiran santri dalam format matriks tanggal dan sesi halaqah.
            {isAdminUser && (
              <span className="ml-1.5 text-blue-600 font-medium">
                (Admin: Klik sel status pada matriks untuk koreksi kehadiran teraudit)
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-center">
          <ActionDropdown
            label="Cetak"
            icon={<Printer size={15} />}
            variant="blue"
          >
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center w-full px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 text-left transition-colors"
            >
              Cetak Data
            </button>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('CetakBukuFisik')}
                className="flex items-center w-full px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 text-left border-t border-slate-100 transition-colors"
              >
                Cetak Buku Fisik
              </button>
            )}
          </ActionDropdown>
        </div>
      </div>

      {/* =====================================================================
          KOP LEMBAGA (Hanya Tampil Saat Dicetak / window.print)
      ===================================================================== */}
      <div className="hidden print:block mb-4 pb-3 border-b-2 border-slate-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {orgLogo && <img src={orgLogo} alt="Logo" className="h-12 w-12 object-contain" />}
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {orgName || "LEMBAGA TAHFIZ AL-QUR'AN"}
              </h2>
              <p className="text-xs text-slate-700 font-medium">
                REKAPITULASI BUKU ABSENSI HALAQAH SANTRI
              </p>
            </div>
          </div>
          <div className="text-right text-2xs text-slate-600">
            <p>
              Periode:{' '}
              <span className="font-semibold text-slate-900">
                {format(daysInRange[0], 'dd MMM yyyy', { locale: localeId })} -{' '}
                {format(daysInRange[daysInRange.length - 1], 'dd MMM yyyy', { locale: localeId })}
              </span>
            </p>
            <p>Dicetak pada: {format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
          </div>
        </div>
      </div>

      {/* =====================================================================
          FILTER BAR (Seragam dengan Input Absensi: Tanpa Judul Kolom, Tinggi h-11)
          Urutan: 1. Rentang Tanggal, 2. Marhalah, 3. Kelas, 4. Jenis Halaqah, 5. Waktu, 6. Cari Nama Santri
      ===================================================================== */}
      <div className="relative z-40 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs print:hidden space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-center">
          {/* 1. Tanggal Mulai */}
          <div className="col-span-1">
            <div className="relative flex items-center h-11 w-full rounded-xl border border-slate-200/90 bg-white px-3 shadow-xs hover:border-slate-300 hover:bg-slate-50 focus-within:bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
              <span className="text-2xs font-semibold text-slate-400 mr-2 shrink-0">Dari:</span>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full flex-1 min-w-0 bg-transparent text-xs font-semibold text-slate-700 outline-none cursor-pointer [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70 hover:[&::-webkit-calendar-picker-indicator]:opacity-100"
                title="Tanggal Mulai"
              />
            </div>
          </div>

          {/* 2. Tanggal Selesai */}
          <div className="col-span-1">
            <div className="relative flex items-center h-11 w-full rounded-xl border border-slate-200/90 bg-white px-3 shadow-xs hover:border-slate-300 hover:bg-slate-50 focus-within:bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
              <span className="text-2xs font-semibold text-slate-400 mr-2 shrink-0">Sampai:</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full flex-1 min-w-0 bg-transparent text-xs font-semibold text-slate-700 outline-none cursor-pointer [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70 hover:[&::-webkit-calendar-picker-indicator]:opacity-100"
                title="Tanggal Selesai"
              />
            </div>
          </div>

          {/* 3. Peran */}
          <div className="relative w-full col-span-1">
            <select
              value={filterPeran}
              onChange={e => setFilterPeran(e.target.value)}
              className="appearance-none h-11 w-full rounded-xl border border-slate-200/90 bg-white pl-3.5 pr-9 text-sm font-medium text-slate-700 shadow-xs outline-none cursor-pointer transition-colors hover:border-slate-300 hover:bg-slate-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 truncate"
            >
              <option value="all">Semua Peran</option>
              <option value="Santri">Santri</option>
              <option value="Musammi">Musammi</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          </div>

          {/* 4. Marhalah */}
          <div className="relative w-full col-span-1">
            <select
              value={filterMarhalah}
              onChange={e => setFilterMarhalah(e.target.value)}
              className="appearance-none h-11 w-full rounded-xl border border-slate-200/90 bg-white pl-3.5 pr-9 text-sm font-medium text-slate-700 shadow-xs outline-none cursor-pointer transition-colors hover:border-slate-300 hover:bg-slate-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 truncate"
            >
              <option value="all">Semua Marhalah</option>
              {availableMarhalahList.map(m => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          </div>

          {/* 5. Kelas */}
          <div className="relative w-full col-span-1">
            <select
              value={filterKelas}
              onChange={e => setFilterKelas(e.target.value)}
              className="appearance-none h-11 w-full rounded-xl border border-slate-200/90 bg-white pl-3.5 pr-9 text-sm font-medium text-slate-700 shadow-xs outline-none cursor-pointer transition-colors hover:border-slate-300 hover:bg-slate-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 truncate"
            >
              <option value="all">Semua Kelas</option>
              {availableKelasList.map(k => (
                <option key={k} value={k}>
                  Kelas {k}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          </div>

          {/* 6. Jenis Halaqah */}
          <div className="relative w-full col-span-1">
            <select
              value={filterJenisHalaqah}
              onChange={e => setFilterJenisHalaqah(e.target.value)}
              className="appearance-none h-11 w-full rounded-xl border border-slate-200/90 bg-white pl-3.5 pr-9 text-sm font-medium text-slate-700 shadow-xs outline-none cursor-pointer transition-colors hover:border-slate-300 hover:bg-slate-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 truncate"
            >
              <option value="all">Semua Jenis Halaqah</option>
              {availableJenisHalaqahList.map(j => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          </div>

          {/* 7. Waktu (Dropdown Multiselect) */}
          <div className="col-span-1 relative z-50" ref={waktuDropdownRef}>
            <button
              type="button"
              onClick={() => setIsWaktuDropdownOpen(prev => !prev)}
              className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200/90 bg-white pl-3.5 pr-9 text-sm font-medium text-slate-700 shadow-xs transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-left cursor-pointer truncate"
            >
              <span className="truncate">
                {selectedWaktuSessions.length === availableWaktuList.length
                  ? `Semua Waktu (${availableWaktuList.length})`
                  : selectedWaktuSessions.length === 0
                  ? 'Pilih Waktu...'
                  : selectedWaktuSessions.join(', ')}
              </span>
              <ChevronDown
                size={16}
                className={`absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none transition-transform duration-200 ${
                  isWaktuDropdownOpen ? 'rotate-180 text-blue-600' : ''
                }`}
              />
            </button>

            {/* Menu Popover Multiselect */}
            {isWaktuDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-slate-200/90 rounded-xl shadow-xl p-2 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-slate-100 px-1">
                  <span className="text-2xs font-semibold text-slate-500">Pilih Sesi Waktu</span>
                  <button
                    type="button"
                    onClick={handleSelectAllWaktu}
                    className="text-2xs font-semibold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                  >
                    {selectedWaktuSessions.length === availableWaktuList.length
                      ? 'Kosongkan'
                      : 'Pilih Semua'}
                  </button>
                </div>
                <div className="space-y-0.5 max-h-48 overflow-y-auto">
                  {availableWaktuList.map(session => {
                    const isChecked = selectedWaktuSessions.includes(session);
                    return (
                      <label
                        key={session}
                        onClick={e => {
                          e.preventDefault();
                          toggleWaktuSession(session);
                        }}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-50 cursor-pointer select-none transition-colors"
                      >
                        <span className="text-slate-800 font-medium">{session}</span>
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                            isChecked
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isChecked && <Check size={12} strokeWidth={3} />}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 8. Cari Nama (Santri / Musammi) */}
          <div className="relative group w-full col-span-1">
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-hover:text-blue-500 transition-colors pointer-events-none"
            />
            <input
              type="text"
              placeholder="Cari nama..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="flex h-11 w-full rounded-xl border border-slate-200/90 bg-white pl-10 pr-4 text-sm font-medium text-slate-700 shadow-xs transition-all hover:border-slate-300 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-slate-400"
            />
          </div>
        </div>
      </div>

      {/* =====================================================================
          TABEL MATRIKS BUKU ABSENSI TUNGGAL (TIDAK DIPISAH PER HALAQAH)
      ===================================================================== */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-xs text-slate-500">Memuat data buku absensi...</p>
        </div>
      ) : activeWaktuSessions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center text-slate-500 text-xs">
          Silakan pilih minimal 1 sesi waktu pada filter Sesi Waktu di atas untuk menampilkan data absensi.
        </div>
      ) : studentRows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center text-slate-500 text-xs">
          Tidak ada data santri yang sesuai dengan filter yang dipilih.
        </div>
      ) : (
        <>
        {/* Fase 7 · HP: ringkasan per santri sebagai kartu (matriks tanggal tampil di layar ≥ 640 px & saat cetak) */}
        <div className="sm:hidden print:hidden space-y-2">
          <p className="text-sm text-slate-500 px-1">Ringkasan kehadiran {studentRows.length} orang. Buka di layar lebar untuk melihat matriks per tanggal.</p>
          {studentRows.map((student) => {
            const summary = calculateStudentSummary(student.id, student.peran);
            return (
              <div key={`hp_${student.peran}_${student.id}_${student.halaqahId}`} className="bg-white rounded-xl border border-slate-200 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 text-base truncate">{student.nama}</div>
                    <div className="text-sm text-slate-500">{student.peran} · {student.halaqahNama}{student.kelas && student.kelas !== '-' ? ` · ${student.kelas}` : ''}</div>
                  </div>
                  <div className="text-xl font-extrabold text-slate-900 tabular-nums">{summary.percentage}%</div>
                </div>
                <div className="mt-2.5 grid grid-cols-5 gap-1.5 text-center text-sm">
                  {([['Hadir', summary.h, 'text-emerald-700 bg-emerald-50'], ['Izin', summary.i, 'text-blue-700 bg-blue-50'], ['Sakit', summary.s, 'text-amber-700 bg-amber-50'], ['Alpa', summary.a, 'text-red-700 bg-red-50'], ['Telat', summary.t, 'text-yellow-700 bg-yellow-50']] as [string, number, string][]).map(([l, v, c]) => (
                    <div key={l} className={`rounded-lg py-1.5 ${c}`}><div className="font-bold tabular-nums">{v}</div><div className="text-xs">{l}</div></div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="hidden sm:block print:block relative z-10 bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden print:border print:border-slate-300 print:shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                {/* Header Baris 1: No, Nama Santri, Peran, Kelas, Halaqah, Header Tanggal, Header Rekapitulasi */}
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <th
                    rowSpan={2}
                    className="sticky left-0 print:static print:left-auto z-20 bg-slate-100 py-3.5 px-3 text-center font-bold text-slate-700 border-r border-slate-200 w-12 min-w-[48px] max-w-[48px] text-xs select-none"
                  >
                    No
                  </th>

                  {/* Kolom Nama Santri (Sortable) */}
                  <th
                    rowSpan={2}
                    onClick={() => handleSort('nama')}
                    className="sticky left-12 print:static print:left-auto z-20 bg-slate-100 py-3.5 px-3.5 font-bold text-slate-800 border-r border-slate-200 min-w-[180px] text-sm select-none cursor-pointer hover:bg-slate-200/70 transition-colors group shadow-xs print:shadow-none"
                    title="Klik untuk menyortir nama"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span>Nama</span>
                      <span
                        className={`p-0.5 rounded transition-colors ${
                          sortField === 'nama'
                            ? 'text-blue-600 bg-blue-50'
                            : 'text-slate-400 group-hover:text-slate-600'
                        }`}
                      >
                        {sortField === 'nama' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp size={13} strokeWidth={2.5} />
                          ) : (
                            <ArrowDown size={13} strokeWidth={2.5} />
                          )
                        ) : (
                          <ArrowUpDown size={13} />
                        )}
                      </span>
                    </div>
                  </th>

                  {/* Kolom Peran (Sortable) */}
                  <th
                    rowSpan={2}
                    onClick={() => handleSort('peran')}
                    className="py-3.5 px-3 font-bold text-slate-800 border-r border-slate-200 w-24 text-center text-xs select-none cursor-pointer hover:bg-slate-200/70 transition-colors group"
                    title="Klik untuk menyortir peran"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Peran</span>
                      <span
                        className={`p-0.5 rounded transition-colors ${
                          sortField === 'peran'
                            ? 'text-blue-600 bg-blue-50'
                            : 'text-slate-400 group-hover:text-slate-600'
                        }`}
                      >
                        {sortField === 'peran' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp size={13} strokeWidth={2.5} />
                          ) : (
                            <ArrowDown size={13} strokeWidth={2.5} />
                          )
                        ) : (
                          <ArrowUpDown size={13} />
                        )}
                      </span>
                    </div>
                  </th>

                  {/* Kolom Kelas (Sortable) */}
                  <th
                    rowSpan={2}
                    onClick={() => handleSort('kelas')}
                    className="py-3.5 px-3 font-bold text-slate-800 border-r border-slate-200 w-24 text-center text-xs select-none cursor-pointer hover:bg-slate-200/70 transition-colors group"
                    title="Klik untuk menyortir kelas"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Kelas</span>
                      <span
                        className={`p-0.5 rounded transition-colors ${
                          sortField === 'kelas'
                            ? 'text-blue-600 bg-blue-50'
                            : 'text-slate-400 group-hover:text-slate-600'
                        }`}
                      >
                        {sortField === 'kelas' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp size={13} strokeWidth={2.5} />
                          ) : (
                            <ArrowDown size={13} strokeWidth={2.5} />
                          )
                        ) : (
                          <ArrowUpDown size={13} />
                        )}
                      </span>
                    </div>
                  </th>

                  {/* Kolom Halaqah (Sortable) */}
                  <th
                    rowSpan={2}
                    onClick={() => handleSort('halaqah')}
                    className="py-3.5 px-3.5 font-bold text-slate-800 border-r border-slate-200 min-w-[150px] text-xs select-none cursor-pointer hover:bg-slate-200/70 transition-colors group"
                    title="Klik untuk menyortir halaqah"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span>Halaqah</span>
                      <span
                        className={`p-0.5 rounded transition-colors ${
                          sortField === 'halaqah'
                            ? 'text-blue-600 bg-blue-50'
                            : 'text-slate-400 group-hover:text-slate-600'
                        }`}
                      >
                        {sortField === 'halaqah' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp size={13} strokeWidth={2.5} />
                          ) : (
                            <ArrowDown size={13} strokeWidth={2.5} />
                          )
                        ) : (
                          <ArrowUpDown size={13} />
                        )}
                      </span>
                    </div>
                  </th>

                  {/* Header Tanggal */}
                  {daysInRange.map((day, idx) => (
                    <th
                      key={idx}
                      colSpan={activeWaktuSessions.length}
                      className="py-2.5 px-2 text-center font-bold text-slate-800 border-r border-slate-200 whitespace-nowrap bg-slate-100"
                    >
                      <div className="text-xs font-bold text-slate-800">
                        {format(day, 'EEE', { locale: localeId })}
                      </div>
                      <div className="text-2xs font-medium text-slate-500">
                        {format(day, 'dd/MM')}
                      </div>
                    </th>
                  ))}

                  {/* Header Ringkasan */}
                  <th
                    colSpan={6}
                    className="py-3.5 px-3 text-center font-bold text-slate-800 bg-slate-100 text-xs"
                  >
                    Rekapitulasi
                  </th>
                </tr>

                {/* Header Baris 2: Sub-kolom Sesi Waktu & Sub-kolom Ringkasan */}
                <tr className="bg-slate-50 text-2xs font-semibold text-slate-600 border-b border-slate-200">
                  {daysInRange.map((_, dayIdx) =>
                    activeWaktuSessions.map((session, sIdx) => (
                      <th
                        key={`${dayIdx}_${sIdx}`}
                        className="py-2 px-1 text-center border-r border-slate-200 min-w-[32px]"
                        title={session}
                      >
                        {session.substring(0, 3)}
                      </th>
                    ))
                  )}

                  {/* Sub-kolom Ringkasan */}
                  <th className="py-2 px-1.5 text-center font-bold text-emerald-800 border-r border-slate-200 w-8 text-2xs">
                    H
                  </th>
                  <th className="py-2 px-1.5 text-center font-bold text-blue-800 border-r border-slate-200 w-8 text-2xs">
                    I
                  </th>
                  <th className="py-2 px-1.5 text-center font-bold text-amber-800 border-r border-slate-200 w-8 text-2xs">
                    S
                  </th>
                  <th className="py-2 px-1.5 text-center font-bold text-red-800 border-r border-slate-200 w-8 text-2xs">
                    A
                  </th>
                  <th className="py-2 px-1.5 text-center font-bold text-yellow-800 border-r border-slate-200 w-8 text-2xs">
                    T
                  </th>
                  <th className="py-2 px-2 text-center font-bold text-slate-800 w-12 text-2xs">%</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {studentRows.map((student, sIdx) => {
                  const summary = calculateStudentSummary(student.id, student.peran);

                  return (
                    <tr
                      key={`${student.peran}_${student.id}_${student.halaqahId}`}
                      className="group hover:bg-slate-50/70 transition-colors text-slate-800"
                    >
                      {/* Nomor Urut */}
                      <td className="sticky left-0 print:static print:left-auto z-20 bg-white group-hover:bg-slate-50 py-3 px-2.5 text-center text-slate-500 border-r border-slate-100 text-sm w-12 min-w-[48px] max-w-[48px] transition-colors">
                        {sIdx + 1}
                      </td>

                      {/* Nama */}
                      <td className="sticky left-12 print:static print:left-auto z-20 bg-white group-hover:bg-slate-50 py-3 px-3.5 font-semibold text-slate-900 border-r border-slate-100 whitespace-nowrap text-sm shadow-xs print:shadow-none transition-colors">
                        {student.nama}
                      </td>

                      {/* Peran */}
                      <td className="py-3 px-2.5 text-center border-r border-slate-100 text-xs whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold ${
                            student.peran === 'Musammi'
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}
                        >
                          {student.peran}
                        </span>
                      </td>

                      {/* Kelas */}
                      <td className="py-3 px-2.5 text-center text-slate-600 border-r border-slate-100 text-xs font-medium whitespace-nowrap">
                        {student.kelas}
                      </td>

                      {/* Halaqah */}
                      <td className="py-3 px-3.5 text-slate-600 border-r border-slate-100 text-xs font-medium whitespace-nowrap">
                        {student.halaqahNama}
                      </td>

                      {/* Sel Kehadiran Tiap Hari & Sesi */}
                      {daysInRange.map((day, dayIdx) =>
                        activeWaktuSessions.map((session, sessIdx) => {
                          const dateStr = format(day, 'yyyy-MM-dd');
                          const keyWithRole = `${student.id}_${student.peran}_${dateStr}_${session.toLowerCase().trim()}`;
                          const keySimple = `${student.id}_${dateStr}_${session.toLowerCase().trim()}`;
                          const existingSt = attendanceLookup.get(keyWithRole) || attendanceLookup.get(keySimple) || '';

                          return (
                            <td
                              key={`${dayIdx}_${sessIdx}`}
                              onClick={() => {
                                if (!isAdminUser) return;
                                setCorrectionTarget({
                                  student,
                                  dateStr,
                                  session,
                                  currentStatus: existingSt,
                                  newStatus: existingSt || (globalAttendanceStatus?.[0] || 'Hadir'),
                                  reason: ''
                                });
                              }}
                              title={
                                isAdminUser
                                  ? `Klik untuk koreksi kehadiran ${student.nama} (${dateStr} - ${session})`
                                  : undefined
                              }
                              className={`py-2.5 px-1 text-center border-r border-slate-100 min-w-[32px] ${
                                isAdminUser ? 'cursor-pointer hover:bg-blue-50/70 transition-colors' : ''
                              }`}
                            >
                              {renderStatusCell(student.id, student.peran, day, session)}
                            </td>
                          );
                        })
                      )}

                      {/* Rekapitulasi: Hadir, Izin, Sakit, Alpa, Terlambat, Persentase */}
                      <td className="py-3 px-1.5 text-center font-bold text-emerald-700 bg-emerald-50/30 border-r border-slate-100 text-xs">
                        {summary.h}
                      </td>
                      <td className="py-3 px-1.5 text-center font-bold text-blue-700 bg-blue-50/30 border-r border-slate-100 text-xs">
                        {summary.i}
                      </td>
                      <td className="py-3 px-1.5 text-center font-bold text-amber-700 bg-amber-50/30 border-r border-slate-100 text-xs">
                        {summary.s}
                      </td>
                      <td className="py-3 px-1.5 text-center font-bold text-red-700 bg-red-50/30 border-r border-slate-100 text-xs">
                        {summary.a}
                      </td>
                      <td className="py-3 px-1.5 text-center font-bold text-yellow-700 bg-yellow-50/30 border-r border-slate-100 text-xs">
                        {summary.t}
                      </td>
                      <td className="py-3 px-2 text-center font-extrabold text-slate-900 bg-slate-50/50 text-xs">
                        {summary.percentage}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}

      {/* Modal Koreksi Kehadiran Teraudit (Admin) */}
      <Modal
        isOpen={Boolean(correctionTarget)}
        onClose={() => setCorrectionTarget(null)}
        title="Koreksi Kehadiran Buku Absensi (Teraudit)"
      >
        {correctionTarget && (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Peserta:</span>
                <span className="font-semibold text-slate-900">
                  {correctionTarget.student.nama} ({correctionTarget.student.peran})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Halaqah:</span>
                <span className="font-medium text-slate-800">{correctionTarget.student.halaqahNama}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tanggal & Sesi:</span>
                <span className="font-semibold text-slate-800">
                  {correctionTarget.dateStr} — {correctionTarget.session}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status Saat Ini:</span>
                <span className="font-semibold text-slate-700">
                  {correctionTarget.currentStatus || 'Belum diisi (-)'}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Status Kehadiran Baru
              </label>
              <select
                value={correctionTarget.newStatus}
                onChange={e =>
                  setCorrectionTarget(prev => (prev ? { ...prev, newStatus: e.target.value } : null))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-none"
              >
                {(globalAttendanceStatus?.length
                  ? globalAttendanceStatus
                  : ['Hadir', 'Izin', 'Sakit', 'Alpa', 'Terlambat']
                ).map(st => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Alasan Koreksi (Wajib untuk Audit Log) <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                value={correctionTarget.reason}
                onChange={e =>
                  setCorrectionTarget(prev => (prev ? { ...prev, reason: e.target.value } : null))
                }
                placeholder="Contoh: Koreksi berdasarkan surat keterangan dokter / konfirmasi musyrif..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-800 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCorrectionTarget(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!correctionTarget.reason.trim() || isSavingCorrection}
                onClick={handleSaveCorrection}
                className="btn btn-primary btn-sm"
              >
                {isSavingCorrection ? 'Menyimpan...' : 'Simpan Koreksi & Catat Audit'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Kolom Tanda Tangan Cetak Fisik */}
      <div className="hidden print:grid grid-cols-2 gap-8 pt-8 mt-6 text-center text-xs text-slate-800">
        <div>
          <p className="text-slate-600 mb-16">Pengampu / Musammi Halaqah</p>
          <p className="font-bold border-b border-slate-800 inline-block min-w-[180px] pb-1">
            ( .................................................. )
          </p>
        </div>
        <div>
          <p className="text-slate-600 mb-16">
            Mengetahui,
            <br />
            Koordinator Kepengasuhan & Tahfiz
          </p>
          <p className="font-bold border-b border-slate-800 inline-block min-w-[180px] pb-1">
            ( .................................................. )
          </p>
        </div>
      </div>
    </div>
  );
};

export default BukuAbsensiPage;
