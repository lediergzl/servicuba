import { apiFetch, notify, escapeHtml } from './core.js';
import { initAuth, showLanding, showRegister, showLogin, logout } from './auth.js';
import { initTasks, loadCategories, showDashboardCliente, showDashboardTrabajador, switchView } from './tasks.js';
import { initMap } from './map.js';
import { initChat, setCurrentUserId, openChatForTask } from './chat.js';
import { initPush, enablePushNotifications } from './push-native.js';
import { initVerification, refreshVerificationBanner } from './verification.js';
import { initSponsorAdEntry } from './monetization.js';
import { initLandingSearch } from './landing.js';
import { initDirectory, openMunicipioDirectory } from './directory.js';

let activeMode = 'cliente';

function syncModeSwitch(modo) {
    activeMode = modo === 'trabajador' ? 'trabajador' : 'cliente';
    document.querySelectorAll('[data-modo]').forEach(btn => {
        const isActive = btn.dataset.modo === activeMode;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-pressed', String(isActive));
    });
}

function setModeFromUser(me) {
    syncModeSwitch(me?.modo_activo || (me?.es_trabajador ? 'trabajador' : 'cliente'));
}

function installHeaderResponsiveNav() {
    if (document.getElementById('servicubaHeaderNav')) return;
    const header = document.querySelector('.app-header');
    const brand = header?.querySelector('.app-header__brand');
    if (!header || !brand) return;
    const nav = document.createElement('nav');
    nav.id = 'servicubaHeaderNav';
    nav.className = 'app-header__nav';
    nav.setAttribute('aria-label', 'Navegación principal');
    const items = [['landing', 'Buscar servicios'], ['mensajesView', 'Actividad'], ['dashboardTrabajador', 'Busco trabajo'], ['municipioDirectory', 'Por municipio']];
    let menuBtn = null, mobileMenu = null;
    const makeButton = (view, label, mobile = false) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = mobile ? 'app-header__mobile-link' : 'app-header__nav-link';
        btn.dataset.headerView = view;
        btn.textContent = label;
        btn.setAttribute('aria-label', label);
        btn.addEventListener('click', async () => {
            if (view === 'municipioDirectory') await openMunicipioDirectory();
            else if (view === 'landing') showLanding();
            else if (view === 'dashboardTrabajador') await openWorkerView();
            else if (view === 'mensajesView') await openMessagesView();
            else switchView(view);
            mobileMenu?.classList.remove('is-open');
            menuBtn?.setAttribute('aria-expanded', 'false');
        });
        return btn;
    };
    items.forEach(([view, label]) => nav.appendChild(makeButton(view, label)));
    const account = document.getElementById('user-menu-guest') || document.getElementById('user-menu-auth');
    menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'app-header__menu-btn';
    menuBtn.setAttribute('aria-label', 'Abrir menú');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
    mobileMenu = document.createElement('div');
    mobileMenu.className = 'app-header__mobile-menu';
    mobileMenu.setAttribute('aria-label', 'Menú móvil');
    items.forEach(([view, label]) => mobileMenu.appendChild(makeButton(view, label, true)));
    if (account) account.classList.add('app-header__account');
    brand.after(nav);
    if (account) account.after(menuBtn); else header.appendChild(menuBtn);
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
    syncModeSwitch('cliente');
}
function setAuthUi() {
    document.getElementById('user-menu-guest')?.classList.add('hidden');
    document.getElementById('user-menu-auth')?.classList.remove('hidden');
    document.getElementById('bottomNav')?.classList.remove('hidden');
    document.getElementById('modoSwitch')?.classList.remove('hidden');
}

async function openWorkerView() {
    if (!localStorage.getItem('token')) {
        sessionStorage.setItem('servicuba_intent', 'trabajador');
        showLogin();
        return;
    }
    try {
        const me = await apiFetch('/auth/me');
        if (!me.es_trabajador) {
            notify('Completa tu perfil de trabajador para acceder a esta sección.', 'info');
            syncModeSwitch('trabajador');
            switchView('perfilView');
            await loadProfileView();
            return;
        }
        setCurrentUserId(me.id || me.user_id);
        setAuthUi();
        syncModeSwitch('trabajador');
        showDashboardTrabajador();
    } catch (err) {
        notify('No pudimos abrir la sección de trabajador. Inicia sesión nuevamente.', 'error');
    }
}

async function loadProfileView() {
    const container = document.getElementById('perfilContenido');
    if (!container) return;
    container.innerHTML = '<p class="view-subtitle">Cargando perfil…</p>';
    try {
        const profile = await apiFetch('/users/profile');
        const role = profile.es_trabajador ? 'Trabajador' : 'Cliente';
        const category = profile.categoria_nombre || profile.categoria || 'Sin oficio configurado';
        const rating = profile.rating != null ? Number(profile.rating).toFixed(1) : '0.0';
        container.innerHTML = `<div class="task-card"><div class="task-card__row"><h3 class="task-card__title">${escapeHtml(profile.nombre || 'Usuario')}</h3><span class="chip">${escapeHtml(role)}</span></div><p class="task-card__meta">${escapeHtml(profile.telefono || '')}</p><p class="task-card__meta">${escapeHtml(category)} · ⭐ ${escapeHtml(rating)}</p>${profile.municipio ? `<p class="task-card__meta">${escapeHtml(profile.municipio)}${profile.zona ? ` · ${escapeHtml(profile.zona)}` : ''}</p>` : ''}${profile.descripcion_trabajador ? `<p>${escapeHtml(profile.descripcion_trabajador)}</p>` : ''}</div>`;
    } catch (err) {
        container.innerHTML = '<p class="empty-state">No pudimos cargar tu perfil. Inténtalo nuevamente.</p>';
        notify(`No se pudo cargar el perfil: ${err.message}`, 'error');
    }
}

async function openProfileView() {
    if (!localStorage.getItem('token')) { showLogin(); return; }
    switchView('perfilView');
    await loadProfileView();
}

async function openMessagesView() {
    if (!localStorage.getItem('token')) { showLogin(); return; }
    switchView('mensajesView');
    const list = document.getElementById('listaConversaciones');
    if (!list) return;
    list.innerHTML = '<p class="view-subtitle">Cargando conversaciones…</p>';
    try {
        const conversations = await apiFetch('/chat/conversations');
        if (!conversations.length) { list.innerHTML = '<p class="empty-state">Todavía no tienes conversaciones.</p>'; return; }
        list.innerHTML = conversations.map(c => `<button type="button" class="task-card conversation-card" data-chat-task="${escapeHtml(c.task_id)}" style="text-align:left;width:100%;border:0;cursor:pointer"><div class="task-card__row"><strong>${escapeHtml(c.otro_participante || 'Contacto')}</strong>${c.no_leidos ? `<span class="chip">${escapeHtml(String(c.no_leidos))} sin leer</span>` : ''}</div><p class="task-card__meta">${escapeHtml(c.titulo || 'Servicio')} · ${escapeHtml(c.estado || '')}</p><p class="task-card__meta">${escapeHtml(c.ultimo_mensaje || 'Sin mensajes todavía')}</p></button>`).join('');
        list.querySelectorAll('[data-chat-task]').forEach(btn => btn.addEventListener('click', () => openChatForTask(btn.dataset.chatTask)));
    } catch (err) {
        list.innerHTML = '<p class="empty-state">No pudimos cargar tus mensajes.</p>';
        notify(`No se pudieron cargar los mensajes: ${err.message}`, 'error');
    }
}

function wireGlobalButtons() {
    document.getElementById('loginBtn')?.addEventListener('click', showLogin);
    document.getElementById('loginBtn2')?.addEventListener('click', showLogin);
    document.getElementById('registerBtn')?.addEventListener('click', showRegister);
    document.getElementById('logoutBtn')?.addEventListener('click', logout);
    document.getElementById('enablePushBtn')?.addEventListener('click', () => enablePushNotifications().catch(err => notify(err.message || 'No se pudieron activar las notificaciones.', 'error')));
    document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', async () => {
        const view = btn.dataset.view;
        if (view === 'mensajes') return openMessagesView();
        if (view === 'perfil') return openProfileView();
        if (view === 'dashboardTrabajador') return openWorkerView();
        return switchView(view);
    }));
    document.querySelectorAll('[data-modo]').forEach(btn => btn.addEventListener('click', async () => {
        const modo = btn.dataset.modo;
        if (modo === 'trabajador') return openWorkerView();
        if (modo === 'cliente') {
            if (!localStorage.getItem('token')) return showLogin();
            syncModeSwitch('cliente');
            showDashboardCliente();
        }
    }));
}

async function restoreSession() {
    if (!localStorage.getItem('token')) return false;
    try {
        const me = await apiFetch('/auth/me');
        setCurrentUserId(me.id || me.user_id); setAuthUi(); setModeFromUser(me);
        try { await refreshVerificationBanner(); } catch (err) { console.error('verification', err); }
        if (activeMode === 'trabajador' && me.es_trabajador) showDashboardTrabajador(); else { syncModeSwitch('cliente'); showDashboardCliente(); }
        return true;
    } catch (err) { localStorage.removeItem('token'); setGuestUi(); return false; }
}

async function boot() {
    setGuestUi(); showLanding();
    const headerCss = document.createElement('link'); headerCss.rel = 'stylesheet'; headerCss.href = '/css/header-responsive-fix.css?v=2'; document.head.appendChild(headerCss);
    installHeaderResponsiveNav();
    try { initDirectory(); } catch (err) { console.error('initDirectory', err); }
    try { await initLandingSearch(); } catch (err) { console.error('initLandingSearch', err); }
    try { initAuth(); } catch (err) { console.error('initAuth', err); }
    try { initTasks(); } catch (err) { console.error('initTasks', err); }
    try { initChat(); } catch (err) { console.error('initChat', err); }
    try { initMap(); } catch (err) { console.error('initMap', err); }
    try { initVerification(); } catch (err) { console.error('verification', err); }
    try { initPush(); } catch (err) { console.error('push', err); }
    try { initSponsorAdEntry(); } catch (err) { console.error('ads', err); }
    wireGlobalButtons();
    try { await loadCategories(); } catch (err) { console.error('loadCategories', err); }
    const restored = await restoreSession(); if (!restored) showLanding();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
