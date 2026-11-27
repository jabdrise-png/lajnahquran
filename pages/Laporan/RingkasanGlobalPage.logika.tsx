// Dipecah otomatis dari RingkasanGlobalPage.tsx (Fase 8 bagian 2): logika (state, efek, handler) komponen RingkasanGlobalPage.
// Ubah perilaku di sini; tampilan ada di RingkasanGlobalPage.tsx.
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { MarhalahLabel, KelasLabel } from '../../components/Labels';
import Card from '../../components/Card';
import Modal from '../../components/Modal';
import { useSupabaseData, useRiwayat } from '../../hooks/useSupabaseData';
import { exportToExcel } from '../../lib/utils';
import { supabase } from '../../lib/supabaseClient';
import { ALL_PERAN, ALL_ATTENDANCE_STATUS } from '../../constants';
import { Marhalah, Peran, AttendanceStatus, Waktu, AttendanceRecord } from '../../types';
import { Download, Edit, Trash, MoreVertical, Search, Filter, Plus, Clock, Calendar, CheckCircle, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown, Square, CheckSquare, MessageCircle, Send, Copy, AlertCircle } from 'lucide-react';
import { sendCustomTelegramMessage } from '../../lib/telegram';
import { NotificationStore } from '../../lib/NotificationStore';
import { format } from 'date-fns';
import { PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, BarChart, Bar, Legend } from 'recharts';
import html2canvas from 'html2canvas';
import { LoadingState } from '../../components/ui/SaaSPrimitives';
import { motion } from 'motion/react';
import { getStatusColor } from '../../components/Chart';
import { useMintaAlasan } from '../../components/ui/AlasanDialog';
import { hariIni } from '../../lib/sesiHalaqah';


export interface RingkasanGlobalPageProps {
    showAdvancedFilters?: boolean;
    setShowAdvancedFilters?: React.Dispatch<React.SetStateAction<boolean>>;
    exportTrigger?: number;
}

export function useRingkasanGlobalPageLogika({
    showAdvancedFilters: externalShowFilters,
    setShowAdvancedFilters: externalSetShowFilters,
    exportTrigger
}: RingkasanGlobalPageProps) {
    const { attendance, halaqah, santri, appSettings, updateAttendanceRecord, deleteAttendanceRecord, addAttendanceRecords, loading, error , globalMarhalahs, globalWaktuHalaqah, globalAttendanceStatus, userProfile, waliKelas , masterMarhalahs, masterKelasRelasi, getOrgId} = useSupabaseData();
    useRiwayat(); // Fase 7: riwayat absensi/setoran dimuat saat halaman ini dibuka
    const [displayLimit, setDisplayLimit] = useState(50); // Initial limit as in screenshot

    // UI States
    const [localShowFilters, setLocalShowFilters] = useState(false);
    const showAdvancedFilters = externalShowFilters !== undefined ? externalShowFilters : localShowFilters;
    const setShowAdvancedFilters = externalSetShowFilters || setLocalShowFilters;

    const permittedHalaqahIds = useMemo(() => {
        // Allow all roles including musammi to see all data on this page
        return null;
    }, [halaqah, userProfile]);

    // Filters
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [selectedMarhalah, setSelectedMarhalah] = useState<string | 'all'>('all');
    const [selectedKelas, setSelectedKelas] = useState<string | 'all'>('all');
    const [selectedPeran, setSelectedPeran] = useState<string | 'all'>('all');
    const [selectedStatus, setSelectedStatus] = useState<string | 'all'>('all');
    const [searchName, setSearchName] = useState('');
    const [sortBy, setSortBy] = useState('Marhalah'); // Marhalah, Kelas, Nama, Hadir, Sakit, Izin, Alpa, Terlambat
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    // UI States
    const [showTrendMenu, setShowTrendMenu] = useState(false);
    const [showAllTrendLines, setShowAllTrendLines] = useState(true); // Default to true as requested
    const [showPieMenu, setShowPieMenu] = useState(false);
    const [showBarMenu, setShowBarMenu] = useState(false);
    const [showStatsMenu, setShowStatsMenu] = useState(false);
    const [showStatsKelas, setShowStatsKelas] = useState(false);
    const [showStatsWaktu, setShowStatsWaktu] = useState(false);

    // Selection States
    const [selectedStudentDetail, setSelectedStudentDetail] = useState<{id: number, nama: string, peran: string} | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [selectedSantriIds, setSelectedSantriIds] = useState<number[]>([]);
    const [generatedMessages, setGeneratedMessages] = useState<{name: string, phone: string, text: string, telegramChatId?: string}[]>([]);
    const [messageTarget, setMessageTarget] = useState<'wa' | 'telegram'>('wa');
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Add Manual Form State
    const [newManualRecord, setNewManualRecord] = useState({
        date: format(new Date(), 'yyyy-MM-dd'),
        waktu: globalWaktuHalaqah[0] || 'Shubuh',
        status: 'Hadir'
    });

    useEffect(() => {
        if (globalAttendanceStatus?.length > 0) {
            setNewManualRecord(prev => ({ ...prev, status: globalAttendanceStatus[0] }));
        }
    }, [globalAttendanceStatus]);

    const permittedAttendance = useMemo(() => {
        let base = attendance;
        if (permittedHalaqahIds) {
            base = base.filter(record => record.halaqahId && permittedHalaqahIds.includes(record.halaqahId));
        }
        return base;
    }, [attendance, permittedHalaqahIds]);

    // Dynamic Options
    const availableKelas = useMemo(() => {
        const k = new Set<string>();
        permittedAttendance.forEach(record => {
            if (selectedMarhalah !== 'all') {
                if (record.marhalah === selectedMarhalah && record.kelas) k.add(record.kelas);
            } else {
                if (record.kelas) k.add(record.kelas);
            }
        });
        return Array.from(k).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    }, [permittedAttendance, selectedMarhalah]);

    const filteredData = useMemo(() => {
        return permittedAttendance.filter(record => {
            if (dateRange.start && record.date < dateRange.start) return false;
            if (dateRange.end && record.date > dateRange.end) return false;
            if (selectedMarhalah !== 'all' && record.marhalah !== selectedMarhalah) return false;
            if (selectedKelas !== 'all' && record.kelas !== selectedKelas) return false;
            if (selectedPeran !== 'all' && record.peran !== selectedPeran) return false;
            if (selectedStatus !== 'all' && record.status !== selectedStatus) return false;
            if (searchName && !record.nama.toLowerCase().includes(searchName.toLowerCase())) return false;
            return true;
        });
    }, [permittedAttendance, dateRange, selectedMarhalah, selectedKelas, selectedPeran, selectedStatus, searchName]);

    const recapData = useMemo(() => {
        const groups: Record<string, any> = {};
        filteredData.forEach(r => {
            const key = `${r.peran}_${r.personId}`;
            if (!groups[key]) {
                groups[key] = {
                    id: r.personId, Peran: r.peran, Marhalah: r.marhalah, Kelas: r.kelas, Nama: r.nama,
                    Hadir: 0, Izin: 0, Sakit: 0, Terlambat: 0, Alpa: 0, Total: 0
                };
            }
            if (r.status === 'Hadir') groups[key].Hadir++;
            else if (r.status === 'Izin') groups[key].Izin++;
            else if (r.status === 'Sakit') groups[key].Sakit++;
            else if (r.status === 'Terlambat') groups[key].Terlambat++;
            else if (r.status === 'Alpa') groups[key].Alpa++;
            groups[key].Total++;
        });
        
        return Object.values(groups).sort((a, b) => {
            let detailCompare = 0;
            switch(sortBy) {
                case 'Marhalah':
                    const mIdxA = globalMarhalahs.indexOf(a.Marhalah);
                    const mIdxB = globalMarhalahs.indexOf(b.Marhalah);
                    detailCompare = mIdxA - mIdxB;
                    break;
                case 'Kelas':
                    detailCompare = (a.Kelas || '').localeCompare(b.Kelas || '', undefined, { numeric: true, sensitivity: 'base' });
                    break;
                case 'Nama':
                    detailCompare = a.Nama.localeCompare(b.Nama);
                    break;
                case 'Hadir':
                    detailCompare = b.Hadir - a.Hadir;
                    break;
                case 'Izin':
                    detailCompare = b.Izin - a.Izin;
                    break;
                case 'Sakit':
                    detailCompare = b.Sakit - a.Sakit;
                    break;
                case 'Alpa':
                    detailCompare = b.Alpa - a.Alpa;
                    break;
                case 'Terlambat':
                    detailCompare = b.Terlambat - a.Terlambat;
                    break;
                case 'Total':
                    detailCompare = b.Total - a.Total;
                    break;
                default:
                    detailCompare = a.Nama.localeCompare(b.Nama);
            }
            
            if (sortOrder === 'desc') {
                if (sortBy === 'Nama' || sortBy === 'Kelas' || sortBy === 'Marhalah') {
                    detailCompare = -detailCompare; // Reverse string sort to descending
                }
            } else {
                if (sortBy !== 'Nama' && sortBy !== 'Kelas' && sortBy !== 'Marhalah') {
                    detailCompare = -detailCompare; // Reverse number sort to ascending
                }
            }

            // Fallback to name if primary sort is equal (only if primary sort isn't Name)
            if (detailCompare === 0 && sortBy !== 'Nama') {
                return a.Nama.localeCompare(b.Nama);
            }
            return detailCompare;
        });
    }, [filteredData, sortBy, sortOrder, globalMarhalahs]);

    const prevExportTrigger = useRef(exportTrigger);
    useEffect(() => {
        if (exportTrigger && exportTrigger !== prevExportTrigger.current) {
            prevExportTrigger.current = exportTrigger;
            exportToExcel(recapData, 'Rekap_Global');
        }
    }, [exportTrigger, recapData]);

    const summaryOptions = useMemo(() => {
        const groups: Record<string, any> = {};
        filteredData.forEach(r => {
            const m = r.marhalah || '-';
            const k = r.kelas || '-';
            const w = r.waktu || '-';
            
            let key = m;
            if (showStatsKelas) key += `|${k}`;
            if (showStatsWaktu) key += `|${w}`;

            if (!groups[key]) {
                groups[key] = { marhalah: m, kelas: k, waktu: w, Total: 0 };
                globalAttendanceStatus?.forEach(s => groups[key][s] = 0);
            }
            if (r.status && groups[key][r.status] !== undefined) {
                groups[key][r.status]++;
            } else if (r.status) {
                groups[key][r.status] = 1;
            }
            groups[key].Total++;
        });
        return Object.values(groups).sort((a, b) => {
            const mIdxA = globalMarhalahs.indexOf(a.marhalah);
            const mIdxB = globalMarhalahs.indexOf(b.marhalah);
            if (mIdxA !== mIdxB) return mIdxA - mIdxB;
            const cK = a.kelas.localeCompare(b.kelas);
            if (cK !== 0) return cK;
            return a.waktu.localeCompare(b.waktu);
        });
    }, [filteredData, showStatsKelas, showStatsWaktu, globalMarhalahs, globalAttendanceStatus]);

    const visibleData = useMemo(() => recapData.slice(0, displayLimit), [recapData, displayLimit]);

    const pieStats = useMemo(() => {
        const counts: Record<string, number> = {};
        globalAttendanceStatus?.forEach(s => counts[s] = 0);
        let total = 0;

        filteredData.forEach(r => {
            if (r.status) {
                counts[r.status] = (counts[r.status] || 0) + 1;
                total++;
            }
        });
        
        const chartData = globalAttendanceStatus?.map(s => ({ name: s, value: counts[s] || 0 })).filter(d => d.value > 0) || [];
        
        const result: any = { total, chartData };
        if (total > 0) {
            globalAttendanceStatus?.forEach(s => {
                result[`${s.toLowerCase()}Val`] = Math.round(((counts[s] || 0) / total) * 100);
            });
        }
        return { ...counts, ...result };
    }, [filteredData, globalAttendanceStatus]);

    const trendData = useMemo(() => {
        const parseDate = (dateStr: string) => {
            const parts = dateStr.split('-');
            return parts.length === 3 ? new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])) : new Date();
        };
        const endDate = dateRange.end ? parseDate(dateRange.end) : new Date();
        const startDate = dateRange.start ? parseDate(dateRange.start) : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        const days: Record<string, any> = {};
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            if (d.getDay() === 5) continue;
            const strDate = format(d, 'yyyy-MM-dd');
            const dayData: any = { date: format(d, 'MMM d'), fullDate: strDate };
            globalAttendanceStatus?.forEach(s => dayData[s] = 0);
            days[strDate] = dayData;
        }
        filteredData.forEach(r => {
            if (r.date && days[r.date] && r.status) {
                if (days[r.date][r.status] !== undefined) {
                    days[r.date][r.status]++;
                } else {
                    days[r.date][r.status] = 1;
                }
            }
        });
        return Object.values(days).sort((a, b) => a.fullDate.localeCompare(b.fullDate)).map((day) => {
            let total = 0;
            globalAttendanceStatus?.forEach(s => total += (day[s] || 0));
            const res = { ...day };
            if (total > 0) {
                globalAttendanceStatus?.forEach(s => {
                    if (day[s] !== undefined) res[s] = parseFloat(((day[s] / total) * 100).toFixed(1));
                });
            }
            return res;
        });
    }, [filteredData, dateRange, globalAttendanceStatus]);

    const studentDetailData = useMemo(() => {
        if (!selectedStudentDetail) return [];
        return filteredData
            .filter(r => r.personId === selectedStudentDetail.id && r.peran === selectedStudentDetail.peran)
            .sort((a, b) => b.date.localeCompare(a.date));
    }, [selectedStudentDetail, filteredData]);

    const handleEdit = (record: AttendanceRecord) => { setEditingRecord(record); setIsEditModalOpen(true); };
    // Fase 3: mengubah/menghapus absensi tanggal yang sudah lewat = koreksi Admin beralasan
    const [dialogAlasan, mintaAlasan] = useMintaAlasan();
    const alasanJikaLewat = async (tanggal: (string | undefined)[], title: string): Promise<string | null | undefined> => {
        const today = hariIni();
        if (!tanggal.some(t => t && t < today)) return undefined;
        return mintaAlasan({ title, description: 'Absensi tanggal yang sudah lewat hanya bisa dikoreksi Admin dengan alasan. Alasan tercatat di Audit Log.' });
    };
    const handleDelete = async (id: number) => {
        try {
            const rec: any = attendance.find((a) => String(a.id) === String(id));
            const alasan = await alasanJikaLewat([rec?.date], 'Hapus catatan absensi');
            if (alasan === null) return;
            await deleteAttendanceRecord(id, alasan || undefined);
            NotificationStore.addNotification('Data absensi berhasil dihapus.', 'success');
        } catch (e: any) { NotificationStore.addNotification(e.message, 'error'); }
    };
    
    const sendWA = (phone: string, text: string) => {
        if(!phone) {
            NotificationStore.addNotification("Nomor HP tidak tersedia.", "error");
            return;
        }
        let p = phone.replace(/\D/g, '');
        if(p.startsWith('0')) p = '62' + p.substring(1);
        NotificationStore.addNotification(`Membuka WhatsApp untuk mengirim pesan ke ${p}...`, 'info');
        window.open(`https://wa.me/${p}?text=${encodeURIComponent(text)}`, '_blank');
    };

    const handleSendTelegram = async (chatId: string, text: string) => {
        const botToken = appSettings.find(s => s.key === 'TELEGRAM_BOT_TOKEN')?.value;
        if (!botToken) {
            NotificationStore.addNotification("TELEGRAM_BOT_TOKEN belum diatur di Settings.", "error");
            return;
        }
        try {
            await sendCustomTelegramMessage(botToken, chatId, text);
            NotificationStore.addNotification("Pesan Telegram terkirim.", "success");
        } catch (err: any) {
            NotificationStore.addNotification(`Gagal kirim: ${err.message}`, "error");
        }
    };

    const handleSendMassTelegram = async () => {
        const botToken = appSettings.find(s => s.key === 'TELEGRAM_BOT_TOKEN')?.value;
        if (!botToken) {
            NotificationStore.addNotification("TELEGRAM_BOT_TOKEN belum diatur.", "error");
            return;
        }
        const validMessages = generatedMessages.filter(m => m.telegramChatId);
        if (validMessages.length === 0) {
            NotificationStore.addNotification("Tidak ada penerima Telegram yang valid.", "info");
            return;
        }
        
        NotificationStore.addNotification(`Mulai mengirim ${validMessages.length} pesan Telegram...`, 'info');
        for (const msg of validMessages) {
            try {
                await sendCustomTelegramMessage(botToken, msg.telegramChatId!, msg.text);
            } catch (err) {
                console.error("Gagal kirim ke", msg.telegramChatId);
            }
        }
        NotificationStore.addNotification(`Pengiriman massal selesai.`, 'success');
        setIsPreviewModalOpen(false);
    };

    const handleGeneratePreview = (target: 'wa' | 'telegram') => {
        const messages: {name: string, phone: string, text: string, telegramChatId?: string}[] = [];
        
        selectedSantriIds.forEach(id => {
            const dataRow = visibleData.find(d => d.id === id && d.Peran === 'Santri');
            if (dataRow) {
                const s = santri.find(st => st.id === id);
                if (s) {
                    const phone = s.no_hp_wali || s.no_hp || '';
                    const telegramChatId = s.telegram_chat_id || '';
                    const parentName = s.nama_wali || 'Bapak/Ibu';
                    
                    let msg = `Assalamu'alaikum warahmatullahi wabarakatuh.\n\n`;
                    msg += `Yth. ${parentName}\n`;
                    msg += `Ananda: *${s.nama}*\n`;
                    msg += `Kelas: *${s.kelas_id ? masterKelasRelasi?.find((k) => k.id === s.kelas_id)?.nama_kelas || s.kelas : s.kelas} (${s.marhalah_id ? masterMarhalahs?.find((m) => m.id === s.marhalah_id)?.nama || s.marhalah : s.marhalah})*\n\n`;
                    msg += `Berikut kami sampaikan Laporan Kehadiran Halaqah Ananda.\n`;
                    if (dateRange.start || dateRange.end) {
                        msg += `Periode: ${dateRange.start ? format(new Date(dateRange.start), 'dd MMM yyyy') : 'Awal'} s/d ${dateRange.end ? format(new Date(dateRange.end), 'dd MMM yyyy') : 'Sekarang'}\n`;
                    }
                    msg += `\n*Rincian Kehadiran:*\n`;
                    msg += `Hadir      : ${dataRow.Hadir || 0} kali\n`;
                    msg += `Izin       : ${dataRow.Izin || 0} kali\n`;
                    msg += `Sakit      : ${dataRow.Sakit || 0} kali\n`;
                    msg += `Alpa       : ${dataRow.Alpa || 0} kali\n`;
                    msg += `Terlambat  : ${dataRow.Terlambat || 0} kali\n`;
                    msg += `Total Sesi : ${dataRow.Total || 0} kali\n\n`;
                    msg += `Demikian laporan kehadiran ini kami sampaikan. Semoga Allah memberkahi Ananda dalam menuntut ilmu.\n\n`;
                    msg += `Wassalamu'alaikum warahmatullahi wabarakatuh.`;
                    
                    messages.push({ name: s.nama, phone, text: msg, telegramChatId });
                }
            }
        });

        if (messages.length === 0) {
            NotificationStore.addNotification("Pilih minimal 1 santri untuk mengirim pesan.", "info");
            return;
        }
        setGeneratedMessages(messages);
        setMessageTarget(target);
        setIsPreviewModalOpen(true);
    };

    const handleSelectAll = () => {
        if (selectedSantriIds.length === visibleData.filter(d => d.Peran === 'Santri').length) setSelectedSantriIds([]);
        else setSelectedSantriIds(visibleData.filter(d => d.Peran === 'Santri').map(d => d.id));
    };

    const handleUpdate = async () => {
        if(!editingRecord) return;
        const asal: any = attendance.find((a) => String(a.id) === String(editingRecord.id));
        const alasan = await alasanJikaLewat([asal?.date, editingRecord.date], 'Koreksi absensi');
        if (alasan === null) return;
        setIsSubmitting(true);
        try {
            await updateAttendanceRecord(editingRecord.id, { status: editingRecord.status, date: editingRecord.date, waktu: editingRecord.waktu }, alasan || undefined);
            setIsEditModalOpen(false);
            NotificationStore.addNotification("Data absensi berhasil diperbarui.", "success");
        } catch(e:any) { NotificationStore.addNotification(e.message, "error"); }
        finally { setIsSubmitting(false); }
    };

    const handleAddManualSubmit = async () => {
        if (!selectedStudentDetail) return;
        const alasan = await alasanJikaLewat([newManualRecord.date], 'Tambah absensi tanggal lampau');
        if (alasan === null) return;
        setIsSubmitting(true);
        try {
            const targetDateStr = newManualRecord.date;
            const targetHalaqah = halaqah.find(h => {
                if (selectedStudentDetail.peran === Peran.Musammi) {
                    return h.musammi.id === selectedStudentDetail.id;
                }
                if (h.history) {
                    return h.history.some((hs) => 
                        hs.santri_id === selectedStudentDetail.id &&
                        (!hs.start_date || hs.start_date <= targetDateStr) &&
                        (!hs.end_date || hs.end_date >= targetDateStr)
                    );
                }
                return h.santri.some(s => s.id === selectedStudentDetail.id);
            });

            await addAttendanceRecords([{
                date: newManualRecord.date,
                waktu: newManualRecord.waktu,
                personId: selectedStudentDetail.id,
                peran: selectedStudentDetail.peran,
                status: newManualRecord.status,
                halaqahId: targetHalaqah?.id || 0
            }], alasan || undefined);

            setIsAddModalOpen(false);
            NotificationStore.addNotification("Absensi berhasil ditambahkan!", "success");
        } catch(e: any) {
            NotificationStore.addNotification(`Gagal: ${e.message}`, "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    const getInitials = (name: string) => {
        return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    };

    const handleDownloadImage = (elementId: string, filename: string) => {
        // Wait for React to flush state updates (e.g. hiding the menu)
        setTimeout(async () => {
            const element = document.getElementById(elementId);
            if (!element) return;

            // Temp remove overflow restrictions and expand to capture the unclipped chart
            const scrollContainer = element.querySelector('.overflow-x-auto') as HTMLElement | null;
            let originalOverflow = '';
            let originalWidth = '';
            let originalElementWidth = element.style.width;
            
            if (scrollContainer) {
                originalOverflow = scrollContainer.style.overflow;
                originalWidth = scrollContainer.style.width;
                scrollContainer.style.overflow = 'visible';
                scrollContainer.style.width = 'max-content';
                element.style.width = scrollContainer.scrollWidth + 50 + 'px';
            }

            // Wait for DOM to reflow before capturing
            setTimeout(async () => {
                try {
                    const canvas = await html2canvas(element, { 
                        scale: window.devicePixelRatio || 2, 
                        useCORS: true, 
                        backgroundColor: '#ffffff', 
                        windowWidth: scrollContainer ? scrollContainer.scrollWidth + 100 : undefined 
                    });
                    const url = canvas.toDataURL('image/png');
                    const link = document.createElement('a');
                    link.download = `${filename}.png`;
                    link.href = url;
                    link.click();
                } catch (err) {
                    console.error('Failed to download chart', err);
                } finally {
                    // Restore styles
                    if (scrollContainer) {
                        scrollContainer.style.overflow = originalOverflow;
                        scrollContainer.style.width = originalWidth;
                        element.style.width = originalElementWidth;
                    }
                }
            }, 100);
        }, 150);
    };

    const handleOpenInNewTab = (elementId: string) => {
        // Wait for React to flush state updates (e.g. hiding the menu)
        setTimeout(async () => {
            const element = document.getElementById(elementId);
            if (!element) return;

            const scrollContainer = element.querySelector('.overflow-x-auto') as HTMLElement | null;
            let originalOverflow = '';
            let originalWidth = '';
            let originalElementWidth = element.style.width;
            
            if (scrollContainer) {
                originalOverflow = scrollContainer.style.overflow;
                originalWidth = scrollContainer.style.width;
                scrollContainer.style.overflow = 'visible';
                scrollContainer.style.width = 'max-content';
                element.style.width = scrollContainer.scrollWidth + 50 + 'px';
            }

            // Wait for DOM to reflow before capturing
            setTimeout(async () => {
                try {
                    const canvas = await html2canvas(element, { 
                        scale: window.devicePixelRatio || 2, 
                        useCORS: true, 
                        backgroundColor: '#ffffff', 
                        windowWidth: scrollContainer ? scrollContainer.scrollWidth + 100 : undefined 
                    });
                    const url = canvas.toDataURL('image/png');
                    const newWindow = window.open();
                    if (newWindow) {
                        newWindow.document.write(`<iframe src="${url}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
                    }
                } catch (err) {
                    console.error('Failed to open in new tab', err);
                } finally {
                    if (scrollContainer) {
                        scrollContainer.style.overflow = originalOverflow;
                        scrollContainer.style.width = originalWidth;
                        element.style.width = originalElementWidth;
                    }
                }
            }, 100);
        }, 150);
    };

    const handleSort = (field: string) => {
        if (sortBy === field) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortOrder('asc');
        }
    };

    const SortIcon = ({ field }: { field: string }) => {
        if (sortBy !== field) return <ArrowUpDown size={12} className="ml-1.5 text-slate-300 transition-opacity" />;
        return sortOrder === 'asc' 
            ? <ArrowUp size={12} className="ml-1.5 text-blue-500" />
            : <ArrowDown size={12} className="ml-1.5 text-blue-500" />;
    };
  return { externalShowFilters, externalSetShowFilters, exportTrigger, attendance, halaqah, santri, appSettings, updateAttendanceRecord, deleteAttendanceRecord, addAttendanceRecords, loading, error, globalMarhalahs, globalWaktuHalaqah, globalAttendanceStatus, userProfile, waliKelas, masterMarhalahs, masterKelasRelasi, getOrgId, displayLimit, setDisplayLimit, localShowFilters, setLocalShowFilters, showAdvancedFilters, setShowAdvancedFilters, permittedHalaqahIds, dateRange, setDateRange, selectedMarhalah, setSelectedMarhalah, selectedKelas, setSelectedKelas, selectedPeran, setSelectedPeran, selectedStatus, setSelectedStatus, searchName, setSearchName, sortBy, setSortBy, sortOrder, setSortOrder, showTrendMenu, setShowTrendMenu, showAllTrendLines, setShowAllTrendLines, showPieMenu, setShowPieMenu, showBarMenu, setShowBarMenu, showStatsMenu, setShowStatsMenu, showStatsKelas, setShowStatsKelas, showStatsWaktu, setShowStatsWaktu, selectedStudentDetail, setSelectedStudentDetail, isEditModalOpen, setIsEditModalOpen, isAddModalOpen, setIsAddModalOpen, selectedSantriIds, setSelectedSantriIds, generatedMessages, setGeneratedMessages, messageTarget, setMessageTarget, isPreviewModalOpen, setIsPreviewModalOpen, editingRecord, setEditingRecord, isSubmitting, setIsSubmitting, newManualRecord, setNewManualRecord, permittedAttendance, availableKelas, filteredData, recapData, prevExportTrigger, summaryOptions, visibleData, pieStats, trendData, studentDetailData, handleEdit, dialogAlasan, mintaAlasan, alasanJikaLewat, handleDelete, sendWA, handleSendTelegram, handleSendMassTelegram, handleGeneratePreview, handleSelectAll, handleUpdate, handleAddManualSubmit, getInitials, handleDownloadImage, handleOpenInNewTab, handleSort, SortIcon };
}

export type RingkasanGlobalPageLogika = ReturnType<typeof useRingkasanGlobalPageLogika>;
