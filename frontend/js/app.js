import { apiFetch, notify } from './core.js';
import { initAuth, showLanding, showRegister, showLogin, logout } from './auth.js';
import { initTasks, loadCategories, showDashboardCliente, showDashboardTrabajador, switchView } from './tasks.js';
import { initMap } from './map.js';
import { initChat, setCurrentUserId } from './chat.js';
import { initPush, enablePushNotifications } from './push-native.js';
import { initVerification, refreshVerificationBanner } from './verification.js';
import { initSponsorAdEntry } from './monetization.js';
import { initLandingSearch } from './landing.js';

function installHeaderResponsiveNav() {
    if (document.getElementById('servicubaHeaderNav')) return;
    const header = document.querySelector('.app-header');
    const brand = header?.querySelector('.app-header__brand');
    if (!header || !brand) return;

    const nav = document.createElement('nav');
    nav.id = 'servicubaHeaderNav';
    nav.className = 'app-header__nav';
    nav.setAttribute('aria-label', 'Navegación principal');

    const items = [
        ['landing', 'Buscar servicios'],
        ['mensajesView', 'Actividad'],
        ['dashboardTrabajador', 'Busco trabajo'],
        ['municipioDirectory', 'Por municipio'],
    ];

    const makeButton = (view, label, mobile = false) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = mobile ? 'app-header__mobile-link' : 'app-header__nav-link';
        btn.dataset.headerView = view;
        btn.textContent = label;
        btn.setAttribute('aria-label', label);
        btn.addEventListener('click', () => {
            if (view === 'municipioDirectory') {
                document.getElementById('browseByMunicipioBtn')?.click();
            } else {
                switchView(view);
            }
            mobileMenu?.classList.remove('is-open');
            menuBtn?.setAttribute('aria-expanded', 'false');
        });
        return btn;
    };

    items.forEach(([view, label]) => nav.appendChild(makeButton(view, label)));

    const account = document.getElementById('user-menu-guest') || document.getElementById('user-menu-auth');
    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'app-header__menu-btn';
    menuBtn.setAttribute('aria-label', 'Abrir menú');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';

    const mobileMenu = document.createElement('div');
    mobileMenu.className = 'app-header__mobile-menu';
    mobileMenu.setAttribute('aria-label', 'Menú móvil');
    items.forEach(([view, label]) => mobileMenu.appendChild(makeButton(view, label, true)));

    const accountClass = account?.id === 'user-menu-auth' ? 'app-header__account' : 'app-header__account';
    if (account) account.classList.add(accountClass);

    brand.after(nav);
    if (account) account.after(menuBtn);
    else header.appendChild(menuBtn);
    header.appendChild(mobileMenu);

    menuBtn.addEventListener('click', () => {
        const open = mobileMenu.classList.toggle('is-open');
        menuBtn.setAttribute('aria-expanded', String(open));
    });
}

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
    setGuestUi();
    showLanding();

    // Carga el parche visual del header sin modificar el HTML principal.
    const headerCss = document.createElement('link');
    headerCss.rel = 'stylesheet';
    headerCss.href = '/css/header-responsive-fix.css?v=1';
    document.head.appendChild(headerCss);
    installHeaderResponsiveNav();

    try { await initLandingSearch(); } catch (err) { console.error('initLandingSearch', err); }

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
