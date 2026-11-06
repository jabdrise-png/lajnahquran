import { Waktu, Marhalah, Person } from '../types';
import { NotificationStore } from './NotificationStore';
import { supabase } from './supabaseClient';
import { SupportSessionStore } from './permissions';

const DEFAULT_CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID;

interface LaporanData {
    tanggal: string;
    waktu: Waktu;
    marhalah: Marhalah | 'all';
    halaqahName: string;
    records: Array<{
        personId: number;
        status: string;
    }>;
    santriData: Person[];
    chatId?: string;
}

export const sendTelegramNotification = async (data: LaporanData): Promise<void> => {
    const targetChatId = data.chatId || DEFAULT_CHAT_ID;
    if (!targetChatId) {
        console.warn("Telegram Chat ID is not configured. Skipping notification.");
        return;
    }

    const dateObj = new Date(data.tanggal);
    const dateStr = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    const statsStr: Record<string, number> = {};
    const absentees: string[] = [];

    data.records.forEach(record => {
        const lowerStat = record.status?.toLowerCase();
        if (!statsStr[record.status]) {
            statsStr[record.status] = 0;
        }
        statsStr[record.status]++;

        if (lowerStat !== 'hadir') {
            const student = data.santriData.find(s => s.id === record.personId);
            if (student) {
                absentees.push(`- ${student.nama} (${student.marhalah} ${student.kelas}): ${record.status}`);
            }
        }
    });

    const message = `📢 *LAPORAN ABSENSI HALAQAH* 📢
📅 Tanggal: ${dateStr}
🕌 Sesi: ${data.waktu}
🏢 Marhalah: ${data.marhalah === 'all' ? 'Semua Marhalah' : data.marhalah}
🏢 Halaqah: ${data.halaqahName}

*📊 Rekap Kehadiran:*
${Object.entries(statsStr).map(([k, v]) => `• ${k}: ${v}`).join('\n')}

*📝 Santri Tidak Hadir / Terlambat:*
${absentees.length > 0 ? absentees.join('\n') : '✨ _Nihil (Semua Hadir)_'}`;

    await sendCustomTelegramMessage('', targetChatId, message);
};

export const getTelegramUpdates = async (_botToken: string, _offset?: number): Promise<any[]> => {
    // Polling getUpdates langsung dari browser dinonaktifkan demi keamanan token Bot Telegram.
    // Gunakan integrasi Webhook server-side (/api/telegram-webhook).
    return [];
};

export const sendCustomTelegramMessage = async (
    _botToken: string,
    chatId: string,
    message: string,
    santriId?: number
): Promise<boolean> => {
    if (!chatId && !santriId) {
        console.warn("Telegram Chat ID or Santri ID is not provided.");
        return false;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const jwt = sessionData?.session?.access_token;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (jwt) headers['Authorization'] = `Bearer ${jwt}`;

    const activeSupportOrgId = SupportSessionStore.getSession()?.organizationId || undefined;

    const proxyRes = await fetch('/api/notify/telegram', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            chatId,
            santriId,
            organizationId: activeSupportOrgId,
            message,
            parseMode: 'Markdown'
        })
    });

    const contentType = proxyRes.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        const proxyData = await proxyRes.json();
        if (proxyRes.ok && proxyData.success) {
            NotificationStore.addNotification(`Pesan Telegram berhasil dikirim ke ${chatId}`, 'success');
            return true;
        }
        const errMsg = proxyData.error || 'Gagal mengirim pesan Telegram melalui server.';
        NotificationStore.addNotification(`Gagal mengirim Telegram ke ${chatId}: ${errMsg}`, 'error');
        throw new Error(errMsg);
    }

    const fallbackErr = 'Respons server notifikasi tidak valid.';
    NotificationStore.addNotification(`Gagal mengirim Telegram ke ${chatId}: ${fallbackErr}`, 'error');
    throw new Error(fallbackErr);
};
