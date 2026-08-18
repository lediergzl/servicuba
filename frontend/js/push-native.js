// Push unificado para Web + APK.
import { apiFetch, notify } from './core.js';
import { isNativeApp, nativeRequestPushPermission, nativeRegisterPush, nativeAddPushListener } from './native.js';

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function saveNativeToken(token, platform = 'android') {
    if (!token || !localStorage.getItem('token')) return false;
    await apiFetch('/push/native-token', { method: 'POST', body: JSON.stringify({ token, platform }) });
    return true;
}

async function prepareNativePush() {
    if (!isNativeApp() || !localStorage.getItem('token')) return false;
    nativeAddPushListener('registration', async payload => {
        const token = payload?.value || payload?.token;
        if (!token) return;
        try { await saveNativeToken(token, payload?.platform || 'android'); }
        catch (err) { console.error('[ServiCuba Push] token nativo:', err); }
    });
    nativeAddPushListener('registrationError', err => console.error('[ServiCuba Push] registro:', err));
    nativeAddPushListener('pushNotificationReceived', notification => document.dispatchEvent(new CustomEvent('push:received', { detail: notification })));
    return true;
}

export async function initPush() {
    if (await prepareNativePush()) return;
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
            const permission = await nativeRequestPushPermission();
            if (permission === false || permission === 'denied') { notify('No activaste los permisos de notificación.', 'info'); return false; }
            await prepareNativePush();
            await nativeRegisterPush();
            notify('Notificaciones activadas.', 'success');
            return true;
        } catch (err) { notify(`No se pudieron activar las notificaciones: ${err.message || 'error nativo'}`, 'error'); return false; }
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { notify('Tu navegador no soporta notificaciones push.', 'error'); return false; }
    try {
        if (await Notification.requestPermission() !== 'granted') { notify('No activaste los permisos de notificación.', 'info'); return false; }
        const { publicKey } = await apiFetch('/push/vapid-public-key');
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
        await sendWebSubscription(subscription); notify('Notificaciones activadas.', 'success'); return true;
    } catch (err) { notify(`No se pudieron activar las notificaciones: ${err.message}`, 'error'); return false; }
}

async function sendWebSubscription(subscription) {
    const json = subscription.toJSON();
    await apiFetch('/push/subscribe', { method: 'POST', body: JSON.stringify({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }) });
}
