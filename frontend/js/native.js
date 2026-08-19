// Adaptador Capacitor para la web remota de ServiCuba.
// La app usa server.url, por lo que este código NO importa paquetes npm de
// Capacitor: dentro de la APK accede al bridge global inyectado por Capacitor;
// en un navegador normal simplemente informa que no hay plataforma nativa.

function capacitor() {
    return window.Capacitor || null;
}

function plugin(name) {
    return capacitor()?.Plugins?.[name] || null;
}

export function isNativeApp() {
    const cap = capacitor();
    return !!cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform();
}

export function getNativePlatform() {
    const cap = capacitor();
    return typeof cap?.getPlatform === 'function' ? cap.getPlatform() : 'web';
}

export async function nativeGetCurrentPosition(options = {}) {
    const geo = plugin('Geolocation');
    if (!isNativeApp() || !geo?.getCurrentPosition) return null;

    if (geo.requestPermissions) {
        const permissions = await geo.requestPermissions();
        const status = permissions?.location || permissions?.coarseLocation;
        if (status && status !== 'granted') {
            throw new Error('Permiso de ubicación denegado');
        }
    }

    return geo.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000,
        ...options
    });
}

export async function nativeRequestPushPermission() {
    const push = plugin('PushNotifications');
    if (!isNativeApp() || !push?.requestPermissions) return null;
    const result = await push.requestPermissions();
    return result?.receive || result;
}

export async function nativeRegisterPush() {
    const push = plugin('PushNotifications');
    if (!isNativeApp() || !push?.register) return null;
    return push.register();
}

export function nativeAddPushListener(event, callback) {
    const push = plugin('PushNotifications');
    if (!isNativeApp() || !push?.addListener) return null;
    return push.addListener(event, callback);
}
