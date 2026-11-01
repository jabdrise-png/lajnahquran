import React, { useState, useEffect } from 'react';
import { getLatestUpdate, isTopBannerDismissed, dismissTopBanner, markUpdatesAsRead, hasUnreadUpdates, syncUpdatesFromCloud } from '../lib/appUpdates';

interface TopUpdateBarProps {
    onNavigate?: (page: any) => void;
}

export const TopUpdateBar: React.FC<TopUpdateBarProps> = ({ onNavigate }) => {
    const [isDismissed, setIsDismissed] = useState(true);
    const [latestUpdate, setLatestUpdate] = useState(getLatestUpdate());
    const [isUnread, setIsUnread] = useState(false);

    const checkState = () => {
        setIsDismissed(isTopBannerDismissed());
        setLatestUpdate(getLatestUpdate());
        setIsUnread(hasUnreadUpdates());
    };

    useEffect(() => {
        checkState();
        syncUpdatesFromCloud().then(() => {
            checkState();
        });

        const handleUpdateChange = () => {
            checkState();
        };

        window.addEventListener('app_updates_changed', handleUpdateChange);
        return () => window.removeEventListener('app_updates_changed', handleUpdateChange);
    }, []);

    if (isDismissed || !latestUpdate) {
        return null;
    }

    const handleViewDetail = () => {
        try {
            localStorage.setItem('informasi_active_tab', 'pembaruan');
        } catch {}
        markUpdatesAsRead();
        dismissTopBanner();
        if (onNavigate) {
            onNavigate('Pusat Informasi');
        }
    };

    const handleDismiss = () => {
        dismissTopBanner();
        setIsDismissed(true);
    };

    return (
        <aside 
            aria-label="Pemberitahuan Pembaruan Sistem"
            className="print:hidden w-full bg-slate-50 border-b border-slate-200/90 text-slate-700 text-xs sm:text-[13px] select-none transition-colors z-20"
        >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-3">
                {/* Bagian Kiri: Dot Badge + Judul Pembaruan */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* Dot Badge Minimalis */}
                    <span className="relative flex h-2 w-2 shrink-0" title={isUnread ? "Pembaruan Baru" : "Pembaruan Terkini"}>
                        {isUnread && (
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        )}
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${isUnread ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                    </span>

                    <span className="font-semibold text-slate-900 shrink-0">
                        Pembaruan Sistem
                    </span>

                    <span className="text-slate-300 hidden sm:inline" aria-hidden="true">·</span>

                    <span className="text-slate-600 truncate hidden md:inline">
                        <strong className="font-medium text-slate-800">{latestUpdate.version}:</strong> {latestUpdate.summary}
                    </span>
                    <span className="text-slate-600 truncate md:hidden">
                        <strong className="font-medium text-slate-800">{latestUpdate.version}:</strong> {latestUpdate.title}
                    </span>
                </div>

                {/* Bagian Kanan: Tautan Tindakan & Tombol Tutup */}
                <div className="flex items-center gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={handleViewDetail}
                        className="text-blue-600 hover:text-blue-700 font-medium transition-colors text-xs sm:text-[13px] hover:underline flex items-center"
                    >
                        Lihat Catatan Pembaruan &rarr;
                    </button>

                    <button
                        type="button"
                        onClick={handleDismiss}
                        className="text-slate-400 hover:text-slate-700 p-1 -mr-1 rounded hover:bg-slate-200/60 transition-colors"
                        title="Tutup pemberitahuan"
                        aria-label="Tutup pemberitahuan"
                    >
                        <span className="text-base font-semibold leading-none">&times;</span>
                    </button>
                </div>
            </div>
        </aside>
    );
};

export default TopUpdateBar;
