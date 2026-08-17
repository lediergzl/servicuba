// ============================================================
// Núcleo compartido: fetch autenticado, UI (toasts/modales),
// geolocalización. Usado por tasks.js, auth.js, chat.js,
// push.js y verification.js — un solo lugar para no duplicar
// lógica de red/errores entre módulos.
// ============================================================

export const API_BASE = '/api';

export function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

export async function apiFetch(path, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
    };
    let res;
    try {
        res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    } catch (networkError) {
        throw new Error('No se pudo conectar con el servidor. Revisa tu conexión.');
    }
    if (res.status === 401) {
        localStorage.removeItem('token');
        notify('Tu sesión expiró. Inicia sesión de nuevo.', 'error');
        document.dispatchEvent(new CustomEvent('auth:expired'));
        throw new Error('No autorizado');
    }
    let data = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.detail || `Error ${res.status}`);
    return data;
}

export function ensureUiRoot() {
    let root = document.getElementById('ui-overlay-root');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'ui-overlay-root';
    document.body.appendChild(root);
    const toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'toast-container';
    root.appendChild(toastContainer);
    return root;
}

export function notify(message, type = 'info') {
    ensureUiRoot();
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'status');
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

export function showFormModal({ title, fields, confirmLabel = 'Guardar', cancelLabel = 'Cancelar' }) {
    ensureUiRoot();
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        const modal = document.createElement('form');
        modal.className = 'modal-card';
        modal.noValidate = true;
        const heading = document.createElement('h2');
        heading.className = 'modal-title';
        heading.textContent = title;
        modal.appendChild(heading);
        const inputs = {};
        fields.forEach(field => {
            const wrapper = document.createElement('div');
            wrapper.className = 'field-wrapper';
            const label = document.createElement('label');
            label.className = 'field-label';
            label.textContent = field.label;
            wrapper.appendChild(label);
            let input;
            if (field.type === 'textarea') {
                input = document.createElement('textarea');
                input.rows = 3;
            } else if (field.type === 'select') {
                input = document.createElement('select');
                (field.options || []).forEach(opt => {
                    const optionEl = document.createElement('option');
                    optionEl.value = opt.value;
                    optionEl.textContent = opt.label;
                    input.appendChild(optionEl);
                });
            } else {
                input = document.createElement('input');
                input.type = field.type || 'text';
                if (field.min !== undefined) input.min = field.min;
                if (field.step !== undefined) input.step = field.step;
            }
            input.className = 'field-input';
            if (field.type !== 'select') input.placeholder = field.placeholder || '';
            if (field.required) input.required = true;
            if (field.value !== undefined) input.value = field.value;
            const errorMsg = document.createElement('p');
            errorMsg.className = 'field-error hidden';
            wrapper.appendChild(input);
            wrapper.appendChild(errorMsg);
            inputs[field.name] = { input, errorMsg, field };
            modal.appendChild(wrapper);
        });
        const actions = document.createElement('div');
        actions.className = 'modal-actions';
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn btn-ghost';
        cancelBtn.textContent = cancelLabel;
        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'submit';
        confirmBtn.className = 'btn btn-primary';
        confirmBtn.textContent = confirmLabel;
        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);
        modal.appendChild(actions);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        Object.values(inputs)[0]?.input.focus();
        function close(result) {
            overlay.remove();
            document.removeEventListener('keydown', onKeydown);
            resolve(result);
        }
        function onKeydown(e) { if (e.key === 'Escape') close(null); }
        document.addEventListener('keydown', onKeydown);
        cancelBtn.addEventListener('click', () => close(null));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
        modal.addEventListener('submit', (e) => {
            e.preventDefault();
            let valid = true;
            const values = {};
            for (const [name, { input, errorMsg, field }] of Object.entries(inputs)) {
                errorMsg.classList.add('hidden');
                if (field.type === 'select') { values[name] = input.value; continue; }
                const raw = input.value.trim();
                if (field.required && !raw) {
                    errorMsg.textContent = 'Este campo es obligatorio.';
                    errorMsg.classList.remove('hidden');
                    valid = false;
                    continue;
                }
                if (field.type === 'number' && raw) {
                    const num = parseFloat(raw);
                    if (isNaN(num) || (field.min !== undefined && num < field.min)) {
                        errorMsg.textContent = `Debe ser un número válido ${field.min !== undefined ? `(mínimo ${field.min})` : ''}.`;
                        errorMsg.classList.remove('hidden');
                        valid = false;
                        continue;
                    }
                    values[name] = num;
                } else values[name] = raw;
            }
            if (valid) close(values);
        });
    });
}

export function showConfirm({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false }) {
    ensureUiRoot();
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        const modal = document.createElement('div');
        modal.className = 'modal-card';
        const heading = document.createElement('h2');
        heading.className = 'modal-title';
        heading.textContent = title;
        modal.appendChild(heading);
        if (message) {
            const p = document.createElement('p');
            p.className = 'modal-message';
            p.textContent = message;
            modal.appendChild(p);
        }
        const actions = document.createElement('div');
        actions.className = 'modal-actions';
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn btn-ghost';
        cancelBtn.textContent = cancelLabel;
        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';
        confirmBtn.textContent = confirmLabel;
        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);
        modal.appendChild(actions);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        function close(result) { overlay.remove(); resolve(result); }
        cancelBtn.addEventListener('click', () => close(false));
        confirmBtn.addEventListener('click', () => close(true));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    });
}

const SAVED_LOCATION_KEY = 'servicuba:lastLocation';

function readSavedLocation() {
    try {
        const value = JSON.parse(localStorage.getItem(SAVED_LOCATION_KEY) || 'null');
        if (!value || !Number.isFinite(Number(value.lat)) || !Number.isFinite(Number(value.lng))) return null;
        return { lat: Number(value.lat), lng: Number(value.lng), accuracy: value.accuracy || null, source: value.source || 'saved' };
    } catch { return null; }
}

function toPosition(location) {
    return { coords: { latitude: location.lat, longitude: location.lng, accuracy: location.accuracy || null }, _servicubaSource: location.source || 'saved' };
}

function requestBrowserGeolocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Tu navegador no soporta geolocalización.'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            position => {
                const location = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy || null,
                    source: 'gps'
                };
                localStorage.setItem(SAVED_LOCATION_KEY, JSON.stringify(location));
                resolve(position);
            },
            reject,
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
    });
}

async function recoverGeolocation(initialError) {
    let error = initialError;
    while (true) {
        const saved = readSavedLocation();
        const result = await showFormModal({
            title: 'Necesitamos tu ubicación',
            confirmLabel: 'Continuar',
            cancelLabel: 'Cancelar',
            fields: [
                {
                    name: 'action',
                    label: 'Cómo quieres continuar',
                    type: 'select',
                    required: true,
                    value: saved ? 'saved' : 'retry',
                    options: [
                        { value: 'retry', label: 'Volver a intentar ubicación del navegador' },
                        ...(saved ? [{ value: 'saved', label: 'Usar última ubicación guardada' }] : []),
                        { value: 'manual', label: 'Introducir ubicación manualmente' }
                    ]
                },
                { name: 'lat', label: 'Latitud', type: 'number', required: false, step: '0.000001', placeholder: 'Ej: 23.1136' },
                { name: 'lng', label: 'Longitud', type: 'number', required: false, step: '0.000001', placeholder: 'Ej: -82.3666' }
            ]
        });

        if (!result) throw error;
        if (result.action === 'saved' && saved) return toPosition(saved);
        if (result.action === 'manual') {
            const lat = Number(result.lat);
            const lng = Number(result.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                notify('La latitud o longitud no es válida.', 'error');
                continue;
            }
            const location = { lat, lng, accuracy: null, source: 'manual' };
            localStorage.setItem(SAVED_LOCATION_KEY, JSON.stringify(location));
            return toPosition(location);
        }
        try {
            return await requestBrowserGeolocation();
        } catch (retryError) {
            error = retryError;
            notify(`${geolocationErrorMessage(retryError)} Puedes volver a intentarlo, usar una ubicación guardada o introducirla manualmente.`, 'error');
        }
    }
}

export async function getGeolocation() {
    try { return await requestBrowserGeolocation(); }
    catch (err) { return recoverGeolocation(err); }
}

export function geolocationErrorMessage(err) {
    switch (err.code) {
        case err.PERMISSION_DENIED: return 'Activa el permiso de ubicación para continuar.';
        case err.POSITION_UNAVAILABLE: return 'No se pudo determinar tu ubicación. Verifica el GPS.';
        case err.TIMEOUT: return 'La solicitud de ubicación tardó demasiado. Intenta de nuevo.';
        default: return 'No se pudo obtener tu ubicación.';
    }
}
