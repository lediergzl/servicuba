import { syncDashboardData } from './dashboard-live-sync.js';

const ACTION_WORDS = /postular|solicitar|aceptar|rechazar|cancelar|completar|confirmar|publicar|editar|eliminar|guardar/i;
let lastActionAt = 0;
let refreshTimer = null;

function scheduleRefresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
        syncDashboardData().catch(() => {});
    }, 650);
}

function actionLabel(target) {
    return (target?.textContent || target?.getAttribute('aria-label') || target?.getAttribute('title') || '').trim();
}

function handleClick(event) {
    const target = event.target.closest('button, [role="button"], a');
    if (!target || target.disabled) return;
    const label = actionLabel(target);
    if (!ACTION_WORDS.test(label)) return;

    const now = Date.now();
    if (now - lastActionAt < 350) return;
    lastActionAt = now;

    target.classList.add('is-action-pending');
    target.setAttribute('aria-busy', 'true');
    scheduleRefresh();

    window.setTimeout(() => {
        target.classList.remove('is-action-pending');
        target.removeAttribute('aria-busy');
    }, 1600);
}

function handleSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const label = actionLabel(form.querySelector('button[type="submit"], button'));
    if (!ACTION_WORDS.test(label)) return;
    scheduleRefresh();
}

document.addEventListener('click', handleClick, true);
document.addEventListener('submit', handleSubmit, true);
document.addEventListener('servicuba:data-refreshed', () => {
    document.querySelectorAll('.is-action-pending').forEach(el => {
        el.classList.remove('is-action-pending');
        el.removeAttribute('aria-busy');
    });
});
