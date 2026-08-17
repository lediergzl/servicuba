import { loadNearbyTasks, loadNearbyOfertas } from './tasks.js';

let syncTimer = null;
let syncInFlight = false;
let initialized = false;

function isDashboardVisible() {
    const cliente = document.getElementById('dashboardCliente');
    const trabajador = document.getElementById('dashboardTrabajador');
    return !!((cliente && !cliente.classList.contains('hidden')) || (trabajador && !trabajador.classList.contains('hidden')));
}

function isClienteMode() {
    return document.querySelector('.mode-switch__btn.is-active')?.dataset.modo !== 'trabajador';
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
        await loadCurrentWorkspace();
        document.dispatchEvent(new CustomEvent('servicuba:data-refreshed', {
            detail: { at: Date.now(), mode: isClienteMode() ? 'cliente' : 'trabajador' }
        }));
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
