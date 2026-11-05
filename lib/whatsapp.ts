import { NotificationStore } from './NotificationStore';
import { supabase } from './supabaseClient';

export const sendFonnteMessage = async (_token: string, target: string, message: string, _imageSource?: string): Promise<boolean> => {
    if (!target) {
        console.warn("Fonnte Target is not provided.");
        return false;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const jwt = sessionData?.session?.access_token;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (jwt) headers['Authorization'] = `Bearer ${jwt}`;

    const proxyRes = await fetch('/api/notify/whatsapp', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            target,
            message
        })
    });

    const contentType = proxyRes.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        const proxyData = await proxyRes.json();
        if (proxyRes.ok && proxyData.success) {
            NotificationStore.addNotification(`Berhasil mengirim WA ke ${target}`, 'success');
            return true;
        }
        const errMsg = proxyData.error || 'Gagal mengirim pesan WA melalui server.';
        NotificationStore.addNotification(`Gagal mengirim WA (Fonnte) ke ${target}: ${errMsg}`, 'error');
        throw new Error(errMsg);
    }

    const fallbackErr = 'Respons server notifikasi WA tidak valid.';
    NotificationStore.addNotification(`Gagal mengirim WA ke ${target}: ${fallbackErr}`, 'error');
    throw new Error(fallbackErr);
};
