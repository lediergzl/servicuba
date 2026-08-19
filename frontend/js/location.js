import { getGeolocation } from './core.js';
import { nativeGetCurrentPosition, isNativeApp } from './native.js';

const STORAGE_KEY = 'servicuba:lastLocation';

function normalizePosition(pos, source) {
    if (!pos?.coords) return null;
    const lat = Number(pos.coords.latitude);
    const lng = Number(pos.coords.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
        lat,
        lng,
        accuracy: pos.coords.accuracy || null,
        source
    };
}

function saveLocation(location) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
    return location;
}

// Punto único para GPS web.
export async function getLocationWithFallback() {
    try {
        const pos = await getGeolocation();
        const location = normalizePosition(pos, pos._servicubaSource || 'gps');
        return location ? saveLocation(location) : null;
    } catch {
        return null;
    }
}

// Punto único recomendado para TODA la aplicación: APK primero, web después.
export async function getBestLocation() {
    if (isNativeApp()) {
        try {
            const pos = await nativeGetCurrentPosition();
            const location = normalizePosition(pos, 'native-gps');
            if (location) return saveLocation(location);
        } catch (err) {
            console.warn('[ServiCuba] GPS nativo no disponible, usando GPS web:', err);
        }
    }
    return getLocationWithFallback();
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
