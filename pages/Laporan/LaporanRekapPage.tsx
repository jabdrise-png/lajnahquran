import React, { useState } from 'react';
import { Filter, Download, AlertCircle, Calendar, ArrowRight } from 'lucide-react';
import RingkasanGlobalPage from './RingkasanGlobalPage';
import AnalisisPerKelasPage from './AnalisisPerKelasPage';
import TrenHistorisPage from './TrenHistorisPage';
import { useSupabaseData } from '../../hooks/useSupabaseData';

interface Props {
    onNavigate?: (page: any) => void;
}

const LaporanRekapPage: React.FC<Props> = ({ onNavigate }) => {
    const [activeTab, setActiveTab] = useState<'ringkasan' | 'kelas' | 'waktu'>('ringkasan');
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [exportTrigger, setExportTrigger] = useState(0);
    const { activeSemesterDates } = useSupabaseData();

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
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{getPageTitle()}</h1>
                    <p className="text-[14px] text-slate-500 mt-1 pb-1">{getPageDescription()}</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-6 border-b border-slate-200 w-full overflow-x-auto">
                <button
                    onClick={() => setActiveTab('ringkasan')}
                    className={`whitespace-nowrap pb-3 text-[13px] font-bold transition-all duration-200 border-b-2 -mb-[1px] ${
                        activeTab === 'ringkasan'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                >
                    Ringkasan Global
                </button>
                <button
                    onClick={() => setActiveTab('kelas')}
                    className={`whitespace-nowrap pb-3 text-[13px] font-bold transition-all duration-200 border-b-2 -mb-[1px] ${
                        activeTab === 'kelas'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                >
                    Analisis Per Kelas
                </button>
                <button
                    onClick={() => setActiveTab('waktu')}
                    className={`whitespace-nowrap pb-3 text-[13px] font-bold transition-all duration-200 border-b-2 -mb-[1px] ${
                        activeTab === 'waktu'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
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
