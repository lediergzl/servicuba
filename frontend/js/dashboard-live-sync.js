import { apiFetch, notify } from './core.js';
import { loadNearbyTasks, loadNearbyOfertas } from './tasks.js';

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
        pendiente: 'Pendiente',
        aceptada: 'Aceptada',
        asignada: 'Asignada',
        activa: 'Activa',
        en_proceso: 'En proceso',
        completada: 'Completada',
        cancelada: 'Cancelada',
        rechazada: 'Rechazada'
    };
    return labels[String(status || '').toLowerCase()] || String(status || 'Actualización');
}

function renderWorkspaceState(state) {
    latestState = state;
    const mode = isClienteMode() ? 'cliente' : 'trabajador';
    const data = mode === 'cliente' ? state.cliente : state.trabajador;
    const global = state.global || {};

    document.querySelectorAll('[data-dashboard-kpi]').forEach(el => {
        const key = el.dataset.dashboardKpi;
        const value = key === 'mensajes_no_leidos' ? global[key] : data?.[key];
        if (value !== undefined) el.textContent = String(value);
    });

    const stat1 = document.getElementById('dashboardStat1');
    const stat1Label = document.getElementById('dashboardStat1Label');
    const context = document.getElementById('dashboardLiveContext');
    const activity = document.getElementById('dashboardLiveActivity');
    const stat3 = document.getElementById('dashboardStat3');
    const stat3Hint = document.getElementById('dashboardStat3Hint');

    if (stat1 && stat1Label && context) {
        if (mode === 'cliente') {
            stat1Label.textContent = 'Tareas activas';
            stat1.textContent = String(data?.tareas_activas ?? 0);
            context.textContent = (data?.solicitudes_recibidas ?? 0) > 0
                ? `${data.solicitudes_recibidas} solicitud${data.solicitudes_recibidas === 1 ? '' : 'es'} pendiente${data.solicitudes_recibidas === 1 ? '' : 's'}.`
                : 'Tu espacio está actualizado.';
            if (stat3) stat3.textContent = String(global.mensajes_no_leidos ?? 0);
            if (stat3Hint) stat3Hint.textContent = 'mensajes sin leer';
        } else {
            stat1Label.textContent = 'Postulaciones pendientes';
            stat1.textContent = String(data?.postulaciones_pendientes ?? 0);
            context.textContent = (data?.trabajos_aceptados ?? 0) > 0
                ? `${data.trabajos_aceptados} trabajo${data.trabajos_aceptados === 1 ? '' : 's'} aceptado${data.trabajos_aceptados === 1 ? '' : 's'}.`
                : 'Tu espacio de trabajo está actualizado.';
            if (stat3) stat3.textContent = String(data?.servicios_activos ?? 0);
            if (stat3Hint) stat3Hint.textContent = 'servicios activos';
        }
    }

    if (activity) {
        const rows = Array.isArray(state.activity) ? state.activity.slice(0, 4) : [];
        activity.innerHTML = rows.length
            ? rows.map(item => `
                <div class="dashboard-live__activity-item">
                    <div class="dashboard-live__activity-icon">●</div>
                    <div>
                        <strong>${escapeHtml(item.type === 'application_received' ? 'Nueva postulación' : 'Postulación enviada')}</strong>
                        <span>${escapeHtml(item.title)} · ${escapeHtml(statusLabel(item.status))} · ${escapeHtml(formatRelativeTime(item.created_at))}</span>
                    </div>
                </div>`).join('')
            : `<div class="dashboard-live__activity-item">
                <div class="dashboard-live__activity-icon dashboard-live__activity-icon--muted">⌁</div>
                <div><strong>Sin actividad reciente</strong><span>Las nuevas acciones aparecerán aquí.</span></div>
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
        const [stateResult] = await Promise.all([
            apiFetch('/dashboard/state'),
            loadCurrentWorkspace()
        ]);
        renderWorkspaceState(stateResult);
        document.dispatchEvent(new CustomEvent('servicuba:data-refreshed', {
            detail: { at: Date.now(), mode: isClienteMode() ? 'cliente' : 'trabajador', state: stateResult }
        }));
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

export function getLatestDashboardState() {
    return latestState;
}

function handleVisibility() {
    if (document.hidden) { stopDashboardDataSync(); return; }
    if (isDashboardVisible() && localStorage.getItem('token')) {
        syncDashboardData().catch(() => {});
        startDashboardDataSync();
    }
}

function handleModeChange(event) {
    const button = event.target.closest('.mode-switch__btn');
    if (!button || button.classList.contains('is-active')) return;
    window.setTimeout(() => {
        if (isDashboardVisible() && localStorage.getItem('token')) syncDashboardData().catch(() => {});
    }, 150);
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

    if (isDashboardVisible() && localStorage.getItem('token')) {
        syncDashboardData().catch(() => {});
        startDashboardDataSync();
        observer.disconnect();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboardLiveSync, { once: true });
} else {
    initDashboardLiveSync();
}
