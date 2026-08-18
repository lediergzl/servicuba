// ServiCuba — reputación visible en perfiles.
// Mantiene la lógica de reputación fuera de app.js para evitar acoplarla
// al dashboard y poder evolucionarla sin tocar autenticación/navegación.
import { apiFetch, escapeHtml } from './core.js';

const STYLE_ID = 'servicuba-reputation-ui-style';
const CARD_ID = 'servicuba-profile-reputation';

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .sc-reputation { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line); }
        .sc-reputation__head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
        .sc-reputation__title { margin:0; font-size:13px; font-weight:800; color:var(--ink); }
        .sc-reputation__verified { font-size:10px; font-weight:800; color:var(--success); text-transform:uppercase; letter-spacing:.05em; }
        .sc-reputation__overall { display:flex; align-items:center; gap:8px; margin-bottom:13px; }
        .sc-reputation__score { font:800 25px/1 var(--font-display); color:var(--ink); }
        .sc-reputation__stars { color:var(--copper); letter-spacing:1px; font-size:15px; }
        .sc-reputation__count { font-size:11px; color:var(--muted); }
        .sc-reputation__grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 16px; }
        .sc-reputation__metric { min-width:0; }
        .sc-reputation__metric-top { display:flex; justify-content:space-between; gap:8px; font-size:11px; margin-bottom:4px; }
        .sc-reputation__metric-name { color:var(--muted); }
        .sc-reputation__metric-value { color:var(--ink); font-weight:700; }
        .sc-reputation__bar { height:4px; background:var(--line); overflow:hidden; border-radius:99px; }
        .sc-reputation__bar > span { display:block; height:100%; width:0; background:var(--copper); border-radius:99px; transition:width .35s ease; }
        .sc-reputation__empty { margin:0; font-size:12px; line-height:1.45; color:var(--muted); }
        @media(max-width:480px){ .sc-reputation__grid { grid-template-columns:1fr; } }
    `;
    document.head.appendChild(style);
}

function stars(rating) {
    const rounded = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    return Array.from({ length: 5 }, (_, i) => i < rounded ? '★' : '☆').join('');
}

function metric(label, value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '';
    const safe = Math.max(0, Math.min(5, n));
    return `<div class="sc-reputation__metric">
        <div class="sc-reputation__metric-top"><span class="sc-reputation__metric-name">${escapeHtml(label)}</span><span class="sc-reputation__metric-value">${safe.toFixed(1)}</span></div>
        <div class="sc-reputation__bar"><span style="width:${safe * 20}%"></span></div>
    </div>`;
}

async function renderForUser(user) {
    const host = document.getElementById('perfilContenido');
    if (!host || !user?.es_trabajador || !user.id) return;
    ensureStyles();

    let card = document.getElementById(CARD_ID);
    if (!card) {
        card = document.createElement('section');
        card.id = CARD_ID;
        card.className = 'sc-reputation';
        host.appendChild(card);
    }
    card.innerHTML = '<p class="sc-reputation__empty">Cargando reputación…</p>';

    try {
        const summary = await apiFetch(`/reviews/worker/${encodeURIComponent(user.id)}/summary`);
        const total = Number(summary?.total_reviews || 0);
        const rating = Number(summary?.rating || 0);
        if (!total) {
            card.innerHTML = `<div class="sc-reputation__head"><h3 class="sc-reputation__title">Reputación</h3></div><p class="sc-reputation__empty">Todavía no hay suficientes trabajos valorados. Tu primera experiencia completada podrá convertirse en una referencia para futuros clientes.</p>`;
            return;
        }
        const verified = summary?.verified ? '<span class="sc-reputation__verified">Reputación verificada</span>' : '';
        const metrics = [
            metric('Calidad del trabajo', summary?.calidad),
            metric('Trato', summary?.trato),
            metric('Puntualidad', summary?.puntualidad),
            metric('Precio acordado', summary?.precio),
        ].filter(Boolean).join('');
        card.innerHTML = `<div class="sc-reputation__head"><h3 class="sc-reputation__title">Reputación</h3>${verified}</div>
            <div class="sc-reputation__overall"><strong class="sc-reputation__score">${rating.toFixed(1)}</strong><span class="sc-reputation__stars" aria-label="${rating.toFixed(1)} de 5">${stars(rating)}</span><span class="sc-reputation__count">${total} ${total === 1 ? 'reseña' : 'reseñas'}</span></div>
            ${metrics ? `<div class="sc-reputation__grid">${metrics}</div>` : ''}`;
    } catch (err) {
        // La reputación es enriquecimiento; nunca debe impedir abrir el perfil.
        card.innerHTML = '';
    }
}

async function refreshProfileReputation() {
    const host = document.getElementById('perfilContenido');
    if (!host || host.closest('.hidden')) return;
    try {
        const user = await apiFetch('/users/profile');
        await renderForUser(user);
    } catch (_) {}
}

function init() {
    document.addEventListener('click', event => {
        const profileButton = event.target.closest('.bottom-nav__item[data-view="perfil"]');
        if (profileButton) setTimeout(refreshProfileReputation, 80);
    });
    const host = document.getElementById('perfilContenido');
    if (host) {
        const observer = new MutationObserver(() => {
            if (host.children.length) setTimeout(refreshProfileReputation, 0);
        });
        observer.observe(host, { childList: true });
    }
}

document.addEventListener('DOMContentLoaded', init);
