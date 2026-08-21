import { apiFetch, notify, showFormModal, getGeolocation, API_BASE } from './core.js';
import { switchView } from './tasks.js';
import { initLandingPublicExperience } from './landing-public-experience.js';

export let currentUser = null;

// La sesión vive exclusivamente en la cookie HttpOnly. El frontend nunca
// guarda ni reconstruye el JWT en localStorage/sessionStorage.
(function installSecureApiFetch() {
    if (window.__servicubaSecureFetch) return;
    const native = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : input?.url || '';
        const api = url.startsWith('/api/') || url.startsWith(window.location.origin + '/api/');
        if (!api) return native(input, init);

        const method = String(init.method || 'GET').toUpperCase();
        const headers = new Headers(init.headers);
        const csrf = document.cookie.match(/(?:^|; )servicuba_csrf=([^;]+)/);
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrf && !headers.has('X-CSRF-Token')) {
            headers.set('X-CSRF-Token', decodeURIComponent(csrf[1]));
        }
        return native(input, { ...init, headers, credentials: 'include' });
    };
    window.__servicubaSecureFetch = true;
})();

const phone = v => String(v || '').replace(/[\s().-]/g, '');
const email = v => String(v || '').trim().toLowerCase();
const validEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email(v));

function ensureEmail() {
    const form = document.getElementById('registerForm');
    if (!form || document.getElementById('regEmail')) return;
    const input = document.createElement('input');
    input.type = 'email'; input.id = 'regEmail'; input.className = 'field-input';
    input.placeholder = 'Correo electrónico'; input.required = true;
    document.getElementById('regTelefono')?.insertAdjacentElement('afterend', input);
}

async function verify(mail) {
    const data = await showFormModal({
        title: 'Verifica tu correo', confirmLabel: 'Verificar cuenta',
        fields: [{ name: 'codigo', label: 'Código de 6 dígitos enviado a tu correo', type: 'text', required: true, placeholder: '123456' }]
    });
    if (data === null) return false;
    try {
        await apiFetch('/auth/verify-email', { method: 'POST', body: JSON.stringify({ email: email(mail), codigo: String(data.codigo || '').trim() }) });
        notify('Correo verificado correctamente.', 'success');
        return true;
    } catch (error) {
        notify(error.message || 'Código incorrecto o expirado.', 'error');
        return false;
    }
}

export function initAuth() {
    ensureEmail();
    let lat = null, lng = null;
    const worker = document.getElementById('regEsTrabajador');
    worker?.addEventListener('change', e => {
        document.getElementById('categoriaField')?.classList.toggle('hidden', !e.target.checked);
        document.getElementById('ubicacionField')?.classList.toggle('hidden', !e.target.checked);
    });

    document.getElementById('registerForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const es_trabajador = !!worker?.checked;
        const data = {
            nombre: document.getElementById('regNombre')?.value.trim() || '',
            telefono: phone(document.getElementById('regTelefono')?.value),
            email: email(document.getElementById('regEmail')?.value),
            password: document.getElementById('regPassword')?.value || '', es_trabajador,
            categoria_id: es_trabajador ? (Number(document.getElementById('regCategoria')?.value) || null) : null,
            municipio: document.getElementById('regMunicipio')?.value.trim() || null,
            zona: document.getElementById('regZona')?.value.trim() || null, lat, lng
        };
        if (!data.nombre || !/^\+?[0-9]{7,20}$/.test(data.telefono) || !validEmail(data.email) || data.password.length < 8 || (es_trabajador && !data.categoria_id)) return notify('Revisa los datos del formulario.', 'error');
        try {
            await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(data) });
            notify('Cuenta creada. Revisa tu correo.', 'success');
            await verify(data.email); showLogin();
        } catch (error) { notify(error.message || 'No se pudo crear la cuenta.', 'error'); }
    });

    document.getElementById('loginForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const telefono = phone(document.getElementById('logTelefono')?.value);
        const password = document.getElementById('logPassword')?.value || '';
        if (!telefono || !password) return notify('Completa teléfono y contraseña.', 'error');
        try {
            const response = await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telefono, password }), credentials: 'include' });
            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(body?.detail || `Error ${response.status}`);
            currentUser = await apiFetch('/auth/me');
            document.getElementById('user-menu-guest')?.classList.add('hidden');
            document.getElementById('user-menu-auth')?.classList.remove('hidden');
            document.getElementById('bottomNav')?.classList.remove('hidden');
            document.getElementById('modoSwitch')?.classList.remove('hidden');
            document.body.classList.add('is-authenticated');
            notify('Sesión iniciada correctamente.', 'success');
            window.location.reload();
        } catch (error) { notify(`Error: ${error.message}`, 'error'); }
    });

    document.getElementById('getGpsBtn')?.addEventListener('click', async () => {
        try { const p = await getGeolocation(); lat = Number(p.coords.latitude); lng = Number(p.coords.longitude); notify('Ubicación obtenida.', 'success'); }
        catch { notify('No se pudo obtener la ubicación. Puedes continuar sin ella.', 'error'); }
    });
    document.getElementById('verifyPendingBtn')?.addEventListener('click', async () => {
        const data = await showFormModal({ title: 'Verificar correo', confirmLabel: 'Continuar', fields: [{ name: 'email', label: 'Correo electrónico', type: 'email', required: true }] });
        if (data) await verify(data.email);
    });
    document.getElementById('forgotPasswordBtn')?.addEventListener('click', async () => {
        const data = await showFormModal({ title: 'Recuperar contraseña', confirmLabel: 'Enviar código', fields: [{ name: 'email', label: 'Correo electrónico', type: 'email', required: true }] });
        if (!data) return;
        try {
            const result = await apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: email(data.email) }) });
            const next = await showFormModal({ title: 'Nueva contraseña', confirmLabel: 'Restablecer', fields: [{ name: 'codigo', label: `Código de 6 dígitos (válido ${result.expira_en_minutos} min)`, type: 'text', required: true }, { name: 'nueva_password', label: 'Nueva contraseña', type: 'password', required: true }] });
            if (next) {
                await apiFetch('/auth/reset-password', { method: 'POST', body: JSON.stringify({ email: email(data.email), codigo: String(next.codigo || '').trim(), nueva_password: next.nueva_password }) });
                notify('Contraseña actualizada.', 'success');
            }
        } catch (error) { notify(error.message || 'No se pudo recuperar la contraseña.', 'error'); }
    });
}

export function showLanding() { switchView('landing'); requestAnimationFrame(() => initLandingPublicExperience()); }
export function showRegister() { switchView('register'); }
export function showLogin() { switchView('login'); }
export async function logout() {
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch {}
    currentUser = null;
    window.location.reload();
}
