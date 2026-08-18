// ============================================================
// Notificaciones push (Web Push API + Service Worker)
// ============================================================
import { apiFetch, notify } from './core.js';
import './reputation-ui.js';

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export async function initPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        return; // navegador sin soporte — degradación silenciosa
    }
    if (!localStorage.getItem('token')) return;

    try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
            await sendSubscriptionToServer(existing);
            return;
        }
        // No pedimos permiso automáticamente al cargar la app: se pide
        // explícitamente desde el botón de "Activar notificaciones".
    } catch (err) {
        console.warn('Push init falló:', err);
    }
}

export async function enablePushNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        notify('Tu navegador no soporta notificaciones push.', 'error');
        return false;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            notify('No activaste los permisos de notificación.', 'info');
            return false;
        }

        const { publicKey } = await apiFetch('/push/vapid-public-key');
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
        });

        await sendSubscriptionToServer(subscription);
        notify('Notificaciones activadas.', 'success');
        return true;
    } catch (err) {
        notify(`No se pudieron activar las notificaciones: ${err.message}`, 'error');
        return false;
    }
}

async function sendSubscriptionToServer(subscription) {
    const json = subscription.toJSON();
    await apiFetch('/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({
            endpoint: json.endpoint,
            keys: { p256dh: json.keys.p256dh, auth: json.keys.auth }
        })
    });
}