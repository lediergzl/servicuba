import { getGeolocation } from './core.js';

const STORAGE_KEY = 'servicuba:lastLocation';

/**
 * Fuente única para obtener la ubicación usada por mapa y descubrimiento.
 * core.getGeolocation ya contiene el flujo de recuperación (GPS, reintento,
 * ubicación guardada y ubicación manual), por lo que este módulo no debe
 * mostrar un segundo modal cuando el primer intento falla.
 */
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