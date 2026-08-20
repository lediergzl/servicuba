// Notificaciones unificadas para Web + APK.
//
// - Web (navegador normal): sigue igual, Web Push estándar con VAPID
//   (registration.pushManager.subscribe), como ya lo tenías.
// - APK (Capacitor): en vez del plugin PushNotifications (requiere Firebase,
//   bloqueado/no confiable en Cuba y causaba el crash al presionar "Activar
//   notificaciones"), se abre una conexión SSE (Server-Sent Events) al
//   backend. El servidor empuja el evento apenas ocurre algo (nueva
//   postulación, mensaje, etc. — ver services/push_service.py en el
//   backend), sin que el cliente tenga que preguntar por polling. Al llegar
//   un evento se dispara una notificación LOCAL nativa (LocalNotifications),
//   generada 100% en el dispositivo.
//
// Limitación real de este enfoque: solo entrega mientras la app está
// abierta (primer o segundo plano). Si el usuario cierra la app del todo,
// no hay aviso hasta que la reabra — es el costo de no depender de Firebase.
import { apiFetch, notify } from './core.js';
import {
    isNativeApp,
    nativeRequestLocalNotifPermission,
    nativeShowLocalNotification,
} from './native.js';

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

// --- Conexión SSE (solo dentro de la APK) ---

let eventSource = null;

function apiBaseUrl() {
    // Ajusta si tu apiFetch usa una base distinta; por defecto la app y la
    // API viven en el mismo origen (servicuba.onrender.com).
    return window.location.origin;
}

function startNativeEventStream() {
    if (eventSource || !isNativeApp()) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    const url = `${apiBaseUrl()}/api/push/stream?token=${encodeURIComponent(token)}`;
    eventSource = new EventSource(url);

    eventSource.addEventListener('notificacion', async (event) => {
        try {
            const data = JSON.parse(event.data);
            await nativeShowLocalNotification(data.title, data.body, data.url);
            document.dispatchEvent(new CustomEvent('push:received', { detail: data }));
        } catch (err) {
            console.warn('[ServiCuba Push] evento SSE inválido:', err);
        }
    });

    eventSource.onerror = () => {
        // EventSource reintenta solo la reconexión; no hace falta manejarlo
        // manualmente. Si el token expiró, el próximo intento fallará con
        // 401 y el navegador dejará de reintentar — se resuelve solo en el
        // siguiente login (se llama startNativeEventStream() de nuevo).
    };
}

function stopNativeEventStream() {
    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }
}

// Reconecta el stream automáticamente si la app vuelve a primer plano
// (Android puede cortar la conexión en segundo plano).
document.addEventListener('visibilitychange', () => {
    if (!isNativeApp()) return;
    if (document.hidden) return;
    if (!localStorage.getItem('sc_notif_activadas')) return;
    stopNativeEventStream();
    startNativeEventStream();
});

// --- API pública ---

export async function initPush() {
    if (isNativeApp()) {
        if (localStorage.getItem('sc_notif_activadas') === '1') startNativeEventStream();
        return;
    }
    if (!localStorage.getItem('token') || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) await sendWebSubscription(subscription);
    } catch (err) { console.warn('[ServiCuba Push] init:', err); }
}

export async function enablePushNotifications() {
    if (isNativeApp()) {
        try {
            const permission = await nativeRequestLocalNotifPermission();
            if (permission === false || permission === 'denied') {
                notify('No activaste los permisos de notificación.', 'info');
                return false;
            }
            startNativeEventStream();
            localStorage.setItem('sc_notif_activadas', '1');
            notify('Notificaciones activadas.', 'success');
            return true;
        } catch (err) {
            notify(`No se pudieron activar las notificaciones: ${err.message || 'error'}`, 'error');
            return false;
        }
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        notify('Tu navegador no soporta notificaciones push.', 'error');
        return false;
    }
    try {
        if (await Notification.requestPermission() !== 'granted') {
            notify('No activaste los permisos de notificación.', 'info');
            return false;
        }
        const { publicKey } = await apiFetch('/push/vapid-public-key');
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        await sendWebSubscription(subscription);
        notify('Notificaciones activadas.', 'success');
        return true;
    } catch (err) {
        notify(`No se pudieron activar las notificaciones: ${err.message}`, 'error');
        return false;
    }
}

async function sendWebSubscription(subscription) {
    const json = subscription.toJSON();
    await apiFetch('/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }),
    });
}
