import { apiFetch, notify } from './core.js';
import { loadNearbyTasks, loadNearbyOfertas } from './tasks.js';
import './dashboard-card-ux.js';
import './dashboard-presence.js';
import './dashboard-messaging-sync.js';

let syncTimer = null;
let syncInFlight = false;
let initialized = false;
let latestState = null;

function isDashboardVisible() {
    const cliente = document.getElementById('dashboardCliente');
    const trabajador = document.getElementById('dashboardTrabajador');
    return !!((cliente && !cliente.classList.contains('hidden')) || (trabajador && !trabajador.classList.contains('hidden')));
}

function isClienteMode() {
    return document.querySelector('.mode-switch__btn.is-active')?.dataset.modo !== 'trabajador';
}

function formatRelativeTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return 'ahora mismo';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    return `hace ${Math.floor(hours / 24)} d`;
}

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value ?? '';
    return div.innerHTML;
}

function statusLabel(status) {
    const labels = {
        pendiente: 'Pendiente', aceptada: 'Aceptada', asignada: 'Asignada', activa: 'Activa',
        en_proceso: 'En proceso', completada: 'Completada', cancelada: 'Cancelada', rechazada: 'Rechazada'
    };
    return labels[String(status || '').toLowerCase()] || String(status || 'Actualización');
}

function ensureKpiGrid(shell) {
    let grid = shell.querySelector('.dashboard-live__kpis');
    if (grid) return grid;
    grid = document.createElement('div');
    grid.className = 'dashboard-live__kpis';
    grid.innerHTML = `
        <article class="dashboard-live__kpi"><span>Activas</span><strong data-dashboard-kpi="primario">0</strong><small data-dashboard-kpi-hint="primario">en tu espacio</small></article>
        <article class="dashboard-live__kpi"><span>En espera</span><strong data-dashboard-kpi="secundario">0</strong><small data-dashboard-kpi-hint="secundario">pendientes</small></article>
        <article class="dashboard-live__kpi"><span>Completadas</span><strong data-dashboard-kpi="completadas">0</strong><small>historial</small></article>
        <article class="dashboard-live__kpi"><span>Mensajes</span><strong data-dashboard-kpi="mensajes_no_leidos">0</strong><small>sin leer</small></article>
    `;
    const activity = shell.querySelector('#dashboardLiveActivity');
    shell.insertBefore(grid, activity || null);
    return grid;
}

function renderWorkspaceState(state) {
    latestState = state;
    const mode = isClienteMode() ? 'cliente' : 'trabajador';
    const data = mode === 'cliente' ? (state.cliente || {}) : (state.trabajador || {});
    const global = state.global || {};
    const shell = document.querySelector(`#${mode === 'cliente' ? 'dashboardCliente' : 'dashboardTrabajador'} .dashboard-live`);
    if (!shell) return;
    const grid = ensureKpiGrid(shell);

    let cards;
    if (mode === 'cliente') {
        cards = {
            primario: data.tareas_activas ?? 0,
            secundario: data.solicitudes_recibidas ?? 0,
            completadas: data.tareas_completadas ?? 0,
            mensajes_no_leidos: global.mensajes_no_leidos ?? 0
        };
        grid.querySelector('[data-dashboard-kpi="primario"]')?.closest('article')?.querySelector('span').replaceChildren('Tareas activas');
        grid.querySelector('[data-dashboard-kpi="secundario"]')?.closest('article')?.querySelector('span').replaceChildren('Solicitudes');
        grid.querySelector('[data-dashboard-kpi="completadas"]')?.closest('article')?.querySelector('span').replaceChildren('Completadas');
        grid.querySelector('[data-dashboard-kpi-hint="primario"]')?.replaceChildren('que requieren atención');
        grid.querySelector('[data-dashboard-kpi-hint="secundario"]')?.replaceChildren(cards.secundario ? 'esperando respuesta' : 'ninguna pendiente');
    } else {
        cards = {
            primario: data.trabajos_aceptados ?? 0,
            secundario: data.postulaciones_pendientes ?? 0,
            completadas: data.servicios_activos ?? 0,
            mensajes_no_leidos: global.mensajes_no_leidos ?? 0
        };
        grid.querySelector('[data-dashboard-kpi="primario"]')?.closest('article')?.querySelector('span').replaceChildren('Trabajos aceptados');
        grid.querySelector('[data-dashboard-kpi="secundario"]')?.closest('article')?.querySelector('span').replaceChildren('Postulaciones');
        grid.querySelector('[data-dashboard-kpi="completadas"]')?.closest('article')?.querySelector('span').replaceChildren('Servicios activos');
        grid.querySelector('[data-dashboard-kpi-hint="primario"]')?.replaceChildren(cards.primario ? 'requieren seguimiento' : 'sin trabajos activos');
        grid.querySelector('[data-dashboard-kpi-hint="secundario"]')?.replaceChildren(cards.secundario ? 'pendientes de respuesta' : 'ninguna pendiente');
    }

    Object.entries(cards).forEach(([key, value]) => {
        const el = grid.querySelector(`[data-dashboard-kpi="${key}"]`);
        if (el) el.textContent = String(value);
    });

    const context = shell.querySelector('#dashboardLiveContext');
    const stat2 = shell.querySelector('#dashboardStat2');
    const stat3 = shell.querySelector('#dashboardStat3');
    const stat3Hint = shell.querySelector('#dashboardStat3Hint');
    if (context) context.textContent = mode === 'cliente'
        ? (cards.secundario ? `${cards.secundario} solicitud${cards.secundario === 1 ? '' : 'es'} pendiente${cards.secundario === 1 ? '' : 's'}.` : 'Todo está actualizado. Puedes buscar un servicio o crear una tarea.')
        : (cards.secundario ? `${cards.secundario} postulación${cards.secundario === 1 ? '' : 'es'} esperando respuesta.` : 'Tu espacio de trabajo está actualizado.');
    if (stat2) stat2.textContent = new Date().toLocaleTimeString('es-CU', { hour: '2-digit', minute: '2-digit' });
    if (stat3) stat3.textContent = cards.mensajes_no_leidos > 0 ? String(cards.mensajes_no_leidos) : 'OK';
    if (stat3Hint) stat3Hint.textContent = cards.mensajes_no_leidos > 0 ? 'mensajes sin leer' : 'sin alertas';

    const activity = shell.querySelector('#dashboardLiveActivity');
    if (activity) {
        const rows = Array.isArray(state.activity) ? state.activity.slice(0, 5) : [];
        activity.innerHTML = rows.length ? rows.map(item => `
            <div class="dashboard-live__activity-item">
                <div class="dashboard-live__activity-icon">●</div>
                <div><strong>${escapeHtml(item.type === 'application_received' ? 'Nueva postulación' : 'Postulación enviada')}</strong><span>${escapeHtml(item.title)} · ${escapeHtml(statusLabel(item.status))} · ${escapeHtml(formatRelativeTime(item.created_at))}</span></div>
            </div>`).join('') : `
            <div class="dashboard-live__activity-item">
                <div class="dashboard-live__activity-icon dashboard-live__activity-icon--muted">⌁</div>
                <div><strong>Sin actividad reciente</strong><span>Las nuevas acciones aparecerán aquí automáticamente.</span></div>
            </div>`;
    }
}

async function loadCurrentWorkspace() {
    if (isClienteMode()) {
        const ofertasPanel = document.getElementById('ofertasCercanasPanel');
        if (ofertasPanel && !ofertasPanel.classList.contains('hidden')) {
            await loadNearbyOfertas();
            return;
        }
        const module = await import('./tasks.js');
        if (typeof module.loadMyTasks === 'function') await module.loadMyTasks();
    } else {
        const tareasPanel = document.getElementById('tareasCercanasPanel');
        if (tareasPanel && !tareasPanel.classList.contains('hidden')) {
            await loadNearbyTasks();
            return;
        }
        const module = await import('./tasks.js');
        if (typeof module.loadMyOfertas === 'function') await module.loadMyOfertas();
    }
}

export async function syncDashboardData() {
    if (syncInFlight || !isDashboardVisible() || !localStorage.getItem('token')) return;
    syncInFlight = true;
    const buttons = document.querySelectorAll('.dashboard-live__refresh');
    buttons.forEach(button => { button.classList.add('is-loading'); button.setAttribute('aria-busy', 'true'); });
    try {
        const [stateResult] = await Promise.all([apiFetch('/dashboard/state'), loadCurrentWorkspace()]);
        renderWorkspaceState(stateResult);
        document.dispatchEvent(new CustomEvent('servicuba:data-refreshed', { detail: { at: Date.now(), mode: isClienteMode() ? 'cliente' : 'trabajador', state: stateResult } }));
    } catch (err) {
        document.dispatchEvent(new CustomEvent('servicuba:data-refresh-error', { detail: { error: err } }));
        if (err?.message) notify(`No se pudo actualizar el espacio de trabajo: ${err.message}`, 'error');
    } finally {
        syncInFlight = false;
        buttons.forEach(button => { button.classList.remove('is-loading'); button.removeAttribute('aria-busy'); });
    }
}

export function startDashboardDataSync(intervalMs = 10000) {
    stopDashboardDataSync();
    syncTimer = window.setInterval(() => syncDashboardData().catch(() => {}), intervalMs);
}

export function stopDashboardDataSync() {
    if (syncTimer !== null) { window.clearInterval(syncTimer); syncTimer = null; }
}

export function getLatestDashboardState() { return latestState; }

function handleVisibility() {
    if (document.hidden) { stopDashboardDataSync(); return; }
    if (isDashboardVisible() && localStorage.getItem('token')) { syncDashboardData().catch(() => {}); startDashboardDataSync(); }
}

function handleModeChange(event) {
    const button = event.target.closest('.mode-switch__btn');
    if (!button || button.classList.contains('is-active')) return;
    window.setTimeout(() => { if (isDashboardVisible() && localStorage.getItem('token')) syncDashboardData().catch(() => {}); }, 150);
}

export function initDashboardLiveSync() {
    if (initialized) return;
    initialized = true;
    document.addEventListener('visibilitychange', handleVisibility);
    document.getElementById('modoSwitch')?.addEventListener('click', handleModeChange);
    const root = document.getElementById('views') || document.body;
    const observer = new MutationObserver(() => {
        if (isDashboardVisible() && localStorage.getItem('token')) {
            syncDashboardData().catch(() => {});
            startDashboardDataSync();
            observer.disconnect();
        }
    });
    observer.observe(root, { childList: true, subtree: true });
    if (isDashboardVisible() && localStorage.getItem('token')) { syncDashboardData().catch(() => {}); startDashboardDataSync(); observer.disconnect(); }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDashboardLiveSync, { once: true });
else initDashboardLiveSync();