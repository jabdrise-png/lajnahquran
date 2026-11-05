import { createPortal } from "react-dom";
import { supabase } from '../lib/supabaseClient';

import React, { useState, useMemo, useRef, useEffect } from 'react'; 
import { MarhalahLabel, KelasLabel } from '../components/Labels';
import Card from '../components/Card';
import Modal from '../components/Modal';
import SetoranSettingsModal from '../components/SetoranSettingsModal';
import KelolaTargetModal from '../components/KelolaTargetModal';
import { SantriDetailProgressView } from '../components/SantriDetailProgressView';
import StudentProgressComponent from './StudentProgress';
import StatistikPerkembangan from './StatistikPerkembangan';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { Marhalah, StudentEvaluation, AttendanceStatus, StudentProgress, MasterEvaluationPeriod } from '../types';
import {    Search, Save, MessageCircle, Settings, Download, Upload, FileSpreadsheet, CheckSquare, Square, Edit, Copy, AlertCircle, Send, Plus, Trash2, ChevronRight, Users, ListChecks, Edit2, X , ArrowUpDown , GripVertical, MoreVertical, LayoutList , ChevronUp, ChevronDown, Filter, ListFilter } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { exportToExcel, parseSpreadsheet, getEvaluationPeriods, formatPeriodName } from '../lib/utils';
import { sendCustomTelegramMessage } from '../lib/telegram';
import { NotificationStore } from '../lib/NotificationStore';

// Constants
const DEFAULT_OPTIONS = ['Mumtaz', 'Jayyid Jiddan', 'Jayyid', 'Maqbul', 'Rasib'];

const DEFAULT_PERKEMBANGAN_TEMPLATE = `Assalamu'alaikum warahmatullahi wabarakatuh.

Yth. Bapak/Ibu Wali Santri
Ananda: *{{nama}}*
Kelas: *{{kelas}} ({{marhalah}})*

Semoga Allah Ta'ala senantiasa melimpahkan rahmat, keberkahan, dan kesehatan kepada Bapak/Ibu sekeluarga.

Berikut kami sampaikan Laporan Evaluasi Perkembangan Tahfidz Ananda untuk periode:

*{{periode}}*

────────────────────

*STATISTIK KEHADIRAN*

{{statistik_kehadiran}}

────────────────────

*CAPAIAN TAHFIDZ*

{{capaian_tahfidz}}

────────────────────

*PENILAIAN DAN EVALUASI*

{{penilaian_evaluasi}}

────────────────────

*CATATAN PENGASUH*

{{catatan_pengasuh}}

────────────────────

Demikian laporan evaluasi ini kami sampaikan. Besar harapan kami agar Bapak/Ibu senantiasa memberikan doa, perhatian, dan motivasi kepada Ananda untuk terus meningkatkan kualitas hafalan, muroja'ah, serta adab dalam berinteraksi dengan Al-Qur'an.

Semoga Allah Ta'ala menjadikan Ananda termasuk ahlul Qur'an yang senantiasa menjaga, mengamalkan, dan mendapatkan keberkahan dari Al-Qur'an.

Jazakumullahu khairan katsiran atas kerja sama dan kepercayaan Bapak/Ibu.

Wassalamu'alaikum warahmatullahi wabarakatuh.`;

const formatDateIndo = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    const y = parts[0];
    const m = parts[1];
    const d = parts[2] || '';
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return d ? `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}` : `${months[parseInt(m) - 1]} ${y}`;
};



// Component to handle color picker without losing focus/closing on re-render
const ColorPicker = ({ initialColor, onChangeComplete }: { initialColor: string, onChangeComplete: (c: string) => void }) => {
    const [color, setColor] = React.useState(initialColor);
    
    React.useEffect(() => {
        setColor(initialColor);
    }, [initialColor]);

    return (
        <div className="relative w-4 h-4 rounded-full mr-3 shrink-0" style={{ backgroundColor: color }}>
            <input 
                type="color" 
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                value={color}
                onChange={e => setColor(e.target.value)}
                onBlur={() => onChangeComplete(color)}
            />
        </div>
    );
};

const PerkembanganMasterDataPage: React.FC = () => {
    const { santri, halaqah, studentEvaluations, evaluationSettings, attendance, studentProgress, setoranHarian, appSettings, halaqahEvalQuestions, halaqahEvaluations, saveHalaqahEvalQuestion, deleteHalaqahEvalQuestion, saveHalaqahEvaluation, saveAppSetting, updateEvaluation, updateEvaluationBatch, updateEvaluationSettingsBatch, saveEvaluationSetting, deleteEvaluationSetting, deleteEvaluationCategory, updateEvaluationCategory, addStudentProgressBatch, loading, fetchData, masterKelas, globalMarhalahs, globalJenisHalaqah, globalAttendanceStatus, saveClassTarget, classTargets, userProfile, selectedAcademicYear , masterMarhalahs, masterKelasRelasi} = useSupabaseData();
    
    // Internal States
    const [selectedMonth, setSelectedMonth] = useState('');
    const [filterMarhalah, setFilterMarhalah] = useState<Marhalah | 'all'>('all');
    const [filterKelas, setFilterKelas] = useState<string | 'all'>('all');
    const [filterHalaqah, setFilterHalaqah] = useState<string | 'all'>('all');
    const [filterJenisHalaqah, setFilterJenisHalaqah] = useState<string | 'all'>('all');
    const [searchName, setSearchName] = useState('');
    const isMusammi = userProfile?.role?.toLowerCase() === 'musammi';
    const [activeTab, setActiveTab] = useState<'santri' | 'halaqah' | 'pivot' | 'statistik'>(isMusammi ? 'statistik' : 'santri');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [filterSkema, setFilterSkema] = useState('all');
    const [isFilterExpanded, setIsFilterExpanded] = useState(false);
    const [isZiyadahMenuOpen, setIsZiyadahMenuOpen] = useState(false);
    const [isMurojaahMenuOpen, setIsMurojaahMenuOpen] = useState(false);
    const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);

    // Detail Santri View (Halaman Progres & Riwayat Santri)
    const [selectedSantriForDetail, setSelectedSantriForDetail] = useState<any | null>(null);

    // Selection for Bulk Action
    const [selectedSantriIds, setSelectedSantriIds] = useState<number[]>([]);

    const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'} | null>(null);
    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    
    // Evaluation Periods
    const masterPeriods = getEvaluationPeriods(appSettings);
    const sortedPeriods = [...masterPeriods].sort((a, b) => {
        const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
        const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
        if (dateA !== dateB) return dateB - dateA;
        return b.id.localeCompare(a.id);
    });

    useEffect(() => {
        if (!selectedMonth && sortedPeriods.length > 0) {
            setSelectedMonth(sortedPeriods[0].id);
        }
    }, [sortedPeriods, selectedMonth]);

    // Modals
    
    const [isManageModalOpen, setIsManageModalOpen] = useState(false);
    const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
    const [editingPeriod, setEditingPeriod] = useState<(MasterEvaluationPeriod & { isNew?: boolean }) | null>(null);
    
    // Target state
    
    const deleteEvaluationPeriod = async (id: string) => {
        try {
            const updated = masterPeriods.filter(p => p.id !== id);
            await saveAppSetting('EVALUATION_PERIODS', JSON.stringify(updated));
            NotificationStore.addNotification('Periode evaluasi berhasil dihapus.', 'success');
            if (selectedMonth === id) {
                setSelectedMonth('');
            }
        } catch (error) {
            console.error('Error deleting evaluation period:', error);
            NotificationStore.addNotification('Gagal menghapus periode evaluasi.', 'error');
        }
    };

    const [editingTarget, setEditingTarget] = useState<any>({
        kelas: '',
        marhalah: '',
        halaqah_id: 'all',
        
        target_ziyadah: 0,
        
        target_murojaah: 0,
        
        target_hafalan: 0,
    });
    const [targetActiveTab, setTargetActiveTab] = useState<'hafalan' | 'murojaah' | 'ziyadah'>('hafalan');
    
    const handleMarhalahChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const marhalah = e.target.value;
        const target = classTargets?.find(t => t.marhalah === marhalah ) || {
            
            target_ziyadah: 0,
            
            target_murojaah: 0,
            
            target_hafalan: 0,
        };
        setEditingTarget({
            ...editingTarget,
            marhalah,
            kelas: 'all',
            ...target
        });
    };

    const handleKelasChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const kelas = e.target.value;
        const target = classTargets?.find(t => t.marhalah === editingTarget.marhalah && t.kelas === kelas) || {
            
            target_ziyadah: 0,
            
            target_murojaah: 0,
            
            target_hafalan: 0,
        };
        setEditingTarget({
            ...editingTarget,
            kelas,
            ...target
        });
    };
    
    // Auto-populate when modal opens
    useEffect(() => {
        if (isTargetModalOpen && editingTarget.marhalah) {
            const target = classTargets?.find(t => t.marhalah === editingTarget.marhalah && t.kelas === editingTarget.kelas) || {
                
                target_ziyadah: 0,
                
                target_murojaah: 0,
                
                target_hafalan: 0,
            };
            setEditingTarget(prev => ({
                ...prev,
                ...target
            }));
        }
    }, [isTargetModalOpen]);
    

    const handleSaveTarget = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            // Save Class Target
            await saveClassTarget({
                marhalah: editingTarget.marhalah as any,
                kelas: editingTarget.kelas,
                
                target_ziyadah: editingTarget.target_ziyadah,
                
                target_murojaah: editingTarget.target_murojaah,
                
                target_hafalan: editingTarget.target_hafalan,
            });
            
            // If halaqah_id is selected, we also save to appSettings
            if (editingTarget.halaqah_id && editingTarget.halaqah_id !== 'all') {
                const settingKey = 'target_halaqah_' + editingTarget.halaqah_id;
                await saveAppSetting(settingKey, JSON.stringify({
                    
                    target_murojaah: editingTarget.target_murojaah,
                    
                    target_ziyadah: editingTarget.target_ziyadah
                }));
            }
            
            NotificationStore.addNotification('Target berhasil disimpan.', 'success');
            setIsTargetModalOpen(false);
        } catch (error: any) {
            console.error('Error saving target', error);
            NotificationStore.addNotification(`Gagal menyimpan target: ${error?.message || JSON.stringify(error)}`, 'error');
        }
    };
    
    // Load existing halaqah target when halaqah changes
    useEffect(() => {
        if (editingTarget.halaqah_id && editingTarget.halaqah_id !== 'all') {
            const settingKey = 'target_halaqah_' + editingTarget.halaqah_id;
            const setting = appSettings.find(s => s.key === settingKey);
            if (setting && setting.value) {
                try {
                    const parsed = JSON.parse(setting.value);
                    setEditingTarget(prev => ({
                        ...prev,
                        
                        target_murojaah: parsed.target_murojaah || 0,
                        
                        target_ziyadah: parsed.target_ziyadah || 0,
                    }));
                } catch(e) {}
            }
        }
    }, [editingTarget.halaqah_id, appSettings]);

    const handleSavePeriod = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingPeriod) return;

        const start = new Date(editingPeriod.startDate);
        const end = new Date(editingPeriod.endDate);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            NotificationStore.addNotification('Tanggal mulai dan tanggal selesai harus diisi dengan format yang benar.', 'error');
            return;
        }

        if (start > end) {
            NotificationStore.addNotification('Tanggal mulai tidak boleh lebih besar dari tanggal selesai.', 'error');
            return;
        }

        const { isNew, ...periodToSave } = editingPeriod;
        let updated: MasterEvaluationPeriod[];
        if (masterPeriods.find(p => p.id === periodToSave.id)) {
            updated = masterPeriods.map(p => p.id === periodToSave.id ? periodToSave : p);
        } else {
            updated = [...masterPeriods, periodToSave];
        }

        try {
            await saveAppSetting('EVALUATION_PERIODS', JSON.stringify(updated));
            if (!masterPeriods.find(p => p.id === periodToSave.id)) {
                setSelectedMonth(periodToSave.id);
            }
            setEditingPeriod(null);
            setIsManageModalOpen(false);
        } catch (error: any) {
            console.error('Error saving period:', error);
            NotificationStore.addNotification('Gagal menyimpan: ' + error.message, 'error');
        }
    };

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    
    const [evalColors, setEvalColors] = useState<Record<string, string>>({});

    const [localCategorySettings, setLocalCategorySettings] = useState<any[]>([]);
    const [localEvalColors, setLocalEvalColors] = useState<Record<string, string>>({});
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [draggedIdx, setDraggedIdx] = useState<number | null>(null);



    const handleDragStart = (e: React.DragEvent, idx: number) => {
        setDraggedIdx(idx);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/html", (e.target as any).innerHTML);
    };

    const handleDragOver = (e: React.DragEvent, idx: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (draggedIdx === null || draggedIdx === idx) return;

        const items = [...localCategorySettings];
        const draggedItem = items[draggedIdx];
        items.splice(draggedIdx, 1);
        items.splice(idx, 0, draggedItem);

        

        setLocalCategorySettings(items);
        setDraggedIdx(idx);
        setHasUnsavedChanges(true);
    };

    const handleDragEnd = () => {
        setDraggedIdx(null);
    };

    const handleAddLocalOption = () => {
        if (!newOption.trim()) return;
        let cat = newCategory;
        if (!cat && allCategories.length > 0) cat = allCategories[0];
        if (!cat) cat = 'Kategori 1';

        const newItem = { id: Date.now() * -1, category: cat, label: newOption, score: 0 };
        const newSettings = [...localCategorySettings, newItem];
        
        setLocalCategorySettings(newSettings);
        setNewOption('');
        setHasUnsavedChanges(true);
    };

    const handleDeleteLocalOption = (id: number) => {
        const newSettings = localCategorySettings.filter(s => s.id !== id);
        setLocalCategorySettings(newSettings);
        setHasUnsavedChanges(true);
    };

    const handleUpdateLocalColor = (label: string, color: string) => {
        setLocalEvalColors(prev => ({ ...prev, [label]: color }));
        setHasUnsavedChanges(true);
    };

    const handleSaveChanges = async () => {
        try {
            const originalSettings = evaluationSettings.filter(s => s.category === newCategory);
            const localIds = localCategorySettings.filter(s => s.id > 0).map(s => s.id);
            
            const toDelete = [];
            for (const orig of originalSettings) {
                if (!localIds.includes(orig.id)) {
                    toDelete.push(orig.id);
                }
            }
            
            const toUpdate = [];
            const toInsert = [];
            for (const item of localCategorySettings) {
                if (item.id < 0) {
                    toInsert.push({ category: item.category, label: item.label, score: item.score });
                } else {
                    const orig = originalSettings.find(s => s.id === item.id);
                    if (!orig || orig.label !== item.label || orig.score !== item.score) {
                        toUpdate.push({ id: item.id, category: item.category, label: item.label, score: item.score, color: orig?.color });
                    }
                }
            }
            
            if (toDelete.length > 0 || toUpdate.length > 0 || toInsert.length > 0) {
                await updateEvaluationSettingsBatch(toInsert, toUpdate, toDelete);
            }
            
            const updatedColors = { ...evalColors, ...localEvalColors };
            setEvalColors(updatedColors);
            await saveAppSetting('EVALUATION_COLORS', JSON.stringify(updatedColors));
            setHasUnsavedChanges(false);
            NotificationStore.addNotification("Perubahan berhasil disimpan.", 'success');
        } catch (error) {
            console.error(error);
            NotificationStore.addNotification("Terjadi kesalahan saat menyimpan.", 'error');
        }
    };

    useEffect(() => {
        const savedColors = appSettings.find(s => s.key === 'EVALUATION_COLORS')?.value;
        if (savedColors) {
            try { setEvalColors(JSON.parse(savedColors)); } catch (e) {}
        }
    }, [appSettings]);



    const [activeEvalTab, setActiveEvalTab] = useState<'santri' | 'halaqah'>('santri');
    const [selectedHalaqahQuestionId, setSelectedHalaqahQuestionId] = useState<number | null>(null);
    const [isAddingHalaqahQuestion, setIsAddingHalaqahQuestion] = useState(false);
    const [isSetoranSettingsOpen, setIsSetoranSettingsOpen] = useState(false);
        const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
    
    // State for Notes Modal
    const [currentNoteSantri, setCurrentNoteSantri] = useState<{id: number, name: string} | null>(null);
    const [tempNotes, setTempNotes] = useState({ musammi: '', muroqib: '', lajnah: '' });

    // State for Report Preview
    const [generatedMessages, setGeneratedMessages] = useState<{name: string, phone: string, text: string, telegramChatId?: string}[]>([]);
    const [messageTarget, setMessageTarget] = useState<'wa' | 'telegram'>('wa');
    
    const templateSettingKey = `EVAL_SANTRI_TEMPLATE_${selectedAcademicYear?.id}`;
    const evalTemplate = useMemo(() => {
        const stored = appSettings.find(s => s.key === templateSettingKey)?.value;
        return stored || DEFAULT_PERKEMBANGAN_TEMPLATE;
    }, [appSettings, templateSettingKey]);
    
    const [isEditingTemplate, setIsEditingTemplate] = useState(false);
    const [tempTemplate, setTempTemplate] = useState(evalTemplate);
    
    useEffect(() => {
        if (isPreviewModalOpen) {
            setTempTemplate(evalTemplate);
            setIsEditingTemplate(false);
        }
    }, [isPreviewModalOpen, evalTemplate]);
    
    // Local State for Edits
    const [localEvaluations, setLocalEvaluations] = useState<Record<number, Partial<StudentEvaluation>>>({});
    const [localProgress, setLocalProgress] = useState<Record<number, Record<string, string>>>({});
    
    const progressMap = useMemo(() => {
        const map = new Map();
        for (const p of studentProgress) {
            map.set(`${p.santri_id}_${p.month_key}_${p.progress_type}`, p.value || '');
        }
        return map;
    }, [studentProgress]);

    const evalMap = useMemo(() => {
        const map = new Map();
        for (const e of studentEvaluations) {
            map.set(`${e.santri_id}_${e.month_key}`, e);
        }
        return map;
    }, [studentEvaluations]);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 100;

    // File Input
    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- Helpers: Dropdown Options ---
    const getOptions = (category: string) => {
        const custom = evaluationSettings.filter(s => s.category === category).sort((a,b) => (b.score || 0) - (a.score || 0));
        if (custom.length > 0) return custom.map(c => ({ label: c.label, color: evalColors[c.label], score: c.score }));
        return DEFAULT_OPTIONS.map(label => ({ label, color: evalColors[label] }));
    };

    // --- 1. Filter Logic ---
    
    const getSantriMetrics = (s: any, selectedMonth: string) => {
        const hafalanDepanStr = localProgress[s.id]?.['Hafalan Depan'] ?? progressMap.get(`${s.id}_${selectedMonth}_Hafalan Depan`) ?? '';
        const hafalanDepan = parseFloat(hafalanDepanStr) || 0;
        
        const hafalanBelakangStr = localProgress[s.id]?.['Hafalan Belakang'] ?? progressMap.get(`${s.id}_${selectedMonth}_Hafalan Belakang`) ?? '';
        const hafalanBelakang = parseFloat(hafalanBelakangStr) || 0;
        
        const explicitCurrentTotalHafalanStr = progressMap.get(`${s.id}_${selectedMonth}_Total Hafalan`);
        const explicitCurrentTotalHafalan = parseFloat(explicitCurrentTotalHafalanStr ?? '0') || 0;
        const totalHafalan = (hafalanDepan === 0 && hafalanBelakang === 0 && explicitCurrentTotalHafalan > 0) ? explicitCurrentTotalHafalan : (hafalanDepan + hafalanBelakang);

        let prevMonthKey = '';
        if (selectedMonth && sortedPeriods.length > 0) {
            const currentIndex = sortedPeriods.findIndex(p => p.id === selectedMonth);
            if (currentIndex !== -1 && currentIndex + 1 < sortedPeriods.length) {
                prevMonthKey = sortedPeriods[currentIndex + 1].id;
            }
        }
        const explicitPrevTotalHafalanStr = progressMap.get(`${s.id}_${prevMonthKey}_Total Hafalan`);
        const prevHafalanDepan = parseFloat(progressMap.get(`${s.id}_${prevMonthKey}_Hafalan Depan`) ?? '0') || 0;
        const prevHafalanBelakang = parseFloat(progressMap.get(`${s.id}_${prevMonthKey}_Hafalan Belakang`) ?? '0') || 0;
        const prevTotalHafalan = explicitPrevTotalHafalanStr ? parseFloat(explicitPrevTotalHafalanStr) || 0 : (prevHafalanDepan + prevHafalanBelakang);
        
        const penambahanHafalan = totalHafalan - prevTotalHafalan;
        
        const murojaahValStr = localProgress[s.id]?.['Murojaah'] ?? progressMap.get(`${s.id}_${selectedMonth}_Murojaah`) ?? '';
        const murojaah = parseFloat(murojaahValStr) || 0;
        
        const ziyadahStr = localProgress[s.id]?.['Ziyadah'] ?? progressMap.get(`${s.id}_${selectedMonth}_Ziyadah`) ?? '';
        const ziyadah = parseFloat(ziyadahStr) || 0;
        
        const activeSemester = selectedAcademicYear?.active_semester || 'Ganjil';
        const target = classTargets?.find(t => (t.semester === activeSemester || !t.semester) && t.marhalah === s.marhalah && t.kelas === s.kelas) || { target_hafalan: 0 };
        
        let targetMurojaah = 0;
        const murojaahSetting = appSettings.find(s => s.key === 'TARGET_MUROJAAH_GLOBAL');
        if (murojaahSetting && murojaahSetting.value) {
            try {
                const parsed = JSON.parse(murojaahSetting.value);
                const rules = parsed[s.marhalah] || [];
                if (Array.isArray(rules)) {
                    // Find the first rule where totalHafalan >= min_capaian (assuming sorted descending)
                    const sortedRules = [...rules].sort((a, b) => b.min_capaian - a.min_capaian);
                    const matchedRule = sortedRules.find(r => totalHafalan >= r.min_capaian);
                    if (matchedRule) {
                        targetMurojaah = matchedRule.target;
                    }
                }
            } catch (e) {
                console.error("Error parsing murojaah setting", e);
            }
        }

        const pctHafalan = target.target_hafalan ? (totalHafalan / target.target_hafalan) * 100 : 0;
        const pctMurojaah = targetMurojaah ? (murojaah / targetMurojaah) * 100 : 0;
        
        return {
            totalHafalan,
            penambahanHafalan,
            murojaah,
            ziyadah,
            pctHafalan,
            pctMurojaah
        };
    };

    const nilaiRanges = useMemo(() => {
        const val = appSettings.find(s => s.key === 'SETORAN_AUTO_RANGES')?.value;
        if (val) {
            try { return JSON.parse(val); } catch (e) {}
        }
        return [
            { label: 'Mumtaz', min: 90 },
            { label: 'Jayyid Jiddan', min: 80 },
            { label: 'Jayyid', min: 70 },
            { label: 'Maqbul', min: 60 },
            { label: 'Dhaif', min: 0 }
        ];
    }, [appSettings]);

    const dynamicSkemaOptions = useMemo(() => {
        const fromSettings = (appSettings.find(s => s.key === 'SETORAN_SKEMA_OPTIONS')?.value?.split(',') || ['Ziyadah', 'Murojaah', 'Sabqi', 'Manzil'])
            .map(s => s.trim()).filter(Boolean);
        const fromData = Array.from(new Set((setoranHarian || []).map(sh => sh.skema?.trim()).filter(Boolean)));
        return Array.from(new Set([...fromSettings, ...fromData])).filter(Boolean);
    }, [appSettings, setoranHarian]);

    const getSantriDailyStats = (santriId: number, monthKey: string, skemaFilter: string = filterSkema) => {
        const periodObj = masterPeriods.find(p => p.id === monthKey);
        const pStart = periodObj?.startDate || (monthKey.match(/^\d{4}-\d{2}$/) ? `${monthKey}-01` : '');
        const pEnd = periodObj?.endDate || (monthKey.match(/^\d{4}-\d{2}$/) ? `${monthKey}-31` : '');

        let sSetoran = (setoranHarian || []).filter(sh => sh.santri_id === santriId);
        if (pStart) sSetoran = sSetoran.filter(sh => sh.tanggal >= pStart);
        if (pEnd) sSetoran = sSetoran.filter(sh => sh.tanggal <= pEnd);

        // Apply skemaFilter if not 'all'
        if (skemaFilter && skemaFilter !== 'all') {
            const lowerFilter = skemaFilter.toLowerCase().trim();
            sSetoran = sSetoran.filter(sh => {
                const s = (sh.skema || '').toLowerCase().trim();
                return s === lowerFilter || s.includes(lowerFilter);
            });
        }

        const frekuensiSetoran = sSetoran.length;
        const totalHalaman = sSetoran.reduce((acc, sh) => acc + (parseFloat(sh.jumlah_halaman as any) || 0), 0);

        let totalScore = 0;
        let scoredCount = 0;
        sSetoran.forEach(sh => {
            const range = nilaiRanges.find((r: any) => r.label === sh.nilai);
            if (range) {
                totalScore += range.min;
                scoredCount++;
            } else if (sh.nilai) {
                const n = String(sh.nilai).toLowerCase();
                if (n.includes('mumtaz')) totalScore += 90;
                else if (n.includes('jayyid jiddan')) totalScore += 80;
                else if (n.includes('jayyid')) totalScore += 70;
                else if (n.includes('maqbul')) totalScore += 60;
                scoredCount++;
            }
        });

        const avgScore = scoredCount > 0 ? totalScore / scoredCount : 0;
        let finalNilaiLabel = '-';
        const sortedRanges = [...nilaiRanges].sort((a: any, b: any) => b.min - a.min);
        if (scoredCount > 0) {
            for (const r of sortedRanges) {
                if (avgScore >= r.min) {
                    finalNilaiLabel = r.label;
                    break;
                }
            }
        }

        // Attendance stats in this period
        let sAtt = (attendance || []).filter(a => a.personId === santriId && a.peran !== 'Musammi');
        if (pStart) sAtt = sAtt.filter(a => a.date >= pStart);
        if (pEnd) sAtt = sAtt.filter(a => a.date <= pEnd);
        const hadirAtt = sAtt.filter(a => a.status === 'Hadir' || a.status === 'Terlambat').length;
        const persentaseKehadiran = sAtt.length > 0 ? (hadirAtt / sAtt.length) * 100 : 0;

        return {
            frekuensiSetoran,
            totalHalaman,
            persentaseKelancaran: scoredCount > 0 ? avgScore : 0,
            finalNilaiLabel,
            persentaseKehadiran,
            hasDailyData: frekuensiSetoran > 0,
            setoranList: sSetoran
        };
    };


    const getHalaqahForSantriInPeriod = (santriId: number, monthKey: string) => {
        const periodObj = masterPeriods.find(p => p.id === monthKey);
        const periodEnd = periodObj?.endDate || (monthKey.match(/^\d{4}-\d{2}$/) ? `${monthKey}-31` : undefined);
        const periodStart = periodObj?.startDate || (monthKey.match(/^\d{4}-\d{2}$/) ? `${monthKey}-01` : undefined);

        // 1. Check in all halaqah history (including archived)
        for (const h of halaqah) {
            if (h.history && h.history.length > 0) {
                const match = h.history.find(hs => {
                    if (hs.santri_id !== santriId) return false;
                    if (periodEnd && hs.start_date) {
                        const sDate = hs.start_date.includes('/') ? hs.start_date.split('/').reverse().join('-') : hs.start_date;
                        if (new Date(sDate.substring(0, 10)).getTime() > new Date(periodEnd.substring(0, 10)).getTime()) return false;
                    }
                    if (periodStart && hs.end_date && hs.end_date.trim() !== '') {
                        const eDate = hs.end_date.includes('/') ? hs.end_date.split('/').reverse().join('-') : hs.end_date;
                        if (new Date(eDate.substring(0, 10)).getTime() < new Date(periodStart.substring(0, 10)).getTime()) return false;
                    }
                    return true;
                });
                if (match) return h;
            }
        }

        // 2. Fallback to current halaqah santri list
        const currentMatch = halaqah.find(h => h.santri.some(member => member.id === santriId));
        return currentMatch || null;
    };

    // Calculate dynamic available halaqah for the selected period / evaluation records
    const availableHalaqahOptions = useMemo(() => {
        // Collect halaqah IDs that actually have evaluations in this period
        const periodHalaqahIds = new Set<number>();

        // From halaqah_evaluations
        (halaqahEvaluations || []).forEach(e => {
            if (e.month_key === selectedMonth && e.halaqah_id) {
                periodHalaqahIds.add(Number(e.halaqah_id));
            }
        });

        // From santri who have progress / evaluation in this period
        const santriWithRecord = new Set<number>();
        (studentProgress || []).forEach(p => {
            if (p.month_key === selectedMonth && p.value && p.value.trim() !== '') {
                santriWithRecord.add(p.santri_id);
            }
        });
        (studentEvaluations || []).forEach(e => {
            if (e.month_key === selectedMonth) {
                santriWithRecord.add(e.santri_id);
            }
        });

        santriWithRecord.forEach(sId => {
            const h = getHalaqahForSantriInPeriod(sId, selectedMonth);
            if (h) periodHalaqahIds.add(h.id);
        });

        // Build list: all active halaqah PLUS any archived halaqah that has evaluations/progress in this period
        const optionsMap = new Map<number, { id: number; nama: string; marhalah: string; jenis?: string; is_active: boolean }>();

        halaqah.forEach(h => {
            const hasHistoryInPeriod = periodHalaqahIds.has(h.id);
            const isCurrentlyActive = h.is_active !== false;

            if (isCurrentlyActive || hasHistoryInPeriod) {
                // Apply filters (Marhalah & Jenis)
                if (filterMarhalah !== 'all' && h.marhalah !== filterMarhalah) return;
                if (filterJenisHalaqah !== 'all' && (h.jenis || (h as any).jenis_halaqah) !== filterJenisHalaqah) return;

                if (isMusammi) {
                    const isMatch = Boolean(h.musammi?.user_id && userProfile?.id && h.musammi.user_id === userProfile.id);
                    if (!isMatch) return;
                }

                optionsMap.set(h.id, {
                    id: h.id,
                    nama: h.nama,
                    marhalah: h.marhalah,
                    jenis: h.jenis || (h as any).jenis_halaqah,
                    is_active: isCurrentlyActive
                });
            }
        });

        return Array.from(optionsMap.values()).sort((a, b) => a.nama.localeCompare(b.nama));
    }, [halaqah, halaqahEvaluations, studentProgress, studentEvaluations, selectedMonth, filterMarhalah, filterJenisHalaqah, isMusammi, userProfile, masterPeriods]);

    const filteredHalaqah = useMemo(() => {
        // Collect halaqah IDs that have evaluations in this period so archived ones can still be displayed in halaqah tab
        const evalHalaqahIds = new Set(
            (halaqahEvaluations || [])
                .filter(e => e.month_key === selectedMonth)
                .map(e => Number(e.halaqah_id))
        );

        return halaqah.filter(h => h.is_active !== false || evalHalaqahIds.has(h.id)).filter(h => {
            if (isMusammi) {
                const isMatch = Boolean(h.musammi?.user_id && userProfile?.id && h.musammi.user_id === userProfile.id);
                if (!isMatch) return false;
            }
            if (filterMarhalah !== 'all' && h.marhalah !== filterMarhalah) return false;
            if (filterJenisHalaqah !== 'all' && (h.jenis || (h as any).jenis_halaqah) !== filterJenisHalaqah) return false;
            if (filterHalaqah !== 'all' && h.id.toString() !== filterHalaqah) return false;
            if (searchName && !h.nama.toLowerCase().includes(searchName.toLowerCase()) && !h.musammi?.nama?.toLowerCase().includes(searchName.toLowerCase())) return false;
            return true;
        });
    }, [halaqah, filterMarhalah, filterHalaqah, searchName, filterJenisHalaqah, isMusammi, userProfile, halaqahEvaluations, selectedMonth]);

    const filteredSantri = useMemo(() => {
        let result = santri.filter(s => {
            if (s.kelas === '-') return false;
            if (filterMarhalah !== 'all' && s.marhalah !== filterMarhalah) return false;
            if (filterKelas !== 'all' && s.kelas !== filterKelas) return false;
            
            const sHalaqah = getHalaqahForSantriInPeriod(s.id, selectedMonth);

            if (isMusammi) {
                const inAllowedHalaqah = filteredHalaqah.some(h => h.id === sHalaqah?.id || h.santri.some(member => member.id === s.id));
                if (!inAllowedHalaqah) return false;
            }

            if (filterHalaqah !== 'all') {
                const targetHalaqahId = parseInt(filterHalaqah);
                const isMemberOfSelected = sHalaqah?.id === targetHalaqahId || (halaqah.find(h => h.id === targetHalaqahId)?.santri.some(member => member.id === s.id));
                if (!isMemberOfSelected) return false;
            }
            if (searchName && !s.nama.toLowerCase().includes(searchName.toLowerCase())) return false;
            return true;
        });

        if (sortConfig) {
            result.sort((a, b) => {
                let valA: any = a[sortConfig.key as keyof typeof a];
                let valB: any = b[sortConfig.key as keyof typeof b];

                // Check calculated metrics
                
                if (sortConfig.key.startsWith('cat_')) {
                    const catName = sortConfig.key.replace('cat_', '');
                    const valAStr = localProgress[a.id]?.[catName] ?? progressMap.get(`${a.id}_${selectedMonth}_${catName}`) ?? '';
                    const valBStr = localProgress[b.id]?.[catName] ?? progressMap.get(`${b.id}_${selectedMonth}_${catName}`) ?? '';
                    valA = valAStr;
                    valB = valBStr;
                } else if (['totalHafalan', 'penambahanHafalan', 'murojaah', 'ziyadah', 'pctHafalan', 'pctMurojaah'].includes(sortConfig.key)) {

                    const metricsA = getSantriMetrics(a, selectedMonth);
                    const metricsB = getSantriMetrics(b, selectedMonth);
                    valA = (metricsA as any)[sortConfig.key];
                    valB = (metricsB as any)[sortConfig.key];
                } else if (['frekuensiSetoran', 'totalHalaman', 'persentaseKelancaran', 'persentaseKehadiran'].includes(sortConfig.key)) {
                    const statsA = getSantriDailyStats(a.id, selectedMonth, filterSkema);
                    const statsB = getSantriDailyStats(b.id, selectedMonth, filterSkema);
                    valA = (statsA as any)[sortConfig.key] || 0;
                    valB = (statsB as any)[sortConfig.key] || 0;
                }
                
                if (sortConfig.key === 'halaqah') {
                    const hA = getHalaqahForSantriInPeriod(a.id, selectedMonth);
                    const hB = getHalaqahForSantriInPeriod(b.id, selectedMonth);
                    valA = hA ? hA.nama : '';
                    valB = hB ? hB.nama : '';
                }

                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        } else {
            result.sort((a, b) => {
                const mIdxA = globalMarhalahs.indexOf(a.marhalah);
                const mIdxB = globalMarhalahs.indexOf(b.marhalah);
                if (mIdxA !== mIdxB) return mIdxA - mIdxB;
                if (a.kelas !== b.kelas) return a.kelas.localeCompare(b.kelas);
                return a.nama.localeCompare(b.nama);
            });
        }
        return result;
    }, [santri, filterMarhalah, filterKelas, filterHalaqah, searchName, halaqah, globalMarhalahs, sortConfig, localProgress, studentProgress, selectedMonth, sortedPeriods, classTargets, filteredHalaqah, isMusammi, filterSkema]);


    const paginatedSantri = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredSantri.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredSantri, currentPage]);

    const totalPages = Math.ceil(filteredSantri.length / itemsPerPage);

    // --- 2. Action Handlers ---
    
    const handleValueChange = (santriId: number, field: keyof StudentEvaluation, value: any) => {
        setLocalEvaluations(prev => ({
            ...prev,
            [santriId]: {
                ...prev[santriId],
                [field]: value
            }
        }));
    };

    
    const handleSyncSetoranHarian = async (type: 'ziyadah' | 'murojaah') => {
        setIsZiyadahMenuOpen(false);
        setIsMurojaahMenuOpen(false);
        
        const activePeriod = masterPeriods.find(p => p.id === selectedMonth);
        if (!activePeriod || !activePeriod.startDate || !activePeriod.endDate) {
            NotificationStore.addNotification("Periode evaluasi ini tidak memiliki tanggal mulai atau akhir yang valid.", 'error');
            return;
        }
        
        try {
            const { data, error } = await (supabase as any)
                .from('setoran_harian')
                .select('santri_id, skema, jumlah_halaman')
                .gte('tanggal', activePeriod.startDate)
                .lte('tanggal', activePeriod.endDate);
                
            if (error) throw error;
            if (!data || data.length === 0) {
                NotificationStore.addNotification("Tidak ada data setoran pada periode ini.", 'info');
                return;
            }

            const newLocalProgress = { ...localProgress };
            const santriMap = new Map();
            
            data.forEach((row: any) => {
                const skemaStr = row.skema ? String(row.skema).toLowerCase() : '';
                const isZiyadah = skemaStr.includes('ziyadah');
                const isMurojaah = !isZiyadah && (skemaStr.includes('murojaah') || skemaStr.includes('sabqi') || skemaStr.includes('manzil'));
                
                if (type === 'ziyadah' && isZiyadah) {
                    santriMap.set(row.santri_id, (santriMap.get(row.santri_id) || 0) + (row.jumlah_halaman || 0));
                } else if (type === 'murojaah' && isMurojaah) {
                    santriMap.set(row.santri_id, (santriMap.get(row.santri_id) || 0) + (row.jumlah_halaman || 0));
                }
            });
            
            paginatedSantri.forEach(s => {
                const totalHalaman = santriMap.get(s.id) || 0;
                if (totalHalaman > 0) {
                    if (!newLocalProgress[s.id]) newLocalProgress[s.id] = {};
                    if (type === 'ziyadah') {
                        newLocalProgress[s.id]['Ziyadah'] = String(totalHalaman);
                    } else {
                        newLocalProgress[s.id]['Murojaah'] = String(Number((totalHalaman / 20).toFixed(2)));
                    }
                }
            });
            
            setLocalProgress(newLocalProgress);
            NotificationStore.addNotification(`Berhasil menyinkronkan data ${type === 'ziyadah' ? 'Ziyadah' : 'Murojaah'}. Silahkan klik Simpan Perubahan.`, 'success');
        } catch (err: any) {
            NotificationStore.addNotification("Gagal sinkronisasi: " + err.message, 'error');
        }
    };

    const handleAutofillZiyadah = () => {
        // confirm removed for iframe compatibility
        
        const newLocalProgress = { ...localProgress };
        
        paginatedSantri.forEach(s => {
            const hafalanDepanStr = localProgress[s.id]?.['Hafalan Depan'] ?? progressMap.get(`${s.id}_${selectedMonth}_Hafalan Depan`) ?? '';
            const hafalanDepan = parseFloat(hafalanDepanStr) || 0;
            
            const hafalanBelakangStr = localProgress[s.id]?.['Hafalan Belakang'] ?? progressMap.get(`${s.id}_${selectedMonth}_Hafalan Belakang`) ?? '';
            const hafalanBelakang = parseFloat(hafalanBelakangStr) || 0;
            
            const explicitCurrentTotalHafalanStr = progressMap.get(`${s.id}_${selectedMonth}_Total Hafalan`);
            const explicitCurrentTotalHafalan = parseFloat(explicitCurrentTotalHafalanStr ?? '0') || 0;
            const totalHafalan = (hafalanDepan === 0 && hafalanBelakang === 0 && explicitCurrentTotalHafalan > 0) ? explicitCurrentTotalHafalan : (hafalanDepan + hafalanBelakang);

            let prevMonthKey = '';
            if (selectedMonth && sortedPeriods.length > 0) {
                const currentIndex = sortedPeriods.findIndex(p => p.id === selectedMonth);
                if (currentIndex !== -1 && currentIndex + 1 < sortedPeriods.length) {
                    prevMonthKey = sortedPeriods[currentIndex + 1].id;
                }
            }
            const explicitPrevTotalHafalanStr = progressMap.get(`${s.id}_${prevMonthKey}_Total Hafalan`);
            const prevHafalanDepan = parseFloat(progressMap.get(`${s.id}_${prevMonthKey}_Hafalan Depan`) ?? '0') || 0;
            const prevHafalanBelakang = parseFloat(progressMap.get(`${s.id}_${prevMonthKey}_Hafalan Belakang`) ?? '0') || 0;
            const prevTotalHafalan = explicitPrevTotalHafalanStr ? parseFloat(explicitPrevTotalHafalanStr) || 0 : (prevHafalanDepan + prevHafalanBelakang);
            
            const penambahanHafalan = totalHafalan - prevTotalHafalan;
            
            if (!newLocalProgress[s.id]) newLocalProgress[s.id] = {};
            
            const existingZiyadah = newLocalProgress[s.id]['Ziyadah'] ?? progressMap.get(`${s.id}_${selectedMonth}_Ziyadah`);
            if (!existingZiyadah || existingZiyadah.trim() === '') {
                const halaman = penambahanHafalan >= 0 ? penambahanHafalan * 20 : 0;
                newLocalProgress[s.id]['Ziyadah'] = String(halaman);
            }
        });
        
        setLocalProgress(newLocalProgress);
    };

    const handleDynamicValueChange = (santriId: number, category: string, value: string) => {
        setLocalProgress(prev => ({
            ...prev,
            [santriId]: {
                ...prev[santriId],
                [category]: value
            }
        }));
    };

    const handleSaveAll = async () => {
        const evalUpdates: (Partial<StudentEvaluation> & { santri_id: number, month_key: string })[] = [];
        const progressUpdates: Omit<StudentProgress, 'id'>[] = [];

        filteredSantri.forEach((santri) => {
            const santri_id = santri.id;
            
            if (localEvaluations[santri_id]) {
                evalUpdates.push({ ...(localEvaluations[santri_id] as any), santri_id, month_key: selectedMonth });
            }

            const safeCategories = localProgress[santri_id] || {};
            
            // Calculate total and penambahan before saving
            const hafalanDepan = parseFloat(safeCategories['Hafalan Depan'] ?? progressMap.get(`${santri_id}_${selectedMonth}_Hafalan Depan`) ?? '0') || 0;
            const hafalanBelakang = parseFloat(safeCategories['Hafalan Belakang'] ?? progressMap.get(`${santri_id}_${selectedMonth}_Hafalan Belakang`) ?? '0') || 0;
            const totalHafalan = hafalanDepan + hafalanBelakang;

            let prevMonthKey = '';
            if (selectedMonth && sortedPeriods.length > 0) {
                const currentIndex = sortedPeriods.findIndex(p => p.id === selectedMonth);
                if (currentIndex !== -1 && currentIndex + 1 < sortedPeriods.length) {
                    prevMonthKey = sortedPeriods[currentIndex + 1].id;
                }
            }
            const explicitPrevTotalHafalanStr = progressMap.get(`${santri_id}_${prevMonthKey}_Total Hafalan`);
            
            const prevHafalanDepan = parseFloat(progressMap.get(`${santri_id}_${prevMonthKey}_Hafalan Depan`) ?? '0') || 0;
            const prevHafalanBelakang = parseFloat(progressMap.get(`${santri_id}_${prevMonthKey}_Hafalan Belakang`) ?? '0') || 0;
            
            const prevTotalHafalan = explicitPrevTotalHafalanStr ? parseFloat(explicitPrevTotalHafalanStr) || 0 : (prevHafalanDepan + prevHafalanBelakang);
            
            const explicitCurrentTotalHafalanStr = progressMap.get(`${santri_id}_${selectedMonth}_Total Hafalan`);
            const explicitCurrentTotalHafalan = parseFloat(explicitCurrentTotalHafalanStr ?? '0') || 0;
            
            const totalHafalanEff = (hafalanDepan === 0 && hafalanBelakang === 0 && explicitCurrentTotalHafalan > 0) ? explicitCurrentTotalHafalan : totalHafalan;

            const finalCategories = {
                ...(safeCategories as any),
                'Total Hafalan': totalHafalanEff.toString()
            };

            Object.entries(finalCategories).forEach(([progress_type, value]) => {
                progressUpdates.push({ santri_id, month_key: selectedMonth, progress_type, value: value as string });
            });
        });

        try {
            if (evalUpdates.length > 0) {
                // We need to implement updateEvaluationBatch in useSupabaseData if it's not there,
                // but since we added it, we can use it.
                await updateEvaluationBatch(evalUpdates);
            }
            if (progressUpdates.length > 0) {
                await addStudentProgressBatch(progressUpdates);
            }
            NotificationStore.addNotification('Data berhasil disimpan!', 'success');
            setLocalEvaluations({});
            setLocalProgress({});
        } catch (error) {
            console.error(error);
            NotificationStore.addNotification('Terjadi kesalahan saat menyimpan data.', 'error');
        }
    };

    const openNotesModal = (santriId: number, name: string) => {
        const evalData = evalMap.get(`${santriId}_${selectedMonth}`);
        setTempNotes({
            musammi: evalData?.catatan_musammi || '',
            muroqib: evalData?.catatan_muroqib || '',
            lajnah: evalData?.catatan_lajnah || ''
        });
        setCurrentNoteSantri({ id: santriId, name });
        setIsNotesModalOpen(true);
    };

    const saveNotes = () => {
        if (currentNoteSantri) {
            updateEvaluation({
                santri_id: currentNoteSantri.id,
                month_key: selectedMonth,
                catatan_musammi: tempNotes.musammi,
                catatan_muroqib: tempNotes.muroqib,
                catatan_lajnah: tempNotes.lajnah
            });
            setIsNotesModalOpen(false);
        }
    };

    // --- 3. Settings Logic ---
    const [newOption, setNewOption] = useState('');
    const [newCategory, setNewCategory] = useState<string>('Hafalan');
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    useEffect(() => {
        if (!hasUnsavedChanges && newCategory) {
            setLocalCategorySettings(evaluationSettings.filter(s => s.category === newCategory).sort((a,b) => (b.score || 0) - (a.score || 0)));
            setLocalEvalColors(evalColors);
        }
    }, [newCategory, evaluationSettings, evalColors, hasUnsavedChanges]);
    const [isEditingCategory, setIsEditingCategory] = useState(false);
    const [editCategoryName, setEditCategoryName] = useState('');

    const allCategories = Array.from(new Set(evaluationSettings.map(s => s.category))) as string[];

    useEffect(() => {
        if (allCategories.length > 0 && !allCategories.includes(newCategory)) {
            setNewCategory(allCategories[0]);
        }
    }, [allCategories, newCategory]);

    const handleAddCategory = async () => {
        if (!newCategoryName.trim() || !newOption.trim()) return;
        await saveEvaluationSetting({ category: newCategoryName as any, label: newOption, score: 0 });
        setNewCategoryName('');
        setNewOption('');
        setNewCategory(newCategoryName);
        setIsAddingCategory(false);
    };

    const handleUpdateCategory = async () => {
        if (!editCategoryName.trim() || newCategory === editCategoryName) return;
        await updateEvaluationCategory(newCategory, editCategoryName);
        setNewCategory(editCategoryName);
        setIsEditingCategory(false);
        NotificationStore.addNotification('Kategori berhasil diperbarui.', 'success');
    };

    const handleDeleteCategory = async () => {
        await deleteEvaluationCategory(newCategory);
        setNewCategory(allCategories.length > 0 ? (allCategories.find(c => c !== newCategory) || '') : '');
        NotificationStore.addNotification('Kategori berhasil dihapus.', 'success');
    };

    // --- Halaqah Settings Logic ---
    
    const [editingHalaqahQuestion, setEditingHalaqahQuestion] = useState<Partial<any> | null>(null);

    const handleSaveHalaqahQuestion = async () => {
        if (!editingHalaqahQuestion?.question || !editingHalaqahQuestion?.type) return;
        try {
            await saveHalaqahEvalQuestion(editingHalaqahQuestion);
            setEditingHalaqahQuestion(null);
        } catch (error) {
            console.error('Error saving question:', error);
            NotificationStore.addNotification('Gagal menyimpan pertanyaan.', 'error');
        }
    };

    // --- 4. Report Generation ---
    
    const handleGeneratePreview = (target: 'wa' | 'telegram') => {
        if (selectedSantriIds.length === 0) return NotificationStore.addNotification("Pilih santri terlebih dahulu.", 'info');
        
        const messages: {name: string, phone: string, text: string, telegramChatId?: string}[] = [];

        selectedSantriIds.forEach(id => {
            const student = santri.find(x => x.id === id);
            if (!student) return;

            const evalData = studentEvaluations.find(x => x.santri_id === id && x.month_key === selectedMonth);
            
            let startDate = selectedMonth && selectedMonth.length === 7 ? selectedMonth + '-01' : selectedMonth;
            let endDate = selectedMonth && selectedMonth.length === 7 ? selectedMonth + '-31' : selectedMonth; // Crude fallback
            let periodName = formatDateIndo(selectedMonth);

            const activePeriod = masterPeriods.find(p => p.id === selectedMonth);
            if (activePeriod) {
                if (activePeriod.startDate) startDate = activePeriod.startDate;
                if (activePeriod.endDate) endDate = activePeriod.endDate;
                if (activePeriod.name && activePeriod.startDate && activePeriod.endDate) {
                    const sDate = new Date(startDate);
                    const eDate = new Date(endDate);
                    if (!isNaN(sDate.getTime()) && !isNaN(eDate.getTime())) {
                        periodName = `${activePeriod.name} (${format(sDate, 'dd MMM yyyy')} s.d ${format(eDate, 'dd MMM yyyy')})`;
                    } else {
                        periodName = activePeriod.name;
                    }
                } else if (activePeriod.startDate && activePeriod.endDate) {
                    const sDate = new Date(startDate);
                    const eDate = new Date(endDate);
                    if (!isNaN(sDate.getTime()) && !isNaN(eDate.getTime())) {
                        periodName = `${format(sDate, 'dd MMM yyyy')} s.d ${format(eDate, 'dd MMM yyyy')}`;
                    } else if (activePeriod.name) {
                        periodName = activePeriod.name;
                    }
                } else if (activePeriod.name) {
                    periodName = activePeriod.name;
                } else if (activePeriod.id && !activePeriod.id.startsWith('period_')) {
                    periodName = formatDateIndo(activePeriod.id);
                } else if (activePeriod.id && activePeriod.id.startsWith('period_')) {
                    periodName = 'Periode ' + activePeriod.id.replace('period_', '');
                }
            } else if (selectedMonth.startsWith('period_')) {
                periodName = 'Periode ' + selectedMonth.replace('period_', '');
            }

            // 1. Attendance Stats for Selected Month
            const studentAtt = attendance.filter(a => 
                a.personId === id && 
                a.peran === 'Santri' && 
                a.date >= startDate &&
                a.date <= endDate
            );
            
            const stats: Record<string, number> = {};
            globalAttendanceStatus?.forEach(s => stats[s] = 0);
            
            studentAtt.forEach(a => { if (a.status !== undefined) stats[a.status] = (stats[a.status] || 0) + 1; });

            // 2. Progress Stats for Selected Month
            const studentProg = studentProgress.filter(p => p.santri_id === id && p.month_key === selectedMonth);
            const getProgVal = (type: string) => {
                const progValue = studentProg.find(p => p.progress_type === type)?.value;
                if (progValue) return progValue;
                if (type === 'Hafalan') return evalData?.kualitas_hafalan || '-';
                if (type === 'Bacaan') return evalData?.kualitas_bacaan || '-';
                if (type === 'Sikap') return evalData?.sikap_prilaku || '-';
                return '-';
            };

            const metrics = getSantriMetrics(student, selectedMonth);
            const activeSemester = selectedAcademicYear?.active_semester || 'Ganjil';
            const target = classTargets?.find(t => (t.semester === activeSemester || !t.semester) && t.marhalah === student.marhalah && t.kelas === student.kelas) || { target_hafalan: 0 };
            
            let targetMurojaah = 0;
            const murojaahSetting = appSettings.find(s => s.key === 'TARGET_MUROJAAH_GLOBAL');
            if (murojaahSetting && murojaahSetting.value) {
                try {
                    const parsed = JSON.parse(murojaahSetting.value);
                    const rules = parsed[student.marhalah] || [];
                    if (Array.isArray(rules)) {
                        const sortedRules = [...rules].sort((a, b) => b.min_capaian - a.min_capaian);
                        const matchedRule = sortedRules.find(r => metrics.totalHafalan >= r.min_capaian);
                        if (matchedRule) {
                            targetMurojaah = matchedRule.target;
                        }
                    }
                } catch (e) {}
            }

            // 3. Construct Message
            const parentName = student.nama_wali || 'Bapak/Ibu';
            
            let statHadir = `Hadir      : ${stats.Hadir || 0} kali\n`;
            statHadir += `Sakit      : ${stats.Sakit || 0} kali\n`;
            statHadir += `Izin       : ${stats.Izin || 0} kali\n`;
            statHadir += `Alpa       : ${stats.Alpa || 0} kali\n`;
            statHadir += `Terlambat  : ${stats.Terlambat || 0} kali`;

            let capTahfidz = `Hafalan Depan     : ${getProgVal('Hafalan Depan')} Juz (${getProgVal('Surat Ayat Depan')})\n`;
            capTahfidz += `Hafalan Belakang  : ${getProgVal('Hafalan Belakang')} Juz (${getProgVal('Surat Ayat Belakang')})\n`;
            capTahfidz += `Total Hafalan     : ${getProgVal('Total Hafalan')} Juz\n`;
            capTahfidz += `Target Hafalan    : ${target.target_hafalan || 0} Juz (${metrics.pctHafalan.toFixed(1)}%)\n`;
            capTahfidz += `Muroja'ah         : ${getProgVal('Murojaah')} Juz\n`;
            capTahfidz += `Target Murojaah   : ${targetMurojaah || 0} Juz (${metrics.pctMurojaah.toFixed(1)}%)\n`;
            capTahfidz += `Ziyadah           : ${getProgVal('Ziyadah')} Halaman`;

            let penEval = '';
            allCategories.forEach(c => {
                const val = getProgVal(c);
                if (val !== '-') {
                    penEval += `${c} : *${val}*\n`;
                }
            });
            const halaqahObj = student.halaqah_id ? halaqah.find(h => h.id === parseInt(student.halaqah_id.toString())) : null;
            const halaqahEval = halaqahObj ? halaqahEvaluations.find(e => e.halaqah_id === halaqahObj.id && e.month_key === selectedMonth) : null;
            if (halaqahEval && halaqahEval.answers && Object.keys(halaqahEval.answers).length > 0) {
                halaqahEvalQuestions.forEach(q => {
                    const ans = halaqahEval.answers[q.id];
                    if (ans) {
                        penEval += `${q.question} : *${ans}*\n`;
                    }
                });
            }
            if (penEval.endsWith('\n')) penEval = penEval.slice(0, -1);

            let catPengasuh = '';
            if (evalData?.catatan_musammi) catPengasuh += `Musammi\n"${evalData.catatan_musammi}"\n\n`;
            if (evalData?.catatan_muroqib) catPengasuh += `Muroqib\n"${evalData.catatan_muroqib}"\n\n`;
            if (evalData?.catatan_lajnah) catPengasuh += `Lajnah\n"${evalData.catatan_lajnah}"\n\n`;
            if (!evalData?.catatan_musammi && !evalData?.catatan_muroqib && !evalData?.catatan_lajnah) {
                catPengasuh += `(Tidak ada catatan khusus)`;
            }
            if (catPengasuh.endsWith('\n\n')) catPengasuh = catPengasuh.slice(0, -2);

            let msg = evalTemplate
                .replace(/\{\{nama\}\}/gi, student.nama)
                .replace(/\{\{kelas\}\}/gi, student.kelas)
                .replace(/\{\{marhalah\}\}/gi, student.marhalah)
                .replace(/\{\{periode\}\}/gi, periodName)
                .replace(/\{\{statistik_kehadiran\}\}/gi, statHadir)
                .replace(/\{\{capaian_tahfidz\}\}/gi, capTahfidz)
                .replace(/\{\{penilaian_evaluasi\}\}/gi, penEval)
                .replace(/\{\{catatan_pengasuh\}\}/gi, catPengasuh);

            messages.push({
                name: student.nama,
                phone: student.no_hp_wali || '',
                telegramChatId: student.telegram_chat_id || '',
                text: msg
            });
        });

        setGeneratedMessages(messages);
        setMessageTarget(target);
        setIsPreviewModalOpen(true);
    };

    const sendWA = (phone: string, text: string) => {
        if(!phone) return NotificationStore.addNotification("Nomor HP tidak tersedia.", 'error');
        let p = phone.replace(/\D/g, '');
        if(p.startsWith('0')) p = '62' + p.substring(1);
        NotificationStore.addNotification(`Membuka WhatsApp untuk mengirim pesan ke ${p}...`, 'info');
        window.open(`https://wa.me/${p}?text=${encodeURIComponent(text)}`, '_blank');
    };

    const handleSendTelegram = async (chatId: string, text: string) => {
        const botToken = appSettings.find(s => s.key === 'TELEGRAM_BOT_TOKEN')?.value;
        if (!botToken) {
            return NotificationStore.addNotification('Bot token belum disetting. Silakan setting di menu Pengaturan.', 'error');
        }
        if (!chatId) return NotificationStore.addNotification('Chat ID tidak tersedia untuk santri ini.', 'error');

        try {
            await sendCustomTelegramMessage(botToken, chatId, text);
            NotificationStore.addNotification('Pesan berhasil terkirim!', 'success');
        } catch (e: any) {
            NotificationStore.addNotification('Gagal mengirim pesan: ' + e.message, 'error');
        }
    };

    const handleSendMassTelegram = async () => {
        const botToken = appSettings.find(s => s.key === 'TELEGRAM_BOT_TOKEN')?.value;
        if (!botToken) {
            return NotificationStore.addNotification('Bot token belum disetting. Silakan setting di menu Pengaturan.', 'error');
        }

        const validMessages = generatedMessages.filter(m => m.telegramChatId);
        if (validMessages.length === 0) return NotificationStore.addNotification('Tidak ada santri dengan Chat ID yang valid.', 'error');

        let successCount = 0;
        let failCount = 0;

        for (const msg of validMessages) {
            try {
                await sendCustomTelegramMessage(botToken, msg.telegramChatId!, msg.text);
                successCount++;
            } catch (e) {
                failCount++;
            }
        }
        
        NotificationStore.addNotification(`Pengiriman massal selesai. Berhasil: ${successCount}. Gagal: ${failCount}.`, 'info');
    };

    const copyText = (text: string) => {
        navigator.clipboard.writeText(text);
        NotificationStore.addNotification("Pesan disalin ke clipboard!", 'success');
    };

    // --- 5. Import/Export ---
    
    const handleDownloadTemplate = () => {
        const periodName = formatPeriodName(selectedMonth, appSettings);
        if (activeTab === 'halaqah') {
            let items: any[] = [];
            filteredHalaqah.forEach(h => {
                const row: any = {
                    'ID Halaqah': h.id,
                    'Nama Halaqah': h.nama
                };
                halaqahEvalQuestions.forEach(q => row[q.question] = '');
                items.push(row);
            });
            if (items.length === 0) {
                const dummyRow: any = {
                    'ID Halaqah': 1,
                    'Nama Halaqah': 'Halaqah A'
                };
                halaqahEvalQuestions.forEach(q => dummyRow[q.question] = '');
                items.push(dummyRow);
            }
            exportToExcel(items, `Template_Evaluasi_Halaqah_${periodName}`);
            return;
        }

        let items: any[] = [];
        
        filteredSantri.forEach(s => {
            const row: any = {
                'ID Santri': s.id,
                'nama_santri': s.nama,
                'hafalan_depan': '',
                'surat_ayat_depan': '',
                'hafalan_belakang': '',
                'surat_ayat_belakang': '',
                'murojaah': '',
                'jumlah_ziyadah': ''
            };
            allCategories.forEach(c => row[c] = '');
            row['catatan_musammi'] = '';
            row['catatan_muroqib'] = '';
            row['catatan_lajnah'] = '';
            items.push(row);
        });

        if (items.length === 0) {
            const dummyRow: any = {
                'ID Santri': 123,
                'nama_santri': 'Abdullah',
                'hafalan_depan': '',
                'surat_ayat_depan': '',
                'hafalan_belakang': '',
                'surat_ayat_belakang': '',
                'murojaah': '',
                'jumlah_ziyadah': ''
            };
            allCategories.forEach(c => dummyRow[c] = '');
            dummyRow['catatan_musammi'] = '';
            dummyRow['catatan_muroqib'] = '';
            dummyRow['catatan_lajnah'] = '';
            items.push(dummyRow);
        }

        exportToExcel(items, `Template_Evaluasi_Santri_${periodName}`);
    };

    const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if(!file) return;
        try {
            const csvData = await parseSpreadsheet(file);
            let success = 0; 
            
            if (activeTab === 'halaqah') {
                for (const row of csvData) {
                    const getRowVal = (keysToTry: string[]) => {
                        for (const k of Object.keys(row)) {
                            if (keysToTry.some(kt => k.toLowerCase() === kt.toLowerCase() || k.toLowerCase() === kt.toLowerCase().replace(/_/g, ' '))) {
                                return row[k];
                            }
                        }
                        return undefined;
                    };

                    const rowId = getRowVal(['id_halaqah', 'ID Halaqah', 'id']);
                    const name = getRowVal(['nama_halaqah', 'Nama Halaqah', 'nama']);

                    if (!rowId && !name) continue;

                    let target = undefined;
                    if (rowId) target = halaqah.find(h => h.id.toString() === rowId.toString());
                    if (!target && name) target = halaqah.find(h => h.nama.toLowerCase() === name.toLowerCase().trim());
                    
                    if (target) {
                        const answers: Record<string, string> = {};
                        halaqahEvalQuestions.forEach(q => {
                            const val = getRowVal([q.question]);
                            if (val !== undefined && val !== '') answers[q.id] = String(val);
                        });
                        
                        if (Object.keys(answers).length > 0) {
                            await saveHalaqahEvaluation({
                                halaqah_id: target.id,
                                month_key: selectedMonth,
                                answers
                            });
                            success++;
                        }
                    }
                }
                NotificationStore.addNotification(`Berhasil import ${success} data evaluasi halaqah.`, 'success');
                fetchData();
                if(fileInputRef.current) fileInputRef.current.value = '';
                return;
            }

            const evalUpdates: any[] = [];
            const progressUpdates: any[] = [];

            for(const row of csvData) {
                const getRowVal = (keysToTry: string[]) => {
                    for (const k of Object.keys(row)) {
                        if (keysToTry.some(kt => k.toLowerCase() === kt.toLowerCase() || k.toLowerCase() === kt.toLowerCase().replace(/_/g, ' '))) {
                            return row[k];
                        }
                    }
                    return undefined;
                };

                const rowId = getRowVal(['id_santri', 'ID Santri', 'id']);
                const name = getRowVal(['nama_santri', 'nama']);
                
                if(!rowId && !name) continue;
                
                let target = undefined;
                if (rowId) {
                    target = santri.find(s => s.id.toString() === rowId.toString());
                }
                
                if (!target && name) {
                    target = santri.find(s => s.nama.toLowerCase() === name.toLowerCase().trim());
                }

                if(target) {
                    evalUpdates.push({
                        santri_id: target.id,
                        month_key: selectedMonth,
                        kualitas_hafalan: getRowVal(['kualitas_hafalan', 'hafalan']),
                        kualitas_bacaan: getRowVal(['kualitas_bacaan', 'bacaan']),
                        sikap_prilaku: getRowVal(['sikap_prilaku', 'sikap']),
                        catatan_musammi: getRowVal(['catatan_musammi', 'catatan musammi']),
                        catatan_muroqib: getRowVal(['catatan_muroqib', 'catatan muroqib']),
                        catatan_lajnah: getRowVal(['catatan_lajnah', 'catatan lajnah'])
                    });
                    
                    const pTypes = [
                        { key: 'hafalan_depan', type: 'Hafalan Depan' },
                        { key: 'surat_ayat_depan', type: 'Surat Ayat Depan' },
                        { key: 'hafalan_belakang', type: 'Hafalan Belakang' },
                        { key: 'surat_ayat_belakang', type: 'Surat Ayat Belakang' },
                        { key: 'murojaah', type: 'Murojaah' }
                    ];

                    pTypes.forEach(pt => {
                        const val = getRowVal([pt.key, pt.type]);
                        if (val !== undefined && val !== '') {
                            progressUpdates.push({ santri_id: target.id, month_key: selectedMonth, progress_type: pt.type, value: String(val) });
                        }
                    });

                    allCategories.forEach(c => {
                        const val = getRowVal([c, c.toLowerCase().replace(/\s+/g, '_')]);
                        if (val !== undefined && val !== '') {
                            progressUpdates.push({ santri_id: target.id, month_key: selectedMonth, progress_type: c, value: String(val) });
                        }
                    });

                    // Calculate Total Hafalan & Ziyadah
                    const hafalanDepan = parseFloat(String(getRowVal(['hafalan_depan', 'Hafalan Depan']) || 0)) || 0;
                    const hafalanBelakang = parseFloat(String(getRowVal(['hafalan_belakang', 'Hafalan Belakang']) || 0)) || 0;
                    const explicitTotalHafalan = getRowVal(['total_hafalan', 'Total Hafalan']);
                    const totalHafalan = explicitTotalHafalan !== undefined && explicitTotalHafalan !== '' ? parseFloat(String(explicitTotalHafalan)) : (hafalanDepan + hafalanBelakang);

                    const explicitZiyadah = getRowVal(['ziyadah', 'Ziyadah', 'jumlah_ziyadah', 'Jumlah Ziyadah']);
                    
                    progressUpdates.push({ santri_id: target.id, month_key: selectedMonth, progress_type: 'Total Hafalan', value: String(totalHafalan) });
                    if (explicitZiyadah !== undefined && explicitZiyadah !== '') {
                        progressUpdates.push({ santri_id: target.id, month_key: selectedMonth, progress_type: 'Ziyadah', value: String(explicitZiyadah) });
                    }
                    
                    success++;
                }
            }
            if (evalUpdates.length > 0) await updateEvaluationBatch(evalUpdates);
            if (progressUpdates.length > 0) await addStudentProgressBatch(progressUpdates);

            NotificationStore.addNotification(`Berhasil import ${success} data evaluasi santri.`, 'success');
            fetchData();
        } catch(err) { NotificationStore.addNotification('Gagal import CSV', 'error'); }
        if(fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleExportExcel = () => {
        const periodName = formatPeriodName(selectedMonth, appSettings);

        if (activeTab === 'halaqah') {
            const data = filteredHalaqah.map(h => {
                const evalData = halaqahEvaluations.find(e => e.halaqah_id === h.id && e.month_key === selectedMonth);
                const row: any = {
                    'ID Halaqah': h.id,
                    'Nama Halaqah': h.nama,
                    'Marhalah': h.marhalah,
                    'Musammi': h.musammi?.nama || '-'
                };
                halaqahEvalQuestions.forEach(q => row[q.question] = evalData?.answers?.[q.id] || '');
                return row;
            });
            exportToExcel(data, `Evaluasi_Halaqah_${periodName}`);
            return;
        }

        const data = filteredSantri.map(s => {
            const evalData = evalMap.get(`${s.id}_${selectedMonth}`);
            const studentProg = studentProgress.filter(p => p.santri_id === s.id && p.month_key === selectedMonth);
            const getProgVal = (type: string) => {
                const progValue = studentProg.find(p => p.progress_type === type)?.value;
                if (progValue) return progValue;
                if (type === 'Hafalan') return evalData?.kualitas_hafalan || '-';
                if (type === 'Bacaan') return evalData?.kualitas_bacaan || '-';
                if (type === 'Sikap') return evalData?.sikap_prilaku || '-';
                return '-';
            };
            
            const metrics = getSantriMetrics(s, selectedMonth);
            const dailyStats = getSantriDailyStats(s.id, selectedMonth, filterSkema);
            const activeSemester = selectedAcademicYear?.active_semester || 'Ganjil';
            const target = classTargets?.find(t => (t.semester === activeSemester || !t.semester) && t.marhalah === s.marhalah && t.kelas === s.kelas) || { target_hafalan: 0 };
            
            let targetMurojaah = 0;
            const murojaahSetting = appSettings.find(set => set.key === 'TARGET_MUROJAAH_GLOBAL');
            if (murojaahSetting && murojaahSetting.value) {
                try {
                    const parsed = JSON.parse(murojaahSetting.value);
                    const rules = parsed[s.marhalah] || [];
                    if (Array.isArray(rules)) {
                        const sortedRules = [...rules].sort((a, b) => b.min_capaian - a.min_capaian);
                        const matchedRule = sortedRules.find(r => metrics.totalHafalan >= r.min_capaian);
                        if (matchedRule) {
                            targetMurojaah = matchedRule.target;
                        }
                    }
                } catch (e) {}
            }

            const sH = getHalaqahForSantriInPeriod(s.id, selectedMonth);
            const row: any = {
                'ID Santri': s.id,
                'Nama': s.nama,
                'Halaqah': sH ? sH.nama : '-',
                'Kelas': `${s.kelas_id ? masterKelasRelasi?.find((k: any) => k.id === s.kelas_id)?.nama_kelas || s.kelas : s.kelas} (${s.marhalah_id ? masterMarhalahs?.find((m: any) => m.id === s.marhalah_id)?.nama || s.marhalah : s.marhalah})`,
                'Hafalan Depan': getProgVal('Hafalan Depan'),
                'Surat Ayat Depan': getProgVal('Surat Ayat Depan'),
                'Hafalan Belakang': getProgVal('Hafalan Belakang'),
                'Surat Ayat Belakang': getProgVal('Surat Ayat Belakang'),
                'Total Hafalan (Juz)': metrics.totalHafalan,
                'Target Hafalan (Juz)': target.target_hafalan || 0,
                '% Target Hafalan': `${metrics.pctHafalan.toFixed(1)}%`,
                'Jumlah Ziyadah': getProgVal('Ziyadah'),
                'Murojaah': getProgVal('Murojaah'),
                'Target Murojaah (Juz)': targetMurojaah,
                '% Target Murojaah': `${metrics.pctMurojaah.toFixed(1)}%`
            };
            
            allCategories.forEach(c => {
                row[c] = getProgVal(c);
            });

            // Metrik Setoran Harian (diletakkan setelah kuesioner dinamis)
            row['Jml Setoran'] = dailyStats.hasDailyData ? `${dailyStats.totalHalaman} Hal` : '-';
            row['Frekuensi'] = dailyStats.hasDailyData ? `${dailyStats.frekuensiSetoran}x` : '-';
            row['% Kelancaran'] = dailyStats.hasDailyData ? `${dailyStats.persentaseKelancaran.toFixed(1)}%` : '-';
            row['Nilai Rata-rata'] = dailyStats.hasDailyData && dailyStats.finalNilaiLabel !== '-' ? dailyStats.finalNilaiLabel : '-';
            row['% Kehadiran'] = dailyStats.hasDailyData ? `${dailyStats.persentaseKehadiran.toFixed(1)}%` : '-';
            
            // Catatan diletakkan paling akhir
            row['Catatan Musammi'] = evalData?.catatan_musammi || '-';
            row['Catatan Muroqib'] = evalData?.catatan_muroqib || '-';
            row['Catatan Lajnah'] = evalData?.catatan_lajnah || '-';

            return row;
        });
        exportToExcel(data, `Evaluasi_Santri_${periodName}`);
    };

    const toggleSelectAll = () => {
        if (selectedSantriIds.length === filteredSantri.length) setSelectedSantriIds([]);
        else setSelectedSantriIds(filteredSantri.map(s => s.id));
    };

    if (loading) return <p>Loading...</p>;

    if (selectedSantriForDetail) {
        return (
            <div className="w-full space-y-6 animate-in fade-in duration-300 pb-12 font-sans">
                <SantriDetailProgressView
                    santri={selectedSantriForDetail}
                    selectedPeriod={selectedMonth}
                    onPeriodChange={setSelectedMonth}
                    periods={sortedPeriods}
                    appSettings={appSettings}
                    halaqahList={halaqah}
                    studentProgress={studentProgress}
                    localProgress={localProgress}
                    studentEvaluations={studentEvaluations}
                    attendance={attendance}
                    setoranHarian={setoranHarian}
                    allCategories={allCategories}
                    getOptions={getOptions}
                    evalColors={evalColors}
                    classTargets={classTargets}
                    onBack={() => setSelectedSantriForDetail(null)}
                />
            </div>
        );
    }

    const getPageTitle = () => {
        switch (activeTab) {
            case 'santri': return "Evaluasi Santri";
            case 'halaqah': return "Evaluasi Halaqah";
            case 'setoran': return "Setoran Harian";
            default: return "Progres & Evaluasi";
        }
    };

    const getPageDescription = () => {
        switch (activeTab) {
            case 'santri': return "Kelola data evaluasi dan laporan perkembangan santri.";
            case 'halaqah': return "Kelola data evaluasi dan laporan perkembangan halaqah.";
            case 'setoran': return "Kelola data setoran harian.";
            default: return "Kelola data evaluasi dan laporan perkembangan santri maupun halaqah.";
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500 font-sans min-h-screen max-w-[1400px] mx-auto pb-12 pt-2">
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-2 relative z-[60]">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight leading-tight mb-2">
                        {getPageTitle()}
                    </h1>
                    <p className="text-sm text-slate-500 font-medium">
                        {getPageDescription()}
                    </p>
                </div>
                <div className="flex flex-wrap gap-3 justify-end items-center">
                    <button 
                        onClick={() => setIsFilterExpanded(!isFilterExpanded)} 
                        className={`border px-4 py-2.5 rounded-xl text-[13px] font-bold shadow-sm transition-all focus:ring-4 focus:ring-slate-100 flex items-center ${isFilterExpanded ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' : 'bg-white text-slate-700 border-slate-200/80 hover:bg-slate-50 hover:border-slate-300'}`}
                        title="Filter Data"
                    >
                        <ListFilter size={16} />
                    </button>
                    {activeTab === 'pivot' && (
                        <div className="relative z-20">
                            <button 
                                onClick={() => setIsImportMenuOpen(!isImportMenuOpen)}
                                className="bg-emerald-600 text-white border border-emerald-700/80 hover:bg-emerald-700 px-4 py-2.5 rounded-xl text-[13px] font-bold flex items-center transition-all shadow-sm focus:ring-4 focus:ring-emerald-100"
                            >
                                <Upload size={16} className="mr-2" /> Import
                            </button>
                            {isImportMenuOpen && (
                                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-200 z-50 py-2">
                                    <button 
                                        className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center"
                                        onClick={() => { setIsImportMenuOpen(false); fileInputRef.current?.click(); }}
                                    >
                                        <Upload size={14} className="mr-2" /> Import Excel CSV
                                    </button>
                                    <button 
                                        className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center"
                                        onClick={() => { setIsImportMenuOpen(false); handleDownloadTemplate(); }}
                                    >
                                        <Download size={14} className="mr-2" /> Download Template
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    <button type="button" onClick={handleExportExcel} className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-[13px] hover:bg-emerald-700 flex items-center font-bold shadow-sm transition-all focus:ring-4 focus:ring-emerald-100">
                        <Download size={16} className="mr-2"/> Export
                    </button>
                    
                    {(activeTab === 'santri' || activeTab === 'halaqah') && (
                        <div className="relative group z-20">
                            <button className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-[13px] hover:bg-emerald-700 font-bold flex items-center shadow-sm transition-all focus:ring-4 focus:ring-emerald-100">
                                <Upload size={16} className="mr-2"/> Import
                            </button>
                            <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-100 rounded-2xl shadow-[0_12px_40px_-10px_rgba(0,0,0,0.15)] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all overflow-hidden z-[70]">
                                <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full text-left px-5 py-3.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center transition-colors">
                                    <Upload size={16} className="mr-3 text-blue-600"/> Upload File Excel
                                </button>
                                <button type="button" onClick={handleDownloadTemplate} className="w-full text-left px-5 py-3.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center border-t border-slate-100 transition-colors">
                                    <Download size={16} className="mr-3 text-emerald-600"/> Download Template
                                </button>
                            </div>
                        </div>
                    )}
                    <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls, .csv" onChange={handleImportCSV}/>
                    
                    {activeTab === 'santri' && selectedSantriIds.length > 0 && (
                        <>
                            <button type="button" onClick={() => handleGeneratePreview('wa')} className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-[13px] font-bold shadow-sm transition-all hover:bg-emerald-700 hover:shadow-md active:bg-emerald-800 flex items-center gap-2 animate-in fade-in duration-200">
                                <MessageCircle size={16} strokeWidth={2.5}/> Bagikan WA ({selectedSantriIds.length})
                            </button>
                            <button type="button" onClick={() => handleGeneratePreview('telegram')} className="bg-sky-500 text-white px-4 py-2.5 rounded-xl text-[13px] font-bold shadow-sm transition-all hover:bg-sky-600 hover:shadow-md active:bg-sky-700 flex items-center gap-2 animate-in fade-in duration-200">
                                <Send size={16} strokeWidth={2.5}/> Bagikan Telegram ({selectedSantriIds.length})
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Filters Bar & Tabs */}
            <div className="flex flex-col gap-6 z-10 relative">
                <div className="flex items-center gap-6 border-b border-slate-200">
                    <div className="flex gap-6">
                        {isMusammi ? (
                            <button type="button" onClick={() => setActiveTab('statistik')} className={`pb-3 text-sm font-bold transition-all duration-200 border-b-2 ${activeTab === 'statistik' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Statistik</button>
                        ) : (
                            <>
                                <button type="button" onClick={() => setActiveTab('santri')} className={`pb-3 text-sm font-bold transition-all duration-200 border-b-2 ${activeTab === 'santri' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Evaluasi Santri</button>
                                <button type="button" onClick={() => setActiveTab('halaqah')} className={`pb-3 text-sm font-bold transition-all duration-200 border-b-2 ${activeTab === 'halaqah' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Evaluasi Halaqah</button>
                                <button type="button" onClick={() => setActiveTab('pivot')} className={`pb-3 text-sm font-bold transition-all duration-200 border-b-2 ${activeTab === 'pivot' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Pivot Table</button>
                                <button type="button" onClick={() => setActiveTab('statistik')} className={`pb-3 text-sm font-bold transition-all duration-200 border-b-2 ${activeTab === 'statistik' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Statistik</button>
                            </>
                        )}
                    </div>
                </div>
                
                {isFilterExpanded && (
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="flex flex-wrap gap-4 items-end">
                            <div className="flex-[2] min-w-[250px]">
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Pencarian Santri</label>
                                <div className="relative">
                                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input type="text" placeholder="Cari nama santri..." className="w-full border border-slate-200/80 rounded-xl pl-10 pr-4 py-2.5 text-[13px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white" value={searchName} onChange={e => setSearchName(e.target.value)} />
                                </div>
                            </div>
                            <div className="flex-1 min-w-[200px]">
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Periode Evaluasi</label>
                                <select className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all cursor-pointer" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
                                    {sortedPeriods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                        </div>
                        
                        <div className="flex flex-wrap gap-4 items-end">
                            <div className="flex-1 min-w-[150px]">
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Marhalah</label>
                                <select className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all cursor-pointer" value={filterMarhalah} onChange={e => setFilterMarhalah(e.target.value as Marhalah | 'all')}>
                                    <option value="all">Semua Marhalah</option>
                                    {globalMarhalahs.map(m => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                            </div>
                            
                            <div className="flex-1 min-w-[150px]">
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Kelas</label>
                                <select className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all cursor-pointer" value={filterKelas} onChange={e => setFilterKelas(e.target.value)}>
                                    <option value="all">Semua Kelas</option>
                                    {masterKelas
                                        .filter(k => filterMarhalah === 'all' || k.marhalah === filterMarhalah)
                                        .map(k => k.nama_kelas)
                                        .filter((value, index, self) => self.indexOf(value) === index)
                                        .sort()
                                        .map(k => (
                                            <option key={k} value={k}>{k}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex-1 min-w-[150px]">
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Jenis Halaqah</label>
                                <select className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all cursor-pointer" value={filterJenisHalaqah} onChange={e => setFilterJenisHalaqah(e.target.value)}>
                                    <option value="all">Semua Jenis</option>
                                    {globalJenisHalaqah.map(jenis => (
                                        <option key={jenis} value={jenis}>{jenis}</option>
                                    ))}
                                </select>
                            </div>
                            
                            <div className="flex-1 min-w-[150px]">
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Halaqah</label>
                                <select className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all cursor-pointer" value={filterHalaqah} onChange={e => setFilterHalaqah(e.target.value)}>
                                    <option value="all">Semua Halaqah</option>
                                    {availableHalaqahOptions.map(h => (
                                        <option key={h.id} value={h.id}>
                                            {h.nama} {h.is_active ? '(Aktif)' : '(Arsip)'}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex-1 min-w-[150px]">
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Jenis Setoran</label>
                                <select 
                                    className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all cursor-pointer" 
                                    value={filterSkema} 
                                    onChange={e => setFilterSkema(e.target.value)}
                                >
                                    <option value="all">Semua Jenis Setoran</option>
                                    {dynamicSkemaOptions.map(sk => (
                                        <option key={sk} value={sk}>{sk}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {activeTab === 'santri' && (
                <>
            {filterHalaqah !== 'all' && (
                <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-5 mb-6 text-slate-700">
                    <h3 className="font-bold text-[14px] text-blue-900 mb-4 flex items-center">
                        <Users size={16} className="mr-2" /> Evaluasi Halaqah ({halaqah.find(h => h.id.toString() === filterHalaqah)?.nama})
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(() => {
                            const evalData = halaqahEvaluations.find(e => e.halaqah_id.toString() === filterHalaqah && e.month_key === selectedMonth);
                            if (!evalData || !evalData.answers || Object.keys(evalData.answers).length === 0) return <p className="text-[12px] text-slate-500 italic col-span-full">Belum ada evaluasi halaqah untuk periode ini.</p>;
                            
                            return halaqahEvalQuestions.map(q => (
                                <div key={q.id} className="bg-white border border-blue-100/50 rounded-xl p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{q.question}</p>
                                    <p className="text-[13px] font-medium text-slate-800">{evalData.answers[q.id] || '-'}</p>
                                </div>
                            ));
                        })()}
                    </div>
                </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden flex flex-col min-h-[500px]">
                {/* Table */}
                <div className="flex-1 overflow-x-auto p-0 min-h-[300px] border-b border-slate-200/80">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-40">
                            <tr className="bg-slate-50 border-b border-slate-200/80">
                                <th className="px-5 py-4 sticky left-0 bg-slate-50 z-50 w-12 border-r-2 border-slate-200/80 text-[12px] font-bold text-slate-600 uppercase tracking-wider text-center shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                                    <button type="button" onClick={toggleSelectAll} className="hover:opacity-80 transition-opacity flex items-center justify-center w-full">{selectedSantriIds.length === filteredSantri.length && filteredSantri.length > 0 ? <CheckSquare size={18} className="text-blue-600"/> : <Square size={18} className="text-slate-400 font-normal"/>}</button>
                                </th>
                                
                                <th className="px-5 py-4 sticky left-[48px] bg-slate-50 z-50 min-w-[200px] border-r-2 border-slate-200/80 text-[12px] font-bold text-slate-600 uppercase tracking-wider shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                                    <div className="flex items-center justify-between">
                                        <span>Nama Santri</span>
                                        <button type="button" onClick={() => handleSort('nama')} className="text-slate-400 hover:text-slate-600"><ArrowUpDown size={14} /></button>
                                    </div>
                                </th>
                                <th className="px-5 py-4 text-[12px] font-bold text-slate-600 uppercase tracking-wider min-w-[150px] border-r border-slate-200/80">
                                    <div className="flex items-center justify-between">
                                        <span>Halaqah</span>
                                        <button type="button" onClick={() => handleSort('halaqah')} className="text-slate-400 hover:text-slate-600"><ArrowUpDown size={14} /></button>
                                    </div>
                                </th>
                                <th className="px-5 py-4 text-[12px] font-bold text-slate-600 uppercase tracking-wider min-w-[100px] border-r border-slate-200/80">
                                    <div className="flex items-center justify-between">
                                        <span>Kelas</span>
                                        <button type="button" onClick={() => handleSort('kelas')} className="text-slate-400 hover:text-slate-600"><ArrowUpDown size={14} /></button>
                                    </div>
                                </th>
                                <th className="px-5 py-4 text-[12px] font-bold text-slate-600 uppercase tracking-wider text-center min-w-[120px] border-r border-slate-200/80">Jml Hafalan Depan (Juz)</th>
                                <th className="px-5 py-4 text-[12px] font-bold text-slate-600 uppercase tracking-wider text-center min-w-[150px] border-r border-slate-200/80">Surat & Ayat Depan</th>
                                <th className="px-5 py-4 text-[12px] font-bold text-slate-600 uppercase tracking-wider text-center min-w-[120px] border-r border-slate-200/80">Jml Hafalan Belakang (Juz)</th>
                                <th className="px-5 py-4 text-[12px] font-bold text-slate-600 uppercase tracking-wider text-center min-w-[150px] border-r border-slate-200/80">Surat & Ayat Belakang</th>
                                <th className="px-5 py-4 text-[12px] font-bold text-slate-600 uppercase tracking-wider text-center min-w-[120px] border-r border-slate-200/80">
                                    <div className="flex items-center justify-between gap-1">
                                        <span>Total Hafalan</span>
                                        <button type="button" onClick={() => handleSort('totalHafalan')} className="text-slate-400 hover:text-slate-600 shrink-0"><ArrowUpDown size={14} /></button>
                                    </div>
                                </th>
                                <th className="px-5 py-4 text-[12px] font-bold text-slate-600 uppercase tracking-wider text-center min-w-[150px] border-r border-slate-200/80">
                                    <div className="flex items-center justify-between gap-1">
                                        <span>% Target Hafalan</span>
                                        <button type="button" onClick={() => handleSort('pctHafalan')} className="text-slate-400 hover:text-slate-600 shrink-0"><ArrowUpDown size={14} /></button>
                                    </div>
                                </th>
                                <th className="px-5 py-4 text-[12px] font-bold text-slate-600 uppercase tracking-wider text-center min-w-[180px] border-r border-slate-200/80">
                                    <div className="flex items-center justify-between gap-1">
                                        <div className="flex items-center gap-2 relative">
                                            <span>Penambahan (Ziyadah)</span>
                                            <button type="button" onClick={() => setIsZiyadahMenuOpen(!isZiyadahMenuOpen)} className="bg-blue-100 text-blue-600 p-1 rounded hover:bg-blue-200 transition-colors" title="Opsi Kalkulasi Ziyadah"><Plus size={14}/></button>
                                            {isZiyadahMenuOpen && (
                                                <div className="absolute top-full left-0 mt-2 bg-white shadow-lg border border-slate-200 rounded-lg py-2 flex flex-col z-50 w-48 text-left">
                                                    <button type="button" onClick={() => { handleAutofillZiyadah(); setIsZiyadahMenuOpen(false); }} className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-600 w-full text-left">Hitung dari Total Hafalan</button>
                                                    <button type="button" onClick={() => handleSyncSetoranHarian('ziyadah')} className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-600 w-full text-left">Sinkronisasi Setoran Harian</button>
                                                </div>
                                            )}
                                        </div>
                                        <button type="button" onClick={() => handleSort('ziyadah')} className="text-slate-400 hover:text-slate-600 shrink-0"><ArrowUpDown size={14} /></button>
                                    </div>
                                </th>
                                <th className="px-5 py-4 text-[12px] font-bold text-slate-600 uppercase tracking-wider text-center min-w-[150px] border-r border-slate-200/80">
                                    <div className="flex items-center justify-between gap-1">
                                        <div className="flex items-center gap-2 relative">
                                            <span>Jml Murojaah (Juz)</span>
                                            <button type="button" onClick={() => setIsMurojaahMenuOpen(!isMurojaahMenuOpen)} className="bg-blue-100 text-blue-600 p-1 rounded hover:bg-blue-200 transition-colors" title="Opsi Kalkulasi Murojaah"><Plus size={14}/></button>
                                            {isMurojaahMenuOpen && (
                                                <div className="absolute top-full left-0 mt-2 bg-white shadow-lg border border-slate-200 rounded-lg py-2 flex flex-col z-50 w-48 text-left">
                                                    <button type="button" onClick={() => handleSyncSetoranHarian('murojaah')} className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-600 w-full text-left">Sinkronisasi Setoran Harian</button>
                                                </div>
                                            )}
                                        </div>
                                        <button type="button" onClick={() => handleSort('murojaah')} className="text-slate-400 hover:text-slate-600 shrink-0"><ArrowUpDown size={14} /></button>
                                    </div>
                                </th>
                                <th className="px-5 py-4 text-[12px] font-bold text-slate-600 uppercase tracking-wider text-center min-w-[150px] border-r border-slate-200/80">
                                    <div className="flex items-center justify-between gap-1">
                                        <span>% Target Murojaah</span>
                                        <button type="button" onClick={() => handleSort('pctMurojaah')} className="text-slate-400 hover:text-slate-600 shrink-0"><ArrowUpDown size={14} /></button>
                                    </div>
                                </th>
                                
                                {allCategories.map(c => (
                                    <th key={c} className="px-5 py-3.5 text-[12px] font-bold text-blue-600 uppercase tracking-wider text-center min-w-[150px] border-r border-slate-200/60">
                                        <div className="flex items-center justify-between gap-1">
                                            <span>{c}</span>
                                            <button type="button" onClick={() => handleSort('cat_' + c)} className="text-slate-400 hover:text-slate-600 shrink-0"><ArrowUpDown size={14} /></button>
                                        </div>
                                    </th>
                                ))}

                                {/* Metrik Setoran Harian (Berada setelah kuesioner dinamis) */}
                                <th className="px-5 py-4 text-[12px] font-bold text-slate-600 uppercase tracking-wider text-center min-w-[130px] border-r border-slate-200/80">
                                    <div className="flex items-center justify-between gap-1">
                                        <span>Jml Setoran</span>
                                        <button type="button" onClick={() => handleSort('totalHalaman')} className="text-slate-400 hover:text-slate-600 shrink-0"><ArrowUpDown size={14} /></button>
                                    </div>
                                </th>
                                <th className="px-5 py-4 text-[12px] font-bold text-slate-600 uppercase tracking-wider text-center min-w-[120px] border-r border-slate-200/80">
                                    <div className="flex items-center justify-between gap-1">
                                        <span>Frekuensi</span>
                                        <button type="button" onClick={() => handleSort('frekuensiSetoran')} className="text-slate-400 hover:text-slate-600 shrink-0"><ArrowUpDown size={14} /></button>
                                    </div>
                                </th>
                                <th className="px-5 py-4 text-[12px] font-bold text-slate-600 uppercase tracking-wider text-center min-w-[130px] border-r border-slate-200/80">
                                    <div className="flex items-center justify-between gap-1">
                                        <span>% Kelancaran</span>
                                        <button type="button" onClick={() => handleSort('persentaseKelancaran')} className="text-slate-400 hover:text-slate-600 shrink-0"><ArrowUpDown size={14} /></button>
                                    </div>
                                </th>
                                <th className="px-5 py-4 text-[12px] font-bold text-slate-600 uppercase tracking-wider text-center min-w-[120px] border-r border-slate-200/80">
                                    <span>Nilai Rata-rata</span>
                                </th>
                                <th className="px-5 py-4 text-[12px] font-bold text-slate-600 uppercase tracking-wider text-center min-w-[120px] border-r border-slate-200/80">
                                    <div className="flex items-center justify-between gap-1">
                                        <span>% Kehadiran</span>
                                        <button type="button" onClick={() => handleSort('persentaseKehadiran')} className="text-slate-400 hover:text-slate-600 shrink-0"><ArrowUpDown size={14} /></button>
                                    </div>
                                </th>

                                <th className="px-5 py-3.5 text-[12px] font-bold text-slate-500 uppercase tracking-wider text-center min-w-[100px]">Catatan</th>

                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {paginatedSantri.map(s => {
                                const evalData = evalMap.get(`${s.id}_${selectedMonth}`);
                                const localEval = localEvaluations[s.id] || {};
                                const isSelected = selectedSantriIds.includes(s.id);
                                const hasNotes = evalData?.catatan_musammi || evalData?.catatan_muroqib || evalData?.catatan_lajnah;

                                const hafalanDepanStr = localProgress[s.id]?.['Hafalan Depan'] ?? progressMap.get(`${s.id}_${selectedMonth}_Hafalan Depan`) ?? '';
                                const hafalanDepan = parseFloat(hafalanDepanStr) || 0;
                                const suratAyatDepan = localProgress[s.id]?.['Surat Ayat Depan'] ?? progressMap.get(`${s.id}_${selectedMonth}_Surat Ayat Depan`) ?? '';
                                
                                const hafalanBelakangStr = localProgress[s.id]?.['Hafalan Belakang'] ?? progressMap.get(`${s.id}_${selectedMonth}_Hafalan Belakang`) ?? '';
                                const hafalanBelakang = parseFloat(hafalanBelakangStr) || 0;
                                const suratAyatBelakang = localProgress[s.id]?.['Surat Ayat Belakang'] ?? progressMap.get(`${s.id}_${selectedMonth}_Surat Ayat Belakang`) ?? '';
                                
                                const totalHafalan = hafalanDepan + hafalanBelakang;

                                let prevMonthKey = '';
                                if (selectedMonth && sortedPeriods.length > 0) {
                                    const currentIndex = sortedPeriods.findIndex(p => p.id === selectedMonth);
                                    if (currentIndex !== -1 && currentIndex + 1 < sortedPeriods.length) {
                                        prevMonthKey = sortedPeriods[currentIndex + 1].id;
                                    }
                                }
                                const explicitPrevTotalHafalanStr = progressMap.get(`${s.id}_${prevMonthKey}_Total Hafalan`);
                                
                                const prevHafalanDepan = parseFloat(progressMap.get(`${s.id}_${prevMonthKey}_Hafalan Depan`) ?? '0') || 0;
                                const prevHafalanBelakang = parseFloat(progressMap.get(`${s.id}_${prevMonthKey}_Hafalan Belakang`) ?? '0') || 0;
                                
                                const prevTotalHafalan = explicitPrevTotalHafalanStr ? parseFloat(explicitPrevTotalHafalanStr) || 0 : (prevHafalanDepan + prevHafalanBelakang);
                                
                                const penambahanHafalan = totalHafalan - prevTotalHafalan;
                                const explicitCurrentTotalHafalanStr = progressMap.get(`${s.id}_${selectedMonth}_Total Hafalan`);
                                const explicitCurrentTotalHafalan = parseFloat(explicitCurrentTotalHafalanStr ?? '0') || 0;
                                
                                const totalHafalanEff = (hafalanDepan === 0 && hafalanBelakang === 0 && explicitCurrentTotalHafalan > 0) ? explicitCurrentTotalHafalan : totalHafalan;

                                
                                const murojaahVal = localProgress[s.id]?.['Murojaah'] ?? progressMap.get(`${s.id}_${selectedMonth}_Murojaah`) ?? '';
                                const dailyStats = getSantriDailyStats(s.id, selectedMonth, filterSkema);

                                return (
                                    <tr 
                                        key={s.id} 
                                        className="hover:bg-slate-50/70 transition-colors group cursor-pointer"
                                        onClick={() => setSelectedSantriForDetail(s)}
                                    >
                                        <td 
                                            className="px-5 py-3 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r-2 border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.02)] text-center w-12" 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedSantriIds(p => p.includes(s.id) ? p.filter(x => x !== s.id) : [...p, s.id]);
                                            }}
                                        >
                                            <input 
                                              type="checkbox"
                                              checked={isSelected}
                                              onChange={() => {}}
                                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer transition-all"
                                            />
                                        </td>
                                        <td className="px-5 py-3 sticky left-[48px] bg-white group-hover:bg-slate-50 z-10 border-r-2 border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.02)] min-w-[200px]">
                                          <div className="flex items-center gap-3">
                                            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                                                <span className="text-[11px] font-bold text-slate-600">
                                                    {s.nama.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                                </span>
                                            </div>
                                            <p className="text-[13px] font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate max-w-[150px]" title={s.nama}>
                                                {s.nama}
                                            </p>
                                          </div>
                                        </td>
                                        
                                        <td className="px-5 py-3 border-r border-slate-100/60">
                                            <div className="flex flex-col">
                                                {(() => {
                                                    const sH = getHalaqahForSantriInPeriod(s.id, selectedMonth);
                                                    return (
                                                        <span className="text-[12px] font-semibold text-slate-700">{sH?.nama || '-'}</span>
                                                    );
                                                })()}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 border-r border-slate-100/60">
                                          <div className="flex flex-col">
                                            <span className="text-[12px] font-semibold text-slate-700"><MarhalahLabel text={s.marhalah} id={s.marhalah_id} /></span>
                                            <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Kelas <KelasLabel text={s.kelas} id={s.kelas_id} /></span>
                                          </div>
                                        </td>

                                        
                                        <td className="px-5 py-3 border-r border-slate-100/60" onClick={e => e.stopPropagation()}>
                                            <input type="number" step="0.1" className="w-full text-[13px] font-medium border border-slate-200/80 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 h-9 px-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)]" value={hafalanDepanStr} onChange={e => handleDynamicValueChange(s.id, 'Hafalan Depan', e.target.value)} />
                                        </td>
                                        <td className="px-5 py-3 border-r border-slate-100/60" onClick={e => e.stopPropagation()}>
                                            <input type="text" className="w-full text-[13px] font-medium border border-slate-200/80 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 h-9 px-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)]" value={suratAyatDepan} onChange={e => handleDynamicValueChange(s.id, 'Surat Ayat Depan', e.target.value)} placeholder="Contoh: Al-Baqarah 1-10" />
                                        </td>
                                        <td className="px-5 py-3 border-r border-slate-100/60" onClick={e => e.stopPropagation()}>
                                            <input type="number" step="0.1" className="w-full text-[13px] font-medium border border-slate-200/80 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 h-9 px-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)]" value={hafalanBelakangStr} onChange={e => handleDynamicValueChange(s.id, 'Hafalan Belakang', e.target.value)} />
                                        </td>
                                        <td className="px-5 py-3 border-r border-slate-100/60" onClick={e => e.stopPropagation()}>
                                            <input type="text" className="w-full text-[13px] font-medium border border-slate-200/80 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 h-9 px-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)]" value={suratAyatBelakang} onChange={e => handleDynamicValueChange(s.id, 'Surat Ayat Belakang', e.target.value)} placeholder="Contoh: An-Naba 1-40" />
                                        </td>
                                        
                                        <td className="px-5 py-3 border-r border-slate-100/60 text-center">
                                            <span className="inline-flex items-center justify-center min-w-[28px] h-7 bg-slate-50 text-slate-700 border border-slate-200/60 rounded-md text-[13px] font-bold shadow-[0_1px_2px_rgba(0,0,0,0.01)] group-hover:bg-slate-100 transition-colors px-2">
                                                {totalHafalan}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 border-r border-slate-100/60 text-center">

                                            {(() => {
                                                const pct = getSantriMetrics(s, selectedMonth).pctHafalan;
                                                let colorClass = "bg-slate-100 text-slate-700";
                                                if (pct >= 100) colorClass = "bg-emerald-100 text-emerald-700";
                                                else if (pct >= 75) colorClass = "bg-amber-100 text-amber-700";
                                                else if (pct > 0) colorClass = "bg-red-100 text-red-700";
                                                return (
                                                    <span className={`inline-flex items-center justify-center h-7 px-2 rounded-md text-[12px] font-bold ${colorClass}`}>
                                                        {pct.toFixed(1)}%
                                                    </span>
                                                );
                                            })()}

                                        </td>
                                        <td className="px-5 py-3 border-r border-slate-100/60" onClick={e => e.stopPropagation()}>
                                            <input type="number" step="0.1" className="w-full text-[13px] font-medium border border-slate-200/80 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 h-9 px-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)]" value={localProgress[s.id]?.['Ziyadah'] ?? progressMap.get(`${s.id}_${selectedMonth}_Ziyadah`) ?? ''} onChange={e => handleDynamicValueChange(s.id, 'Ziyadah', e.target.value)} />
                                        </td>
                                        <td className="px-5 py-3 border-r border-slate-100/60" onClick={e => e.stopPropagation()}>
                                            <input type="number" step="0.1" className="w-full text-[13px] font-medium border border-slate-200/80 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 h-9 px-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)]" value={murojaahVal} onChange={e => handleDynamicValueChange(s.id, 'Murojaah', e.target.value)} />
                                        </td>
                                        <td className="px-5 py-3 border-r border-slate-100/60 text-center">

                                            {(() => {
                                                const pct = getSantriMetrics(s, selectedMonth).pctMurojaah;
                                                let colorClass = "bg-slate-100 text-slate-700";
                                                if (pct >= 100) colorClass = "bg-emerald-100 text-emerald-700";
                                                else if (pct >= 75) colorClass = "bg-amber-100 text-amber-700";
                                                else if (pct > 0) colorClass = "bg-red-100 text-red-700";
                                                return (
                                                    <span className={`inline-flex items-center justify-center h-7 px-2 rounded-md text-[12px] font-bold ${colorClass}`}>
                                                        {pct.toFixed(1)}%
                                                    </span>
                                                );
                                            })()}

                                        </td>

                                        {/* Dropdowns Kuesioner Dinamis */}
                                        {allCategories.map(c => {
                                            const dbProgressVal = progressMap.get(`${s.id}_${selectedMonth}_${c}`);
                                            const dbEvalVal = c === 'Hafalan' ? evalData?.kualitas_hafalan : c === 'Bacaan' ? evalData?.kualitas_bacaan : c === 'Sikap' ? evalData?.sikap_prilaku : undefined;
                                            const actualVal = localProgress[s.id]?.[c] ?? dbProgressVal ?? dbEvalVal ?? '';
                                            return (
                                                <td key={c} className="px-5 py-3 border-r border-slate-100/60 relative" onClick={e => e.stopPropagation()}>
                                                    <select 
                                                        className="appearance-none w-full text-[13px] font-medium border border-slate-200/80 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 h-9 pl-3 pr-8 shadow-[0_1px_2px_rgba(0,0,0,0.02)] cursor-pointer"
                                                        style={{ 
                                                            backgroundColor: actualVal && evalColors[actualVal] ? evalColors[actualVal] + '1A' : '#ffffff',
                                                            color: actualVal && evalColors[actualVal] ? evalColors[actualVal] : '#334155'
                                                        }}
                                                        value={actualVal}
                                                        onChange={e => handleDynamicValueChange(s.id, c, e.target.value)}
                                                    >
                                                        <option value="" style={{backgroundColor: '#fff', color: '#000'}}>- Pilih -</option>
                                                        {getOptions(c).map(o => <option key={o.label} value={o.label} style={{ backgroundColor: '#fff', color: evalColors[o.label] || '#334155' }}>{o.label}</option>)}
                                                    </select>
                                                    <ChevronRight className="absolute right-7 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none rotate-90" size={14} />
                                                </td>
                                            );
                                        })}

                                        {/* Metrik Setoran Harian Values (tampilan seragam dengan kolom lain, tanpa background khusus) */}
                                        <td className="px-5 py-3 border-r border-slate-100/60 text-center">
                                            {dailyStats.hasDailyData ? (
                                                <span className="text-[13px] font-medium text-slate-700">
                                                    {filterSkema.toLowerCase().includes('murojaah') 
                                                        ? (dailyStats.totalHalaman / 20).toFixed(2)
                                                        : dailyStats.totalHalaman} 
                                                    <span className="text-[11px] font-normal text-slate-400 ml-1">
                                                        {filterSkema.toLowerCase().includes('murojaah') ? 'Juz' : 'Hal'}
                                                    </span>
                                                </span>
                                            ) : (
                                                <span className="text-slate-300 font-medium">-</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 border-r border-slate-100/60 text-center">
                                            {dailyStats.hasDailyData ? (
                                                <span className="text-[13px] font-medium text-slate-700">
                                                    {dailyStats.frekuensiSetoran}x
                                                </span>
                                            ) : (
                                                <span className="text-slate-300 font-medium">-</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 border-r border-slate-100/60 text-center">
                                            {dailyStats.hasDailyData ? (
                                                <span className="text-[13px] font-medium text-slate-700">
                                                    {dailyStats.persentaseKelancaran.toFixed(1)}%
                                                </span>
                                            ) : (
                                                <span className="text-slate-300 font-medium">-</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 border-r border-slate-100/60 text-center">
                                            {dailyStats.hasDailyData && dailyStats.finalNilaiLabel !== '-' ? (
                                                <span className="text-[13px] font-medium text-slate-700">
                                                    {dailyStats.finalNilaiLabel}
                                                </span>
                                            ) : (
                                                <span className="text-slate-300 font-medium">-</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 border-r border-slate-100/60 text-center">
                                            {dailyStats.hasDailyData ? (
                                                <span className="text-[13px] font-medium text-slate-700">
                                                    {dailyStats.persentaseKehadiran.toFixed(1)}%
                                                </span>
                                            ) : (
                                                <span className="text-slate-300 font-medium">-</span>
                                            )}
                                        </td>
                                        
                                        <td className="px-5 py-3 text-center" onClick={e => e.stopPropagation()}>
                                            <button 
                                                onClick={() => openNotesModal(s.id, s.nama)}
                                                className={`h-8 w-8 inline-flex items-center justify-center rounded-lg transition-colors ${hasNotes ? 'bg-blue-50 text-blue-600' : 'text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600'}`}
                                                title="Edit Catatan"
                                            >
                                                <Edit size={16} strokeWidth={2.5}/>
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {paginatedSantri.length === 0 && <tr><td colSpan={21 + allCategories.length} className="text-center py-8 text-slate-400">Tidak ada data.</td></tr>}
                        </tbody>
                    </table>
                </div>

                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4 bg-white">
                    <div className="text-[13px] font-medium text-slate-500">
                        Menampilkan <span className="font-bold text-slate-900">{paginatedSantri.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span> - <span className="font-bold text-slate-900">{Math.min(currentPage * itemsPerPage, filteredSantri.length)}</span> dari <span className="font-bold text-slate-900">{filteredSantri.length}</span> santri
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-4 py-2 border border-slate-200/80 rounded-lg text-[13px] font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                        >
                            Sebelumnya
                        </button>
                        <button 
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages || totalPages === 0}
                            className="px-4 py-2 border border-slate-200/80 rounded-lg text-[13px] font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                        >
                            Selanjutnya
                        </button>
                    </div>
                </div>

                <div className="p-5 flex justify-end bg-slate-50/50 mt-auto">
                    <button 
                        onClick={handleSaveAll}
                        className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-[13px] font-bold shadow-[0_2px_12px_rgba(37,99,235,0.25)] transition-all hover:bg-blue-700 hover:-translate-y-0.5 flex items-center gap-2"
                    >
                        <Save size={16} strokeWidth={2.5}/> Simpan Semua Perubahan
                    </button>
                </div>
            </div>
                </>
            )}
            
            {activeTab === 'halaqah' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden min-h-[400px]">
                    <div className="overflow-x-auto hide-scrollbar">
                        <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-40">
                                <tr className="bg-slate-50/50 border-b border-slate-200/60">
                                    <th className="px-5 py-3.5 sticky left-0 bg-slate-50/95 backdrop-blur-sm z-50 min-w-[50px] border-r border-slate-200/60 text-[12px] font-bold text-slate-500 uppercase tracking-wider text-center">No</th>
                                    <th className="px-5 py-3.5 sticky left-[50px] bg-slate-50/95 backdrop-blur-sm z-50 min-w-[150px] border-r border-slate-200/60 text-[12px] font-bold text-slate-500 uppercase tracking-wider">Halaqah</th>
                                    <th className="px-5 py-3.5 sticky left-[200px] bg-slate-50/95 backdrop-blur-sm z-50 min-w-[150px] border-r border-slate-200/60 text-[12px] font-bold text-slate-500 uppercase tracking-wider">Musammi</th>
                                    {halaqahEvalQuestions.map(q => (
                                        <th key={q.id} className="px-5 py-3.5 text-[12px] font-bold text-slate-500 uppercase tracking-wider min-w-[200px] border-r border-slate-200/60">
                                            <div className="w-full truncate" title={q.question}>{q.question}</div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {filteredHalaqah.length === 0 ? (
                                    <tr>
                                        <td colSpan={3 + halaqahEvalQuestions.length} className="px-5 py-8 text-center text-[13px] text-slate-500 font-medium">
                                            Tidak ada halaqah yang ditemukan.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredHalaqah.map((h, idx) => {
                                        const evalData = halaqahEvaluations.find(e => e.halaqah_id === h.id && e.month_key === selectedMonth);
                                        
                                        return (
                                            <tr key={h.id} className="hover:bg-slate-50/40 transition-colors group">
                                                <td className="px-5 py-3 sticky left-0 bg-white group-hover:bg-slate-50/95 backdrop-blur-sm z-10 border-r border-slate-100/60 transition-colors text-center text-[13px] font-medium text-slate-500">
                                                    {idx + 1}
                                                </td>
                                                <td className="px-5 py-3 sticky left-[50px] bg-white group-hover:bg-slate-50/95 backdrop-blur-sm z-10 border-r border-slate-100/60 transition-colors">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="text-[13px] font-bold text-slate-800">{h.nama}</span>
                                                    </div>
                                                    <div className="text-[11px] text-slate-500 mt-0.5"><MarhalahLabel text={h.marhalah} id={h.marhalah_id} /></div>
                                                </td>
                                                <td className="px-5 py-3 sticky left-[200px] bg-white group-hover:bg-slate-50/95 backdrop-blur-sm z-10 border-r border-slate-100/60 transition-colors text-[13px] font-medium text-slate-700">
                                                    {h.musammi?.nama || '-'}
                                                </td>
                                                
                                                {halaqahEvalQuestions.map(q => {
                                                    const answer = evalData?.answers?.[q.id] || '-';
                                                    return (
                                                        <td key={q.id} className="px-5 py-3 text-[13px] font-medium text-slate-700 border-r border-slate-100/60 break-words whitespace-pre-wrap">
                                                            {answer}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            
            {activeTab === 'pivot' && (
                <StudentProgressComponent 
                    globalFilterMonth={selectedMonth}
                    globalFilterMarhalah={filterMarhalah}
                    globalFilterKelas={filterKelas}
                    globalSearchName={searchName}
                    globalViewMode={'Data' as any}
                    globalSelectedScheme={'All' as any}
                />
            )}

            {activeTab === 'statistik' && (
                <StatistikPerkembangan 
                    globalFilterMonth={selectedMonth}
                    globalFilterMarhalah={filterMarhalah}
                    globalFilterKelas={filterKelas}
                    globalFilterHalaqah={filterHalaqah}
                    globalSearchName={searchName}
                    setPage={() => {}}
                />
            )}

            {/* Modal Settings */}
            
            <Modal isOpen={isSettingsOpen} onClose={() => { setIsSettingsOpen(false); setIsAddingCategory(false); setIsAddingHalaqahQuestion(false); }} title="Pengaturan Evaluasi" maxWidth="4xl">
                <div className="flex flex-col h-[600px] -mx-6 -my-6 bg-slate-50">
                    {/* Tabs */}
                    <div className="flex px-6 pt-4 border-b border-slate-200/80 bg-white gap-6">
                        <button 
                            className={`pb-3 text-[13px] font-bold border-b-2 transition-colors ${activeEvalTab === 'santri' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                            onClick={() => { if(hasUnsavedChanges) { setHasUnsavedChanges(false); } setActiveEvalTab('santri'); }}
                        >
                            Evaluasi Santri
                        </button>
                        <button 
                            className={`pb-3 text-[13px] font-bold border-b-2 transition-colors ${activeEvalTab === 'halaqah' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                            onClick={() => { if(hasUnsavedChanges) { setHasUnsavedChanges(false); } setActiveEvalTab('halaqah'); }}
                        >
                            Evaluasi Halaqah
                        </button>
                    </div>

                    <div className="flex flex-1 overflow-hidden">
                        {/* Sidebar */}
                        <div className="w-64 flex flex-col bg-slate-50/50 border-r border-slate-200/60 overflow-hidden shrink-0">
                            <div className="p-4 flex-1 overflow-y-auto hide-scrollbar space-y-1">
                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">
                                    {activeEvalTab === 'santri' ? 'Kategori Evaluasi' : 'Daftar Pertanyaan'}
                                </h4>
                                
                                {activeEvalTab === 'santri' && (
                                    <>
                                        {allCategories.map(c => (
                                            <button 
                                                key={c}
                                                onClick={() => { 
    if (hasUnsavedChanges) {
        setHasUnsavedChanges(false);
    }
    setNewCategory(c); 
    setIsAddingCategory(false); 
    setIsEditingCategory(false); 
}}
                                                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${newCategory === c && !isAddingCategory ? 'bg-white border border-slate-200/80 text-blue-700 shadow-sm' : 'border border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-800'}`}
                                            >
                                                <div className="flex items-center truncate">
                                                    <LayoutList size={15} className={`mr-2.5 shrink-0 ${newCategory === c && !isAddingCategory ? 'text-blue-500' : 'text-slate-400'}`}/>
                                                    <span className="truncate">{c}</span>
                                                </div>
                                                <ChevronRight size={14} className={newCategory === c && !isAddingCategory ? 'text-blue-400' : 'text-transparent'}/>
                                            </button>
                                        ))}
                                    </>
                                )}

                                {activeEvalTab === 'halaqah' && (
                                    <>
                                        {halaqahEvalQuestions.map((q: any) => (
                                            <button 
                                                key={q.id}
                                                onClick={() => { 
                                                    setSelectedHalaqahQuestionId(q.id); 
                                                    setEditingHalaqahQuestion(q);
                                                    setIsAddingHalaqahQuestion(false);
                                                }}
                                                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${(selectedHalaqahQuestionId === q.id || editingHalaqahQuestion?.id === q.id) && !isAddingHalaqahQuestion ? 'bg-white border border-slate-200/80 text-blue-700 shadow-sm' : 'border border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-800'}`}
                                            >
                                                <div className="flex items-center truncate">
                                                    <LayoutList size={15} className={`mr-2.5 shrink-0 ${(selectedHalaqahQuestionId === q.id || editingHalaqahQuestion?.id === q.id) && !isAddingHalaqahQuestion ? 'text-blue-500' : 'text-slate-400'}`}/>
                                                    <span className="truncate">{q.question}</span>
                                                </div>
                                                <ChevronRight size={14} className={(selectedHalaqahQuestionId === q.id || editingHalaqahQuestion?.id === q.id) && !isAddingHalaqahQuestion ? 'text-blue-400' : 'text-transparent'}/>
                                            </button>
                                        ))}
                                    </>
                                )}
                            </div>
                            <div className="p-4 border-t border-slate-200/60 bg-slate-50">
                                {activeEvalTab === 'santri' ? (
                                    <button 
                                        onClick={() => { 
    if (hasUnsavedChanges) {
        setHasUnsavedChanges(false);
    }
    setIsAddingCategory(true); 
    setNewCategory(''); 
}}
                                        className="w-full flex items-center justify-center py-2.5 bg-white border border-slate-200/80 rounded-xl text-[13px] font-bold text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-all shadow-sm"
                                    >
                                        <Plus size={15} className="mr-1.5 text-slate-400" strokeWidth={2.5}/> Tambah Kategori
                                    </button>
                                ) : (
                                    <button 
                                        onClick={() => { 
                                            setIsAddingHalaqahQuestion(true); 
                                            setSelectedHalaqahQuestionId(null);
                                            setEditingHalaqahQuestion({ question: '', type: 'text', options: [] } as any);
                                        }}
                                        className="w-full flex items-center justify-center py-2.5 bg-white border border-slate-200/80 rounded-xl text-[13px] font-bold text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-all shadow-sm"
                                    >
                                        <Plus size={15} className="mr-1.5 text-slate-400" strokeWidth={2.5}/> Tambah Pertanyaan
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Main Content Area */}
                        <div className="flex-1 bg-white overflow-y-auto hide-scrollbar relative">
                            {/* SANTRI TAB CONTENT */}
                            {activeEvalTab === 'santri' && (
                                <>
                                    {isAddingCategory ? (
                                        <div className="p-8 max-w-xl">
                                            <h2 className="text-[20px] font-bold text-slate-800 tracking-tight mb-2">Tambah Kategori Baru</h2>
                                            <p className="text-[13px] text-slate-500 mb-8">Buat kategori evaluasi baru beserta opsi penilaian pertamanya.</p>
                                            
                                            <div className="space-y-5">
                                                <div>
                                                    <label className="block text-[12px] font-bold text-slate-700 mb-1.5">Nama Kategori</label>
                                                    <input 
                                                        type="text" 
                                                        placeholder="Contoh: Setoran dengan musammi" 
                                                        className="w-full text-[13px] font-medium border border-slate-200/80 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50 focus:bg-white transition-colors"
                                                        value={newCategoryName}
                                                        onChange={e => setNewCategoryName(e.target.value)}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[12px] font-bold text-slate-700 mb-1.5">Opsi Pertama</label>
                                                    <input 
                                                        type="text" 
                                                        placeholder="Contoh: Sangat Baik" 
                                                        className="w-full text-[13px] font-medium border border-slate-200/80 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50 focus:bg-white transition-colors"
                                                        value={newOption}
                                                        onChange={e => setNewOption(e.target.value)}
                                                    />
                                                </div>
                                                <div className="pt-4">
                                                    <button type="button" onClick={handleAddCategory} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-[13px] font-bold shadow-sm hover:bg-blue-700 transition-colors">Simpan Kategori</button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : newCategory ? (
                                        <div className="p-8 max-w-2xl">
                                            <div className="flex justify-between items-start mb-8 border-b border-slate-100 pb-6">
                                                {isEditingCategory ? (
                                                    <div className="flex items-center gap-3 w-full max-w-md">
                                                        <input 
                                                            className="flex-1 text-[16px] font-bold text-slate-800 border-b-2 border-blue-500 px-1 py-1.5 outline-none bg-blue-50/50"
                                                            value={editCategoryName}
                                                            onChange={e => setEditCategoryName(e.target.value)}
                                                            autoFocus
                                                        />
                                                        <button type="button" onClick={handleUpdateCategory} className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg"><CheckSquare size={20}/></button>
                                                        <button type="button" onClick={() => setIsEditingCategory(false)} className="text-slate-400 hover:bg-slate-50 p-2 rounded-lg"><X size={20}/></button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div>
                                                            <h2 className="text-[20px] font-bold text-slate-800 tracking-tight mb-1">{newCategory}</h2>
                                                            <p className="text-[13px] text-slate-500">Kelola opsi penilaian yang akan ditampilkan saat pengguna memilih kategori ini.</p>
                                                        </div>
                                                        <div className="flex gap-1 shrink-0 items-center">
                                                            {hasUnsavedChanges && (
                                                                <button type="button" onClick={handleSaveChanges} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-[13px] font-bold transition-colors shadow-sm mr-2">
                                                                    <Save size={16} /> Simpan
                                                                </button>
                                                            )}
                                                            <button type="button" onClick={() => { setEditCategoryName(newCategory); setIsEditingCategory(true); }} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 size={16} strokeWidth={2.5}/></button>
                                                            <button type="button" onClick={handleDeleteCategory} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 size={16} strokeWidth={2.5}/></button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>

                                            <div className="mb-6">
                                                <h3 className="text-[13px] font-bold text-slate-800 mb-4">Daftar Opsi ({localCategorySettings.length})</h3>
                                                <div className="space-y-3">
                                                    {localCategorySettings.map((s, idx) => (
                                                        <div 
                                                            key={s.id} 
                                                            draggable
                                                            onDragStart={(e) => handleDragStart(e, idx)}
                                                            onDragOver={(e) => handleDragOver(e, idx)}
                                                            onDragEnd={handleDragEnd}
                                                            className={`flex items-center bg-white border border-slate-200/80 p-3.5 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:border-slate-300 transition-colors group ${draggedIdx === idx ? 'opacity-50' : ''}`}
                                                        >
                                                            <div className="text-slate-300 mr-3 cursor-grab hover:text-blue-500 transition-colors"><GripVertical size={16}/></div>
                                                            <ColorPicker 
                                                                initialColor={localEvalColors[s.label] || '#cbd5e1'} 
                                                                onChangeComplete={(c) => handleUpdateLocalColor(s.label, c)} 
                                                            />
                                                            <span className="flex-1 text-[14px] font-semibold text-slate-700">{s.label}</span>
                                                            <div className="flex items-center gap-2 mr-3">
                                                                <span className="text-[12px] text-slate-500 font-medium">Nilai (%):</span>
                                                                <input
                                                                    type="number"
                                                                    value={s.score || 0}
                                                                    onChange={(e) => {
                                                                        const val = parseFloat(e.target.value) || 0;
                                                                        const newSettings = [...localCategorySettings];
                                                                        newSettings[idx] = { ...newSettings[idx], score: val };
                                                                        setLocalCategorySettings(newSettings);
                                                                        setHasUnsavedChanges(true);
                                                                    }}
                                                                    className="w-16 px-2 py-1 text-[13px] border border-slate-200 rounded-md focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                                                />
                                                            </div>
                                                            <button type="button" onClick={() => handleDeleteLocalOption(s.id)} className="text-slate-300 hover:text-rose-500 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity rounded-md hover:bg-rose-50">
                                                                <Trash2 size={15}/>
                                                            </button>
                                                        </div>
                                                    ))}
                                                    {localCategorySettings.length === 0 && (
                                                        <p className="text-[13px] text-slate-400 italic text-center py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">Belum ada opsi.</p>
                                                    )}
                                                </div></div><div className="flex bg-slate-50 border border-slate-200/60 p-2 rounded-xl">
                                                <input 
                                                    type="text" 
                                                    placeholder="Ketik opsi baru..." 
                                                    className="flex-1 bg-transparent px-3 py-2 text-[13px] font-medium text-slate-700 outline-none placeholder:text-slate-400"
                                                    value={newOption}
                                                    onChange={e => setNewOption(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleAddLocalOption()}
                                                />
                                                <button type="button" onClick={handleAddLocalOption} className="bg-slate-500 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-[13px] font-bold transition-colors">
                                                    + Tambah Opsi
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center">
                                            <LayoutList size={48} strokeWidth={1} className="mb-4 text-slate-300"/>
                                            <p className="text-[14px] font-medium">Pilih kategori di samping untuk melihat dan mengelola opsi.</p>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* HALAQAH TAB CONTENT */}
                            {activeEvalTab === 'halaqah' && (
                                <>
                                    {isAddingHalaqahQuestion || (editingHalaqahQuestion && editingHalaqahQuestion.id === selectedHalaqahQuestionId) ? (
                                        <div className="p-8 max-w-2xl">
                                            <div className="flex justify-between items-start mb-8 border-b border-slate-100 pb-6">
                                                <div>
                                                    <h2 className="text-[20px] font-bold text-slate-800 tracking-tight mb-1">{isAddingHalaqahQuestion ? 'Tambah Pertanyaan Baru' : 'Edit Pertanyaan'}</h2>
                                                    <p className="text-[13px] text-slate-500">Konfigurasi pertanyaan yang akan dijawab saat evaluasi halaqah.</p>
                                                </div>
                                                {!isAddingHalaqahQuestion && editingHalaqahQuestion?.id && (
                                                    <button type="button" onClick={() => { deleteHalaqahEvalQuestion(editingHalaqahQuestion.id); setIsAddingHalaqahQuestion(true); setEditingHalaqahQuestion(null); setSelectedHalaqahQuestionId(null); }} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 size={16} strokeWidth={2.5}/></button>
                                                )}
                                            </div>

                                            <div className="space-y-6">
                                                <div>
                                                    <label className="block text-[12px] font-bold text-slate-700 mb-1.5">Pertanyaan</label>
                                                    <input 
                                                        type="text" 
                                                        value={editingHalaqahQuestion?.question || ''} 
                                                        onChange={e => setEditingHalaqahQuestion(prev => ({ ...prev, question: e.target.value, type: prev?.type || 'text' }) as any)}
                                                        className="w-full text-[14px] font-semibold text-slate-800 bg-slate-50 focus:bg-white border border-slate-200/80 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                                                        placeholder="Cth: Kelengkapan Santri"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[12px] font-bold text-slate-700 mb-1.5">Penjelasan (Opsional)</label>
                                                    <textarea 
                                                        value={editingHalaqahQuestion?.description || ''} 
                                                        onChange={e => setEditingHalaqahQuestion(prev => ({ ...prev, description: e.target.value }) as any)}
                                                        className="w-full text-[13px] font-medium text-slate-600 bg-slate-50 focus:bg-white border border-slate-200/80 rounded-xl p-4 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors resize-y"
                                                        rows={2}
                                                        placeholder="Tambahkan instruksi jika diperlukan..."
                                                    />
                                                </div>
                                                <div className="w-1/2">
                                                    <label className="block text-[12px] font-bold text-slate-700 mb-1.5">Jenis Jawaban</label>
                                                    <div className="relative">
                                                        <select 
                                                            value={editingHalaqahQuestion?.type || 'text'} 
                                                            onChange={e => setEditingHalaqahQuestion(prev => ({ ...prev, type: e.target.value as 'text' | 'dropdown', options: e.target.value === 'dropdown' ? (prev?.options || [{label: 'Opsi 1', color: '#cbd5e1'}]) : undefined }) as any)}
                                                            className="appearance-none w-full text-[13px] font-semibold text-slate-700 bg-slate-50 focus:bg-white border border-slate-200/80 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors cursor-pointer"
                                                        >
                                                            <option value="text">Teks Bebas</option>
                                                            <option value="dropdown">Pilihan (Dropdown)</option>
                                                        </select>
                                                        <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none rotate-90" size={16} />
                                                    </div>
                                                </div>

                                                {editingHalaqahQuestion?.type === 'dropdown' && (
                                                    <div className="pt-4 border-t border-slate-100">
                                                        <h3 className="text-[13px] font-bold text-slate-800 mb-4">Pilihan Jawaban</h3>
                                                        <div className="space-y-3">
                                                            {(editingHalaqahQuestion.options || []).map((opt: any, idx: number) => (
                                                                                                                                <div key={idx} className="flex items-center bg-white border border-slate-200/80 p-3.5 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:border-slate-300 transition-colors group">
                                                                    <div className="flex flex-col items-center mr-3 gap-0.5">
                                                                        <button type="button" onClick={() => {
                                                                            const newOpts = [...(editingHalaqahQuestion.options || [])];
                                                                            if (idx > 0) {
                                                                                [newOpts[idx-1], newOpts[idx]] = [newOpts[idx], newOpts[idx-1]];
                                                                                setEditingHalaqahQuestion(prev => ({ ...prev, options: newOpts }) as any);
                                                                            }
                                                                        }} disabled={idx === 0} className="text-slate-300 hover:text-blue-500 disabled:opacity-30 disabled:hover:text-slate-300 p-0.5"><ChevronUp size={16} strokeWidth={3}/></button>
                                                                        <button type="button" onClick={() => {
                                                                            const newOpts = [...(editingHalaqahQuestion.options || [])];
                                                                            if (idx < newOpts.length - 1) {
                                                                                [newOpts[idx+1], newOpts[idx]] = [newOpts[idx], newOpts[idx+1]];
                                                                                setEditingHalaqahQuestion(prev => ({ ...prev, options: newOpts }) as any);
                                                                            }
                                                                        }} disabled={idx === (editingHalaqahQuestion.options?.length || 0) - 1} className="text-slate-300 hover:text-blue-500 disabled:opacity-30 disabled:hover:text-slate-300 p-0.5"><ChevronDown size={16} strokeWidth={3}/></button>
                                                                    </div>
                                                                    <ColorPicker 
                                                                        initialColor={opt.color || '#cbd5e1'}
                                                                        onChangeComplete={c => {
                                                                            const newOpts = [...(editingHalaqahQuestion.options || [])];
                                                                            newOpts[idx].color = c;
                                                                            setEditingHalaqahQuestion(prev => ({ ...prev, options: newOpts }) as any);
                                                                        }}
                                                                    />
                                                                    <input 
                                                                        type="text" 
                                                                        value={opt.label} 
                                                                        onChange={e => {
                                                                            const newOpts = [...(editingHalaqahQuestion.options || [])];
                                                                            newOpts[idx].label = e.target.value;
                                                                            setEditingHalaqahQuestion(prev => ({ ...prev, options: newOpts }) as any);
                                                                        }}
                                                                        className="flex-1 text-[14px] font-semibold text-slate-700 outline-none bg-transparent"
                                                                        placeholder="Label Pilihan"
                                                                    />
                                                                    <button 
                                                                        type="button"
                                                                        onClick={() => {
                                                                            const newOpts = [...(editingHalaqahQuestion.options || [])];
                                                                            newOpts.splice(idx, 1);
                                                                            setEditingHalaqahQuestion(prev => ({ ...prev, options: newOpts }) as any);
                                                                        }}
                                                                        className="text-slate-300 hover:text-rose-500 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity rounded-md hover:bg-rose-50"
                                                                    >
                                                                        <Trash2 size={15}/>
                                                                    </button>
                                                                </div>
                                                            ))}
                                                            
                                                            <div className="flex bg-slate-50 border border-slate-200/60 p-2 rounded-xl mt-4 w-max">
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => setEditingHalaqahQuestion(prev => ({ ...prev, options: [...(prev?.options || []), { label: 'Opsi Baru', color: '#94a3b8' }] }) as any)}
                                                                    className="bg-slate-500 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-[13px] font-bold transition-colors flex items-center"
                                                                >
                                                                    <Plus size={14} className="mr-1.5"/> Tambah Pilihan
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="pt-6">
                                                    <button type="button" onClick={handleSaveHalaqahQuestion} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-[13px] font-bold shadow-sm hover:bg-blue-700 transition-colors">
                                                        Simpan Pertanyaan
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center">
                                            <LayoutList size={48} strokeWidth={1} className="mb-4 text-slate-300"/>
                                            <p className="text-[14px] font-medium">Pilih pertanyaan di samping untuk melihat dan mengedit detail.</p>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </Modal>


            {/* Modal Notes */}
            <Modal isOpen={isNotesModalOpen} onClose={() => setIsNotesModalOpen(false)} title={`Catatan: ${currentNoteSantri?.name}`} maxWidth="md">
                <div className="space-y-5">
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Catatan Musammi</label>
                        <textarea className="w-full text-[13px] font-medium border border-slate-200/80 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50 focus:bg-white transition-colors h-24 resize-none shadow-[0_1px_2px_rgba(0,0,0,0.02)]" value={tempNotes.musammi} onChange={e => setTempNotes(p => ({...p, musammi: e.target.value}))} placeholder="Catatan dari pengampu halaqah..."></textarea>
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Catatan Muroqib</label>
                        <textarea className="w-full text-[13px] font-medium border border-slate-200/80 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50 focus:bg-white transition-colors h-24 resize-none shadow-[0_1px_2px_rgba(0,0,0,0.02)]" value={tempNotes.muroqib} onChange={e => setTempNotes(p => ({...p, muroqib: e.target.value}))} placeholder="Catatan dari pengawas..."></textarea>
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Catatan Lajnah</label>
                        <textarea className="w-full text-[13px] font-medium border border-slate-200/80 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50 focus:bg-white transition-colors h-24 resize-none shadow-[0_1px_2px_rgba(0,0,0,0.02)]" value={tempNotes.lajnah} onChange={e => setTempNotes(p => ({...p, lajnah: e.target.value}))} placeholder="Catatan resmi lajnah..."></textarea>
                    </div>
                    <div className="flex justify-end pt-4 border-t border-slate-100/60 mt-2 gap-3">
                        <button type="button" onClick={() => setIsNotesModalOpen(false)} className="px-5 py-2.5 rounded-lg text-[13px] font-bold text-slate-600 hover:bg-slate-100 transition-colors">Batal</button>
                        <button type="button" onClick={saveNotes} className="bg-slate-800 text-white px-6 py-2.5 rounded-lg text-[13px] font-bold shadow-sm transition-all hover:bg-slate-700 hover:-translate-y-0.5">Simpan Catatan</button>
                    </div>
                </div>
            </Modal>

            {/* Preview Modal Laporan */}
            <Modal isOpen={isPreviewModalOpen} onClose={() => setIsPreviewModalOpen(false)} title={`Preview Pesan (${generatedMessages.length})`} maxWidth="2xl">
                {/* Header Actions */}
                <div className="mb-4 flex flex-col sm:flex-row justify-end gap-3 px-4 pt-4">
                    <button 
                        onClick={async () => {
                            if (isEditingTemplate) {
                                await saveAppSetting(templateSettingKey, tempTemplate);
                                setIsEditingTemplate(false);
                                NotificationStore.addNotification('Template berhasil disimpan', 'success');
                                handleGeneratePreview(messageTarget);
                            } else {
                                setIsEditingTemplate(true);
                            }
                        }} 
                        className={`flex items-center justify-center text-sm font-bold px-4 py-2.5 rounded-xl transition-colors border ${isEditingTemplate ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                    >
                        {isEditingTemplate ? <><CheckSquare size={16} className="mr-2" /> Simpan Template & Refresh</> : <><Settings size={16} className="mr-2" /> Pengaturan Template</>}
                    </button>
                    {messageTarget === 'telegram' && (
                        <button 
                            onClick={handleSendMassTelegram}
                            className="bg-[#229ED9] text-white font-bold py-2.5 px-6 rounded-xl hover:bg-[#1C88BA] transition-colors shadow-sm focus:ring-4 focus:ring-[#229ED9]/20 outline-none flex items-center justify-center shrink-0 disabled:opacity-50"
                        >
                            <Send size={18} className="mr-2" strokeWidth={2.5}/> Kirim ke Semua
                        </button>
                    )}
                </div>
                
                <div className="px-4">
                    {isEditingTemplate && (
                        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 shadow-sm">
                            <h4 className="font-bold text-slate-800 text-sm mb-3">Edit Template Pesan</h4>
                            <div className="space-y-3">
                                <textarea
                                    value={tempTemplate}
                                    onChange={e => setTempTemplate(e.target.value)}
                                    rows={12}
                                    className="w-full text-[13px] font-mono border border-slate-300 rounded-lg p-3 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-y"
                                />
                                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                                    <p className="text-xs font-bold text-slate-600 mb-2">Variabel yang tersedia:</p>
                                    <div className="flex flex-wrap gap-2">
                                        {['{{nama}}', '{{kelas}}', '{{marhalah}}', '{{periode}}', '{{statistik_kehadiran}}', '{{capaian_tahfidz}}', '{{penilaian_evaluasi}}', '{{catatan_pengasuh}}'].map(v => (
                                            <span key={v} className="bg-white border border-slate-200 text-slate-700 text-[11px] px-2 py-1 rounded font-mono shadow-sm cursor-pointer hover:border-blue-400 hover:text-blue-600" onClick={() => {
                                                setTempTemplate(prev => prev + ' ' + v);
                                            }} title="Klik untuk menambahkan">
                                                {v}
                                            </span>
                                        ))}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-3 font-medium">Gunakan *text* untuk tebal (bold), _text_ untuk miring (italic).</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>


                
                <div className="space-y-4 max-h-[50vh] overflow-y-auto p-1 hide-scrollbar">
                    {generatedMessages.map((msg, idx) => (
                        <div key={idx} className="border border-slate-200/60 rounded-xl p-4 bg-slate-50/50 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                            <div className="flex justify-between items-start mb-4 gap-4">
                                <div>
                                    <h4 className="font-bold text-slate-800 text-[14px]">{msg.name}</h4>
                                    <p className="text-[12px] font-medium text-slate-500 mt-0.5">
                                        {messageTarget === 'wa' ? (msg.phone || 'No HP Kosong') : (msg.telegramChatId || 'Chat ID Kosong')}
                                    </p>
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    <button 
                                        onClick={() => copyText(msg.text)}
                                        className="h-8 w-8 flex items-center justify-center text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg border border-slate-200/80 bg-white transition-colors shadow-sm"
                                        title="Copy Teks"
                                    >
                                        <Copy size={14} strokeWidth={2.5}/>
                                    </button>
                                    
                                    {messageTarget === 'wa' ? (
                                        <button 
                                            onClick={() => sendWA(msg.phone, msg.text)}
                                            className="bg-[#25D366] text-white px-3 py-1.5 h-8 rounded-lg text-[12px] font-bold flex items-center hover:bg-[#128C7E] shadow-[0_2px_8px_rgba(37,211,102,0.25)] transition-all hover:-translate-y-0.5"
                                        >
                                            <Send size={14} className="mr-1.5" strokeWidth={2.5}/> Kirim WA
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={() => handleSendTelegram(msg.telegramChatId || '', msg.text)}
                                            className="bg-sky-500 text-white px-3 py-1.5 h-8 rounded-lg text-[12px] font-bold flex items-center hover:bg-sky-600 shadow-[0_2px_8px_rgba(14,165,233,0.25)] transition-all hover:-translate-y-0.5"
                                        >
                                            <Send size={14} className="mr-1.5" strokeWidth={2.5}/> Kirim Telegram
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-slate-200/60 text-[12px] leading-relaxed font-mono text-slate-700 whitespace-pre-wrap max-h-48 overflow-y-auto hide-scrollbar shadow-inner">
                                {msg.text}
                            </div>
                            {messageTarget === 'wa' && !msg.phone && (
                                <div className="mt-3 text-[12px] text-rose-600 flex items-center bg-rose-50 px-3 py-2 rounded-lg border border-rose-100 font-medium">
                                    <AlertCircle size={14} className="mr-2 shrink-0"/> Tidak dapat mengirim WA otomatis (No HP kosong). Silakan copy manual.
                                </div>
                            )}
                            {messageTarget === 'telegram' && !msg.telegramChatId && (
                                <div className="mt-3 text-[12px] text-amber-600 flex items-center bg-amber-50 px-3 py-2 rounded-lg border border-amber-100 font-medium">
                                    <AlertCircle size={14} className="mr-2 shrink-0"/> Chat ID kosong. Harus disetting di Data Wali Santri.
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                <div className="flex justify-end pt-4 border-t border-slate-100/60 mt-4">
                    <button type="button" onClick={() => setIsPreviewModalOpen(false)} className="bg-slate-800 text-white px-6 py-2.5 rounded-lg text-[13px] font-bold shadow-sm transition-all hover:bg-slate-700 hover:-translate-y-0.5">Tutup Preview</button>
                </div>
            </Modal>

            
            
            {isManageModalOpen && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center p-5 border-b border-slate-100 shrink-0">
                            <h3 className="font-bold text-lg text-slate-800">Kelola Periode Evaluasi</h3>
                            <button type="button" onClick={() => { setIsManageModalOpen(false); setEditingPeriod(null); }} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-5 overflow-y-auto flex-1 bg-slate-50/50">
                            {editingPeriod && (
                                <form onSubmit={handleSavePeriod} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6">
                                    <h4 className="font-bold text-sm text-slate-700 mb-4">{editingPeriod.isNew ? 'Tambah Periode Baru' : 'Edit Periode'}</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                        <div className="md:col-span-2">
                                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Nama Periode</label>
                                            <input 
                                                type="text" 
                                                value={editingPeriod.name || ''} 
                                                onChange={e => setEditingPeriod({ ...editingPeriod, name: e.target.value })}
                                                className="w-full text-[13px] font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Tanggal Mulai</label>
                                            <input 
                                                type="date" 
                                                value={editingPeriod.startDate} 
                                                onChange={e => setEditingPeriod({ ...editingPeriod, startDate: e.target.value })}
                                                className="w-full text-[13px] font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Tanggal Selesai</label>
                                            <input 
                                                type="date" 
                                                value={editingPeriod.endDate} 
                                                onChange={e => setEditingPeriod({ ...editingPeriod, endDate: e.target.value })}
                                                className="w-full text-[13px] font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <button type="button" onClick={() => setEditingPeriod(null)} className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-50">Batal</button>
                                        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700">Simpan</button>
                                    </div>
                                </form>
                            )}

                            <div className="space-y-3">
                                <div className="flex justify-between items-center mb-4">
                                    <h4 className="font-bold text-sm text-slate-700">Daftar Periode</h4>
                                    <button 
                                        onClick={() => setEditingPeriod({ id: Date.now().toString(), name: '', startDate: '', endDate: '', isNew: true })}
                                        className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center"
                                    >
                                        <Plus size={14} className="mr-1" /> Tambah Periode
                                    </button>
                                </div>
                                {[...masterPeriods].sort((a, b) => {
                                    const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
                                    const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
                                    if (dateA !== dateB) return dateB - dateA;
                                    return b.id.localeCompare(a.id);
                                }).map(p => (
                                    <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-4 flex justify-between items-center shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                                        <div>
                                            <h5 className="font-bold text-[13px] text-slate-800">{p.name || p.id}</h5>
                                            <p className="text-[11px] text-slate-500 font-medium mt-1">
                                                {p.startDate ? format(new Date(p.startDate), 'dd MMM yyyy') : '-'} s/d {p.endDate ? format(new Date(p.endDate), 'dd MMM yyyy') : '-'}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={() => setEditingPeriod(p)}
                                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    deleteEvaluationPeriod(p.id);
                                                }}
                                                className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {masterPeriods.length === 0 && (
                                    <p className="text-center text-slate-400 text-sm italic py-4">Belum ada periode yang ditambahkan.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            , document.body)}

            {/* Replaced by KelolaTargetModal */}
<KelolaTargetModal isOpen={isTargetModalOpen} onClose={() => setIsTargetModalOpen(false)} />

            <SetoranSettingsModal                 isOpen={isSetoranSettingsOpen}                 onClose={() => setIsSetoranSettingsOpen(false)}             />            
        </div>
    );
};

export default PerkembanganMasterDataPage;
