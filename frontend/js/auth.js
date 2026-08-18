// ============================================================
// Registro / Login / Logout
// ============================================================
import { apiFetch, notify, showFormModal, getGeolocation } from './core.js';
import { switchView } from './tasks.js';
import { initLandingPublicExperience } from './landing-public-experience.js';

export let currentUser = null;

function normalizePhone(value) {
    return String(value || '').replace(/[\s().-]/g, '');
}

function validateRegistration(data, esTrabajador) {
    if (!data.nombre || data.nombre.trim().length < 2) return 'Escribe tu nombre completo.';
    if (!/^\+?[0-9]{7,20}$/.test(normalizePhone(data.telefono))) return 'Escribe un teléfono válido.';
    if (!data.password || data.password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
    if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(data.password) || !/[0-9]/.test(data.password)) {
        return 'La contraseña debe incluir al menos una letra y un número.';
    }
    if (esTrabajador && !data.categoria_id) return 'Selecciona el oficio o categoría que ofreces.';
    return null;
}

export function initAuth() {
    const registerForm = document.getElementById('registerForm');
    const loginForm = document.getElementById('loginForm');
    const regEsTrabajador = document.getElementById('regEsTrabajador');
    let regLastLat = null;
    let regLastLng = null;

    if (regEsTrabajador) {
        regEsTrabajador.addEventListener('change', (e) => {
            const show = e.target.checked;
            document.getElementById('categoriaField')?.classList.toggle('hidden', !show);
            document.getElementById('ubicacionField')?.classList.toggle('hidden', !show);
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = registerForm.querySelector('button[type="submit"]');
            const esTrabajador = document.getElementById('regEsTrabajador')?.checked || false;
            const rawPhone = document.getElementById('regTelefono')?.value || '';
            const data = {
                nombre: document.getElementById('regNombre')?.value.trim() || '',
                telefono: normalizePhone(rawPhone),
                password: document.getElementById('regPassword')?.value || '',
                es_trabajador: esTrabajador,
                categoria_id: esTrabajador ? (parseInt(document.getElementById('regCategoria')?.value || '', 10) || null) : null,
                municipio: document.getElementById('regMunicipio')?.value.trim() || null,
                zona: document.getElementById('regZona')?.value.trim() || null,
                lat: Number.isFinite(regLastLat) ? regLastLat : null,
                lng: Number.isFinite(regLastLng) ? regLastLng : null
            };

            const validationError = validateRegistration(data, esTrabajador);
            if (validationError) {
                notify(validationError, 'error');
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Creando cuenta…';
            }

            try {
                await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(data) });
                notify('Cuenta creada correctamente. Ahora inicia sesión.', 'success');
                showLogin();
            } catch (err) {
                // apiFetch already translates FastAPI 422 into the exact field/message.
                notify(err.message || 'No se pudo crear la cuenta.', 'error');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Registrarse';
                }
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = loginForm.querySelector('button[type="submit"]');
            const data = {
                telefono: normalizePhone(document.getElementById('logTelefono')?.value || ''),
                password: document.getElementById('logPassword')?.value || ''
            };
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Ingresando…';
            }
            try {
                const tokenData = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(data) });
                localStorage.setItem('token', tokenData.access_token);
                window.location.reload();
            } catch (err) {
                notify(`Error: ${err.message}`, 'error');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Ingresar';
                }
            }
        });
    }

    document.getElementById('getGpsBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('getGpsBtn');
        if (!btn) return;
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Obteniendo ubicación…';
        try {
            const pos = await getGeolocation();
            const lat = Number(pos.coords.latitude);
            const lng = Number(pos.coords.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Coordenadas inválidas');
            regLastLat = lat;
            regLastLng = lng;
            btn.textContent = '✓ Ubicación obtenida';
            notify('Ubicación GPS obtenida correctamente.', 'success');
        } catch (err) {
            notify('No se pudo obtener la ubicación. Puedes continuar sin ella.', 'error');
            btn.textContent = originalText;
        } finally {
            btn.disabled = false;
        }
    });

    initForgotPassword();
}

function initForgotPassword() {
    document.getElementById('forgotPasswordBtn')?.addEventListener('click', async () => {
        const step1 = await showFormModal({ title: 'Recuperar contraseña', confirmLabel: 'Enviar código', fields: [{ name: 'telefono', label: 'Teléfono', type: 'tel', required: true }] });
        if (step1 === null) return;
        let resp;
        try {
            resp = await apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ telefono: normalizePhone(step1.telefono) }) });
        } catch (err) {
            notify(`Error: ${err.message}`, 'error');
            return;
        }
        if (resp.codigo_demo) notify(`Código de recuperación (demo): ${resp.codigo_demo}`, 'info'); else notify(resp.message, 'info');
        const step2 = await showFormModal({ title: 'Nueva contraseña', confirmLabel: 'Restablecer', fields: [{ name: 'codigo', label: `Código de 6 dígitos (válido ${resp.expira_en_minutos} min)`, type: 'text', required: true, placeholder: '123456' }, { name: 'nueva_password', label: 'Nueva contraseña', type: 'password', required: true }] });
        if (step2 === null) return;
        try {
            await apiFetch('/auth/reset-password', { method: 'POST', body: JSON.stringify({ telefono: normalizePhone(step1.telefono), codigo: step2.codigo.trim(), nueva_password: step2.nueva_password }) });
            notify('Contraseña actualizada. Ya puedes iniciar sesión.', 'success');
        } catch (err) {
            notify(`Error: ${err.message}`, 'error');
        }
    });
}

export function showLanding() {
    switchView('landing');
    requestAnimationFrame(() => initLandingPublicExperience());
}

export function showRegister() { switchView('register'); }
export function showLogin() { switchView('login'); }
export function logout() { localStorage.removeItem('token'); window.location.reload(); }