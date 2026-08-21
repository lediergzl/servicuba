import { syncDashboardData } from './dashboard-live-sync.js';
import { apiFetch } from './core.js';
import { initClientApplications, refreshClientApplications } from './client-applications.js';

const ACTION_WORDS = /postular|solicitar|aceptar|rechazar|cancelar|completar|confirmar|publicar|editar|eliminar|guardar/i;
let lastActionAt = 0;
let refreshTimer = null;
let planCache = { value: null, at: 0 };

function scheduleRefresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
        syncDashboardData().catch(() => {});
        refreshClientApplications().catch(() => {});
    }, 650);
}
function actionLabel(target) { return (target?.textContent || target?.getAttribute('aria-label') || target?.getAttribute('title') || '').trim(); }

async function getPlanState(force = false) {
    if (!localStorage.getItem('token')) return null;
    if (!force && planCache.value && Date.now() - planCache.at < 15000) return planCache.value;
    try { planCache.value = await apiFetch('/dashboard/state'); planCache.at = Date.now(); return planCache.value; } catch { return null; }
}

function renderPlanCapacity(state) {
    const dashboard = document.getElementById('dashboardTrabajador');
    if (!dashboard) return;
    const info = state?.plan || state || {};
    const plan = String(info.nombre || info.plan || '').toLowerCase();
    const limit = Number(info.limite_diario ?? (plan === 'premium' ? 10 : plan === 'free' ? 0 : 1));
    const remaining = Number(info.restantes_hoy ?? Math.max(0, limit - Number(info.publicaciones_hoy || 0)));
    const radius = Number(info.coverage_radius_km ?? (plan === 'premium' ? 20 : 5));
    let el = document.getElementById('planCapacityBanner');
    if (!el) {
        el = document.createElement('div'); el.id = 'planCapacityBanner'; el.className = 'task-card';
        dashboard.querySelector('.view-header-row')?.after(el);
    }
    const premium = plan === 'premium';
    el.innerHTML = `<div class="task-card__row"><strong>${premium ? '⭐ PREMIUM' : plan === 'free' ? 'FREE' : 'BASE'}</strong><span class="chip">${remaining}/${limit}</span></div><p class="task-card__meta">${premium ? `Cobertura Premium: ${radius} km · ` : `Cobertura: ${radius} km · `}Te quedan ${remaining} de ${limit} publicaciones hoy.</p>${premium ? '<p class="task-card__meta">📣 Puedes crear anuncios promocionales desde tu perfil.</p>' : '<button id="dashboardUpgradePremium" type="button" class="btn btn-accent btn-sm">Ver ventajas PREMIUM</button>'}`;
    document.getElementById('dashboardUpgradePremium')?.addEventListener('click', () => document.dispatchEvent(new CustomEvent('servicuba:premium-upsell')));
}

async function refreshPlanUi() {
    const dashboard = document.getElementById('dashboardTrabajador');
    if (!dashboard || dashboard.classList.contains('hidden')) return;
    const state = await getPlanState(); if (state) renderPlanCapacity(state);
}

async function guardBasePublication(event) {
    const target = event.target.closest('#newOfertaBtn');
    if (!target || !localStorage.getItem('token')) return;
    const state = await getPlanState(true); if (!state) return;
    const info = state.plan || state;
    const plan = String(info.nombre || info.plan || 'base').toLowerCase();
    const remaining = Number(info.restantes_hoy ?? 1);
    if (plan === 'base' && remaining <= 0) {
        event.preventDefault(); event.stopImmediatePropagation();
        document.dispatchEvent(new CustomEvent('servicuba:premium-upsell'));
    }
}

function handleClick(event) {
    guardBasePublication(event);
    const target = event.target.closest('button, [role="button"], a');
    if (!target || target.disabled) return;
    const label = actionLabel(target); if (!ACTION_WORDS.test(label)) return;
    const now = Date.now(); if (now - lastActionAt < 350) return;
    lastActionAt = now; target.classList.add('is-action-pending'); target.setAttribute('aria-busy', 'true'); scheduleRefresh();
    window.setTimeout(() => { target.classList.remove('is-action-pending'); target.removeAttribute('aria-busy'); }, 1600);
}
function handleSubmit(event) {
    const form = event.target; if (!(form instanceof HTMLFormElement)) return;
    const label = actionLabel(form.querySelector('button[type="submit"], button')); if (!ACTION_WORDS.test(label)) return;
    planCache.at = 0; scheduleRefresh();
}

document.addEventListener('click', handleClick, true);
document.addEventListener('submit', handleSubmit, true);
document.addEventListener('servicuba:data-refreshed', () => { document.querySelectorAll('.is-action-pending').forEach(el => { el.classList.remove('is-action-pending'); el.removeAttribute('aria-busy'); }); refreshPlanUi(); refreshClientApplications().catch(() => {}); });
new MutationObserver(refreshPlanUi).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
initClientApplications();
refreshPlanUi();
