import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { X, Megaphone, ArrowRight, AlertCircle, Calendar } from 'lucide-react';
import { useSupabaseData } from '../hooks/useSupabaseData';

interface GlobalPinnedBannerProps {
    onNavigate?: (page: string) => void;
}

const stripHtml = (html: string) => {
    const tmp = document.createElement("DIV");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
};

export const GlobalPinnedBanner: React.FC<GlobalPinnedBannerProps> = ({ onNavigate }) => {
    const { activeSemesterDates, userProfile, loading } = useSupabaseData();
    const [pinnedInfo, setPinnedInfo] = useState<any[]>([]);
    const [dismissedIds, setDismissedIds] = useState<number[]>([]);
    const [dismissedMissingDates, setDismissedMissingDates] = useState(false);
    
    useEffect(() => {
        // Load dismissed IDs from localStorage
        const stored = localStorage.getItem('dismissedPinnedInfo');
        if (stored) {
            try {
                setDismissedIds(JSON.parse(stored));
            } catch (e) {}
        }

        const fetchPinned = async () => {
            try {
                const { data, error } = await supabase
                    .from('informasi')
                    .select('*')
                    .eq('is_pinned', true)
                    .order('created_at', { ascending: false });
                
                if (error) throw error;
                setPinnedInfo(data || []);
            } catch (err) {
                console.error("Failed to fetch pinned info:", err);
            }
        };

        fetchPinned();

        // Listen for changes
        const channel = supabase.channel('schema-db-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'informasi',
                    filter: `is_pinned=eq.true`
                },
                (payload) => {
                    fetchPinned();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Jika penampungan data MASIH LOADING, tahan dulu, jangan tampilkan apa-apa.
    // Ini harus di bawah useEffect untuk mencegah React Hook error.
    if (loading) return null;

    // Jika sudah SELESAI LOADING, baru cek apakah tanggalnya benar-benar kosong.
    const isMissingDates = (!activeSemesterDates?.startDate || !activeSemesterDates?.endDate) && !dismissedMissingDates;
    const canManageSettings = userProfile?.role === 'super_admin' || userProfile?.role === 'admin';

    const handleDismiss = (id: number) => {
        const newDismissed = [...dismissedIds, id];
        setDismissedIds(newDismissed);
        localStorage.setItem('dismissedPinnedInfo', JSON.stringify(newDismissed));
    };

    const activeInfo = pinnedInfo.filter(info => !dismissedIds.includes(info.id));

    if (activeInfo.length === 0 && !isMissingDates) return null;

    return (
        <div className="flex flex-col w-full z-40 shadow-md print:hidden">
            {isMissingDates && (
                <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 py-3 sm:px-6 lg:px-8 bg-amber-500 text-white border-b border-amber-600 gap-4">
                    <div className="flex items-start md:items-center min-w-0 flex-1">
                        <AlertCircle className="w-5 h-5 mr-3 mt-0.5 md:mt-0 flex-shrink-0 text-amber-100" />
                        <div className="pr-2">
                            <span className="font-bold mr-2 text-[14px]">Tanggal Semester Belum Diatur</span>
                            <span className="text-amber-100 text-[13px] hidden md:inline">
                                Admin perlu mengatur <strong>Tanggal Mulai</strong> dan <strong>Tanggal Selesai</strong> semester agar data absensi dan laporan dapat ditampilkan.
                            </span>
                        </div>
                    </div>
                    {canManageSettings && onNavigate && (
                        <div className="flex items-center space-x-2 flex-shrink-0 w-full sm:w-auto mt-3 sm:mt-0">
                            <button 
                                onClick={() => onNavigate('TahunAjaran')}
                                className="w-full sm:w-auto px-4 py-1.5 bg-white text-amber-600 hover:bg-amber-50 text-[13px] font-bold rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2"
                            >
                                <Calendar size={14} />
                                Isi Sekarang
                                <ArrowRight size={14} />
                            </button>
                            <button 
                                onClick={() => setDismissedMissingDates(true)}
                                className="flex p-1.5 hover:bg-amber-600 rounded-lg transition-colors text-amber-200 hover:text-white"
                                title="Tutup"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    )}
                </div>
            )}
            {activeInfo.map(info => {
                const plainText = stripHtml(info.content);
                return (
                    <div key={info.id} className="relative flex items-center justify-between px-4 py-3 sm:px-6 lg:px-8 bg-blue-600 text-white border-b border-blue-700/50 gap-4">
                        <div className="flex items-start md:items-center min-w-0 flex-1">
                            <Megaphone className="w-5 h-5 mr-3 mt-0.5 md:mt-0 flex-shrink-0 text-blue-200" />
                            <div className="pr-2 truncate">
                                <span className="font-bold mr-2">{info.title}</span>
                                <span className="text-blue-100 text-sm hidden md:inline truncate">{plainText.length > 100 ? plainText.substring(0, 100) + '...' : plainText}</span>
                            </div>
                        </div>
                        <div className="flex items-center space-x-2 flex-shrink-0">
                            {onNavigate && (
                                <button 
                                    onClick={() => onNavigate('Pusat Informasi')}
                                    className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold rounded-full transition-colors flex items-center"
                                >
                                    Lihat <ArrowRight size={14} className="ml-1" />
                                </button>
                            )}
                            <button 
                                onClick={() => handleDismiss(info.id)}
                                className="flex p-1.5 hover:bg-blue-700 rounded-lg transition-colors text-blue-200 hover:text-white"
                                title="Tutup"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
