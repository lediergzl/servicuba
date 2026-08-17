import { loadNearbyTasks, loadNearbyOfertas } from './tasks.js';

let syncTimer = null;
let syncInFlight = false;

function isDashboardVisible() {
    const cliente = document.getElementById('dashboardCliente');
    const trabajador = document.getElementById('dashboardTrabajador');
    return !!(
        (cliente && !cliente.classList.contains('hidden')) ||
        (trabajador && !trabajador.classList.contains('hidden'))
    );
}

function isClienteMode() {
    return document.querySelector('.mode-switch__btn.is-active')?.dataset.modo !== 'trabajador';
}

export async function syncDashboardData() {
    if (syncInFlight || !isDashboardVisible() || !localStorage.getItem('token')) return;

    syncInFlight = true;
    try {
        if (isClienteMode()) {
            const ofertasPanel = document.getElementById('ofertasCercanasPanel');
            if (ofertasPanel && !ofertasPanel.classList.contains('hidden')) {
                await loadNearbyOfertas();
            } else {
                // Mis tareas es la vista principal del cliente.
                const module = await import('./tasks.js');
                if (typeof module.loadMyTasks === 'function') await module.loadMyTasks();
            }
        } else {
            const tareasPanel = document.getElementById('tareasCercanasPanel');
            if (tareasPanel && !tareasPanel.classList.contains('hidden')) {
                await loadNearbyTasks();
            } else {
                const module = await import('./tasks.js');
                if (typeof module.loadMyOfertas === 'function') await module.loadMyOfertas();
            }
        }

        document.dispatchEvent(new CustomEvent('servicuba:data-refreshed', {
            detail: { at: Date.now(), mode: isClienteMode() ? 'cliente' : 'trabajador' }
        }));
    } finally {
        syncInFlight = false;
    }
}

export function startDashboardDataSync(intervalMs = 10000) {
    stopDashboardDataSync();
    syncTimer = window.setInterval(() => {
        syncDashboardData().catch(() => {});
    }, intervalMs);
}

export function stopDashboardDataSync() {
    if (syncTimer !== null) {
        window.clearInterval(syncTimer);
        syncTimer = null;
    }
}
