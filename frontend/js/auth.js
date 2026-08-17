// ============================================================
// Registro / Login / Logout
// ============================================================
import { apiFetch, notify, showFormModal, getGeolocation } from './core.js';
import { switchView } from './tasks.js';
import { initLandingPublicExperience } from './landing-public-experience.js';

export let currentUser = null;

export function initAuth() {
    const registerForm = document.getElementById('registerForm');
    const loginForm = document.getElementById('loginForm');
    const regEsTrabajador = document.getElementById('regEsTrabajador');
    if (regEsTrabajador) {
        regEsTrabajador.addEventListener('change', (e) => {
            const show = e.target.checked;
            document.getElementById('categoriaField').classList.toggle('hidden', !show);
            document.getElementById('ubicacionField').classList.toggle('hidden', !show);
        });
    }
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = registerForm.querySelector('button[type="submit"]');
            const esTrabajador = document.getElementById('regEsTrabajador')?.checked || false;
            const data = { nombre: document.getElementById('regNombre').value, telefono: document.getElementById('regTelefono').value, password: document.getElementById('regPassword').value, es_trabajador: esTrabajador, categoria_id: esTrabajador ? (parseInt(document.getElementById('regCategoria')?.value || 0) || null) : null, municipio: document.getElementById('regMunicipio')?.value || null, zona: document.getElementById('regZona')?.value || null, lat: regLastLat, lng: regLastLng };
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Creando cuenta…'; }
            try { await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(data) }); notify('Registro exitoso. Ahora inicia sesión.', 'success'); showLogin(); } catch (err) { notify(`Error: ${err.message}`, 'error'); } finally { if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Registrarse'; } }
        });
    }
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault(); const submitBtn = loginForm.querySelector('button[type="submit"]'); const data = { telefono: document.getElementById('logTelefono').value, password: document.getElementById('logPassword').value };
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Ingresando…'; }
            try { const tokenData = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(data) }); localStorage.setItem('token', tokenData.access_token); window.location.reload(); } catch (err) { notify(`Error: ${err.message}`, 'error'); } finally { if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Ingresar'; } }
        });
    }
    let regLastLat = null;
    let regLastLng = null;
    document.getElementById('getGpsBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('getGpsBtn'); const originalText = btn.textContent; btn.disabled = true; btn.textContent = 'Obteniendo ubicación…';
        try { const pos = await getGeolocation(); regLastLat = pos.coords.latitude; regLastLng = pos.coords.longitude; btn.textContent = '✓ Ubicación obtenida'; notify('Ubicación GPS obtenida correctamente.', 'success'); } catch (err) { notify('No se pudo obtener la ubicación. Puedes continuar sin ella.', 'error'); btn.textContent = originalText; } finally { btn.disabled = false; }
    });
    initForgotPassword();
}

function initForgotPassword() {
    document.getElementById('forgotPasswordBtn')?.addEventListener('click', async () => {
        const step1 = await showFormModal({ title: 'Recuperar contraseña', confirmLabel: 'Enviar código', fields: [{ name: 'telefono', label: 'Teléfono', type: 'tel', required: true }] });
        if (step1 === null) return;
        let resp;
        try { resp = await apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ telefono: step1.telefono }) }); } catch (err) { notify(`Error: ${err.message}`, 'error'); return; }
        if (resp.codigo_demo) notify(`Código de recuperación (demo): ${resp.codigo_demo}`, 'info'); else notify(resp.message, 'info');
        const step2 = await showFormModal({ title: 'Nueva contraseña', confirmLabel: 'Restablecer', fields: [{ name: 'codigo', label: `Código de 6 dígitos (válido ${resp.expira_en_minutos} min)`, type: 'text', required: true, placeholder: '123456' }, { name: 'nueva_password', label: 'Nueva contraseña', type: 'password', required: true }] });
        if (step2 === null) return;
        try { await apiFetch('/auth/reset-password', { method: 'POST', body: JSON.stringify({ telefono: step1.telefono, codigo: step2.codigo.trim(), nueva_password: step2.nueva_password }) }); notify('Contraseña actualizada. Ya puedes iniciar sesión.', 'success'); } catch (err) { notify(`Error: ${err.message}`, 'error'); }
    });
}

export function showLanding() {
    switchView('landing');
    requestAnimationFrame(() => initLandingPublicExperience());
}

export function showRegister() { switchView('register'); }
export function showLogin() { switchView('login'); }
export function logout() { localStorage.removeItem('token'); window.location.reload(); }
