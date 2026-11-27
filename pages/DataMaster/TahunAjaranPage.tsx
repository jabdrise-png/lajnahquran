import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import Modal from '../../components/Modal';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { AcademicYear } from '../../types';
import { Plus, Edit, Trash, RefreshCw, Archive, CheckCircle2, AlertTriangle, ShieldCheck, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAcademicYear } from '../../lib/AcademicYearContext';
import { PageShell, PageHeader, StatCard, StatusBadge, ConfirmDialog } from '../../components/ui/SaaSPrimitives';
import { NotificationStore } from '../../lib/NotificationStore';
import { useTahunAjaranPageLogika, type TahunAjaranPageLogika, LIFECYCLE_LABELS, type AcademicYearLifecycleStatus, type ClosingPrerequisite, type ClosingReadinessReport } from './TahunAjaranPage.logika';

export * from './TahunAjaranPage.logika';

const TahunAjaranPage: React.FC = () => {
  const s = useTahunAjaranPageLogika();
  const { location, searchParams, getOrgId, appSettings, saveAppSetting, fetchData, allSantri, santri, halaqah, masterMarhalahs, masterKelasRelasi, refreshAcademicYears, selectedAcademicYear, activeAcademicYear, isArchivedView, openArchivedYear, returnToActiveYear, isStructureRoute, activeSection, setActiveSection, localAcademicYears, setLocalAcademicYears, loading, setLoading, isModalOpen, setIsModalOpen, isClosingModalOpen, setIsClosingModalOpen, closingTargetYear, setClosingTargetYear, closingReason, setClosingReason, closingReadiness, setClosingReadiness, checkingReadiness, setCheckingReadiness, isSubmitting, setIsSubmitting, editingId, setEditingId, formData, setFormData, isMarhalahModalOpen, setIsMarhalahModalOpen, editingMarhalah, setEditingMarhalah, marhalahForm, setMarhalahForm, isKelasModalOpen, setIsKelasModalOpen, editingKelas, setEditingKelas, kelasForm, setKelasForm, fetchAcademicYears, enrollmentReadiness, getEffectiveLifecycleStatus, openModal, handleSubmit, handleDelete, handleSetActive, handleToggleSemester, handleCloseSemester, handleOpenClosingModal, bukaKembali, setBukaKembali, handleBukaKembali, handleConfirmCloseAcademicYear, getSemesterDateDisplay, openMarhalahModal, handleSaveMarhalah, handleDeleteMarhalah, openKelasModal, handleSaveKelas, handleDeleteKelas } = s;


    if (loading) {
        return <div className="p-6 text-sm text-slate-500">Memuat siklus tahun ajaran...</div>;
    }
  return (
        <PageShell>
            <PageHeader
                title="Tahun Ajaran, Semester & Struktur Kelas"
                description="Kelola tahun ajaran & semester, pemeriksaan prasyarat penutupan tahun ajaran, arsip historis, serta struktur Marhalah/Kelas."
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        {activeSection === 'years' && (
                            <button
                                type="button"
                                onClick={() => openModal(null)}
                                className="btn btn-primary btn-sm"
                            >
                                <Plus size={15} /> Tambah Tahun Ajaran
                            </button>
                        )}
                        {activeSection === 'structure' && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => openMarhalahModal(null)}
                                    className="btn btn-secondary btn-sm"
                                >
                                    <Plus size={14} /> Tambah Marhalah
                                </button>
                                <button
                                    type="button"
                                    onClick={() => openKelasModal(null)}
                                    className="btn btn-primary btn-sm"
                                >
                                    <Plus size={15} /> Tambah Kelas & Wali
                                </button>
                            </>
                        )}
                    </div>
                }
            />

            {/* Banner Mode Arsip Tahun Ajaran Lama */}
            {isArchivedView && selectedAcademicYear && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <Archive size={18} className="text-blue-700 mt-0.5 shrink-0" />
                        <div>
                            <div className="text-xs font-semibold text-blue-900">
                                Mode Arsip Tahun Ajaran: {selectedAcademicYear.name} ({selectedAcademicYear.active_semester})
                            </div>
                            <p className="text-xs text-blue-700 mt-0.5">
                                Anda sedang meninjau data historis tahun ajaran arsip. Tahun ajaran operasional yang sedang aktif adalah{' '}
                                <span className="font-bold">{activeAcademicYear?.name || '-'}</span>.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={returnToActiveYear}
                        className="btn btn-primary btn-sm shrink-0"
                    >
                        Kembali ke Tahun Ajaran Aktif
                    </button>
                </div>
            )}

            {/* Segmented Tab Switch */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-2">
                <div className="inline-flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-lg">
                    <button
                        type="button"
                        onClick={() => setActiveSection('years')}
                        className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                            activeSection === 'years'
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        Tahun Ajaran & Semester ({localAcademicYears.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveSection('structure')}
                        className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                            activeSection === 'structure'
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        Marhalah & Kelas ({masterMarhalahs?.length || 0} Marhalah • {masterKelasRelasi?.length || 0} Kelas)
                    </button>
                </div>
            </div>

            {activeSection === 'structure' ? (
                <div className="space-y-4">
                    {(masterMarhalahs || []).length === 0 ? (
                        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
                            <p className="text-sm font-semibold text-slate-800">Belum Ada Struktur Marhalah</p>
                            <p className="text-xs text-slate-500 mt-1 mb-4">
                                Tambahkan jenjang Marhalah terlebih dahulu (mis. Mutawassithah, Aliyah, Jamiah) sebelum membuat daftar kelas.
                            </p>
                            <button
                                type="button"
                                onClick={() => openMarhalahModal(null)}
                                className="btn btn-primary btn-sm"
                            >
                                <Plus size={14} /> Buat Marhalah Pertama
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {(masterMarhalahs || []).map((m) => {
                                const classesForM = (masterKelasRelasi || []).filter((k) => k.marhalah_id === m.id);
                                return (
                                    <div key={m.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                                        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-slate-900 text-white text-xs font-bold">
                                                    {m.urutan || 1}
                                                </span>
                                                <div>
                                                    <h3 className="text-sm font-bold text-slate-900">{m.nama}</h3>
                                                    <p className="text-2xs text-slate-500">
                                                        {classesForM.length} rombongan belajar terdaftar
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => openKelasModal(null, m.id)}
                                                    className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition-colors"
                                                >
                                                    + Tambah Kelas di {m.nama}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => openMarhalahModal(m)}
                                                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600"
                                                    title="Edit Marhalah"
                                                >
                                                    <Edit size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteMarhalah(m)}
                                                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-red-50 text-red-600"
                                                    title="Hapus Marhalah"
                                                >
                                                    <Trash size={14} />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="wadah-tabel overflow-x-auto">
                                            <table className="tabel">
                                                <thead>
                                                    <tr>
                                                        <th className="w-16">Urutan</th>
                                                        <th>Nama Kelas</th>
                                                        <th>Wali Kelas (Atribut Administratif)</th>
                                                        <th>Kontak Wali Kelas</th>
                                                        <th>Musyrif Pembina</th>
                                                        <th className="text-right">Aksi</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="text-xs">
                                                    {classesForM.map((k) => (
                                                        <tr key={k.id}>
                                                            <td className="font-mono text-slate-500">#{k.urutan || 1}</td>
                                                            <td>
                                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold border border-blue-200">
                                                                    Kelas {k.nama_kelas}
                                                                </span>
                                                            </td>
                                                            <td className="font-medium text-slate-800">
                                                                {k.wali_kelas_name || (
                                                                    <span className="text-slate-400 italic">Belum diatur</span>
                                                                )}
                                                            </td>
                                                            <td className="text-slate-600">
                                                                {k.wali_kelas_phone || '-'}
                                                            </td>
                                                            <td className="text-slate-700">
                                                                {k.musyrif_name || (
                                                                    <span className="text-slate-400 italic">-</span>
                                                                )}
                                                            </td>
                                                            <td className="text-right">
                                                                <div className="inline-flex items-center gap-1.5">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => openKelasModal(k)}
                                                                        className="px-2.5 py-1 rounded-md border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold"
                                                                    >
                                                                        Atur Wali / Edit
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDeleteKelas(k)}
                                                                        className="p-1 rounded-md border border-slate-200 hover:bg-red-50 text-red-600"
                                                                    >
                                                                        <Trash size={13} />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {classesForM.length === 0 && (
                                                        <tr>
                                                            <td colSpan={6} className="px-5 py-6 text-center text-xs text-slate-400">
                                                                Belum ada kelas pada marhalah {m.nama}.
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            ) : (
                <>
                    {/* Ringkasan Kesiapan Tahun Ajaran Terpilih */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard
                            label="Total Tahun Ajaran"
                            value={localAcademicYears.length}
                            meta="Maks. 1 Tahun Ajaran Aktif"
                            tone="neutral"
                        />
                        <StatCard
                            label="Santri punya kelas (TA terpilih)"
                            value={enrollmentReadiness.enrolledSantri}
                            meta={`Dari ${enrollmentReadiness.totalMasterSantri} biodata induk santri aktif`}
                            tone="success"
                        />
                        <StatCard
                            label="Belum ditempatkan di kelas"
                            value={enrollmentReadiness.unassignedCount}
                            meta={
                                enrollmentReadiness.unassignedCount === 0
                                    ? 'Seluruh santri telah memiliki kelas'
                                    : 'Tidak masuk daftar operasional kelas'
                            }
                            tone={enrollmentReadiness.unassignedCount === 0 ? 'success' : 'warning'}
                        />
                        <StatCard
                            label="Kelompok Halaqah Aktif"
                            value={enrollmentReadiness.activeHalaqahCount}
                            meta="Pada tahun ajaran terpilih"
                            tone="primary"
                        />
                    </div>

                    {enrollmentReadiness.unassignedCount > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                                <div className="text-xs font-semibold text-amber-800">
                                    Santri belum punya kelas ({selectedAcademicYear?.name})
                                </div>
                                <p className="text-xs text-amber-700 mt-0.5">
                                    Terdapat <span className="font-bold">{enrollmentReadiness.unassignedCount}</span> santri aktif yang belum ditempatkan di kelas pada tahun ajaran ini. Santri tersebut belum muncul di daftar kelas/halaqah sampai diberi kelas.
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="wadah-tabel">
                        <div className="wadah-tabel overflow-x-auto">
                            <table className="tabel">
                                <thead>
                                    <tr>
                                        <th>Tahun Ajaran</th>
                                        <th>Semester Berjalan & Rentang Tanggal</th>
                                        <th>Status</th>
                                        <th className="text-right">Tindakan Tata Kelola</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {localAcademicYears.map((ay) => {
                                        const lifecycle = getEffectiveLifecycleStatus(ay);
                                        const badgeMeta = LIFECYCLE_LABELS[lifecycle] || LIFECYCLE_LABELS.setup;
                                        const isClosed = lifecycle === 'closed';
                                        const isCurrentlyViewed = selectedAcademicYear?.id === ay.id;
                                        return (
                                            <tr key={ay.id} className={`hover:bg-slate-50/70 transition-colors ${isCurrentlyViewed ? 'bg-blue-50/20' : ''}`}>
                                                <td>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-slate-900 tabular-nums">
                                                            {ay.name}
                                                        </span>
                                                        {isCurrentlyViewed && (
                                                            <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-2xs font-bold uppercase">
                                                                Sedang Ditinjau
                                                            </span>
                                                        )}
                                                    </div>
                                                    {ay.closed_at && (
                                                        <div className="text-2xs text-slate-500 mt-0.5">
                                                            Ditutup: {new Date(ay.closed_at).toLocaleDateString('id-ID')}
                                                        </div>
                                                    )}
                                                </td>
                                                <td>
                                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                                        <div>
                                                            <span className="text-xs font-semibold text-slate-800">
                                                                Semester {ay.active_semester}
                                                            </span>
                                                            {getSemesterDateDisplay(ay) ? (
                                                                <div className="text-xs text-slate-600 mt-0.5 tabular-nums">
                                                                    {getSemesterDateDisplay(ay)}
                                                                </div>
                                                            ) : (
                                                                <div className="text-xs text-slate-400 mt-0.5">
                                                                    Rentang tanggal semester belum diatur
                                                                </div>
                                                            )}
                                                        </div>
                                                        {!isClosed && (
                                                            <div className="flex items-center gap-1.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleToggleSemester(ay)}
                                                                    className="btn btn-secondary btn-sm"
                                                                >
                                                                    <RefreshCw size={12} /> Aktifkan {ay.active_semester === 'Ganjil' ? 'Genap' : 'Ganjil'}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleCloseSemester(ay, ay.active_semester)}
                                                                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-600 inline-flex items-center gap-1 transition-colors"
                                                                    title={`Tutup Semester ${ay.active_semester}`}
                                                                >
                                                                    <Lock size={12} /> Tutup Sem.
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td>
                                                    <StatusBadge label={badgeMeta.label} tone={badgeMeta.tone} />
                                                </td>
                                                <td className="text-right">
                                                    <div className="inline-flex flex-wrap items-center justify-end gap-2">
                                                        {!ay.is_active && !isCurrentlyViewed && (
                                                            <button
                                                                type="button"
                                                                onClick={() => openArchivedYear(ay.id)}
                                                                className="px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                                                            >
                                                                <Archive size={13} /> Buka Arsip
                                                            </button>
                                                        )}
                                                        {!ay.is_active && !isClosed && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSetActive(ay.id)}
                                                                className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold transition-colors"
                                                            >
                                                                Aktifkan Tahun
                                                            </button>
                                                        )}
                                                        {isClosed && (
                                                            <button type="button" onClick={() => setBukaKembali(ay)} className="btn btn-secondary btn-sm">
                                                                Buka kembali
                                                            </button>
                                                        )}
                                                        {!isClosed && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenClosingModal(ay)}
                                                                className="px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 text-xs font-semibold transition-colors"
                                                            >
                                                                Tutup tahun ajaran
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => openModal(ay)}
                                                            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
                                                            title="Edit Konfigurasi Tahun Ajaran"
                                                        >
                                                            <Edit size={14} />
                                                        </button>
                                                        {!ay.is_active && !isClosed && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDelete(ay.id)}
                                                                className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                                                                title="Hapus Tahun Ajaran"
                                                            >
                                                                <Trash size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {localAcademicYears.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-xs text-slate-500">
                                                Belum ada data tahun ajaran pada lembaga ini.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* Modal Tambah / Edit Tahun Ajaran */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingId ? 'Edit Tahun Ajaran & Semester' : 'Tambah Tahun Ajaran Baru'}
            >
                <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Nama Tahun Ajaran <span className="text-red-600">*</span>
                            </label>
                            <input
                                type="text"
                                required
                                placeholder="Contoh: 2026/2027"
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-600"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Status Siklus (Lifecycle)
                            </label>
                            <select
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:border-blue-600"
                                value={formData.status}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        status: e.target.value as AcademicYearLifecycleStatus,
                                    })
                                }
                            >
                                <option value="draft">Draft (Perencanaan)</option>
                                <option value="setup">Persiapan kelas & halaqah</option>
                                <option value="active">Active (Berjalan)</option>
                                <option value="closing">Closing (Rekonsiliasi Akhir Tahun)</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Semester Aktif <span className="text-red-600">*</span>
                        </label>
                        <select
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:border-blue-600"
                            value={formData.active_semester}
                            onChange={(e) => setFormData({ ...formData, active_semester: e.target.value })}
                        >
                            <option value="Ganjil">Semester Ganjil</option>
                            <option value="Genap">Semester Genap</option>
                        </select>
                    </div>

                    <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/60 space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-slate-800">Periode Semester Ganjil</h4>
                            {formData.active_semester === 'Ganjil' && (
                                <StatusBadge label="SEMESTER AKTIF" tone="primary" />
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-2xs font-semibold text-slate-600 mb-1">
                                    Tanggal Mulai
                                </label>
                                <input
                                    type="date"
                                    value={formData.ganjil_start_date}
                                    onChange={(e) =>
                                        setFormData({ ...formData, ganjil_start_date: e.target.value })
                                    }
                                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-xs text-slate-800"
                                />
                            </div>
                            <div>
                                <label className="block text-2xs font-semibold text-slate-600 mb-1">
                                    Tanggal Berakhir
                                </label>
                                <input
                                    type="date"
                                    value={formData.ganjil_end_date}
                                    onChange={(e) =>
                                        setFormData({ ...formData, ganjil_end_date: e.target.value })
                                    }
                                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-xs text-slate-800"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/60 space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-slate-800">Periode Semester Genap</h4>
                            {formData.active_semester === 'Genap' && (
                                <StatusBadge label="SEMESTER AKTIF" tone="primary" />
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-2xs font-semibold text-slate-600 mb-1">
                                    Tanggal Mulai
                                </label>
                                <input
                                    type="date"
                                    value={formData.genap_start_date}
                                    onChange={(e) =>
                                        setFormData({ ...formData, genap_start_date: e.target.value })
                                    }
                                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-xs text-slate-800"
                                />
                            </div>
                            <div>
                                <label className="block text-2xs font-semibold text-slate-600 mb-1">
                                    Tanggal Berakhir
                                </label>
                                <input
                                    type="date"
                                    value={formData.genap_end_date}
                                    onChange={(e) =>
                                        setFormData({ ...formData, genap_end_date: e.target.value })
                                    }
                                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-xs text-slate-800"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                        <button
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            Batal
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="btn btn-primary btn-sm"
                        >
                            {isSubmitting ? 'Menyimpan...' : 'Simpan Konfigurasi'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Wizard Pemeriksaan Prasyarat & Penutupan Tahun Ajaran (rpc_close_academic_year) */}
            <Modal
                isOpen={isClosingModalOpen}
                onClose={() => setIsClosingModalOpen(false)}
                title={`Verifikasi Prasyarat & Penutupan Tahun Ajaran ${closingTargetYear?.name || ''}`}
            >
                <form onSubmit={handleConfirmCloseAcademicYear} className="space-y-4">
                    <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-800">
                                Daftar 6 Prasyarat Penutupan Tahun Ajaran (Server-Side Gate)
                            </span>
                            {closingTargetYear && (
                                <button
                                    type="button"
                                    onClick={() => handleOpenClosingModal(closingTargetYear)}
                                    disabled={checkingReadiness}
                                    className="text-2xs font-semibold text-blue-600 hover:underline inline-flex items-center gap-1"
                                >
                                    <RefreshCw size={11} className={checkingReadiness ? 'animate-spin' : ''} /> Periksa Ulang
                                </button>
                            )}
                        </div>

                        {checkingReadiness ? (
                            <div className="py-4 text-center text-xs text-slate-500">
                                Memeriksa 6 prasyarat penutupan pada server...
                            </div>
                        ) : closingReadiness ? (
                            <div className="space-y-2">
                                {(closingReadiness.prerequisites || []).map((item) => (
                                    <div
                                        key={item.key}
                                        className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${
                                            item.passed
                                                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                                                : 'bg-red-50 border-red-200 text-red-900'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            {item.passed ? (
                                                <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                                            ) : (
                                                <AlertTriangle size={14} className="text-red-600 shrink-0" />
                                            )}
                                            <span className="font-medium">{item.label}</span>
                                        </div>
                                        <span className="font-bold">
                                            {item.passed ? '0 (Tuntas)' : `${item.count} Belum Selesai`}
                                        </span>
                                    </div>
                                ))}

                                {!closingReadiness.can_close && (
                                    <div className="p-2.5 rounded-lg bg-red-100/80 border border-red-300 text-2xs text-red-900 font-medium">
                                        Penutupan Tahun Ajaran dikunci oleh server hingga seluruh prasyarat di atas bernilai 0.
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="py-3 text-xs text-red-600">
                                Tidak dapat memverifikasi prasyarat penutupan tahun ajaran.
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Catatan Berita Acara Penutupan Tahun Ajaran <span className="text-red-600">*</span>
                        </label>
                        <textarea
                            required
                            rows={3}
                            value={closingReason}
                            onChange={(e) => setClosingReason(e.target.value)}
                            placeholder="Contoh: Seluruh sesi, ujian, remedial, publikasi raport, dan penempatan kelas telah tuntas."
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-600"
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                        <button
                            type="button"
                            onClick={() => setIsClosingModalOpen(false)}
                            className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            Batal
                        </button>
                        <button
                            type="submit"
                            disabled={
                                isSubmitting ||
                                checkingReadiness ||
                                !closingReason.trim() ||
                                (closingReadiness !== null && !closingReadiness.can_close)
                            }
                            className="btn btn-danger btn-sm"
                        >
                            {isSubmitting ? 'Memproses Penutupan...' : 'Kunci & Tutup Tahun Ajaran'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Modal Tambah/Edit Marhalah */}
            <Modal
                isOpen={isMarhalahModalOpen}
                onClose={() => setIsMarhalahModalOpen(false)}
                title={editingMarhalah ? 'Edit Jenjang Marhalah' : 'Tambah Jenjang Marhalah'}
            >
                <form onSubmit={handleSaveMarhalah} className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Nama Marhalah <span className="text-red-600">*</span>
                        </label>
                        <input
                            type="text"
                            required
                            placeholder="Contoh: Mutawassithah / Aliyah / Jamiah"
                            value={marhalahForm.nama}
                            onChange={(e) => setMarhalahForm({ ...marhalahForm, nama: e.target.value })}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Urutan Jenjang
                        </label>
                        <input
                            type="number"
                            min={1}
                            value={marhalahForm.urutan}
                            onChange={(e) => setMarhalahForm({ ...marhalahForm, urutan: Number(e.target.value) })}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                        <button
                            type="button"
                            onClick={() => setIsMarhalahModalOpen(false)}
                            className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            Batal
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="btn btn-primary btn-sm"
                        >
                            {isSubmitting ? 'Menyimpan...' : 'Simpan Marhalah'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Modal Tambah/Edit Kelas & Atribut Administratif Wali Kelas/Musyrif */}
            <Modal
                isOpen={isKelasModalOpen}
                onClose={() => setIsKelasModalOpen(false)}
                title={editingKelas ? 'Edit Kelas & Atribut Wali Kelas/Musyrif' : 'Tambah Kelas & Atribut Administratif'}
            >
                <form onSubmit={handleSaveKelas} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Marhalah <span className="text-red-600">*</span>
                            </label>
                            <select
                                required
                                value={kelasForm.marhalah_id}
                                onChange={(e) => setKelasForm({ ...kelasForm, marhalah_id: e.target.value })}
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 bg-white focus:outline-none focus:border-blue-600"
                            >
                                <option value="">-- Pilih Marhalah --</option>
                                {(masterMarhalahs || []).map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.nama}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Nama Kelas <span className="text-red-600">*</span>
                            </label>
                            <input
                                type="text"
                                required
                                placeholder="Contoh: 1A / 10-IPA"
                                value={kelasForm.nama_kelas}
                                onChange={(e) => setKelasForm({ ...kelasForm, nama_kelas: e.target.value })}
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                            />
                        </div>
                    </div>

                    <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-700">
                                Atribut Administratif Kelas (Non-Login)
                            </span>
                            <StatusBadge label="ARSITEKTUR 3-ROLE" tone="primary" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Nama Wali Kelas (Tercetak di Raport)
                            </label>
                            <input
                                type="text"
                                placeholder="Contoh: Ustadz Ahmad Fauzi, Lc."
                                value={kelasForm.wali_kelas_name}
                                onChange={(e) => setKelasForm({ ...kelasForm, wali_kelas_name: e.target.value })}
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 bg-white focus:outline-none focus:border-blue-600"
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    No. WhatsApp Wali Kelas
                                </label>
                                <input
                                    type="text"
                                    placeholder="0812xxxxxxxx"
                                    value={kelasForm.wali_kelas_phone}
                                    onChange={(e) => setKelasForm({ ...kelasForm, wali_kelas_phone: e.target.value })}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 bg-white focus:outline-none focus:border-blue-600"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Nama Musyrif Pembina
                                </label>
                                <input
                                    type="text"
                                    placeholder="Contoh: Ustadz Zaid"
                                    value={kelasForm.musyrif_name}
                                    onChange={(e) => setKelasForm({ ...kelasForm, musyrif_name: e.target.value })}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 bg-white focus:outline-none focus:border-blue-600"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                        <button
                            type="button"
                            onClick={() => setIsKelasModalOpen(false)}
                            className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            Batal
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="btn btn-primary btn-sm"
                        >
                            {isSubmitting ? 'Menyimpan...' : 'Simpan Kelas & Atribut'}
                        </button>
                    </div>
                </form>
            </Modal>
            <ConfirmDialog
                isOpen={Boolean(bukaKembali)}
                title={`Buka kembali Tahun Ajaran ${bukaKembali?.name || ''}`}
                description="Data absensi, setoran, ujian, dan rekap tahun ini bisa diubah lagi. Tutup kembali setelah koreksi selesai. Penempatan halaqah yang sudah diakhiri saat penutupan tidak dipulihkan."
                confirmLabel="Buka kembali"
                requireReason
                reasonLabel="Alasan (tercatat di log audit)"
                isSubmitting={isSubmitting}
                onCancel={() => setBukaKembali(null)}
                onConfirm={handleBukaKembali}
            />
        </PageShell>
    );
};

export default TahunAjaranPage;
