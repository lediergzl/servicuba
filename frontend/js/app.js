import { apiFetch, notify } from './core.js';
import { initAuth, showLanding, showRegister, showLogin, logout } from './auth.js';
import { initTasks, loadCategories, showDashboardCliente, showDashboardTrabajador, switchView } from './tasks.js';
import { initMap } from './map.js';
import { initChat, setCurrentUserId } from './chat.js';
import { initPush, enablePushNotifications } from './push-native.js';
import { initVerification, refreshVerificationBanner } from './verification.js';
import { initSponsorAdEntry } from './monetization.js';

function setGuestUi() {
    document.getElementById('user-menu-guest')?.classList.remove('hidden');
    document.getElementById('user-menu-auth')?.classList.add('hidden');
    document.getElementById('bottomNav')?.classList.add('hidden');
    document.getElementById('modoSwitch')?.classList.add('hidden');
}

function setAuthUi() {
    document.getElementById('user-menu-guest')?.classList.add('hidden');
    document.getElementById('user-menu-auth')?.classList.remove('hidden');
    document.getElementById('bottomNav')?.classList.remove('hidden');
    document.getElementById('modoSwitch')?.classList.remove('hidden');
}

function wireGlobalButtons() {
    document.getElementById('loginBtn')?.addEventListener('click', showLogin);
    document.getElementById('loginBtn2')?.addEventListener('click', showLogin);
    document.getElementById('registerBtn')?.addEventListener('click', showRegister);
    document.getElementById('logoutBtn')?.addEventListener('click', logout);
    document.getElementById('enablePushBtn')?.addEventListener('click', () => enablePushNotifications().catch(err => notify(err.message || 'No se pudieron activar las notificaciones.', 'error')));
    document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
}

async function restoreSession() {
    if (!localStorage.getItem('token')) return false;
    try {
        const me = await apiFetch('/auth/me');
        setCurrentUserId(me.id || me.user_id);
        setAuthUi();
        try { await refreshVerificationBanner(); } catch (err) { console.error('verification', err); }
        if (me.es_trabajador) showDashboardTrabajador();
        else showDashboardCliente();
        return true;
    } catch (err) {
        localStorage.removeItem('token');
        setGuestUi();
        return false;
    }
}

async function boot() {
    // La landing se pinta antes de cualquier petición o módulo secundario.
    // Así un fallo auxiliar nunca deja la app bloqueada en el header.
    setGuestUi();
    showLanding();

    try { initAuth(); } catch (err) { console.error('initAuth', err); }
    try { initTasks(); } catch (err) { console.error('initTasks', err); }
    try { initChat(); } catch (err) { console.error('initChat', err); }
    try { initMap(); } catch (err) { console.error('initMap', err); }
    try { initVerification(); } catch (err) { console.error('initVerification', err); }
    try { initPush(); } catch (err) { console.error('initPush', err); }
    try { initSponsorAdEntry(); } catch (err) { console.error('initSponsorAdEntry', err); }
    wireGlobalButtons();

    try { await loadCategories(); } catch (err) { console.error('loadCategories', err); }
    const restored = await restoreSession();
    if (!restored) showLanding();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
