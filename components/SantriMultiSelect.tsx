
import React, { useState, useMemo } from 'react';
import { Search, CheckSquare, Square } from 'lucide-react';
import type { Santri } from '../types';

interface SantriMultiSelectProps {
    santriList: Santri[];
    selectedIds: number[];
    onToggle: (id: number) => void;
    label?: string;
    disabled?: boolean;
}

const SantriMultiSelect: React.FC<SantriMultiSelectProps> = ({ 
    santriList, 
    selectedIds, 
    onToggle, 
    label = "Pilih Santri", 
    disabled = false 
}) => {
    const [search, setSearch] = useState('');
    
    const filteredList = useMemo(() => {
        if (!search) return santriList;
        return santriList.filter(s => 
            s.nama.toLowerCase().includes(search.toLowerCase()) || 
            s.kelas.toLowerCase().includes(search.toLowerCase())
        );
    }, [santriList, search]);

    return (
        <div className="space-y-2">
            <div className="flex justify-between items-center mb-1.5"><label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">{label}</label><span className="text-[11px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{selectedIds.length} terpilih</span></div>
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search size={16} className="text-slate-400" />
                </div>
                <input 
                    type="text" 
                    placeholder="Cari nama santri atau kelas..." 
                    className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all text-sm"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    disabled={disabled}
                />
            </div>
            <div className="mt-2 max-h-52 overflow-y-auto custom-scrollbar border border-slate-200 rounded-lg bg-slate-50/50 p-2 space-y-1">
                {filteredList.length > 0 ? (
                    filteredList.map(s => {
                        const isSelected = selectedIds.includes(s.id);
                        return (
                            <div 
                                key={s.id} 
                                onClick={() => !disabled && onToggle(s.id)}
                                className={`flex items-center px-3 py-2.5 rounded-md cursor-pointer transition-colors border ${isSelected ? 'bg-blue-50/70 border-blue-200 shadow-sm' : 'hover:bg-white border-transparent hover:border-slate-200 hover:shadow-sm'}`}
                            >
                                <div className={`flex-shrink-0 mr-3 ${isSelected ? 'text-secondary' : 'text-slate-400'}`}>
                                    {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                                </div>
                                <div>
                                    <p className={`text-sm font-medium ${isSelected ? 'text-secondary' : 'text-slate-700'}`}>{s.nama}</p>
                                    <p className="text-xs text-slate-500">{s.marhalah} - {s.kelas}</p>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <p className="text-center text-xs text-slate-400 py-4">Tidak ada data santri ditemukan.</p>
                )}
            </div>
        </div>
    );
};

export default SantriMultiSelect;
