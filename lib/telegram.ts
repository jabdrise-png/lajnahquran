import { AttendanceRecord, Waktu, Marhalah, Person } from '../types';
import { NotificationStore } from './NotificationStore';
import { supabase } from './supabaseClient';

// Get Telegram credentials from environment variables
const BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
const CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID;

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
}

export const sendTelegramNotification = async (data: LaporanData): Promise<void> => {
    // Only attempt if credentials are provided
    if (!BOT_TOKEN || !CHAT_ID) {
        console.warn("Telegram Bot Token or Chat ID is not configured. Skipping notification.");
        return;
    }

    // Format the date (assuming 'YYYY-MM-DD', convert to 'DD MMMM YYYY')
    const dateObj = new Date(data.tanggal);
    const dateStr = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    // Calculate summary statistics
    let statsStr: Record<string, number> = {};
    
    // Group abscences
    const absentees: string[] = [];

    data.records.forEach(record => {
        const lowerStat = record.status?.toLowerCase();
        // Increment stats
        if (!statsStr[record.status]) {
            statsStr[record.status] = 0;
        }
        statsStr[record.status]++;
        
        // Track non-hadir
        if (lowerStat !== 'hadir') {
            const student = data.santriData.find(s => s.id === record.personId);
            if (student) {
                // If we also track "keterangan" later it can be appended here
                absentees.push(`- ${student.nama} (${student.marhalah} ${student.kelas}): ${record.status}`);
            }
        }
    });

    // Formatting message string
    const message = `📢 *LAPORAN ABSENSI HALAQAH* 📢
📅 Tanggal: ${dateStr}
🕌 Sesi: ${data.waktu}
🏢 Marhalah: ${data.marhalah === 'all' ? 'Semua Marhalah' : data.marhalah}
🏢 Halaqah: ${data.halaqahName}

*📊 Rekap Kehadiran:*
${Object.entries(statsStr).map(([k, v]) => `• ${k}: ${v}`).join('\n')}

*📝 Santri Tidak Hadir / Terlambat:*
${absentees.length > 0 ? absentees.join('\n') : '✨ _Nihil (Semua Hadir)_'}

Informasi lebih lengkap silahkan lihat di website berikut: https://lajnahquran.web.id`;

    // Dispatch to Telegram API
    const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const payload = {
        chat_id: CHAT_ID,
        text: message,
        parse_mode: "Markdown"
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const resData = await response.json();
             console.error("Failed to send telegram message:", resData);
             NotificationStore.addNotification(`Gagal mengirim laporan Telegram: ${resData.description}`, 'error');
        } else {
             console.log("Telegram notification sent successfully!");
             NotificationStore.addNotification(`Laporan berhasil dikirim ke Telegram grup`, 'success');
        }
    } catch (err: any) {
        console.error("Error connecting to telegram API:", err);
        NotificationStore.addNotification(`Gagal mengirim laporan Telegram: ${err.message}`, 'error');
    }
};

export const getTelegramUpdates = async (botToken: string, offset?: number): Promise<any[]> => {
    if (!botToken) {
        console.warn("Telegram Bot Token is not provided.");
        return [];
    }

    const API_URL = `https://api.telegram.org/bot${botToken}/getUpdates${offset ? `?offset=${offset}` : ''}`;
    try {
        const response = await fetch(API_URL);
        if (!response.ok) {
            console.error("Failed to fetch updates");
            return [];
        }
        const resData = await response.json();
        return resData.result || [];
    } catch (err) {
        console.error("Error connecting to telegram API:", err);
        return [];
    }
};

export const sendCustomTelegramMessage = async (botToken: string, chatId: string, message: string): Promise<boolean> => {
    if (!chatId) {
        console.warn("Telegram Chat ID is not provided.");
        return false;
    }

    try {
        const { data: sessionData } = await supabase.auth.getSession();
        const jwt = sessionData?.session?.access_token;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (jwt) headers['Authorization'] = `Bearer ${jwt}`;

        const proxyRes = await fetch('/api/notify/telegram', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                chatId,
                message,
                botToken: botToken || undefined,
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
            if (proxyData.error) {
                NotificationStore.addNotification(`Gagal mengirim Telegram ke ${chatId}: ${proxyData.error}`, 'error');
                throw new Error(proxyData.error);
            }
        }
    } catch (proxyErr: any) {
        if (!botToken) {
            throw proxyErr;
        }
    }

    if (!botToken) {
        console.warn("Telegram Bot Token is not provided.");
        return false;
    }

    const API_URL = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const payload = {
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown"
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const resData = await response.json();
            console.error("Failed to send telegram message:", resData);
            NotificationStore.addNotification(`Gagal mengirim Telegram ke ${chatId}: ${resData.description}`, 'error');
            throw new Error(resData.description || "Failed to send message");
        }
        NotificationStore.addNotification(`Pesan Telegram berhasil dikirim ke ${chatId}`, 'success');
        return true;
    } catch (err: any) {
        console.error("Error connecting to telegram API:", err);
        NotificationStore.addNotification(`Gagal mengirim Telegram ke ${chatId}: ${err.message}`, 'error');
        throw err;
    }
};
