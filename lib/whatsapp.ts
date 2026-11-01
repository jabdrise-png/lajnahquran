import { NotificationStore } from './NotificationStore';
import { supabase } from './supabaseClient';

export const sendFonnteMessage = async (token: string, target: string, message: string, imageSource?: string): Promise<boolean> => {
    if (!target) {
        console.warn("Fonnte Target is not provided.");
        return false;
    }

    if (!imageSource) {
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const jwt = sessionData?.session?.access_token;
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (jwt) headers['Authorization'] = `Bearer ${jwt}`;

            const proxyRes = await fetch('/api/notify/whatsapp', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    target,
                    message,
                    apiToken: token || undefined
                })
            });

            const contentType = proxyRes.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                const proxyData = await proxyRes.json();
                if (proxyRes.ok && proxyData.success) {
                    NotificationStore.addNotification(`Berhasil mengirim WA ke ${target}`, 'success');
                    return true;
                }
                if (proxyData.error) {
                    NotificationStore.addNotification(`Gagal mengirim WA (Fonnte) ke ${target}: ${proxyData.error}`, 'error');
                    throw new Error(proxyData.error);
                }
            }
        } catch (proxyErr: any) {
            if (!token) {
                throw proxyErr;
            }
        }
    }

    if (!token) {
        console.warn("Fonnte Token is not provided.");
        return false;
    }

    const url = "https://api.fonnte.com/send";
    const formData = new FormData();
    formData.append('target', target);
    formData.append('message', message);
    
    if (imageSource) {
        if (imageSource.startsWith('data:image')) {
            // Convert base64 to Blob and send as 'file'
            const [header, base64Data] = imageSource.split(',');
            const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
            const binary = atob(base64Data);
            const array = [];
            for (let i = 0; i < binary.length; i++) {
                array.push(binary.charCodeAt(i));
            }
            const blob = new Blob([new Uint8Array(array)], { type: mime });
            formData.append('file', blob, 'chart.png');
        } else if (imageSource.startsWith('http')) {
            // Send as 'url'
            formData.append('url', imageSource);
        }
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': token
            },
            body: formData
        });

        const data = await response.json();
        if (!data.status) {
            console.error("Fonnte Error:", data);
            NotificationStore.addNotification(`Gagal mengirim WA (Fonnte) ke ${target}: ${data.reason}`, 'error');
            throw new Error(data.reason || "Gagal mengirim pesan via Fonnte");
        }
        NotificationStore.addNotification(`Berhasil mengirim WA ke ${target}`, 'success');
        return true;
    } catch (err: any) {
        console.error("Error sending Fonnte message:", err);
        NotificationStore.addNotification(`Gagal mengirim WA ke ${target}: ${err.message}`, 'error');
        throw err;
    }
};
