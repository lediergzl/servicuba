// Integración del panel administrativo con la SPA.
import { apiFetch, notify } from './core.js';
import { initAdminPanel, loadPendingPayments, checkAndShowAdminEntry } from './admin.js';

let initialized = false;

async function refreshAdminAccess() {
    const btn = document.getElementById('adminPanelBtn');
    if (!btn) return;
    if (!localStorage.getItem('token')) {
        btn.classList.add('hidden');
        return;
    }
    try {
        // El backend es la fuente de verdad; si /status no está disponible,
        // mantenemos compatibilidad con el chequeo del perfil existente.
        let allowed = false;
        try {
            // 403 acá es el resultado normal para cualquier usuario que no
            // es admin (get_current_admin en el backend) — no es un fallo
            // que amerite quedar en consola en cada carga de la app.
            const status = await apiFetch('/admin/status', { silentStatuses: [403] });
            allowed = status?.is_admin === true || status?.es_admin === true || status?.authorized === true;
        } catch (err) {
            if (String(err?.message || '').includes('No autorizado')) allowed = false;
            else {
                await checkAndShowAdminEntry();
                return;
            }
        }
        btn.classList.toggle('hidden', !allowed);
    } catch {
        btn.classList.add('hidden');
    }
}

async function openAdmin() {
    try {
        const status = await apiFetch('/admin/status');
        const allowed = status?.is_admin === true || status?.es_admin === true || status?.authorized === true;
        if (!allowed) throw new Error('No autorizado');
    } catch (err) {
        notify('No tienes permisos de administración.', 'error');
        await refreshAdminAccess();
        return;
    }
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById('adminView')?.classList.remove('hidden');
    await loadPendingPayments();
}

function closeAdmin() {
    document.getElementById('adminView')?.classList.add('hidden');
    document.getElementById('perfilView')?.classList.remove('hidden');
}

// Los enlaces de descubrimiento de la landing también existen para visitantes.
// Si ya hay una sesión válida, nunca debemos volver a enviar al usuario al login.
// Reutilizamos el mismo flujo centralizado del header, que termina llamando a
// openWorkerView() y respeta tanto perfiles de trabajador como cuentas que aún
// necesitan completar su activación profesional.
function installAuthenticatedLandingRouting() {
    document.addEventListener('click', e => {
        const workerLink = e.target.closest('#landingWorkerLink');
        if (!workerLink || !localStorage.getItem('token')) return;

        const workerNav = document.querySelector('[data-header-view="dashboardTrabajador"]');
        if (!workerNav) return;

        e.preventDefault();
        e.stopImmediatePropagation();
        workerNav.click();
    }, true);
}

function init() {
    if (initialized) return;
    initialized = true;
    initAdminPanel();
    document.getElementById('adminPanelBtn')?.addEventListener('click', openAdmin);
    document.getElementById('adminBackBtn')?.addEventListener('click', closeAdmin);
    refreshAdminAccess();
    installAuthenticatedLandingRouting();
    document.addEventListener('auth:changed', refreshAdminAccess);
    document.addEventListener('auth:expired', () => document.getElementById('adminPanelBtn')?.classList.add('hidden'));
    window.addEventListener('storage', e => { if (e.key === 'token') refreshAdminAccess(); });
    // Al volver al perfil, revalidamos por si la sesión cambió.
    document.addEventListener('click', e => {
        if (e.target.closest('[data-view="perfil"], #logoutBtn')) setTimeout(refreshAdminAccess, 0);
    });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
