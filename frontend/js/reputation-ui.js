// ServiCuba — reputación visible en perfiles y tarjetas públicas.
// La reputación es enriquecimiento: si falla, la experiencia principal sigue funcionando.
import { apiFetch, escapeHtml } from './core.js';

const STYLE_ID = 'servicuba-reputation-ui-style';
const CARD_ID = 'servicuba-profile-reputation';
const OFFER_SELECTOR = '#listaOfertasCercanas .task-card';

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .sc-reputation { margin-top:16px; padding-top:16px; border-top:1px solid var(--line); }
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
        .sc-card-reputation { display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin-top:7px; font-size:11px; color:var(--muted); }
        .sc-card-reputation__stars { color:var(--copper); letter-spacing:.5px; font-size:12px; }
        .sc-card-reputation__score { color:var(--ink); font-weight:800; }
        .sc-card-reputation__verified { color:var(--success); font-weight:700; }
        .sc-card-reputation--empty { opacity:.8; }
        @media(max-width:480px){ .sc-reputation__grid { grid-template-columns:1fr; } }
    `;
    document.head.appendChild(style);
}

function stars(rating) {
    const rounded = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    return Array.from({ length:5 }, (_, i) => i < rounded ? '★' : '☆').join('');
}

function metric(label, value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '';
    const safe = Math.max(0, Math.min(5, n));
    return `<div class="sc-reputation__metric"><div class="sc-reputation__metric-top"><span class="sc-reputation__metric-name">${escapeHtml(label)}</span><span class="sc-reputation__metric-value">${safe.toFixed(1)}</span></div><div class="sc-reputation__bar"><span style="width:${safe * 20}%"></span></div></div>`;
}

async function renderForUser(user) {
    const host = document.getElementById('perfilContenido');
    if (!host || !user?.es_trabajador || !user.id) return;
    ensureStyles();
    let card = document.getElementById(CARD_ID);
    if (!card) { card=document.createElement('section'); card.id=CARD_ID; card.className='sc-reputation'; host.appendChild(card); }
    card.innerHTML='<p class="sc-reputation__empty">Cargando reputación…</p>';
    try {
        const summary=await apiFetch(`/reviews/worker/${encodeURIComponent(user.id)}/summary`);
        const total=Number(summary?.reviews||0), rating=Number(summary?.rating||0), dimensions=summary?.dimensions||{};
        if (!total) {
            card.innerHTML='<div class="sc-reputation__head"><h3 class="sc-reputation__title">Reputación</h3></div><p class="sc-reputation__empty">Todavía no hay trabajos valorados. Cuando completes tu primer servicio confirmado, podrás convertir esa experiencia en una referencia para futuros clientes.</p>';
            return;
        }
        const verified=summary?.verified?'<span class="sc-reputation__verified">Reputación verificada</span>':'';
        const metrics=[metric('Calidad del trabajo',dimensions.calidad_trabajo),metric('Trato',dimensions.trato),metric('Puntualidad',dimensions.puntualidad),metric('Precio acordado',dimensions.precio_acordado)].filter(Boolean).join('');
        card.innerHTML=`<div class="sc-reputation__head"><h3 class="sc-reputation__title">Reputación</h3>${verified}</div><div class="sc-reputation__overall"><strong class="sc-reputation__score">${rating.toFixed(1)}</strong><span class="sc-reputation__stars" aria-label="${rating.toFixed(1)} de 5">${stars(rating)}</span><span class="sc-reputation__count">${total} ${total===1?'reseña':'reseñas'}</span></div>${metrics?`<div class="sc-reputation__grid">${metrics}</div>`:''}`;
    } catch (_) { card.innerHTML=''; }
}

async function refreshProfileReputation() {
    const host=document.getElementById('perfilContenido');
    if (!host || host.closest('.hidden')) return;
    try { await renderForUser(await apiFetch('/users/profile')); } catch (_) {}
}

function renderCardReputation(card, summary) {
    if (!card || !summary) return;
    const existing = card.querySelector('.sc-card-reputation');
    if (existing) existing.remove();
    const total = Number(summary.reviews || 0);
    const rating = Number(summary.rating || 0);
    const row = document.createElement('div');
    row.className = 'sc-card-reputation';
    if (!total) {
        row.classList.add('sc-card-reputation--empty');
        row.innerHTML = '<span>Sin reseñas verificadas todavía</span>';
    } else {
        row.innerHTML = `<span class="sc-card-reputation__stars" aria-hidden="true">${stars(rating)}</span><span class="sc-card-reputation__score">${rating.toFixed(1)}</span><span>· ${total} ${total === 1 ? 'reseña' : 'reseñas'}</span>${summary.verified ? '<span class="sc-card-reputation__verified">✓ Verificada</span>' : ''}`;
    }
    const meta = card.querySelector('.task-card__meta');
    if (meta) meta.insertAdjacentElement('afterend', row);
    else card.appendChild(row);
}

let offerEnrichmentTimer = null;
let offerEnrichmentRunning = false;

async function enrichOfferCards() {
    if (offerEnrichmentRunning) return;
    const container = document.getElementById('listaOfertasCercanas');
    if (!container || container.closest('.hidden')) return;
    const cards = Array.from(container.querySelectorAll('.task-card[data-id]'));
    if (!cards.length) return;

    const ids = cards.map(card => card.dataset.id).filter(Boolean);
    if (!ids.length) return;

    offerEnrichmentRunning = true;
    try {
        const params = new URLSearchParams();
        ids.slice(0, 50).forEach(id => params.append('task_ids', id));
        const summaries = await apiFetch(`/reviews/tasks/summaries?${params.toString()}`);
        cards.forEach(card => {
            const summary = summaries?.[card.dataset.id];
            if (summary) renderCardReputation(card, summary);
        });
    } catch (_) {
        // La reputación nunca debe bloquear la búsqueda de servicios.
    } finally {
        offerEnrichmentRunning = false;
    }
}

function scheduleOfferEnrichment() {
    clearTimeout(offerEnrichmentTimer);
    offerEnrichmentTimer = setTimeout(enrichOfferCards, 80);
}

function init() {
    ensureStyles();
    document.addEventListener('click',event=>{
        if(event.target.closest('.bottom-nav__item[data-view="perfil"]')) setTimeout(refreshProfileReputation,80);
    });
    const host=document.getElementById('perfilContenido');
    if(host){
        const observer=new MutationObserver(()=>{ if(host.children.length) setTimeout(refreshProfileReputation,0); });
        observer.observe(host,{childList:true});
    }

    const offers = document.getElementById('listaOfertasCercanas');
    if (offers) {
        const observer = new MutationObserver(scheduleOfferEnrichment);
        observer.observe(offers, { childList: true, subtree: true });
        document.addEventListener('click', event => {
            if (event.target.closest('[data-clientetab="ofertas"]')) scheduleOfferEnrichment();
        });
        scheduleOfferEnrichment();
    }
}

document.addEventListener('DOMContentLoaded',init);