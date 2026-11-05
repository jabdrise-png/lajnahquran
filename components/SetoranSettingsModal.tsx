import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { NotificationStore } from '../lib/NotificationStore';
import { Save, Plus, Trash } from 'lucide-react';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export default function SetoranSettingsModal({ isOpen, onClose }: Props) {
    const { appSettings, saveAppSetting, saveMultipleAppSettings, globalWaktuHalaqah } = useSupabaseData();
    const [skemaOptions, setSkemaOptions] = useState('Ziyadah,Murojaah,Sabqi,Manzil,Lainnya');
    const [waktuMap, setWaktuMap] = useState<Record<string, string>>({});
    
    // Auto Calculation Settings
    const [autoEnable, setAutoEnable] = useState(false);
    const [autoBase, setAutoBase] = useState(100);
    const [autoKabir, setAutoKabir] = useState(20);
    const [autoShoghir, setAutoShoghir] = useState(10);
    
    const [nilaiRanges, setNilaiRanges] = useState<{label: string, min: number}[]>([
        { label: 'Mumtaz', min: 90 },
        { label: 'Jayyid Jiddan', min: 80 },
        { label: 'Jayyid', min: 70 },
        { label: 'Maqbul', min: 60 },
        { label: 'Dhaif', min: 0 }
    ]);

        const [telegramEnable, setTelegramEnable] = useState(false);
    const [telegramTemplate, setTelegramTemplate] = useState('Ananda {nama_santri} ({halaqah}) telah melaksanakan setoran pada {tanggal} {waktu}.\nSurat: {surat} ayat {ayat}.\nSkema: {skema}\nNilai: {nilai}\nKesalahan Kabir/Shoghir: {khoto_kabir}/{khoto_shoghir}\nJml Halaman: {jumlah_halaman}\nKeterangan: {keterangan}');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            const skemaSetting = appSettings.find(s => s.key === 'SETORAN_SKEMA_OPTIONS');
            if (skemaSetting) setSkemaOptions(skemaSetting.value);
            
            const waktuSetting = appSettings.find(s => s.key === 'SETORAN_WAKTU_SKEMA_MAP');
            if (waktuSetting) {
                try {
                    setWaktuMap(JSON.parse(waktuSetting.value));
                } catch {
                    setWaktuMap({});
                }
            } else {
                setWaktuMap({});
            }

            const telEnableSetting = appSettings.find(s => s.key === 'SETORAN_TELEGRAM_NOTIF_ENABLE');
            if (telEnableSetting) setTelegramEnable(telEnableSetting.value === 'true');
            const telTemplateSetting = appSettings.find(s => s.key === 'SETORAN_TELEGRAM_NOTIF_TEMPLATE');
            if (telTemplateSetting) setTelegramTemplate(telTemplateSetting.value);
            const enableSetting = appSettings.find(s => s.key === 'SETORAN_AUTO_ENABLE');
            if (enableSetting) setAutoEnable(enableSetting.value === 'true');

            const baseSetting = appSettings.find(s => s.key === 'SETORAN_AUTO_BASE');
            if (baseSetting) setAutoBase(Number(baseSetting.value) || 100);

            const kabirSetting = appSettings.find(s => s.key === 'SETORAN_AUTO_KABIR');
            if (kabirSetting) setAutoKabir(Number(kabirSetting.value) || 20);

            const shoghirSetting = appSettings.find(s => s.key === 'SETORAN_AUTO_SHOGHIR');
            if (shoghirSetting) setAutoShoghir(Number(shoghirSetting.value) || 10);

            const rangesSetting = appSettings.find(s => s.key === 'SETORAN_AUTO_RANGES');
            if (rangesSetting) {
                try {
                    setNilaiRanges(JSON.parse(rangesSetting.value));
                } catch {}
            } else {
                // Fallback to old SETORAN_NILAI_OPTIONS
                const nilaiSetting = appSettings.find(s => s.key === 'SETORAN_NILAI_OPTIONS');
                if (nilaiSetting) {
                    const parts = nilaiSetting.value.split(',');
                    const mapped = parts.map((p: string, i: number) => ({
                        label: p.trim(),
                        min: Math.max(0, 100 - (i * 10)) // Just a dummy fallback
                    }));
                    setNilaiRanges(mapped);
                }
            }
        }
    }, [isOpen]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await saveMultipleAppSettings([
                { key: 'SETORAN_SKEMA_OPTIONS', value: skemaOptions },
                { key: 'SETORAN_WAKTU_SKEMA_MAP', value: JSON.stringify(waktuMap) },
                { key: 'SETORAN_TELEGRAM_NOTIF_ENABLE', value: telegramEnable ? 'true' : 'false' },
                { key: 'SETORAN_TELEGRAM_NOTIF_TEMPLATE', value: telegramTemplate },
                { key: 'SETORAN_AUTO_ENABLE', value: autoEnable ? 'true' : 'false' },
                { key: 'SETORAN_AUTO_BASE', value: autoBase.toString() },
                { key: 'SETORAN_AUTO_KABIR', value: autoKabir.toString() },
                { key: 'SETORAN_AUTO_SHOGHIR', value: autoShoghir.toString() },
                { key: 'SETORAN_AUTO_RANGES', value: JSON.stringify(nilaiRanges) },
                { key: 'SETORAN_NILAI_OPTIONS', value: nilaiRanges.map(r => r.label).join(',') }
            ]);

            NotificationStore.addNotification('Pengaturan Setoran berhasil disimpan.', 'success');
            onClose();
        } catch (error) {
            console.error('Error saving setoran settings:', error);
            NotificationStore.addNotification('Gagal menyimpan pengaturan setoran.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Pengaturan Input Setoran">
            <div className="space-y-6 max-h-[80vh] overflow-y-auto pr-2">
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Opsi Skema Setoran</label>
                    <p className="text-xs text-slate-500 mb-2">Pisahkan dengan koma (,). Contoh: Ziyadah,Murojaah</p>
                    <input 
                        type="text" 
                        value={skemaOptions} 
                        onChange={e => setSkemaOptions(e.target.value)} 
                        className="w-full border border-slate-300 rounded-lg p-2.5 text-[13px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                    />
                </div>
                
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-3">Tautan Waktu ke Skema Default</label>
                    <div className="space-y-3 bg-slate-50 p-4 border rounded-xl">
                        {globalWaktuHalaqah.map(waktu => (
                            <div key={waktu} className="flex items-center justify-between">
                                <span className="text-[13px] font-semibold text-slate-700">{waktu}</span>
                                <select 
                                    value={waktuMap[waktu] || ''} 
                                    onChange={e => setWaktuMap({ ...waktuMap, [waktu]: e.target.value })}
                                    className="border border-slate-300 rounded-lg p-1.5 text-[13px] min-w-[150px] focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">Pilih Skema</option>
                                    {skemaOptions.split(',').map(s => s.trim()).filter(s => s).map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="border-t border-slate-200 pt-6">
                    <div className="flex items-center justify-between mb-4">
                        <label className="block text-sm font-bold text-slate-700">Notifikasi Telegram Wali Santri</label>
                        <div className="flex items-center">
                            <input 
                                type="checkbox" 
                                id="telegramEnable"
                                checked={telegramEnable}
                                onChange={e => setTelegramEnable(e.target.checked)}
                                className="mr-2 h-4 w-4 text-blue-600 rounded"
                            />
                            <label htmlFor="telegramEnable" className="text-sm text-slate-600 font-medium">Aktifkan Notifikasi</label>
                        </div>
                    </div>
                    {telegramEnable && (
                        <div className="space-y-4 bg-green-50/50 p-4 rounded-xl border border-green-100 mb-6">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Template Pesan</label>
                                <textarea 
                                    value={telegramTemplate}
                                    onChange={e => setTelegramTemplate(e.target.value)}
                                    className="w-full border border-slate-300 rounded-lg p-2 text-sm h-32"
                                />
                                <p className="text-[11px] text-slate-500 mt-1">
                                    Variabel tersedia: {'{nama_santri}'}, {'{halaqah}'}, {'{tanggal}'}, {'{waktu}'}, {'{surat}'}, {'{ayat}'}, {'{skema}'}, {'{nilai}'}, {'{khoto_kabir}'}, {'{khoto_shoghir}'}, {'{jumlah_halaman}'}, {'{keterangan}'}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="border-t border-slate-200 pt-6">
                    <div className="flex items-center justify-between mb-4">
                        <label className="block text-sm font-bold text-slate-700">Automasi Perhitungan Nilai</label>
                        <div className="flex items-center">
                            <input 
                                type="checkbox" 
                                id="autoEnable"
                                checked={autoEnable}
                                onChange={e => setAutoEnable(e.target.checked)}
                                className="mr-2 h-4 w-4 text-blue-600 rounded"
                            />
                            <label htmlFor="autoEnable" className="text-sm text-slate-600 font-medium">Aktifkan Automasi</label>
                        </div>
                    </div>

                    {autoEnable && (
                        <div className="space-y-4 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Nilai Awal (Base)</label>
                                    <input 
                                        type="number" 
                                        value={autoBase}
                                        onChange={e => setAutoBase(Number(e.target.value))}
                                        className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Minus Khoto Kabir</label>
                                    <input 
                                        type="number" 
                                        value={autoKabir}
                                        onChange={e => setAutoKabir(Number(e.target.value))}
                                        className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Minus Khoto Shoghir</label>
                                    <input 
                                        type="number" 
                                        value={autoShoghir}
                                        onChange={e => setAutoShoghir(Number(e.target.value))}
                                        className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-2">Rentang Nilai & Predikat (Opsi Nilai)</label>
                                <div className="space-y-2">
                                    {nilaiRanges.map((range, idx) => (
                                        <div key={idx} className="flex items-center gap-2">
                                            <input 
                                                type="text" 
                                                value={range.label}
                                                onChange={e => {
                                                    const newRanges = [...nilaiRanges];
                                                    newRanges[idx].label = e.target.value;
                                                    setNilaiRanges(newRanges);
                                                }}
                                                placeholder="Predikat (Mumtaz)"
                                                className="flex-1 border border-slate-300 rounded-lg p-2 text-sm"
                                            />
                                            <span className="text-sm font-medium text-slate-500">Min:</span>
                                            <input 
                                                type="number" 
                                                value={range.min}
                                                onChange={e => {
                                                    const newRanges = [...nilaiRanges];
                                                    newRanges[idx].min = Number(e.target.value);
                                                    setNilaiRanges(newRanges);
                                                }}
                                                className="w-24 border border-slate-300 rounded-lg p-2 text-sm"
                                            />
                                            <button 
                                                onClick={() => {
                                                    const newRanges = nilaiRanges.filter((_, i) => i !== idx);
                                                    setNilaiRanges(newRanges);
                                                }}
                                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                                            >
                                                <Trash size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <button 
                                    onClick={() => setNilaiRanges([...nilaiRanges, { label: 'Baru', min: 0 }])}
                                    className="mt-2 text-blue-600 text-xs font-bold flex items-center gap-1 hover:underline"
                                >
                                    <Plus size={14} /> Tambah Predikat
                                </button>
                                <p className="text-[11px] text-slate-500 mt-2">Nilai ini juga akan menjadi Opsi Nilai Setoran manual Anda.</p>
                            </div>
                        </div>
                    )}
                    
                    {!autoEnable && (
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Opsi Nilai Setoran Manual</label>
                            <p className="text-xs text-slate-500 mb-2">Bila automasi mati, gunakan opsi ini. Pisahkan dengan koma.</p>
                            <input 
                                type="text" 
                                value={nilaiRanges.map(r => r.label).join(',')}
                                onChange={e => {
                                    const parts = e.target.value.split(',');
                                    const mapped = parts.map((p, i) => ({
                                        label: p.trim(),
                                        min: nilaiRanges[i]?.min || 0
                                    }));
                                    setNilaiRanges(mapped);
                                }}
                                className="w-full border border-slate-300 rounded-lg p-2.5 text-[13px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                    )}
                </div>

                <div className="flex justify-end pt-4">
                    <button 
                        onClick={handleSave} 
                        disabled={isSaving}
                        className="flex items-center px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                        <Save size={16} className="mr-2" />
                        {isSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
