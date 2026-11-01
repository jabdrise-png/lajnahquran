import { NotificationStore } from './NotificationStore';
import { AttendanceStatus } from '../types';

interface AttendanceStats {
    total: number;
    hadir: number;
    sakit: number;
    izin: number;
    alpha: number;
    terlambat: number;
    dateStr: string;
    waktu: string;
    marhalah?: string;
}

interface StudentRecord {
    nama: string;
    kelas?: string;
    status: AttendanceStatus;
    keterangan?: string;
}

export function generateMessageText(stats: AttendanceStats, students: StudentRecord[], platform: 'WA' | 'TELEGRAM') {
    const bold = '*';
    const italic = '_';

    let msg = `${bold}LAPORAN KEHADIRAN HALAQAH${bold}\n`;
    msg += `Tanggal: ${stats.dateStr}\n`;
    if (stats.marhalah && stats.marhalah !== 'all') {
        msg += `Marhalah: ${stats.marhalah}\n`;
    }
    msg += `Waktu: ${stats.waktu}\n\n`;

    msg += `${bold}📊 Statistik Kehadiran:${bold}\n`;
    msg += `• Total Peserta  : ${stats.total}\n`;
    msg += `• Hadir        : ${stats.hadir}\n`;
    msg += `• Sakit        : ${stats.sakit}\n`;
    msg += `• Izin         : ${stats.izin}\n`;
    msg += `• Alpha        : ${stats.alpha}\n`;
    msg += `• Terlambat    : ${stats.terlambat}\n\n`;

    const order: Record<string, number> = { 
        'Sakit': 1, 
        'Izin': 2, 
        'Alpa': 3, 
        'Terlambat': 4,
        'Hadir': 5
    };
    
    // Convert to lowercase to check order securely depending on casing
    const getOrder = (status: string) => {
        const lower = status.toLowerCase();
        if (lower === 'sakit') return 1;
        if (lower === 'izin') return 2;
        if (lower === 'alpa') return 3;
        if (lower === 'terlambat') return 4;
        if (lower === 'hadir') return 5;
        return 99;
    };

    const absents = students.filter(s => s.status?.toLowerCase() !== 'hadir')
        .sort((a, b) => getOrder(a.status) - getOrder(b.status));

    if (absents.length > 0) {
        msg += `${bold}📋 Daftar Peserta Absen/Terlambat:${bold}\n`;
        absents.forEach((s, idx) => {
            const ket = s.keterangan ? ` - ${s.keterangan}` : '';
            const kelasLabel = s.kelas ? `[${s.kelas}] ` : '';
            msg += `${idx + 1}. ${kelasLabel}${s.nama} (${s.status})${ket}\n`;
        });
    } else {
        msg += `${italic}Alhamdulillah, seluruh peserta hadir tepat waktu.${italic}\n`;
    }

    msg += `\n${italic}Pesan ini dikirim secara otomatis oleh sistem pencatatan absensi.${italic}`;
    return msg;
}

export async function sendMessageTelegram(botToken: string, chatId: string, text: string) {
    if (!chatId) return false;
    try {
        const proxyRes = await fetch('/api/notify/telegram', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatId,
                message: text,
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
        }
    } catch (e) {
        // Fallback to direct call below
    }

    if (!botToken) return false;
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: "Markdown" }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error("Telegram API Error:", errorText);
            NotificationStore.addNotification(`Gagal mengirim Telegram ke ${chatId}`, 'error');
            return false;
        }
        NotificationStore.addNotification(`Pesan Telegram berhasil dikirim ke ${chatId}`, 'success');
        return true;
    } catch (e: any) {
        console.error("Failed to send Telegram message", e);
        NotificationStore.addNotification(`Gagal mengirim Telegram ke ${chatId}: ${e.message}`, 'error');
        return false;
    }
}

export async function sendMessageFonnte(apiToken: string, targetNetwork: string, text: string) {
    if (!targetNetwork) return false;
    try {
        const proxyRes = await fetch('/api/notify/whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                target: targetNetwork,
                message: text,
                apiToken: apiToken || undefined
            })
        });
        const contentType = proxyRes.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const proxyData = await proxyRes.json();
            if (proxyRes.ok && proxyData.success) {
                NotificationStore.addNotification(`Pesan WA berhasil dikirim ke ${targetNetwork}`, 'success');
                return true;
            }
        }
    } catch (e) {
        // Fallback to direct call below
    }

    if (!apiToken) return false;
    const url = "https://api.fonnte.com/send";
    const payload = new URLSearchParams();
    payload.append('target', targetNetwork);
    payload.append('message', text);

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Authorization": apiToken, "Content-Type": "application/x-www-form-urlencoded" },
            body: payload.toString(),
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error("Fonnte API Error:", errorText);
            NotificationStore.addNotification(`Gagal mengirim WA (Fonnte) ke ${targetNetwork}`, 'error');
            return false;
        }
        NotificationStore.addNotification(`Pesan WA berhasil dikirim ke ${targetNetwork}`, 'success');
        return true;
    } catch (e: any) {
        console.error("Failed to send Fonnte message", e);
        NotificationStore.addNotification(`Gagal mengirim WA ke ${targetNetwork}: ${e.message}`, 'error');
        return false;
    }
}
