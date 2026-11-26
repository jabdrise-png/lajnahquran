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
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-[13px] text-blue-900">
                    Jenis setoran dan jenis bawaan per waktu sekarang diatur di
                    <b> Pengaturan &gt; Referensi Data Dasar</b> (termasuk penanda “menambah hafalan”).
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
                                    Variabel tersedia: {'{nama_santri}'}, {'{halaqah}'}, {'{tanggal}'}, {'{waktu}'}, {'{surat}'}, {'{ayat}'}, {'{skema}'}, {'{nilai}'}, {'{khoto_kabir}'}, {'{khoto_shoghir}'}, {'{jumlah_halaman}'}, {'{keterangan}'}, {'{ulang}'} (berisi “(diulang)” untuk Rasib)
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Fase 3: predikat setoran dihitung server dari Tabel Kelancaran (fluency_rules).
                    Pengaturan "Automasi Perhitungan Nilai" lama tidak dipakai lagi untuk setoran baru;
                    nilainya tetap disimpan apa adanya agar laporan lama tidak berubah. */}
                <div className="border-t border-slate-200 pt-6">
                    <label className="block text-sm font-bold text-slate-700 mb-1">Predikat Setoran</label>
                    <p className="text-[13px] text-slate-600">
                        Predikat sekarang dihitung otomatis dari jumlah khoto kabir & shoghir sesuai
                        <b> Pengaturan &gt; Referensi Data Dasar &gt; Tabel Kelancaran</b>. Predikat Rasib berarti setoran diulang dan tidak menambah hafalan.
                    </p>
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
