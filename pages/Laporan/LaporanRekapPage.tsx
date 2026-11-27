import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import RingkasanGlobalPage from './RingkasanGlobalPage';
import AnalisisPerKelasPage from './AnalisisPerKelasPage';
import TrenHistorisPage from './TrenHistorisPage';

interface Props {
    onNavigate?: (page: any) => void;
}

const LaporanRekapPage: React.FC<Props> = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const initialTab = (searchParams.get('tab') as 'ringkasan' | 'kelas' | 'waktu') || 'ringkasan';
    const [activeTab, setActiveTab] = useState<'ringkasan' | 'kelas' | 'waktu'>(
        ['ringkasan', 'kelas', 'waktu'].includes(initialTab) ? initialTab : 'ringkasan'
    );
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [exportTrigger] = useState(0);

    useEffect(() => {
        const paramTab = searchParams.get('tab') as 'ringkasan' | 'kelas' | 'waktu';
        if (paramTab && ['ringkasan', 'kelas', 'waktu'].includes(paramTab) && paramTab !== activeTab) {
            setActiveTab(paramTab);
        }
    }, [searchParams]);

    const handleChangeTab = (tab: 'ringkasan' | 'kelas' | 'waktu') => {
        setActiveTab(tab);
        const next = new URLSearchParams(searchParams);
        next.set('tab', tab);
        setSearchParams(next, { replace: true });
    };

    const getPageTitle = () => {
        switch (activeTab) {
            case 'ringkasan': return 'Ringkasan Global';
            case 'kelas': return 'Analisis Per Kelas';
            case 'waktu': return 'Tren Historis';
            default: return 'Laporan Utama';
        }
    };

    const getPageDescription = () => {
        switch (activeTab) {
            case 'ringkasan': return 'Laporan eksekutif kehadiran dan statistik absensi santri secara global.';
            case 'kelas': return 'Evaluasi dan perbandingan tingkat kehadiran antar kelas.';
            case 'waktu': return 'Rekapitulasi dan tren kehadiran santri berdasarkan rentang waktu.';
            default: return 'Laporan kehadiran santri.';
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20 max-w-[1400px] font-sans">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">{getPageTitle()}</h1>
                    <p className="text-sm text-slate-500 mt-1 pb-1">{getPageDescription()}</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs">
                <button
                    onClick={() => handleChangeTab('ringkasan')}
                    className={`tab ${activeTab === 'ringkasan' ? 'tab-aktif' : ''}`}
                >
                    Ringkasan Global
                </button>
                <button
                    onClick={() => handleChangeTab('kelas')}
                    className={`tab ${activeTab === 'kelas' ? 'tab-aktif' : ''}`}
                >
                    Analisis Per Kelas
                </button>
                <button
                    onClick={() => handleChangeTab('waktu')}
                    className={`tab ${activeTab === 'waktu' ? 'tab-aktif' : ''}`}
                >
                    Tren Historis
                </button>
            </div>

            {/* Content Area */}
            <div className="mt-6">
                {activeTab === 'ringkasan' && (
                    <RingkasanGlobalPage 
                        showAdvancedFilters={showAdvancedFilters} 
                        setShowAdvancedFilters={setShowAdvancedFilters}
                        exportTrigger={exportTrigger}
                    />
                )}
                {activeTab === 'kelas' && (
                    <AnalisisPerKelasPage 
                        showAdvancedFilters={showAdvancedFilters} 
                        setShowAdvancedFilters={setShowAdvancedFilters}
                        exportTrigger={exportTrigger}
                    />
                )}
                {activeTab === 'waktu' && (
                    <TrenHistorisPage 
                        showAdvancedFilters={showAdvancedFilters} 
                        setShowAdvancedFilters={setShowAdvancedFilters}
                        exportTrigger={exportTrigger}
                    />
                )}
            </div>
        </div>
    );
};

export default LaporanRekapPage;
