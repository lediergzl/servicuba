// ============================================================
// Registro / Login / Logout
// ============================================================
import { apiFetch, notify, getGeolocation } from './core.js';
import { switchView } from './tasks.js';

export let currentUser = null;

export function initAuth() {
    const registerForm = document.getElementById('registerForm');
    const loginForm = document.getElementById('loginForm');
    const regRol = document.getElementById('regRol');

    if (regRol) {
        regRol.addEventListener('change', (e) => {
            const show = e.target.value === 'trabajador';
            document.getElementById('categoriaField').classList.toggle('hidden', !show);
            document.getElementById('ubicacionField').classList.toggle('hidden', !show);
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = registerForm.querySelector('button[type="submit"]');

            const data = {
                nombre: document.getElementById('regNombre').value,
                telefono: document.getElementById('regTelefono').value,
                password: document.getElementById('regPassword').value,
                rol: document.getElementById('regRol').value,
                categoria_id: parseInt(document.getElementById('regCategoria')?.value || 0) || null,
                municipio: document.getElementById('regMunicipio')?.value || null,
                zona: document.getElementById('regZona')?.value || null,
                lat: regLastLat,
                lng: regLastLng
            };

            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Creando cuenta…'; }
            try {
                await apiFetch('/auth/register', {
                    method: 'POST',
                    body: JSON.stringify(data)
                });
                notify('Registro exitoso. Ahora inicia sesión.', 'success');
                showLogin();
            } catch (err) {
                notify(`Error: ${err.message}`, 'error');
            } finally {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Registrarse'; }
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = loginForm.querySelector('button[type="submit"]');
            const data = {
                telefono: document.getElementById('logTelefono').value,
                password: document.getElementById('logPassword').value
            };

            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Ingresando…'; }
            try {
                const tokenData = await apiFetch('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify(data)
                });
                localStorage.setItem('token', tokenData.access_token);
                window.location.reload();
            } catch (err) {
                notify(`Error: ${err.message}`, 'error');
            } finally {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Ingresar'; }
            }
        });
    }

    let regLastLat = null;
    let regLastLng = null;

    document.getElementById('getGpsBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('getGpsBtn');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Obteniendo ubicación…';
        try {
            const pos = await getGeolocation();
            regLastLat = pos.coords.latitude;
            regLastLng = pos.coords.longitude;
            btn.textContent = '✓ Ubicación obtenida';
            notify('Ubicación GPS obtenida correctamente.', 'success');
        } catch (err) {
            notify('No se pudo obtener la ubicación. Puedes continuar sin ella.', 'error');
            btn.textContent = originalText;
        } finally {
            btn.disabled = false;
        }
    });
}

export function showLanding() {
    switchView('landing');
}

export function showRegister() {
    switchView('register');
}

export function showLogin() {
    switchView('login');
}

export function logout() {
    localStorage.removeItem('token');
    window.location.reload();
}
