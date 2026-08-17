import { getGeolocation, geolocationErrorMessage, showFormModal, notify } from './core.js';

const STORAGE_KEY = 'servicuba:lastLocation';

export async function getLocationWithFallback({ allowManual = true } = {}) {
    try {
        const pos = await getGeolocation();
        const location = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy || null,
            source: 'gps'
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
        return location;
    } catch (err) {
        const saved = getSavedLocation();
        const message = geolocationErrorMessage(err);

        const fields = [];
        if (saved) {
            fields.push({
                name: 'use_saved',
                label: `Usar última ubicación guardada (${saved.lat.toFixed(5)}, ${saved.lng.toFixed(5)})`,
                type: 'select',
                required: true,
                value: 'yes',
                options: [
                    { value: 'yes', label: 'Sí, usarla' },
                    { value: 'no', label: 'No, introducir otra' }
                ]
            });
        }
        if (allowManual) {
            fields.push(
                { name: 'lat', label: 'Latitud', type: 'number', required: !saved, step: '0.000001', placeholder: 'Ej: 23.1136' },
                { name: 'lng', label: 'Longitud', type: 'number', required: !saved, step: '0.000001', placeholder: 'Ej: -82.3666' }
            );
        }

        const retry = await showFormModal({
            title: 'Necesitamos tu ubicación',
            confirmLabel: 'Continuar',
            cancelLabel: 'Cancelar',
            fields: [
                { name: 'info', label: 'Permiso de ubicación', type: 'text', value: `${message} Si el navegador lo bloqueó, permite la ubicación para ServiCuba y vuelve a intentarlo.`, required: false },
                ...fields
            ]
        });

        if (retry === null) return null;

        if (saved && retry.use_saved === 'yes') return saved;

        const lat = Number(retry.lat);
        const lng = Number(retry.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            notify('La latitud o longitud no es válida.', 'error');
            return null;
        }

        const location = { lat, lng, accuracy: null, source: 'manual' };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
        return location;
    }
}

export function getSavedLocation() {
    try {
        const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (!value || !Number.isFinite(Number(value.lat)) || !Number.isFinite(Number(value.lng))) return null;
        return { lat: Number(value.lat), lng: Number(value.lng), accuracy: value.accuracy || null, source: value.source || 'saved' };
    } catch {
        return null;
    }
}

export function clearSavedLocation() {
    localStorage.removeItem(STORAGE_KEY);
}
