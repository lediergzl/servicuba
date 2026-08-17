import { apiFetch, notify, showFormModal, getGeolocation } from './core.js';
import { initAuth, showLanding, showRegister, showLogin, logout } from './auth.js';
import { initTasks, loadCategories, showDashboardCliente, showDashboardTrabajador, switchView } from './tasks.js';
import { initMap } from './map.js';
import { initChat, loadConversations, setCurrentUserId } from './chat.js';
import { initPush, enablePushNotifications } from './push.js';
import { initVerification, refreshVerificationBanner } from './verification.js';
import { renderPremiumSection, initSponsorAdEntry, loadAdBanner } from './monetization.js';
import { checkAndShowAdminEntry, initAdminPanel, loadPendingPayments } from './admin.js';
import { initLandingSearch } from './landing.js';

let currentModo = 'cliente';
let isCliente = true;
let isTrabajador = false;
let dashboardLiveTimer = null;
let dashboardUser = null;

function dashboardGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Buenos días';
    if (hour < 19) return 'Buenas tardes';
    return 'Buenas noches';
}

function ensureLiveDashboardShell() {
    const dashboardId = currentModo === 'trabajador' ? 'dashboardTrabajador' : 'dashboardCliente';
    const dashboard = document.getElementById(dashboardId);
    if (!dashboard) return;

    let shell = dashboard.querySelector('.dashboard-live');
    if (!shell) {
        shell = document.createElement('section');
        shell.className = 'dashboard-live';
        shell.innerHTML = `
            <div class="dashboard-live__hero">
                <div>
                    <span class="dashboard-live__eyebrow"><span class="dashboard-live__pulse"></span> ServiCuba activo</span>
                    <h2 id="dashboardLiveGreeting" class="dashboard-live__greeting"></h2>
                    <p id="dashboardLiveContext" class="dashboard-live__context"></p>
                </div>
                <button id="dashboardRefreshBtn" type="button" class="dashboard-live__refresh" title="Actualizar ahora" aria-label="Actualizar ahora">↻</button>
            </div>
            <div class="dashboard-live__stats">
                <article class="dashboard-stat">
                    <span class="dashboard-stat__label" id="dashboardStat1Label">Disponibles</span>
                    <strong class="dashboard-stat__value" id="dashboardStat1">0</strong>
                    <span class="dashboard-stat__hint" id="dashboardStat1Hint">ahora</span>
                </article>
                <article class="dashboard-stat">
                    <span class="dashboard-stat__label" id="dashboardStat2Label">Actualización</span>
                    <strong class="dashboard-stat__value dashboard-stat__value--small" id="dashboardStat2">--:--</strong>
                    <span class="dashboard-stat__hint">última carga</span>
                </article>
                <article class="dashboard-stat">
                    <span class="dashboard-stat__label" id="dashboardStat3Label">Estado</span>
                    <strong class="dashboard-stat__value dashboard-stat__value--status" id="dashboardStat3">Activo</strong>
                    <span class="dashboard-stat__hint" id="dashboardStat3Hint">conectado</span>
                </article>
            </div>
            <div id="dashboardLiveActivity" class="dashboard-live__activity"></div>
        `;
        dashboard.prepend(shell);
        shell.querySelector('#dashboardRefreshBtn')?.addEventListener('click', () => refreshLiveDashboard(true));
    }

    updateLiveDashboardUI();
}

function visibleCount(selector) {
    const el = document.querySelector(selector);
    if (!el) return 0;
    return Array.from(el.children).filter(child => !child.classList.contains('empty-state')).length;
}

function updateLiveDashboardUI() {
    const dashboardId = currentModo === 'trabajador' ? 'dashboardTrabajador' : 'dashboardCliente';
    const dashboard = document.getElementById(dashboardId);
    if (!dashboard || dashboard.classList.contains('hidden')) return;
    ensureLiveDashboardShellNoRecurse(dashboard);

    const name = dashboardUser?.nombre?.split(' ')[0] || 'usuario';
    const greeting = document.getElementById('dashboardLiveGreeting');
    const context = document.getElementById('dashboardLiveContext');
    const stat1Label = document.getElementById('dashboardStat1Label');
    const stat1 = document.getElementById('dashboardStat1');
    const stat2 = document.getElementById('dashboardStat2');
    const stat3 = document.getElementById('dashboardStat3');
    const stat3Hint = document.getElementById('dashboardStat3Hint');
    const activity = document.getElementById('dashboardLiveActivity');
    if (!greeting || !context || !stat1 || !stat2 || !stat3 || !activity) return;

    const now = new Date();
    const time = now.toLocaleTimeString('es-CU', { hour: '2-digit', minute: '2-digit' });
    greeting.textContent = `${dashboardGreeting()}, ${name}`;

    if (currentModo === 'trabajador') {
        const count = visibleCount('#listaTareas');
        stat1Label.textContent = 'Tareas visibles';
        stat1.textContent = String(count);
        context.textContent = count > 0
            ? `${count} ${count === 1 ? 'oportunidad está' : 'oportunidades están'} cerca de ti.`
            : 'Buscando oportunidades cerca de ti…';
        stat3.textContent = isTrabajador ? 'Disponible' : 'Perfil';
        stat3Hint.textContent = isTrabajador ? 'puedes postularte' : 'revisa tu perfil';
        activity.innerHTML = count > 0
            ? `<div class="dashboard-live__activity-icon">●</div><div><strong>${count} tareas encontradas</strong><span>La lista se actualiza con tus filtros y ubicación.</span></div>`
            : `<div class="dashboard-live__activity-icon dashboard-live__activity-icon--muted">⌁</div><div><strong>Sin tareas visibles todavía</strong><span>Prueba otro radio o actualiza tu ubicación.</span></div>`;
    } else {
        const taskCount = visibleCount('#misTareas');
        const offerCount = visibleCount('#listaOfertasCercanas');
        const offersPanel = document.getElementById('ofertasCercanasPanel');
        const offersActive = offersPanel && !offersPanel.classList.contains('hidden');
        stat1Label.textContent = offersActive ? 'Servicios visibles' : 'Mis tareas';
        stat1.textContent = String(offersActive ? offerCount : taskCount);
        context.textContent = offersActive
            ? (offerCount > 0 ? `${offerCount} servicios disponibles en tu radio.` : 'Buscando servicios cerca de ti…')
            : (taskCount > 0 ? `${taskCount} tareas en tu espacio de trabajo.` : 'Tu espacio está listo para crear una tarea.');
        stat3.textContent = 'Activo';
        stat3Hint.textContent = 'cuenta conectada';
        activity.innerHTML = offersActive
            ? `<div class="dashboard-live__activity-icon">●</div><div><strong>${offerCount ? `${offerCount} servicios encontrados` : 'Explorando servicios'}</strong><span>Resultados según ubicación, radio y categoría.</span></div>`
            : `<div class="dashboard-live__activity-icon">✓</div><div><strong>${taskCount ? `${taskCount} tareas en tu cuenta` : 'Todo listo para empezar'}</strong><span>Desde aquí puedes publicar y seguir tus solicitudes.</span></div>`;
    }

    stat2.textContent = time;
}

function ensureLiveDashboardShellNoRecurse(dashboard) {
    if (dashboard.querySelector('.dashboard-live')) return;
    const shell = document.createElement('section');
    shell.className = 'dashboard-live';
    shell.innerHTML = `
        <div class="dashboard-live__hero">
            <div>
                <span class="dashboard-live__eyebrow"><span class="dashboard-live__pulse"></span> ServiCuba activo</span>
                <h2 id="dashboardLiveGreeting" class="dashboard-live__greeting"></h2>
                <p id="dashboardLiveContext" class="dashboard-live__context"></p>
            </div>
            <button id="dashboardRefreshBtn" type="button" class="dashboard-live__refresh" title="Actualizar ahora" aria-label="Actualizar ahora">↻</button>
        </div>
        <div class="dashboard-live__stats">
            <article class="dashboard-stat"><span class="dashboard-stat__label" id="dashboardStat1Label">Disponibles</span><strong class="dashboard-stat__value" id="dashboardStat1">0</strong><span class="dashboard-stat__hint" id="dashboardStat1Hint">ahora</span></article>
            <article class="dashboard-stat"><span class="dashboard-stat__label">Actualización</span><strong class="dashboard-stat__value dashboard-stat__value--small" id="dashboardStat2">--:--</strong><span class="dashboard-stat__hint">última carga</span></article>
            <article class="dashboard-stat"><span class="dashboard-stat__label">Estado</span><strong class="dashboard-stat__value dashboard-stat__value--status" id="dashboardStat3">Activo</strong><span class="dashboard-stat__hint" id="dashboardStat3Hint">conectado</span></article>
        </div>
        <div id="dashboardLiveActivity" class="dashboard-live__activity"></div>
    `;
    dashboard.prepend(shell);
    shell.querySelector('#dashboardRefreshBtn')?.addEventListener('click', () => refreshLiveDashboard(true));
}

async function refreshLiveDashboard(force = false) {
    if (!localStorage.getItem('token')) return;
    const dashboardId = currentModo === 'trabajador' ? 'dashboardTrabajador' : 'dashboardCliente';
    const dashboard = document.getElementById(dashboardId);
    if (!dashboard || dashboard.classList.contains('hidden')) return;

    ensureLiveDashboardShell();
    updateLiveDashboardUI();

    if (!force) return;
    const button = document.getElementById('dashboardRefreshBtn');
    button?.classList.add('is-spinning');
    try {
        if (currentModo === 'trabajador') {
            document.getElementById('filtroRadio')?.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (!document.getElementById('ofertasCercanasPanel')?.classList.contains('hidden')) {
            document.getElementById('filtroRadioOfertas')?.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            const list = document.getElementById('misTareas');
            if (list) list.dispatchEvent(new CustomEvent('dashboard:refresh'));
        }
        setTimeout(updateLiveDashboardUI, 250);
    } finally {
        setTimeout(() => button?.classList.remove('is-spinning'), 450);
    }
}

async function bootstrap() {
    const token = localStorage.getItem('token');
    document.getElementById('user-menu-guest')?.classList.toggle('hidden', !!token);
    document.getElementById('user-menu-auth')?.classList.toggle('hidden', !token);
    document.getElementById('bottomNav')?.classList.toggle('hidden', !token);
    document.getElementById('modoSwitch')?.classList.toggle('hidden', !token);

    if (token) {
        try {
            const user = await apiFetch('/users/profile');
            dashboardUser = user;
            isCliente = user.es_cliente;
            isTrabajador = user.es_trabajador;
            currentModo = (user.modo_activo === 'trabajador' && isTrabajador) ? 'trabajador' : 'cliente';
            setCurrentUserId(user.id);
            updateModeSwitchUI();

            if (currentModo === 'cliente') {
                showDashboardCliente();
            } else {
                showDashboardTrabajador();
                loadAdBanner('adBannerTrabajador');
            }
            ensureLiveDashboardShell();
            refreshVerificationBanner();
            initPush();
            checkAndShowAdminEntry();
            loadConversations();
            startDashboardLiveUpdates();
        } catch {
            showLanding();
        }
    } else {
        showLanding();
    }
}

function startDashboardLiveUpdates() {
    if (dashboardLiveTimer) clearInterval(dashboardLiveTimer);
    dashboardLiveTimer = setInterval(() => updateLiveDashboardUI(), 5000);
}

function updateModeSwitchUI() {
    document.querySelectorAll('.mode-switch__btn').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.modo === currentModo);
    });
}

function initModeSwitch() {
    document.getElementById('modoSwitch')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('.mode-switch__btn');
        if (!btn || btn.classList.contains('is-active')) return;
        await switchModo(btn.dataset.modo);
    });
}

async function switchModo(modo) {
    if (modo === currentModo) return;
    if (modo === 'trabajador' && !isTrabajador) {
        const activated = await promptActivateWorker();
        if (!activated) return;
        isTrabajador = true;
    }

    try {
        await apiFetch('/users/modo-activo', { method: 'PUT', body: JSON.stringify({ modo }) });
    } catch (err) {
        notify(`Error: ${err.message}`, 'error');
        return;
    }

    currentModo = modo;
    updateModeSwitchUI();
    if (modo === 'cliente') {
        showDashboardCliente();
    } else {
        showDashboardTrabajador();
        loadAdBanner('adBannerTrabajador');
    }
    ensureLiveDashboardShell();
    updateLiveDashboardUI();
    document.querySelectorAll('.bottom-nav__item').forEach(el => {
        el.classList.toggle('is-active', el.dataset.view === 'dashboardCliente');
    });
}

async function promptActivateWorker() {
    let categorias;
    try { categorias = await apiFetch('/categories'); }
    catch (err) { notify(`No se pudieron cargar las categorías: ${err.message}`, 'error'); return false; }
    if (!categorias.length) { notify('No hay categorías disponibles todavía.', 'error'); return false; }
    const categoryOptions = categorias.map(c => ({ value: String(c.id), label: `${c.icono ? c.icono + ' ' : ''}${c.nombre}` }));
    const result = await showFormModal({ title: 'Activar modo Trabajador', confirmLabel: 'Activar', fields: [
        { name: 'categoria_id', label: 'Tu oficio', type: 'select', required: true, options: categoryOptions },
        { name: 'descripcion_trabajador', label: 'Descripción (opcional)', type: 'textarea', placeholder: 'Ej: Electricista con 10 años de experiencia...' },
        { name: 'precio_hora', label: 'Precio por hora (opcional)', type: 'number', min: 0, step: '0.01' },
        { name: 'municipio', label: 'Municipio', type: 'text' },
        { name: 'zona', label: 'Zona / Consejo popular', type: 'text' }
    ]});
    if (result === null) return false;
    const categoria = parseInt(result.categoria_id, 10);
    if (!categorias.some(c => c.id === categoria)) { notify('Selecciona un oficio válido.', 'error'); return false; }
    let lat = null, lng = null;
    try { const pos = await getGeolocation(); lat = pos.coords.latitude; lng = pos.coords.longitude; } catch {}
    try {
        await apiFetch('/users/activar-trabajador', { method: 'PUT', body: JSON.stringify({ categoria_id: categoria, descripcion_trabajador: result.descripcion_trabajador || null, precio_hora: result.precio_hora || null, municipio: result.municipio || null, zona: result.zona || null, lat, lng }) });
        notify('Perfil de trabajador activado.', 'success');
        return true;
    } catch (err) { notify(`Error: ${err.message}`, 'error'); return false; }
}

function initBottomNav() {
    document.querySelectorAll('.bottom-nav__item').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            if (view === 'dashboardCliente' || view === 'dashboardTrabajador') {
                if (currentModo === 'cliente') showDashboardCliente(); else showDashboardTrabajador();
                ensureLiveDashboardShell(); updateLiveDashboardUI();
            } else if (view === 'mensajes') {
                switchView('mensajesView');
                document.querySelectorAll('.bottom-nav__item').forEach(el => el.classList.toggle('is-active', el === btn));
                loadConversations();
            } else if (view === 'perfil') {
                switchView('perfilView');
                document.querySelectorAll('.bottom-nav__item').forEach(el => el.classList.toggle('is-active', el === btn));
                loadProfile(); renderPremiumSection();
            }
        });
    });

    document.getElementById('adminPanelBtn')?.addEventListener('click', () => { switchView('adminView'); loadPendingPayments(); });
    document.getElementById('adminBackBtn')?.addEventListener('click', () => { switchView('perfilView'); document.querySelectorAll('.bottom-nav__item').forEach(el => el.classList.toggle('is-active', el.dataset.view === 'perfil')); });
    document.addEventListener('chat:closed', () => { switchView('mensajesView'); loadConversations(); });
}

const STAR_ICON = '<svg class="icon" viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.3 6.9.7-5.2 4.7 1.5 6.8L12 17.6l-6.1 3.4 1.5-6.8L2.2 9.5l6.9-.7Z"/></svg>';
function renderStarRating(rating) { const rounded = Math.round(rating || 0); return `<span class="star-rating">${Array.from({ length: 5 }, (_, i) => STAR_ICON.replace('class="icon"', `class="icon${i < rounded ? ' icon--filled' : ''}"`)).join('')}</span>`; }

async function loadProfile() {
    const el = document.getElementById('perfilContenido');
    const workerSection = document.getElementById('workerActivationSection');
    if (!el) return;
    el.innerHTML = '<p class="empty-state">Cargando…</p>';
    try {
        const user = await apiFetch('/users/profile');
        dashboardUser = user;
        isCliente = user.es_cliente; isTrabajador = user.es_trabajador;
        let roleDetail = '';
        if (user.es_trabajador && user.categoria_nombre) roleDetail = `<p class="profile-card__meta">${user.categoria_icono ? user.categoria_icono + ' ' : ''}${user.categoria_nombre}</p>`;
        const badges = [user.es_cliente ? '<span class="chip chip--estado-activa">Cliente</span>' : '', user.es_trabajador ? '<span class="chip chip--estado-activa">Trabajador</span>' : ''].filter(Boolean).join(' ');
        el.innerHTML = `<div class="profile-card"><div class="profile-card__avatar">${user.nombre.charAt(0).toUpperCase()}</div><h2 class="profile-card__name">${user.nombre} ${user.verificado ? '<span class="verified-stamp" title="Cuenta verificada">✓ VERIFICADO</span>' : ''}</h2><p class="profile-card__meta">${badges}</p>${roleDetail}<p class="profile-card__meta">${renderStarRating(user.rating)} <span class="mono">${(user.rating ?? 0).toFixed(1)}</span></p><p class="profile-card__meta mono">${user.telefono}</p></div>`;
        if (workerSection) {
            if (!user.es_trabajador) {
                workerSection.innerHTML = `<div class="worker-status-card"><p class="task-card__title">¿También ofreces servicios?</p><p class="task-card__meta" style="margin:6px 0 10px">Activa tu perfil de trabajador para aparecer en las búsquedas, postularte a tareas cercanas y publicar tus propios servicios.</p><button id="activateWorkerBtn" class="btn btn-accent btn-block btn-sm">Activar modo Trabajador</button></div>`;
                document.getElementById('activateWorkerBtn')?.addEventListener('click', async () => { const activated = await promptActivateWorker(); if (activated) { isTrabajador = true; await loadProfile(); } });
            } else workerSection.innerHTML = '';
        }
    } catch (err) { el.innerHTML = `<p class="empty-state">Error: ${err.message}</p>`; }
}

document.addEventListener('DOMContentLoaded', () => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    loadCategories(); initAuth(); initTasks(); initMap(); initChat(); initVerification(); initBottomNav(); initModeSwitch(); initSponsorAdEntry(); initAdminPanel(); initLandingSearch();
    document.getElementById('loginBtn')?.addEventListener('click', showLogin);
    document.getElementById('loginBtn2')?.addEventListener('click', showLogin);
    document.getElementById('registerBtn')?.addEventListener('click', showRegister);
    document.getElementById('logoutBtn')?.addEventListener('click', logout);
    document.getElementById('enablePushBtn')?.addEventListener('click', enablePushNotifications);
    document.addEventListener('auth:expired', () => { document.getElementById('bottomNav')?.classList.add('hidden'); document.getElementById('modoSwitch')?.classList.add('hidden'); if (dashboardLiveTimer) clearInterval(dashboardLiveTimer); showLanding(); });
    bootstrap();
});