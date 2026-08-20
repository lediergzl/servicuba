// Cobertura y prioridad comercial de PREMIUM.
// El backend es la fuente de verdad: /dashboard/state devuelve el radio efectivo.
import { apiFetch } from './core.js';

const WORKER_RADIO_ID = 'filtroRadio';
const BASE_OPTIONS = [1, 3, 5];
const PREMIUM_OPTIONS = [1, 3, 5, 10, 20];
let lastPlanKey = null;
let syncing = false;

function isWorkerDashboardVisible() {
    const view = document.getElementById('dashboardTrabajador');
    return !!view && !view.classList.contains('hidden');
}

function renderCoverageBadge(isPremium, radius) {
    const panel = document.getElementById('tareasCercanasPanel');
    if (!panel) return;
    let badge = document.getElementById('premiumCoverageBadge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'premiumCoverageBadge';
        badge.className = 'premium-coverage-badge';
        const filters = panel.querySelector('.filter-row');
        if (filters) filters.before(badge);
    }
    if (!isPremium) {
        badge.classList.add('hidden');
        badge.innerHTML = '';
        return;
    }
    badge.classList.remove('hidden');
    badge.innerHTML = `<strong>⭐ Cobertura Premium: ${radius} km</strong><span>Acceso anticipado a las mejores oportunidades.</span>`;
}

function configureRadioSelect(isPremium, radius) {
    const select = document.getElementById(WORKER_RADIO_ID);
    if (!select) return;
    const options = isPremium ? PREMIUM_OPTIONS : BASE_OPTIONS;
    const current = Number(select.value);
    const preferred = isPremium ? Math.min(Number(radius) || 20, 20) : Math.min(Number(radius) || 5, 5);
    select.innerHTML = options.map(km => `<option value="${km}">${km} km</option>`).join('');

    // Al activar PREMIUM usamos por defecto todo su alcance. Si el usuario
    // ya eligió manualmente un radio válido, lo respetamos.
    const keepCurrent = options.includes(current) && current > 0 && lastPlanKey === (isPremium ? 'premium' : 'base');
    select.value = String(keepCurrent ? current : preferred);
    select.title = isPremium ? `Cobertura Premium: hasta ${preferred} km` : 'Cobertura estándar: hasta 5 km';
}

export async function syncPremiumCoverage(force = false) {
    if (syncing || !localStorage.getItem('token')) return;
    if (!force && !isWorkerDashboardVisible()) return;
    syncing = true;
    try {
        const state = await apiFetch('/dashboard/state', { cache: 'no-store' });
        const planName = String(state?.plan?.nombre || state?.user?.plan || '').toLowerCase();
        const isPremium = planName === 'premium';
        const radius = Number(state?.plan?.coverage_radius_km) || (isPremium ? 20 : 5);
        const planKey = isPremium ? 'premium' : 'base';
        configureRadioSelect(isPremium, radius);
        renderCoverageBadge(isPremium, radius);
        if (lastPlanKey !== planKey) {
            lastPlanKey = planKey;
            const select = document.getElementById(WORKER_RADIO_ID);
            if (select && isWorkerDashboardVisible()) select.dispatchEvent(new Event('change', { bubbles: true }));
        }
    } catch (err) {
        // No romper el dashboard por un fallo del indicador comercial.
        console.warn('[ServiCuba Premium] No se pudo sincronizar cobertura:', err);
    } finally {
        syncing = false;
    }
}

function init() {
    syncPremiumCoverage(true);
    // El plan puede cambiar mientras la SPA permanece abierta (pago/aprobación).
    // Refrescamos periódicamente, pero sólo cuando hay sesión.
    window.setInterval(() => syncPremiumCoverage(false), 5000);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) syncPremiumCoverage(true);
    });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
