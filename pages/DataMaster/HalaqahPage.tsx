import React, { useState, useMemo, useRef, useEffect } from 'react';
import { MarhalahLabel, KelasLabel } from '../../components/Labels';
import Card from '../../components/Card';
import Modal from '../../components/Modal';
import ActionDropdown from '../../components/ActionDropdown';
import SantriMultiSelect from '../../components/SantriMultiSelect';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { useAcademicYear } from '../../lib/AcademicYearContext';
import { HalaqahType, Marhalah, Waktu, Halaqah, Santri } from '../../types';
import {   Plus, Trash, Users, Edit, ArrowLeft, X, Search, Upload, Download, FileSpreadsheet, FileText, Save, CheckSquare, Square, Clock, ChevronDown, Hash, Check, ChevronRight, RefreshCw , Calendar  } from 'lucide-react';
import { useLocation, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { parseSpreadsheet, exportToExcel, exportToPDF } from '../../lib/utils';
import { supabase } from '../../lib/supabaseClient';
import { StatusBadge, LoadingState } from '../../components/ui/SaaSPrimitives';
import { NotificationStore } from '../../lib/NotificationStore';
import { useHalaqahPageLogika, type HalaqahPageLogika, WaktuDropdown, SearchableMusammiSelect } from './HalaqahPage.logika';

export * from './HalaqahPage.logika';

const HalaqahPage: React.FC = () => {
  const s = useHalaqahPageLogika();
  if ((s as any).__berhenti) return (s as any).__kembali;
  const { location, halaqahId, halaqah, musammi, santri, addHalaqah, deleteHalaqah, deleteHalaqahBatch, restoreHalaqah, updateHalaqah, addSantriToHalaqah, keluarkanSantri, mutasiSantri, assignHalaqahMusammi, fetchData, loading, error, getOrgId, globalMarhalahs, globalJenisHalaqah, globalWaktuHalaqah, masterMarhalahs, masterKelasRelasi, selectedAcademicYear, fileInputRef, activeViewTab, setActiveViewTab, selectedHalaqah, setSelectedHalaqah, modalType, setModalType, isSubmitting, setIsSubmitting, manageStatusModalOpen, setManageStatusModalOpen, manageStatusType, setManageStatusType, manageSantriId, setManageSantriId, manageTargetHalaqahId, setManageTargetHalaqahId, manageDate, setManageDate, showRiwayat, setShowRiwayat, rosterAsOfDate, setRosterAsOfDate, musammiModalOpen, setMusammiModalOpen, musammiAssignType, setMusammiAssignType, musammiAssignId, setMusammiAssignId, musammiValidFrom, setMusammiValidFrom, musammiValidTo, setMusammiValidTo, musammiAssignNotes, setMusammiAssignNotes, selectedHalaqahIds, setSelectedHalaqahIds, currentPage, setCurrentPage, itemsPerPage, filterStatus, setFilterStatus, newHalaqahName, setNewHalaqahName, noUrut, setNoUrut, selectedMusammiId, setSelectedMusammiId, selectedJenis, setSelectedJenis, selectedMarhalah, setSelectedMarhalah, selectedWaktu, setSelectedWaktu, selectedSantriIds, setSelectedSantriIds, isCustomJenis, setIsCustomJenis, customJenisName, setCustomJenisName, filterJenis, setFilterJenis, filterMarhalah, setFilterMarhalah, filterSearch, setFilterSearch, availableTypes, scheduleAnalysis, filteredHalaqah, totalPages, paginatedHalaqah, availableSantri, toggleSelectAll, toggleSelectRow, handleBulkDelete, openEditModal, toggleWaktuSelection, handleCreate, handleUpdateHalaqahSubmit, handleAssignMusammiSubmit, handleDelete, handleRestore, openManageStatusModal, handleManageStatusSubmit, handleDownloadTemplate, handleImportCSV, getDetailedExportData, handleExportExcel, handleExportPDF, renderFormContent } = s;

  return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20 max-w-[1400px] font-sans">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 sm:gap-4">
                <div className="min-w-0 flex-1">
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                        Kelompok Halaqah
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Kelola kelompok halaqah, penugasan Musammi, riwayat mutasi anggota, dan deteksi bentrok waktu sesi otomatis.
                    </p>
                </div>
            </div>

            {!selectedHalaqah && (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-2">
                    <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                        <button
                            type="button"
                            onClick={() => setActiveViewTab('groups')}
                            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                                activeViewTab === 'groups'
                                    ? 'bg-white text-slate-900 shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            Daftar Halaqah ({filteredHalaqah.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveViewTab('schedule')}
                            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                                activeViewTab === 'schedule'
                                    ? 'bg-white text-slate-900 shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            Jadwal & Bentrok ({scheduleAnalysis.totalConflicts} Konflik)
                        </button>
                    </div>
                    {scheduleAnalysis.totalConflicts > 0 && activeViewTab === 'groups' && (
                        <button
                            type="button"
                            onClick={() => setActiveViewTab('schedule')}
                            className="px-3 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200 text-xs font-semibold hover:bg-red-100"
                        >
                            Lihat {scheduleAnalysis.totalConflicts} Bentrok Waktu Sesi →
                        </button>
                    )}
                </div>
            )}

            {selectedHalaqah ? (
                // DETAIL VIEW
                <div className="space-y-6">
                    <button onClick={() => setSelectedHalaqah(null)} className="btn btn-secondary btn-sm mb-2">
                        <ArrowLeft size={16} className="mr-2" /> Kembali ke Daftar
                    </button>

                    {/* Detail Card ... standard card style */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                        <div className="flex flex-col md:flex-row justify-between items-start px-6 py-5 border-b border-slate-100 bg-slate-50/30">
                            <div>
                                <h2 className="text-xl font-bold text-slate-800">
                                    {selectedHalaqah.nama}
                                    {selectedHalaqah.is_active === false && (
                                        <span className="ml-3 text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-1 rounded-md border border-amber-200 align-middle">Diarsipkan</span>
                                    )}
                                </h2>
                                <div className="flex items-center text-sm text-slate-500 mt-2 space-x-3 flex-wrap gap-y-2">
                                    <span className="flex items-center font-mono text-xs bg-slate-200/50 px-2 rounded-md">#{selectedHalaqah.id}</span>
                                    <span className="flex items-center font-semibold text-slate-700"><Users size={14} className="mr-1.5"/> Utama: {selectedHalaqah.musammi.nama}</span>
                                    {(selectedHalaqah.substitute_musammi || []).length > 0 && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold">
                                            Pengganti: {(selectedHalaqah.substitute_musammi || []).map((m) => m.nama).join(', ')}
                                        </span>
                                    )}
                                    <span>•</span><span><MarhalahLabel text={selectedHalaqah.marhalah} id={selectedHalaqah.marhalah_id} /></span>
                                    <span>•</span><span>{selectedHalaqah.jenis}</span>
                                    <span>•</span><span>No. {selectedHalaqah.no_urut || '-'}</span>
                                    <span>•</span><span className="flex items-center text-slate-600 font-medium bg-slate-100 px-2 py-0.5 rounded-md"><Clock size={12} className="mr-1.5"/> {selectedHalaqah.waktu.join(', ')}</span>
                                    {selectedHalaqah.created_at && (
                                        <>
                                            <span>•</span>
                                            <span className="flex items-center text-slate-500 font-medium">
                                                <Calendar size={12} className="mr-1.5" /> Dibuat: {format(new Date(selectedHalaqah.created_at), 'dd MMM yyyy', { locale: localeId })}
                                            </span>
                                        </>
                                    )}
                                    {selectedHalaqah.is_active === false && selectedHalaqah.updated_at && (
                                        <>
                                            <span>•</span>
                                            <span className="flex items-center text-amber-600 font-medium">
                                                <Calendar size={12} className="mr-1.5" /> Diarsipkan: {format(new Date(selectedHalaqah.updated_at), 'dd MMM yyyy', { locale: localeId })}
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2 mt-4 md:mt-0">
                                {selectedHalaqah.is_active === false ? (
                                    <button onClick={() => handleRestore(selectedHalaqah.id)} className="h-9 px-4 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-semibold hover:bg-emerald-100 transition-colors flex items-center">
                                        <RefreshCw size={14} className="mr-2" strokeWidth={2.5}/> Kembalikan Halaqah
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setMusammiAssignType('substitute');
                                                setMusammiAssignId('');
                                                setMusammiValidFrom(new Date().toISOString().split('T')[0]);
                                                setMusammiValidTo('');
                                                setMusammiAssignNotes('');
                                                setMusammiModalOpen(true);
                                            }}
                                            className="h-9 px-3.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition-colors flex items-center gap-1.5"
                                        >
                                            <Users size={14} /> Penugasan Musammi (Utama / Pengganti)
                                        </button>
                                        <button onClick={() => handleDelete(selectedHalaqah.id)} className="h-9 px-4 rounded-lg bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 transition-colors flex items-center">
                                            <Trash size={14} className="mr-2" strokeWidth={2.5}/> Arsipkan Halaqah
                                        </button>
                                        <button onClick={openEditModal} className="btn btn-primary btn-sm">
                                            <Edit size={14} strokeWidth={2.5} /> Edit Data
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Panel Penugasan Musammi Kanonikal V2 (Primary & Substitute) */}
                        {(selectedHalaqah.musammi_assignments || []).length > 0 && (
                            <div className="px-6 py-3.5 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className="font-semibold text-slate-600">Penugasan Musammi V2:</span>
                                    {(selectedHalaqah.musammi_assignments || [])
                                        .filter((a) => a.is_active)
                                        .map((a, idx) => (
                                            <span
                                                key={a.id || idx}
                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-semibold ${
                                                    a.assignment_type === 'primary'
                                                        ? 'bg-blue-50 text-blue-800 border-blue-200'
                                                        : 'bg-blue-50 text-blue-800 border-blue-200'
                                                }`}
                                            >
                                                <span>{a.assignment_type === 'primary' ? 'Utama' : 'Pengganti'}:</span>
                                                <span className="font-bold">{a.musammi?.nama || `#${a.musammi_id}`}</span>
                                                <span className="font-mono text-2xs opacity-75">
                                                    ({a.valid_from}{a.valid_to ? ` s/d ${a.valid_to}` : ''})
                                                </span>
                                            </span>
                                        ))}
                                </div>
                            </div>
                        )}

                        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-bold text-slate-800">
                                    {rosterAsOfDate
                                        ? `Rekonstruksi Roster Historis per Tanggal ${rosterAsOfDate}`
                                        : `Anggota Aktif (${selectedHalaqah.active_santri?.length || selectedHalaqah.santri.length})`}
                                </h3>
                                <p className="text-2xs text-slate-500">
                                    Berdasarkan tanggal mulai & selesai keanggotaan santri di halaqah.
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-xs font-semibold text-slate-600">Tinjau Roster per Tanggal:</label>
                                <input
                                    type="date"
                                    value={rosterAsOfDate}
                                    onChange={(e) => setRosterAsOfDate(e.target.value)}
                                    className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 bg-white"
                                />
                                {rosterAsOfDate && (
                                    <button
                                        type="button"
                                        onClick={() => setRosterAsOfDate('')}
                                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700"
                                    >
                                        Reset ke Hari Ini
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="overflow-x-auto min-h-[300px]">
                            {(() => {
                                const displayMembers: Santri[] = rosterAsOfDate
                                    ? (selectedHalaqah.history || [])
                                          .filter(
                                              (h) =>
                                                  h.start_date <= rosterAsOfDate &&
                                                  (!h.end_date || h.end_date >= rosterAsOfDate) &&
                                                  h.santri
                                          )
                                          .map((h) => h.santri!)
                                    : selectedHalaqah.active_santri || selectedHalaqah.santri;
                                const uniqueMembers: Santri[] = Array.from(
                                    new Map<number, Santri>(displayMembers.map((m) => [m.id, m])).values()
                                ).sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));

                                return (
                                    <table className="tabel">
                                        <thead>
                                            <tr>
                                                <th className="w-12 text-center">No.</th>
                                                <th className="w-16 text-center">ID</th>
                                                <th>Nama Santri</th>
                                                <th>Kelas</th>
                                                <th className="text-right">Aksi</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {uniqueMembers.map((s, idx) => (
                                                <tr key={s.id}>
                                                    <td className="text-xs font-bold text-slate-500 text-center">{idx + 1}</td>
                                                    <td className="text-xs font-mono font-medium text-slate-400 text-center">#{s.id}</td>
                                                    <td className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{s.nama}</td>
                                                    <td className="text-sm font-semibold text-slate-600"><KelasLabel text={s.kelas} id={s.kelas_id} /></td>
                                                    <td className="text-right">
                                                        {!rosterAsOfDate && (
                                                            <div className="opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex justify-end">
                                                                <button title="Mutasi / Keluarkan Santri" onClick={() => openManageStatusModal(s.id)} className="h-9 px-3 inline-flex items-center justify-center rounded-xl bg-slate-50 text-slate-500 hover:bg-amber-500 hover:text-white transition-all shadow-sm text-xs font-semibold gap-1.5">
                                                                    <RefreshCw size={14} strokeWidth={2.5}/> Kelola Status
                                                                </button>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                            {uniqueMembers.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="text-center py-16 text-sm text-slate-500 font-medium">
                                                        {rosterAsOfDate
                                                            ? `Tidak ada anggota halaqah yang tercatat aktif pada tanggal ${rosterAsOfDate}.`
                                                            : 'Belum ada anggota aktif.'}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                );
                            })()}
                            
                            <div className="p-6 border-t border-slate-100">
                                <button
                                    onClick={() => setShowRiwayat(!showRiwayat)}
                                    className="w-full py-2.5 rounded-lg border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors"
                                >
                                    {showRiwayat ? 'Tutup Riwayat Anggota' : `Lihat riwayat anggota keluar/mutasi (${(selectedHalaqah.history || []).filter(h => h.status !== 'Aktif').length})`}
                                </button>
                            </div>

                            {showRiwayat && (
                                <table className="tabel">
                                    <thead>
                                        <tr>
                                            <th className="w-12 text-center">No.</th>
                                            <th>Nama Santri</th>
                                            <th>Tgl Masuk (valid_from)</th>
                                            <th>Tgl Keluar (valid_to)</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(selectedHalaqah.history || []).filter(h => h.status !== 'Aktif').sort((a,b) => new Date(b.end_date || '').getTime() - new Date(a.end_date || '').getTime()).map((h, idx) => (
                                            <tr key={`${h.santri_id}-${h.start_date}-${idx}`}>
                                                <td className="text-xs font-bold text-slate-500 text-center">{idx + 1}</td>
                                                <td className="text-sm font-bold text-slate-800">{h.santri?.nama || '-'}</td>
                                                <td className="text-sm font-semibold text-slate-600">{h.start_date}</td>
                                                <td className="text-sm font-semibold text-slate-600">{h.end_date || '-'}</td>
                                                <td className="text-sm font-bold text-slate-500">
                                                    <span className="bg-slate-100 px-2.5 py-1 rounded-md">{h.status}</span>
                                                </td>
                                            </tr>
                                        ))}
                                        {(selectedHalaqah.history || []).filter(h => h.status !== 'Aktif').length === 0 && <tr><td colSpan={5} className="text-center py-16 text-sm text-slate-500 font-medium">Belum ada riwayat anggota yang keluar/pindah.</td></tr>}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                    
                    {/* EDIT MODAL */}
                    <Modal isOpen={modalType === 'edit'} onClose={() => setModalType(null)} title="Edit Data Halaqah">
                        {renderFormContent(true)}
                    </Modal>

                    {/* MODAL PENUGASAN MUSAMMI UTAMA / PENGGANTI (FASE 4 SECTION 5) */}
                    <Modal
                        isOpen={musammiModalOpen}
                        onClose={() => setMusammiModalOpen(false)}
                        title={`Penugasan Musammi Halaqah — ${selectedHalaqah.nama}`}
                    >
                        <form onSubmit={handleAssignMusammiSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">
                                    Tipe Penugasan (assignment_type)
                                </label>
                                <select
                                    value={musammiAssignType}
                                    onChange={(e) => setMusammiAssignType(e.target.value as 'primary' | 'substitute')}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white font-semibold text-slate-800"
                                >
                                    <option value="primary">Musammi Utama (Primary — Menggantikan Musammi Utama Sebelumnya)</option>
                                    <option value="substitute">Musammi Pengganti / Badal (Substitute — Sementara)</option>
                                </select>
                            </div>

                            <SearchableMusammiSelect
                                musammiList={musammi}
                                selectedId={musammiAssignId}
                                onChange={setMusammiAssignId}
                            />

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">
                                        Berlaku Mulai (valid_from) <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="date"
                                        required
                                        value={musammiValidFrom}
                                        onChange={(e) => setMusammiValidFrom(e.target.value)}
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">
                                        Berlaku Sampai (valid_to)
                                    </label>
                                    <input
                                        type="date"
                                        value={musammiValidTo}
                                        onChange={(e) => setMusammiValidTo(e.target.value)}
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">
                                    Catatan Penugasan
                                </label>
                                <input
                                    type="text"
                                    placeholder="Contoh: Badal selama Musammi utama bertugas keluar kota..."
                                    value={musammiAssignNotes}
                                    onChange={(e) => setMusammiAssignNotes(e.target.value)}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800"
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                                <button
                                    type="button"
                                    onClick={() => setMusammiModalOpen(false)}
                                    className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting || !musammiAssignId}
                                    className="btn btn-primary btn-sm"
                                >
                                    {isSubmitting ? 'Menyimpan...' : 'Simpan Penugasan'}
                                </button>
                            </div>
                        </form>
                    </Modal>
                </div>
            ) : activeViewTab === 'schedule' ? (
                <div className="space-y-4">
                    {/* Panel Deteksi Bentrok Jadwal */}
                    <div className={`p-5 rounded-xl border ${scheduleAnalysis.totalConflicts > 0 ? 'bg-red-50/70 border-red-200' : 'bg-emerald-50/60 border-emerald-200'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                            <div>
                                <h3 className="text-sm font-bold text-slate-900">
                                    Audit Deteksi Bentrok Jadwal Sesi Halaqah
                                </h3>
                                <p className="text-xs text-slate-600 mt-0.5">
                                    Memeriksa apakah ada Musammi atau Santri yang terdaftar pada lebih dari 1 halaqah aktif di waktu sesi yang sama.
                                </p>
                            </div>
                            <StatusBadge
                                label={
                                    scheduleAnalysis.totalConflicts > 0
                                        ? `${scheduleAnalysis.totalConflicts} KONFLIK DITEMUKAN`
                                        : '0 KONFLIK JADWAL'
                                }
                                tone={scheduleAnalysis.totalConflicts > 0 ? 'danger' : 'success'}
                            />
                        </div>

                        {scheduleAnalysis.totalConflicts > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                                {scheduleAnalysis.musammiConflicts.map((c, idx) => (
                                    <div key={`mc-${idx}`} className="p-3 rounded-lg bg-white border border-red-200 text-xs">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-bold text-red-700">Bentrok Musammi • Waktu {c.waktu}</span>
                                            <StatusBadge label="DOUBLE-BOOKED" tone="danger" />
                                        </div>
                                        <p className="text-slate-800 font-semibold">{c.musammiName}</p>
                                        <p className="text-slate-500 mt-0.5">
                                            Terdaftar di: <span className="font-medium text-slate-700">{c.halaqahNames.join(', ')}</span>
                                        </p>
                                    </div>
                                ))}
                                {scheduleAnalysis.santriConflicts.map((c, idx) => (
                                    <div key={`sc-${idx}`} className="p-3 rounded-lg bg-white border border-amber-200 text-xs">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-bold text-amber-800">Bentrok Santri • Waktu {c.waktu}</span>
                                            <StatusBadge label="BENTROK ANGGOTA" tone="warning" />
                                        </div>
                                        <p className="text-slate-800 font-semibold">{c.santriName}</p>
                                        <p className="text-slate-500 mt-0.5">
                                            Terdaftar di: <span className="font-medium text-slate-700">{c.halaqahNames.join(', ')}</span>
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Matriks Jadwal Harian per Waktu Sesi */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {scheduleAnalysis.timeSlots.map((slot) => {
                            const slotGroups = scheduleAnalysis.bySlot[slot] || [];
                            return (
                                <div key={slot} className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
                                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                                        <span className="text-xs font-semibold text-slate-800">
                                            Sesi {slot}
                                        </span>
                                        <StatusBadge label={`${slotGroups.length} HALAQAH`} tone="primary" />
                                    </div>
                                    <div className="divide-y divide-slate-200 flex-1">
                                        {slotGroups.map((g) => (
                                            <div
                                                key={g.id}
                                                onClick={() => setSelectedHalaqah(g)}
                                                className="px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-xs font-bold text-slate-900">{g.nama}</span>
                                                    <span className="text-2xs font-medium text-slate-500">
                                                        {(g.active_santri || g.santri || []).length} santri
                                                    </span>
                                                </div>
                                                <div className="text-2xs text-slate-600 mt-0.5">
                                                    Musammi: <span className="font-semibold">{g.musammi?.nama || '-'}</span> • {g.marhalah}
                                                </div>
                                            </div>
                                        ))}
                                        {slotGroups.length === 0 && (
                                            <div className="px-4 py-8 text-center text-xs text-slate-400">
                                                Tidak ada halaqah terjadwal pada waktu {slot}.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                // LIST VIEW
                <>
                    <div className="flex justify-end">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            {selectedHalaqahIds.length > 0 && (
                                <button 
                                    onClick={handleBulkDelete} 
                                    disabled={isSubmitting}
                                    className="btn btn-danger-soft"
                                >
                                    <Trash size={16} strokeWidth={2.5}/> Arsipkan {selectedHalaqahIds.length} Terpilih
                                </button>
                            )}

                            <input type="file" ref={fileInputRef} onChange={handleImportCSV} accept=".csv,.xlsx,.xls" className="hidden" />
                            
                            <ActionDropdown label="Ekspor" icon={<Download size={14}/>}>
                                <button onClick={handleExportExcel} className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left">
                                    <FileSpreadsheet size={14} className="mr-2 text-emerald-600"/> Ekspor Excel Lengkap
                                </button>
                                <button onClick={handleExportPDF} className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left border-t border-slate-100">
                                    <FileText size={14} className="mr-2 text-red-600"/> Ekspor PDF Lengkap
                                </button>
                            </ActionDropdown>
                            
                            <ActionDropdown label="Impor" icon={<Upload size={14}/>}>
                                <button onClick={() => fileInputRef.current?.click()} className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left">
                                    <FileSpreadsheet size={14} className="mr-2 text-emerald-600"/> Upload File
                                </button>
                                <button onClick={handleDownloadTemplate} className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left border-t border-slate-100">
                                    <Download size={14} className="mr-2 text-blue-600"/> Unduh Templat
                                </button>
                            </ActionDropdown>
                            
                            <button 
                                onClick={() => { setModalType('create'); setNewHalaqahName(''); setNoUrut(999); setSelectedSantriIds([]); setSelectedWaktu([Waktu.Shubuh, Waktu.Ashar, Waktu.Isya]); setSelectedMusammiId(''); }} 
                                className="btn btn-primary justify-center"
                            >
                                <Plus size={16} strokeWidth={2.5}/> Buat Baru
                            </button>
                        </div>
                    </div>

                    <div className="panel-filter">
                      <div className="grid-filter">
                        <input 
                                                                type="text" 
                                                                placeholder="Cari halaqah atau musammi..."
                                                                value={filterSearch} 
                                                                onChange={e => setFilterSearch(e.target.value)} 
                                                                className="kontrol kontrol-cari"
                                                            />
                        <select 
                                                                        value={filterJenis} onChange={e => setFilterJenis(e.target.value as any)}
                                                                        className="kontrol"
                                                                    >
                                                                        <option value="all">Semua Jenis</option>{availableTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                                                    </select>
                        <select 
                                                                        value={filterMarhalah} onChange={e => setFilterMarhalah(e.target.value as any)}
                                                                        className="kontrol"
                                                                    >
                                                                        <option value="all">Semua Marhalah</option>{masterMarhalahs?.map((m) => <option key={m.id} value={m.nama}>{m.nama}</option>) || globalMarhalahs.map((m) => <option key={m} value={m}>{m}</option>)}
                                                                    </select>
                        <select 
                                                                        value={filterStatus}
                                                                        onChange={(e) => setFilterStatus(e.target.value as any)}
                                                                        className="kontrol"
                                                                    >
                                                                        <option value="Aktif">Aktif</option>
                                                                        <option value="Diarsipkan">Diarsipkan</option>
                                                                        <option value="Semua">Semua status</option>
                                                                    </select>
                      </div>
                    </div>
                    <div className="wadah-tabel">
                        

                        <div className="min-h-[400px] overflow-x-auto">
                            <table className="tabel tabel-kartu">
                                <thead>
                                    <tr>
                                        <th className="w-12 text-center">
                                            <button onClick={toggleSelectAll} className="text-slate-400 hover:text-blue-600 transition-colors">
                                                {selectedHalaqahIds.length === filteredHalaqah.length && filteredHalaqah.length > 0 
                                                    ? <CheckSquare size={16} className="text-blue-600"/> 
                                                    : <Square size={16}/>
                                                }
                                            </button>
                                        </th>
                                        <th className="w-16 text-center">No/ID</th>
                                        <th>Nama Halaqah & Jenis</th>
                                        <th>Musammi'</th>
                                        <th>Waktu</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedHalaqah.map(h => {
                                        const isSelected = selectedHalaqahIds.includes(h.id);
                                        return (
                                            <tr key={h.id} className={`hover:bg-blue-50/30 transition-colors cursor-pointer group ${isSelected ? 'bg-blue-50/50' : ''}`} onClick={() => { setSelectedHalaqah(h); setShowRiwayat(false); setRosterAsOfDate(''); }}>
                                                <td className="text-center" onClick={(e) => { e.stopPropagation(); toggleSelectRow(h.id); }}>
                                                    {isSelected ? <CheckSquare size={16} className="text-blue-600"/> : <Square size={16} className="text-slate-300 group-hover:text-slate-400"/>}
                                                </td>
                                                <td data-label="No/ID" className="text-2xs font-mono font-bold text-slate-400 text-center flex flex-col">
                                                    <span className="text-sm text-slate-700">{h.no_urut || '-'}</span>
                                                    <span className="text-2xs font-normal opacity-70">#{h.id}</span>
                                                </td>
                                                <td>
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{h.nama}</span>
                                                            {h.is_active === false && (
                                                                <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">Arsip</span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className="text-xs font-semibold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-md border border-blue-200">{h.jenis}</span>
                                                            <span className="text-xs font-semibold text-slate-500"><MarhalahLabel text={h.marhalah} id={h.marhalah_id} /></span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td data-label="Musammi'" className="text-sm font-bold text-slate-700">
                                                    <div>{h.musammi.nama}</div>
                                                    {(h.substitute_musammi || []).length > 0 && (
                                                        <div className="text-2xs font-semibold text-blue-600 mt-0.5">
                                                            Pengganti: {(h.substitute_musammi || []).map((s) => s.nama).join(', ')}
                                                        </div>
                                                    )}
                                                </td>
                                                <td data-label="Waktu" className="text-xs font-medium text-slate-500 max-w-[150px] truncate" title={h.waktu.join(', ')}>
                                                    <div className="flex items-center gap-1.5 text-slate-600 bg-slate-50 px-2 py-1 rounded-md w-fit border border-slate-200/60 font-semibold shadow-sm">
                                                        <Clock size={12}/> {h.waktu.join(', ')}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {filteredHalaqah.length === 0 && <tr><td colSpan={5} className="text-center py-16 text-sm text-slate-500 font-medium">Tidak ada data ditemukan.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                        {filteredHalaqah.length > itemsPerPage && (
                            <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-600">
                                <span>
                                    Menampilkan <span className="font-bold">{paginatedHalaqah.length}</span> dari <span className="font-bold">{filteredHalaqah.length}</span> kelompok halaqah
                                </span>
                                <div className="inline-flex items-center gap-2">
                                    <button
                                        type="button"
                                        disabled={currentPage <= 1}
                                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                        className="px-3 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-semibold"
                                    >
                                        Sebelumnya
                                    </button>
                                    <span className="font-mono">
                                        Hal {currentPage} / {totalPages}
                                    </span>
                                    <button
                                        type="button"
                                        disabled={currentPage >= totalPages}
                                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                        className="px-3 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-semibold"
                                    >
                                        Berikutnya
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Create Modal */}
                    <Modal isOpen={modalType === 'create'} onClose={() => setModalType(null)} title="Buat Halaqah Baru">
                        {renderFormContent(false)}
                    </Modal>
                </>
            )}

            {/* Manage Status Modal */}
            <Modal isOpen={manageStatusModalOpen} onClose={() => setManageStatusModalOpen(false)} title="Kelola Status Santri">
                <form onSubmit={handleManageStatusSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-2">Pilih Aksi</label>
                        <div className="relative">
                            <select 
                                value={manageStatusType}
                                onChange={(e) => setManageStatusType(e.target.value as 'mutasi' | 'keluar')}
                                className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none text-sm font-medium text-slate-700 transition-all appearance-none"
                            >
                                <option value="mutasi">Pindah Halaqah</option>
                                <option value="keluar">Keluar / Berhenti</option>
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                <ChevronDown size={16} />
                            </div>
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-2">Tanggal Berubah <span className="text-red-500">*</span></label>
                        <input 
                            type="date"
                            value={manageDate}
                            onChange={(e) => setManageDate(e.target.value)}
                            className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none text-sm font-medium text-slate-700 transition-all"
                            required
                        />
                    </div>

                    {manageStatusType === 'mutasi' && (
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-2">Halaqah Tujuan <span className="text-red-500">*</span></label>
                            <div className="relative">
                                <select 
                                    value={manageTargetHalaqahId}
                                    onChange={(e) => setManageTargetHalaqahId(e.target.value)}
                                    className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none text-sm font-medium text-slate-700 transition-all appearance-none"
                                    required={manageStatusType === 'mutasi'}
                                >
                                    <option value="" disabled>Pilih Halaqah Tujuan...</option>
                                    {halaqah.filter(h => h.id !== selectedHalaqah?.id).map(h => (
                                        <option key={h.id} value={h.id}>{h.nama} - {h.jenis} ({h.musammi.nama})</option>
                                    ))}
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                    <ChevronDown size={16} />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-100">
                        <button type="button" onClick={() => setManageStatusModalOpen(false)} className="px-5 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 transition-colors">Batal</button>
                        <button type="submit" disabled={isSubmitting || (manageStatusType === 'mutasi' && !manageTargetHalaqahId)} className="btn btn-primary">
                            {isSubmitting ? 'Menyimpan...' : 'Simpan Status'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default HalaqahPage;
