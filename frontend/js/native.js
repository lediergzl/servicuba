// Adaptador Capacitor para la web remota de ServiCuba.
// La app usa server.url, por lo que este código NO importa paquetes npm de
// Capacitor: dentro de la APK accede al bridge global inyectado por Capacitor;
// en un navegador normal simplemente informa que no hay plataforma nativa.
//
// IMPORTANTE: se quitó el uso del plugin Capacitor "PushNotifications"
// (push.requestPermissions / push.register). Ese plugin requiere Firebase
// Cloud Messaging configurado en el proyecto Android (google-services.json),
// y Firebase está bloqueado/no es confiable desde Cuba (embargo de EE.UU.).
// Llamarlo sin esa configuración provocaba un crash nativo de la app (no
// capturable desde JS). En su lugar usamos el plugin "LocalNotifications"
// (100% en el dispositivo, sin ningún servicio de Google) combinado con una
// conexión SSE al backend — ver push-native.js.

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

// --- Notificaciones locales (reemplazo de PushNotifications/Firebase) ---

export async function nativeRequestLocalNotifPermission() {
    const local = plugin('LocalNotifications');
    if (!isNativeApp() || !local?.requestPermissions) return null;
    const result = await local.requestPermissions();
    return result?.display || result;
}

let _localNotifIdCounter = 1;

export async function nativeShowLocalNotification(title, body, url = '/') {
    const local = plugin('LocalNotifications');
    if (!isNativeApp() || !local?.schedule) return null;
    const id = _localNotifIdCounter = (_localNotifIdCounter % 2147483647) + 1;
    return local.schedule({
        notifications: [{
            id,
            title,
            body,
            extra: { url },
            schedule: { at: new Date(Date.now() + 100) }
        }]
    });
}
