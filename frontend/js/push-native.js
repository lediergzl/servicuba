// Notificaciones unificadas para Web + APK.
// Web: Web Push estándar con VAPID. APK: SSE + LocalNotifications.
import { apiFetch, notify } from './core.js';
import { isNativeApp, nativeRequestLocalNotifPermission, nativeShowLocalNotification } from './native.js';

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

let eventSource = null;
let nativeActionListenerAttached = false;
const SERVICE_WORKER_READY_TIMEOUT_MS = 8000;

function urlBaseUrl() { return window.location.origin; }
function apiBaseUrl() { return window.location.origin; }

async function readyWithTimeout(ms = SERVICE_WORKER_READY_TIMEOUT_MS) {
    if (!('serviceWorker' in navigator)) throw new Error('Service Worker no disponible');
    return Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('El Service Worker no respondió a tiempo')), ms))
    ]);
}

function attachNativeNotificationActionListener() {
    if (!isNativeApp() || nativeActionListenerAttached) return;
    const local = window.Capacitor?.Plugins?.LocalNotifications;
    if (!local?.addListener) return;
    nativeActionListenerAttached = true;
    local.addListener('localNotificationActionPerformed', event => {
        const url = event?.notification?.extra?.url;
        if (!url) return;
        window.location.href = url;
    });
}

function startNativeEventStream() {
    if (eventSource || !isNativeApp()) return;
    const token = localStorage.getItem('token'); if (!token) return;
    attachNativeNotificationActionListener();
    const url = `${apiBaseUrl()}/api/push/stream?token=${encodeURIComponent(token)}`;
    eventSource = new EventSource(url);
    eventSource.addEventListener('notificacion', async event => {
        try {
            const data = JSON.parse(event.data);
            await nativeShowLocalNotification(data.title, data.body, data.url);
            document.dispatchEvent(new CustomEvent('push:received', { detail: data }));
        } catch (err) { console.warn('[ServiCuba Push] evento SSE inválido:', err); }
    });
    eventSource.onerror = () => {};
}

function stopNativeEventStream() { if (eventSource) { eventSource.close(); eventSource = null; } }

document.addEventListener('visibilitychange', () => {
    if (!isNativeApp() || document.hidden || !localStorage.getItem('sc_notif_activadas')) return;
    stopNativeEventStream(); startNativeEventStream();
});

export async function initPush() {
    if (isNativeApp()) {
        attachNativeNotificationActionListener();
        if (localStorage.getItem('sc_notif_activadas') === '1') startNativeEventStream();
        return;
    }
    if (!localStorage.getItem('token') || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
        const registration = await readyWithTimeout();
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) await sendWebSubscription(subscription);
    } catch (err) { console.warn('[ServiCuba Push] init:', err); }
}

export async function enablePushNotifications() {
    if (isNativeApp()) {
        try {
            const permission = await nativeRequestLocalNotifPermission();
            if (permission === false || permission === 'denied') { notify('No activaste los permisos de notificación.', 'info'); return false; }
            attachNativeNotificationActionListener(); startNativeEventStream(); localStorage.setItem('sc_notif_activadas', '1');
            notify('Notificaciones activadas.', 'success'); return true;
        } catch (err) { notify(`No se pudieron activar las notificaciones: ${err.message || 'error'}`, 'error'); return false; }
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { notify('Tu navegador no soporta notificaciones push.', 'error'); return false; }
    try {
        if (await Notification.requestPermission() !== 'granted') { notify('No activaste los permisos de notificación.', 'info'); return false; }
        const { publicKey } = await apiFetch('/push/vapid-public-key');
        const registration = await readyWithTimeout();
        const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
        await sendWebSubscription(subscription); notify('Notificaciones activadas.', 'success'); return true;
    } catch (err) { notify(`No se pudieron activar las notificaciones: ${err.message}`, 'error'); return false; }
}

async function sendWebSubscription(subscription) {
    const json = subscription.toJSON();
    await apiFetch('/push/subscribe', { method: 'POST', body: JSON.stringify({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }) });
}
