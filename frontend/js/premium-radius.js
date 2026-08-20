import { apiFetch } from './core.js';

const PREMIUM_MAX_RADIUS_KM = 20;
const STANDARD_MAX_RADIUS_KM = 5;
const SELECTORS = ['#filtroRadio', '#filtroRadioOfertas'];
let configuredToken = null;
let configuredPlan = null;
let loading = false;

function setOptions(select, maxKm, premium) {
    if (!select) return;
    const current = Number(select.value) || 3;
    const values = maxKm >= 20 ? [1, 3, 5, 10, 15, 20] : [1, 3, 5];
    select.innerHTML = '';
    values.forEach(value => {
        const option = document.createElement('option');
        option.value = String(value);
        option.textContent = `${value} km`;
        select.appendChild(option);
    });
    // Premium entra con cobertura ampliada visible desde el primer acceso.
    // Si ya había una selección válida, la conservamos; de lo contrario
    // usamos el máximo para que el beneficio sea evidente.
    const next = premium ? (values.includes(current) ? current : maxKm) : Math.min(current, maxKm);
    select.value = String(values.includes(next) ? next : values[values.length - 1]);
    select.title = premium ? 'Cobertura Premium: alcance ampliado hasta 20 km' : 'Cobertura estándar: hasta 5 km';
}

function renderCoverageBadge(premium) {
    const el = document.getElementById('premiumCoverageBadge');
    if (!el) return;
    if (!premium) {
        el.classList.add('hidden');
        el.innerHTML = '';
        return;
    }
    el.classList.remove('hidden');
    el.innerHTML = '<span class="chip" style="font-weight:700">⭐ PREMIUM · Cobertura ampliada hasta 20 km</span>';
}

async function configure() {
    const token = localStorage.getItem('token');
    if (!token) {
        configuredToken = null;
        configuredPlan = null;
        return;
    }
    if (loading) return;
    if (token === configuredToken) return;
    loading = true;
    try {
        const me = await apiFetch('/auth/me', { silentStatuses: [401] });
        const premium = String(me?.plan || '').toLowerCase() === 'premium' && (!me.plan_expira || new Date(me.plan_expira) > new Date());
        const maxKm = premium ? PREMIUM_MAX_RADIUS_KM : STANDARD_MAX_RADIUS_KM;
        SELECTORS.forEach(selector => setOptions(document.querySelector(selector), maxKm, premium));
        renderCoverageBadge(premium);
        configuredToken = token;
        configuredPlan = premium ? 'premium' : 'standard';
    } catch {
        // El backend sigue siendo la autoridad: si falla esta mejora visual,
        // no bloqueamos la navegación ni la búsqueda.
    } finally {
        loading = false;
    }
}

function resetIfLoggedOut() {
    if (!localStorage.getItem('token')) {
        configuredToken = null;
        configuredPlan = null;
        renderCoverageBadge(false);
        SELECTORS.forEach(selector => setOptions(document.querySelector(selector), STANDARD_MAX_RADIUS_KM, false));
    }
}

function boot() {
    configure();
    setInterval(() => {
        resetIfLoggedOut();
        configure();
    }, 1500);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
