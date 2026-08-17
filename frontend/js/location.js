import { getGeolocation, geolocationErrorMessage, showFormModal, notify } from './core.js';

const STORAGE_KEY = 'servicuba:lastLocation';

async function requestGps() {
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
        return { error: err };
    }
}

function buildRecoveryFields(saved, allowManual, message) {
    const fields = [
        {
            name: 'action',
            label: 'Cómo quieres continuar',
            type: 'select',
            required: true,
            value: 'retry',
            options: [
                { value: 'retry', label: 'Volver a intentar ubicación del navegador' },
                ...(saved ? [{ value: 'saved', label: 'Usar última ubicación guardada' }] : []),
                ...(allowManual ? [{ value: 'manual', label: 'Introducir ubicación manualmente' }] : [])
            ]
        }
    ];

    if (allowManual) {
        fields.push(
            { name: 'lat', label: 'Latitud (solo si eliges manual)', type: 'number', required: false, step: '0.000001', placeholder: 'Ej: 23.1136' },
            { name: 'lng', label: 'Longitud (solo si eliges manual)', type: 'number', required: false, step: '0.000001', placeholder: 'Ej: -82.3666' }
        );
    }

    return [
        {
            name: 'info',
            label: 'Estado',
            type: 'text',
            value: `${message} Si aparece un aviso del navegador, selecciona Permitir para ServiCuba.`,
            required: false
        },
        ...fields
    ];
}

export async function getLocationWithFallback({ allowManual = true } = {}) {
    let first = await requestGps();
    if (!first.error) return first;

    while (true) {
        const saved = getSavedLocation();
        const message = geolocationErrorMessage(first.error);
        const result = await showFormModal({
            title: 'Necesitamos tu ubicación',
            confirmLabel: 'Continuar',
            cancelLabel: 'Cancelar',
            fields: buildRecoveryFields(saved, allowManual, message)
        });

        if (result === null) return null;

        if (result.action === 'saved' && saved) return saved;

        if (result.action === 'manual' && allowManual) {
            const lat = Number(result.lat);
            const lng = Number(result.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                notify('La latitud o longitud no es válida.', 'error');
                continue;
            }

            const location = { lat, lng, accuracy: null, source: 'manual' };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
            return location;
        }

        if (result.action === 'retry') {
            const retry = await requestGps();
            if (!retry.error) return retry;

            first = retry;
            notify(`${geolocationErrorMessage(retry.error)} Puedes volver a intentarlo, usar una ubicación guardada o introducirla manualmente.`, 'error');
        }
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