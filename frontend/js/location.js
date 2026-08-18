import { getGeolocation } from './core.js';
import { nativeGetCurrentPosition, isNativeApp } from './native.js';

const STORAGE_KEY = 'servicuba:lastLocation';

export async function getLocationWithFallback() {
    try {
        const pos = await getGeolocation();
        const location = {
            lat: Number(pos.coords.latitude),
            lng: Number(pos.coords.longitude),
            accuracy: pos.coords.accuracy || null,
            source: pos._servicubaSource || 'gps'
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
        return location;
    } catch {
        return null;
    }
}

export function getSavedLocation() {
    try {
        const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (!value || !Number.isFinite(Number(value.lat)) || !Number.isFinite(Number(value.lng))) return null;
        return {
            lat: Number(value.lat),
            lng: Number(value.lng),
            accuracy: value.accuracy || null,
            source: value.source || 'saved'
        };
    } catch {
        return null;
    }
}

export function clearSavedLocation() {
    localStorage.removeItem(STORAGE_KEY);
}

// Punto único de entrada para ubicación. Si la APK expone el puente nativo,
// usamos GPS nativo; la web normal sigue usando core.js/navigator.geolocation.
export async function getBestLocation() {
    if (isNativeApp()) {
        try {
            const pos = await nativeGetCurrentPosition();
            if (pos?.coords) {
                const location = {
                    lat: Number(pos.coords.latitude),
                    lng: Number(pos.coords.longitude),
                    accuracy: pos.coords.accuracy || null,
                    source: 'native-gps'
                };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
                return location;
            }
        } catch (err) {
            console.warn('[ServiCuba] GPS nativo no disponible, usando fallback web:', err);
        }
    }
    return getLocationWithFallback();
}
