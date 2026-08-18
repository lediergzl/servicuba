// Puente opcional entre la web ServiCuba y la app Capacitor.
// La web NO importa paquetes de Capacitor directamente: eso rompería el
// navegador cuando la web se sirve desde servicuba.onrender.com.
//
// La APK puede exponer window.ServiCubaNative con:
//   geolocation.getCurrentPosition()
//   push.requestPermission()
//   push.register()
//   push.addListener(event, callback)
//
// Si el puente no existe, todo cae automáticamente a las APIs web.

export function isNativeApp() {
    return !!window.ServiCubaNative?.isNative;
}

export async function nativeGetCurrentPosition() {
    const fn = window.ServiCubaNative?.geolocation?.getCurrentPosition;
    if (!isNativeApp() || typeof fn !== 'function') return null;
    return fn();
}

export async function nativeRequestPushPermission() {
    const fn = window.ServiCubaNative?.push?.requestPermission;
    if (!isNativeApp() || typeof fn !== 'function') return null;
    return fn();
}

export async function nativeRegisterPush() {
    const fn = window.ServiCubaNative?.push?.register;
    if (!isNativeApp() || typeof fn !== 'function') return null;
    return fn();
}

export function nativeAddPushListener(event, callback) {
    const fn = window.ServiCubaNative?.push?.addListener;
    if (!isNativeApp() || typeof fn !== 'function') return null;
    return fn(event, callback);
}
