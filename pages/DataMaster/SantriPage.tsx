import { tampilKode } from '../../lib/telegramPesan';
import { PeringatanLangganan } from '../../components/LanggananLembaga';
import { arahSantri } from '../../lib/arahHafalan';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MarhalahLabel, KelasLabel } from '../../components/Labels';
import Card from '../../components/Card';
import Modal from '../../components/Modal';
import ActionDropdown from '../../components/ActionDropdown';
import { useSupabaseData, useRiwayat } from '../../hooks/useSupabaseData';
import { useAcademicYear } from '../../lib/AcademicYearContext';
import { Marhalah, Santri } from '../../types';
import { Plus, Trash, Upload, Download, Search, Edit, FileText, FileSpreadsheet, ChevronRight, Send, Link as LinkIcon, ListFilter, ArrowUpDown } from 'lucide-react';
import { parseSpreadsheet, exportToExcel, exportToPDF } from '../../lib/utils';
import { supabase } from '../../lib/supabaseClient';
import { StatusBadge, LoadingState } from '../../components/ui/SaaSPrimitives';
import { NotificationStore } from '../../lib/NotificationStore';
import { useSantriPageLogika, type SantriPageLogika, normalizeTanggal } from './SantriPage.logika';

export * from './SantriPage.logika';

const SantriPage: React.FC = () => {
  const s = useSantriPageLogika();
  const { studentId, navigate, handleWA, allSantri, santri, halaqah, setoranHarian, fetchData, loading, error, getOrgId, masterKelas, globalMarhalahs, masterMarhalahs, masterKelasRelasi, selectedAcademicYear, academicYears, isModalOpen, setIsModalOpen, isSubmitting, setIsSubmitting, editingPerson, setEditingPerson, detailSantri, setDetailSantri, studentEnrollmentHistory, setStudentEnrollmentHistory, formData, setFormData, filterMarhalah, setFilterMarhalah, filterKelas, setFilterKelas, filterSearch, setFilterSearch, filterStatus, setFilterStatus, filterUnenrolledOnly, setFilterUnenrolledOnly, sortConfig, setSortConfig, handleSort, getSortIcon, fileInputRef, currentPage, setCurrentPage, itemsPerPage, activeSantri, enrolledIdSet, unenrolledCount, openDetailTimeline, availableFilterKelas, availableFormKelas, filteredData, paginatedData, totalPages, openModal, handleSubmit, handleDelete, handleDownloadTemplate, handleImportCSV, handleExportPDF } = s;


    if (loading) return <LoadingState label="Memuat data…" />;
    if (error) return <p className="text-error">{error}</p>;
  return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20 max-w-[1400px] font-sans">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 sm:gap-4">
                <div className="min-w-0 flex-1">
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                        Data Santri
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Identitas santri dan kelasnya pada tahun ajaran ini. Klik nama santri untuk melihat progres & riwayat kelas.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
                    <input type="file" ref={fileInputRef} onChange={handleImportCSV} accept=".csv,.xlsx,.xls" className="hidden" />
                    
                    <ActionDropdown label="Ekspor data" icon={<Download size={14}/>}>
                        <button onClick={() => exportToExcel(filteredData, 'Data_Santri')} className="flex items-center w-full px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors text-left">
                            <FileSpreadsheet size={16} className="mr-3 text-emerald-600"/> Ekspor Excel
                        </button>
                        <button onClick={handleExportPDF} className="flex items-center w-full px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors text-left border-t border-slate-100">
                            <FileText size={16} className="mr-3 text-red-600"/> Ekspor PDF
                        </button>
                    </ActionDropdown>
                    
                    <ActionDropdown label="Impor data" icon={<Upload size={14}/>}>
                        <button onClick={() => fileInputRef.current?.click()} className="flex items-center w-full px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors text-left">
                            <FileSpreadsheet size={16} className="mr-3 text-emerald-600"/> Unggah file Excel/CSV
                        </button>
                        <button onClick={handleDownloadTemplate} className="flex items-center w-full px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors text-left border-t border-slate-100">
                            <Download size={16} className="mr-3 text-blue-600"/> Unduh template
                        </button>
                    </ActionDropdown>
                    
                    <button 
                        onClick={() => openModal(null)} 
                        className="btn btn-primary justify-center"
                    >
                        <Plus size={16} strokeWidth={2.5}/> Tambah Data
                    </button>
                </div>
            </div>

            <PeringatanLangganan />

            {/* Banner Kesiapan Enrollment Tahun Ajaran Aktif */}
            <div className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${unenrolledCount > 0 ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50/70 border-emerald-200 text-emerald-900'}`}>
                <div className="flex items-center gap-3">
                    <StatusBadge
                        label={unenrolledCount > 0 ? `${unenrolledCount} belum punya kelas` : 'Semua sudah punya kelas'}
                        tone={unenrolledCount > 0 ? 'warning' : 'success'}
                    />
                    <span className="text-xs font-medium">
                        {unenrolledCount > 0
                            ? `Terdapat ${unenrolledCount} santri aktif yang belum memiliki penempatan kelas pada Tahun Ajaran ${selectedAcademicYear?.name || 'ini'}.`
                            : `Seluruh ${enrolledIdSet.size} santri aktif telah memiliki penempatan kelas pada Tahun Ajaran ${selectedAcademicYear?.name || 'ini'}.`}
                    </span>
                </div>
                {unenrolledCount > 0 && (
                    <button
                        type="button"
                        onClick={() => setFilterUnenrolledOnly((prev) => !prev)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                            filterUnenrolledOnly
                                ? 'bg-amber-900 text-white border-amber-900'
                                : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100'
                        }`}
                    >
                        {filterUnenrolledOnly ? 'Tampilkan Semua Santri' : 'Tampilkan yang belum punya kelas'}
                    </button>
                )}
            </div>

            {/* Content Wrap */}
            <div className="panel-filter">
              <div className="grid-filter">
                <input 
                                                type="text" 
                                                placeholder="Cari nama / ID santri..."
                                                value={filterSearch} 
                                                onChange={e => setFilterSearch(e.target.value)} 
                                                className="kontrol kontrol-cari"
                                            />
                <select 
                                                        value={filterMarhalah} 
                                                        onChange={e => {setFilterMarhalah(e.target.value as any); setFilterKelas('all')}}
                                                        className="kontrol"
                                                    >
                                                        <option value="all">Semua Marhalah</option>
                                                        {masterMarhalahs.map((m) => <option key={m.id} value={m.nama}>{m.nama}</option>)}
                                                    </select>
                <select 
                                                        value={filterKelas} 
                                                        onChange={e => setFilterKelas(e.target.value)} 
                                                        disabled={filterMarhalah === 'all'} 
                                                        className="kontrol"
                                                    >
                                                        <option value="all">Semua Kelas</option>
                                                        {filterMarhalah !== 'all' && availableFilterKelas.map(k => <option key={k} value={k}>{k}</option>)}
                                                    </select>
                <select 
                                                        value={filterStatus}
                                                        onChange={e => setFilterStatus(e.target.value)}
                                                        className="kontrol"
                                                    >
                                                        <option value="active">Aktif</option>
                                                        <option value="inactive">Tidak Aktif</option>
                                                        <option value="all">Semua Status</option>
                                                    </select>
              </div>
            </div>
            <div className="wadah-tabel">
                

                <div className="wadah-tabel min-h-[400px] hide-scrollbar overflow-x-auto">
                                        <table className="tabel tabel-kartu">
                        <thead>
                            <tr>
                                <th className="w-12 text-center">No</th>
                                <th className="w-16 text-center"><div onClick={() => handleSort('id')} className="flex items-center justify-center gap-1.5 group cursor-pointer hover:text-slate-600 transition-colors"><span>ID</span>{getSortIcon('id')}</div></th>
                                <th className="min-w-[200px]"><div onClick={() => handleSort('nama')} className="flex items-center justify-start gap-1.5 group cursor-pointer hover:text-slate-600 transition-colors"><span>Nama Santri</span>{getSortIcon('nama')}</div></th>
                                <th className="min-w-[140px]"><div onClick={() => handleSort('marhalah_kelas')} className="flex items-center justify-start gap-1.5 group cursor-pointer hover:text-slate-600 transition-colors"><span>Marhalah & Kelas</span>{getSortIcon('marhalah_kelas')}</div></th>
                                <th className="text-center w-24"><div onClick={() => handleSort('status')} className="flex items-center gap-1.5 justify-center group cursor-pointer hover:text-slate-600 transition-colors"><span>Status Santri</span>{getSortIcon('status')}</div></th>
                                <th className="min-w-[160px]"><div onClick={() => handleSort('nama_wali')} className="flex items-center justify-start gap-1.5 group cursor-pointer hover:text-slate-600 transition-colors"><span>Nama Wali</span>{getSortIcon('nama_wali')}</div></th>
                                <th className="min-w-[140px]"><div onClick={() => handleSort('no_hp_wali')} className="flex items-center justify-start gap-1.5 group cursor-pointer hover:text-slate-600 transition-colors"><span>No HP Wali</span>{getSortIcon('no_hp_wali')}</div></th>
                                <th className="text-center min-w-[140px]"><div onClick={() => handleSort('telegram_chat_id')} className="flex items-center gap-1.5 justify-center group cursor-pointer hover:text-slate-600 transition-colors"><span>Telegram Wali</span>{getSortIcon('telegram_chat_id')}</div></th>
                                <th className="text-right w-24">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedData.map((s, idx) => (
                                <tr key={s.id}>
                                    <td data-label="No" className="text-xs font-medium text-slate-500 text-center">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
                                    <td data-label="ID" className="text-xs font-medium text-slate-400 text-center group-hover:text-blue-500 transition-colors">#{s.id}</td>
                                    <td className="cursor-pointer" onClick={() => openDetailTimeline(s)}>
                                        <div className="flex items-center gap-4">
                                            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gradient-to-br from-blue-50 to-blue-50 border border-blue-100 flex items-center justify-center shadow-sm">
                                                <span className="text-xs font-extrabold text-blue-600">
                                                    {s.nama.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                                </span>
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{s.nama}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    {s.kode && <span className="text-2xs font-medium text-slate-500">NIS: {s.kode}</span>}
                                                    {!enrolledIdSet.has(s.id) && (
                                                        <StatusBadge label="Belum punya kelas" tone="warning" />
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td data-label="Marhalah & kelas">
                                        <div className="flex flex-col gap-1">
                                            <span className="inline-flex self-start items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-600"><MarhalahLabel text={s.marhalah} id={s.marhalah_id} /></span>
                                            <span className="text-sm font-bold text-slate-700">Kelas <KelasLabel text={s.kelas} id={s.kelas_id} /></span>
                                        </div>
                                    </td>
                                    
                                    <td data-label="Status" className="text-center">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-2xs font-bold uppercase tracking-wider ${(s.status || 'active') === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                            {(s.status || 'active') === 'active' ? 'Aktif' : 'Tidak Aktif'}
                                        </span>
                                    </td>
                                    <td data-label="Nama wali">
                                        {s.nama_wali ? (
                                            <span className="text-sm font-bold text-slate-700">{s.nama_wali}</span>
                                        ) : (
                                            <span className="text-xs italic text-slate-400 font-medium">Belum ada data</span>
                                        )}
                                    </td>
                                    <td data-label="No HP wali">
                                        {s.no_hp_wali ? (
                                            <button onClick={(e) => { e.stopPropagation(); handleWA(s.no_hp_wali!); }} className="inline-flex items-center text-2xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-md hover:bg-emerald-100 transition-colors tracking-wide border border-emerald-200/60 shadow-sm">
                                                <Send size={12} className="mr-1.5" strokeWidth={2.5}/> {s.no_hp_wali}
                                            </button>
                                        ) : (
                                            <span className="text-xs italic text-slate-400 font-medium">Belum ada data</span>
                                        )}
                                    </td>
                                    <td data-label="Telegram" className="text-center" onClick={(e) => e.stopPropagation()}>
                                        {/* Fase 6: status tautan wali + kode santri (kelola di Notifikasi Telegram) */}
                                        {s.telegram_chat_id ? (
                                            <span className="text-xs font-semibold text-emerald-700">Tertaut</span>
                                        ) : (
                                            <span className="text-xs text-slate-400 font-medium">Belum</span>
                                        )}
                                        {(s as any).kode_telegram && <div className="text-2xs font-mono text-slate-400 tracking-wider">{tampilKode((s as any).kode_telegram)}</div>}
                                    </td>
                                    <td data-label="Aksi" className="text-right">
                                        <div className="flex justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => openDetailTimeline(s)}
                                                className="px-2.5 h-9 inline-flex items-center justify-center rounded-xl bg-slate-50 text-slate-600 hover:bg-slate-200 text-2xs font-bold transition-all shadow-sm"
                                                title="Lihat riwayat kelas"
                                            >
                                                Linimasa
                                            </button>
                                            <button onClick={() => openModal(s)} className="h-9 w-9 inline-flex items-center justify-center rounded-xl bg-slate-50 text-slate-500 hover:bg-blue-500 hover:text-white transition-all shadow-sm">
                                                <Edit size={14} strokeWidth={2.5}/>
                                            </button>
                                            <button onClick={() => handleDelete(s.id)} className="h-9 w-9 inline-flex items-center justify-center rounded-xl bg-slate-50 text-slate-500 hover:bg-red-500 hover:text-white transition-all shadow-sm">
                                                <Trash size={14} strokeWidth={2.5}/>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {paginatedData.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="text-center py-16 text-sm text-slate-500 font-medium">
                                        Tidak ada data yang ditemukan.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="flex justify-between items-center bg-slate-50/50 border-t border-slate-100 p-5 px-6">
                        <p className="text-sm font-medium text-slate-500">
                            Menampilkan <span className="font-bold text-slate-700">{((currentPage - 1) * itemsPerPage) + 1}</span> - <span className="font-bold text-slate-700">{Math.min(currentPage * itemsPerPage, filteredData.length)}</span> dari <span className="font-bold text-slate-700">{filteredData.length}</span> data
                        </p>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="btn btn-secondary"
                            >
                                Sebelumnya
                            </button>
                            <span className="px-4 py-2 text-sm font-bold text-slate-700 bg-white border border-slate-200/80 rounded-xl shadow-sm flex items-center justify-center min-w-[3rem]">
                                {currentPage} / {totalPages}
                            </span>
                            <button 
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="btn btn-secondary"
                            >
                                Selanjutnya
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingPerson ? "Edit Santri" : "Tambah Santri"}>
                <div className="space-y-5">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-2">NIS <span className="text-red-500">*</span></label>
                            <input type="text" placeholder="Masukkan NIS" className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white text-sm font-semibold text-slate-800 placeholder:text-slate-400" value={formData.kode} onChange={e => setFormData({...formData, kode: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-2">Nama Lengkap <span className="text-red-500">*</span></label>
                            <input type="text" placeholder="Nama Lengkap" className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white text-sm font-semibold text-slate-800 placeholder:text-slate-400" value={formData.nama} onChange={e => setFormData({...formData, nama: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-2 gap-5">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-2">Tanggal Lahir</label>
                                <input type="date" max={new Date().toISOString().slice(0, 10)} className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-slate-50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white text-sm font-semibold text-slate-800" value={formData.tanggal_lahir} onChange={e => setFormData({...formData, tanggal_lahir: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-2">Asal</label>
                                <input type="text" placeholder="Kota/kabupaten asal" className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-slate-50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white text-sm font-semibold text-slate-800 placeholder:text-slate-400" value={formData.asal} onChange={e => setFormData({...formData, asal: e.target.value})} />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-2">Arah Hafalan</label>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                {([
                                    { v: 'maju', t: 'Maju', d: 'Dari Al-Fatihah ke An-Nas' },
                                    { v: 'mundur', t: 'Mundur', d: 'Dari An-Nas ke Al-Baqarah (juz 30 dulu)' },
                                    { v: 'dua_arah', t: 'Dua arah', d: 'Hafalan dari depan dan dari belakang' },
                                ] as const).map(o => (
                                    <button key={o.v} type="button" onClick={() => setFormData({...formData, arah_hafalan: o.v})}
                                        className={`text-left border rounded-xl px-3 py-2 transition-all ${formData.arah_hafalan === o.v ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/10' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}>
                                        <span className="block text-sm font-bold text-slate-800">{o.t}</span>
                                        <span className="block text-2xs text-slate-500">{o.d}</span>
                                    </button>
                                ))}
                            </div>
                            <p className="text-2xs text-slate-400 mt-1">Dipakai untuk menebak ayat awal setoran berikutnya dan menghitung posisi hafalan. Dua arah: setiap ziyadah otomatis menambah sisi (depan/belakang) yang paling dekat.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-5">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-2">Marhalah <span className="text-red-500">*</span></label>
                                <select 
                                    className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white text-sm font-semibold text-slate-800 cursor-pointer" 
                                    value={formData.marhalah} 
                                    onChange={e => {
                                        const newMarhalah = e.target.value;
                                        const targetM = masterMarhalahs?.find((m) => m.nama === newMarhalah);
                                        let availableForNew = targetM
                                            ? masterKelasRelasi?.filter((k) => k.marhalah_id === targetM.id).map((k) => k.nama_kelas)
                                            : [];
                                        if (!availableForNew || availableForNew.length === 0) {
                                            availableForNew = masterKelas?.filter(m => m.marhalah === newMarhalah).map(m => m.nama_kelas) || [];
                                        }
                                        setFormData({
                                            ...formData, 
                                            marhalah: newMarhalah, 
                                            kelas: availableForNew[0] || ''
                                        });
                                    }}
                                >
                                    {masterMarhalahs?.map((m) => <option key={m.id} value={m.nama}>{m.nama}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col">
                                <label className="block text-xs font-semibold text-slate-500 mb-2">Kelas <span className="text-red-500">*</span></label>
                                <select 
                                    className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white text-sm font-semibold text-slate-800 cursor-pointer" 
                                    value={formData.kelas} 
                                    onChange={e => setFormData({...formData, kelas: e.target.value})}
                                >
                                    {availableFormKelas.length === 0 && <option value="">Tidak ada kelas (atur di Pengaturan)</option>}
                                    {availableFormKelas.map(k => <option key={k} value={k}>{k}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    <div className="border-t border-slate-200/80 pt-5 space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-1.5 h-4 bg-emerald-500 rounded-full"></div>
                            <p className="text-xs font-semibold text-slate-700">Data Wali</p>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-2">Nama Wali</label>
                            <input type="text" placeholder="Nama Wali Santri" className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white text-sm font-semibold text-slate-800 placeholder:text-slate-400" value={formData.nama_wali} onChange={e => setFormData({...formData, nama_wali: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-2">No HP / WhatsApp</label>
                            <input type="text" placeholder="08xxxxxxxxxx" className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white text-sm font-semibold text-slate-800 placeholder:text-slate-400" value={formData.no_hp_wali} onChange={e => setFormData({...formData, no_hp_wali: e.target.value})} />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-2">Telegram Chat ID <span className="normal-case font-medium text-slate-400">(terisi otomatis saat wali mengirim kode ke bot)</span></label>
                            <input type="text" placeholder="Contoh: 123456789" className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white text-sm font-semibold text-slate-800 placeholder:text-slate-400" value={formData.telegram_chat_id} onChange={e => setFormData({...formData, telegram_chat_id: e.target.value})} />
                        </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-slate-100">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-1.5 h-4 bg-orange-500 rounded-full"></div>
                            <p className="text-xs font-semibold text-slate-700">Status Santri</p>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-2">Status <span className="text-red-500">*</span></label>
                            <select className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white text-sm font-semibold text-slate-800 cursor-pointer appearance-none" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})}>
                                <option value="active">Aktif</option>
                                <option value="inactive">Tidak Aktif</option>
                            </select>
                        </div>
                    </div>
                    
                    <div className="flex justify-end pt-6 gap-3 border-t border-slate-200/80">
                        <button onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors">Batal</button>
                        <button onClick={handleSubmit} disabled={isSubmitting} className="btn btn-primary justify-center min-w-[120px]">
                            {isSubmitting ? (
                                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div> Menyimpan...</>
                            ) : 'Simpan Data'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Modal Linimasa Progres & Riwayat Enrollment Santri */}
            <Modal
                isOpen={Boolean(detailSantri)}
                onClose={() => {
                    setDetailSantri(null);
                    if (studentId) navigate('/app/students', { replace: true });
                }}
                title={`Profil Induk & Linimasa Santri — ${detailSantri?.nama || ''}`}
            >
                {detailSantri && (
                    <div className="space-y-4">
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-bold text-slate-900">{detailSantri.nama}</div>
                                <div className="text-xs text-slate-500 mt-0.5">
                                    ID #{detailSantri.id} • NIS: {detailSantri.kode || '-'} • Wali: {detailSantri.nama_wali || '-'}
                                </div>
                            </div>
                            <StatusBadge
                                label={(detailSantri.status || 'active') === 'active' ? 'SANTRI AKTIF' : 'NON-AKTIF'}
                                tone={(detailSantri.status || 'active') === 'active' ? 'success' : 'neutral'}
                            />
                        </div>

                        <div>
                            <h4 className="text-xs font-semibold text-slate-600 mb-2">
                                Riwayat kelas per tahun ajaran
                            </h4>
                            <div className="wadah-tabel">
                                <table className="tabel">
                                    <thead>
                                        <tr>
                                            <th>Tahun Ajaran</th>
                                            <th>Marhalah & Kelas</th>
                                            <th>Status penempatan</th>
                                            <th>Periode Efektif</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {studentEnrollmentHistory.map((row) => {
                                            const ayObj = (academicYears || []).find((a) => a.id === row.academic_year_id);
                                            const st = row.status || row.enrollment_status || 'active';
                                            return (
                                                <tr key={row.id || row.academic_year_id}>
                                                    <td className="font-semibold text-slate-800">
                                                        {ayObj?.name || `TA #${row.academic_year_id}`}
                                                    </td>
                                                    <td>
                                                        <span className="text-slate-600">{row.marhalah}</span> •{' '}
                                                        <span className="font-bold text-blue-700">Kelas {row.kelas}</span>
                                                    </td>
                                                    <td>
                                                        <StatusBadge
                                                            label={String(st).toUpperCase()}
                                                            tone={
                                                                st === 'active'
                                                                    ? 'success'
                                                                    : st === 'promoted' || st === 'graduated'
                                                                    ? 'primary'
                                                                    : 'warning'
                                                            }
                                                        />
                                                    </td>
                                                    <td className="font-mono text-2xs text-slate-500">
                                                        {row.enrolled_at || '-'} {row.left_at ? `s/d ${row.left_at}` : '(Aktif)'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {studentEnrollmentHistory.length === 0 && (
                                            <tr>
                                                <td colSpan={4} className="px-3.5 py-4 text-center text-slate-400">
                                                    Belum ada riwayat enrollment tercatat pada tahun ajaran manapun.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div>
                            <h4 className="text-xs font-semibold text-slate-600 mb-2">
                                2. Keanggotaan Halaqah & Ringkasan Setoran
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="p-3 rounded-lg border border-slate-200 bg-white">
                                    <div className="text-2xs font-semibold text-slate-500 uppercase">Halaqah Binaan</div>
                                    <div className="text-xs font-bold text-slate-900 mt-1">
                                        {(halaqah || [])
                                            .filter((h) => (h.active_santri || h.santri).some((st) => st.id === detailSantri.id))
                                            .map((h) => `${h.nama} (${h.musammi?.nama || '-'})`)
                                            .join(', ') || 'Belum tergabung di halaqah aktif'}
                                    </div>
                                </div>
                                <div className="p-3 rounded-lg border border-slate-200 bg-white">
                                    <div className="text-2xs font-semibold text-slate-500 uppercase">Transaksi Setoran Tercatat</div>
                                    <div className="text-xs font-bold text-slate-900 mt-1">
                                        {(setoranHarian || []).filter((st) => st.santri_id === detailSantri.id).length} kali setoran pada periode aktif
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                            <button
                                type="button"
                                onClick={() => {
                                    const target = detailSantri;
                                    setDetailSantri(null);
                                    if (studentId) navigate('/app/students', { replace: true });
                                    openModal(target);
                                }}
                                className="btn btn-primary btn-sm"
                            >
                                Edit Santri / Penempatan Kelas
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setDetailSantri(null);
                                    if (studentId) navigate('/app/students', { replace: true });
                                }}
                                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default SantriPage;
