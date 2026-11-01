export interface AppNotification {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
    timestamp: Date;
    read: boolean;
}

type Listener = (notifications: AppNotification[]) => void;

class NotificationStoreImpl {
    private notifications: AppNotification[] = [];
    private listeners: Set<Listener> = new Set();

    addNotification(message: string, type: 'success' | 'error' | 'info' = 'info') {
        const notification: AppNotification = {
            id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
            message,
            type,
            timestamp: new Date(),
            read: false
        };
        // Keep only last 50 notifications
        this.notifications = [notification, ...this.notifications].slice(0, 50);
        this.notifyListeners();
    }

    markAsRead(id: string) {
        this.notifications = this.notifications.map(n => 
            n.id === id ? { ...n, read: true } : n
        );
        this.notifyListeners();
    }

    markAllAsRead() {
        this.notifications = this.notifications.map(n => ({ ...n, read: true }));
        this.notifyListeners();
    }

    clearAll() {
        this.notifications = [];
        this.notifyListeners();
    }

    getNotifications() {
        return this.notifications;
    }

    subscribe(listener: Listener) {
        this.listeners.add(listener);
        listener(this.notifications);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private notifyListeners() {
        this.listeners.forEach(listener => listener(this.notifications));
    }
}

export const NotificationStore = new NotificationStoreImpl();
