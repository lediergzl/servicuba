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
import { initLandingPublicExperience } from './landing-public-experience.js';

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
