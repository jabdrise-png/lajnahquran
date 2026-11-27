// Dipisah dari HalaqahPage.logika.tsx (Fase 8 bagian 2).
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



// --- CUSTOM COMPONENTS FOR MODAL ---

export const WaktuDropdown = ({ selected, options, onChange }: { selected: string[], options: string[], onChange: (w: string) => void }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const displayValue = selected.length === 0 
        ? 'Pilih Waktu' 
        : selected.length === options.length 
            ? 'Semua Waktu' 
            : `${selected.length} dipilih`;

    return (
        <div className="relative" ref={containerRef}>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Waktu Halaqah</label>
            <button 
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="btn btn-secondary w-full justify-between"
            >
                <span className={selected.length === 0 ? "text-slate-400" : "font-medium"}>{displayValue}</span>
                <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}/>
            </button>

            {isOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <div className="p-1 max-h-60 overflow-y-auto">
                        {options.map(w => {
                            const isSelected = selected.includes(w);
                            return (
                                <div 
                                    key={w} 
                                    onClick={() => onChange(w)}
                                    className="flex items-center px-3 py-2 hover:bg-slate-50 cursor-pointer rounded-md"
                                >
                                    <div className={`w-4 h-4 border rounded mr-3 flex items-center justify-center transition-colors ${isSelected ? 'bg-secondary border-secondary' : 'border-slate-300'}`}>
                                        {isSelected && <Check size={10} className="text-white" />}
                                    </div>
                                    <span className="text-sm text-slate-700">{w}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export const SearchableMusammiSelect = ({ 
    musammiList, 
    selectedId, 
    onChange 
}: { 
    musammiList: any[], 
    selectedId: string, 
    onChange: (id: string) => void 
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    // Get selected object to display name if ID matches
    const selectedObj = musammiList.find(m => String(m.id) === selectedId);

    // Initial search text based on selected ID
    useEffect(() => {
        if (!isOpen && selectedObj) {
            setSearch(selectedObj.nama);
        } else if (!isOpen && !selectedId) {
            setSearch('');
        }
    }, [selectedId, isOpen, selectedObj]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                // Reset search text to selected item name on close
                if (selectedObj) setSearch(selectedObj.nama);
                else setSearch('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [selectedObj]);

    const filteredList = musammiList.filter(m => 
        m.nama.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="relative" ref={containerRef}>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Pilih Musammi</label>
            <div className="relative">
                <input
                    type="text"
                    placeholder="Cari nama musammi..."
                    className="kontrol kontrol-cari"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setIsOpen(true); }}
                    onFocus={(e) => { setIsOpen(true); e.target.select(); }}
                />
                {selectedId && !isOpen && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); onChange(''); setSearch(''); }}
                        className="absolute right-2 top-2 text-slate-400 hover:text-red-500"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>

            {isOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-100">
                    {filteredList.length > 0 ? filteredList.map(m => (
                        <div 
                            key={m.id}
                            onClick={() => { onChange(String(m.id)); setIsOpen(false); setSearch(m.nama); }}
                            className={`px-4 py-2.5 hover:bg-slate-50 cursor-pointer flex items-center justify-between border-b border-slate-50 last:border-0 ${String(m.id) === selectedId ? 'bg-blue-50' : ''}`}
                        >
                            <div>
                                <p className="text-sm font-medium text-slate-800 uppercase">{m.nama}</p>
                                <p className="text-2xs text-slate-500"><MarhalahLabel text={m.marhalah} id={m.marhalah_id} /></p>
                            </div>
                            {String(m.id) === selectedId && <Check size={16} className="text-secondary"/>}
                        </div>
                    )) : (
                        <div className="p-4 text-center text-sm text-slate-400">Tidak ditemukan.</div>
                    )}
                </div>
            )}
        </div>
    );
};
