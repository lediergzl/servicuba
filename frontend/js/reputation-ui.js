// ServiCuba — reputación visible en perfiles, tarjetas y experiencias verificadas.
import { apiFetch, escapeHtml } from './core.js';

const STYLE_ID = 'servicuba-reputation-ui-style';
const CARD_ID = 'servicuba-profile-reputation';
const EXPERIENCES_ID = 'servicuba-worker-experiences';

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
        .sc-reputation__stars,.experience-card__rating { color:var(--copper); letter-spacing:1px; font-size:15px; }
        .sc-reputation__count { font-size:11px; color:var(--muted); }
        .sc-reputation__grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 16px; }
        .sc-reputation__metric { min-width:0; }
        .sc-reputation__metric-top { display:flex; justify-content:space-between; gap:8px; font-size:11px; margin-bottom:4px; }
        .sc-reputation__metric-name { color:var(--muted); }
        .sc-reputation__metric-value { color:var(--ink); font-weight:700; }
        .sc-reputation__bar { height:4px; background:var(--line); overflow:hidden; border-radius:99px; }
        .sc-reputation__bar > span { display:block; height:100%; width:0; background:var(--copper); border-radius:99px; transition:width .35s ease; }
        .sc-reputation__empty,.reputation-loading { margin:0; font-size:12px; line-height:1.45; color:var(--muted); }
        .sc-card-reputation { display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin-top:7px; font-size:11px; color:var(--muted); }
        .sc-card-reputation__stars { color:var(--copper); letter-spacing:.5px; font-size:12px; }
        .sc-card-reputation__score { color:var(--ink); font-weight:800; }
        .sc-card-reputation__verified,.experience-card__verified { color:var(--success); font-weight:700; }
        .sc-card-reputation__new { color:var(--copper); font-weight:700; }
        .sc-card-reputation--empty { opacity:.8; }
        .experience-list { margin-top:14px; display:grid; gap:10px; }
        .experience-card { border-top:1px solid var(--line); padding-top:12px; }
        .experience-card__head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
        .experience-card__rating { font-size:13px; letter-spacing:.5px; }
        .experience-card__verified { display:block; margin-top:3px; font-size:10px; text-transform:uppercase; letter-spacing:.04em; }
        .experience-card__date { flex-shrink:0; color:var(--muted); font-size:10px; }
        .experience-card__dimensions { display:flex; flex-wrap:wrap; gap:5px 10px; margin-top:8px; color:var(--muted); font-size:10.5px; }
        .experience-card__dimensions strong { color:var(--ink); font-weight:700; }
        .experience-card__comment { margin:9px 0 0; color:var(--ink); font-size:12px; line-height:1.5; }
        .experience-card__location { display:inline-block; margin-top:6px; color:var(--muted); font-size:10px; }
        .experience-more { margin-top:10px; width:100%; }
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

function experienceMarkup(item) {
    const date = item.created_at ? new Date(item.created_at) : null;
    const dateText = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('es-CU', { day:'numeric', month:'short', year:'numeric' }) : '';
    const dimensions = [
        ['Calidad', item.calidad_trabajo], ['Trato', item.trato],
        ['Puntualidad', item.puntualidad], ['Precio', item.precio_acordado]
    ].filter(([, value]) => value != null)
     .map(([label, value]) => `<span><strong>${escapeHtml(label)}</strong> ${Number(value).toFixed(1)}</span>`).join(' · ');
    return `<article class="experience-card"><div class="experience-card__head"><div><div class="experience-card__rating" aria-label="${Number(item.rating || 0).toFixed(1)} de 5">${stars(item.rating)}</div><span class="experience-card__verified">✓ Servicio verificado</span></div><time class="experience-card__date">${escapeHtml(dateText)}</time></div>${dimensions ? `<div class="experience-card__dimensions">${dimensions}</div>` : ''}${item.comentario ? `<p class="experience-card__comment">“${escapeHtml(item.comentario)}”</p>` : ''}${item.municipio ? `<span class="experience-card__location">${escapeHtml(item.municipio)}</span>` : ''}</article>`;
}

async function renderExperiences(workerId, host) {
    if (!host || !workerId) return;
    let section = document.getElementById(EXPERIENCES_ID);
    if (!section) { section=document.createElement('section'); section.id=EXPERIENCES_ID; section.className='sc-reputation'; host.appendChild(section); }
    section.innerHTML='<div class="sc-reputation__head"><h3 class="sc-reputation__title">Experiencias verificadas</h3></div><p class="reputation-loading">Cargando experiencias…</p>';
    try {
        const data=await apiFetch(`/reviews/worker/${encodeURIComponent(workerId)}/experiences?limit=8`);
        if(!data?.items?.length){ section.innerHTML='<div class="sc-reputation__head"><h3 class="sc-reputation__title">Experiencias verificadas</h3></div><p class="sc-reputation__empty">Todavía no hay experiencias verificadas para este trabajador.</p>'; return; }
        section.innerHTML=`<div class="sc-reputation__head"><h3 class="sc-reputation__title">Experiencias verificadas</h3><span class="sc-reputation__verified">${Number(data.total)} ${Number(data.total)===1?'servicio':'servicios'}</span></div><div class="experience-list">${data.items.map(experienceMarkup).join('')}</div>`;
    } catch (_) { section.innerHTML=''; }
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
        const verified=summary?.verified?'<span class="sc-reputation__verified">Reputación verificada</span>':'';
        if (!total) {
            card.innerHTML=`<div class="sc-reputation__head"><h3 class="sc-reputation__title">Reputación</h3>${verified}</div><p class="sc-reputation__empty">Todavía no hay trabajos valorados.</p>`;
        } else {
            const metrics=[metric('Calidad del trabajo',dimensions.calidad_trabajo),metric('Trato',dimensions.trato),metric('Puntualidad',dimensions.puntualidad),metric('Precio acordado',dimensions.precio_acordado)].filter(Boolean).join('');
            card.innerHTML=`<div class="sc-reputation__head"><h3 class="sc-reputation__title">Reputación</h3>${verified}</div><div class="sc-reputation__overall"><strong class="sc-reputation__score">${rating.toFixed(1)}</strong><span class="sc-reputation__stars" aria-label="${rating.toFixed(1)} de 5">${stars(rating)}</span><span class="sc-reputation__count">${total} ${total===1?'reseña':'reseñas'}</span></div>${metrics?`<div class="sc-reputation__grid">${metrics}</div>`:''}`;
        }
        await renderExperiences(user.id, host);
    } catch (_) { card.innerHTML=''; }
}

async function refreshProfileReputation() {
    const host=document.getElementById('perfilContenido');
    if (!host || host.closest('.hidden')) return;
    try { await renderForUser(await apiFetch('/users/profile')); } catch (_) {}
}

function renderCardReputation(card, summary) {
    if (!card || !summary) return;
    card.querySelector('.sc-card-reputation')?.remove();
    const total=Number(summary.reviews||0), rating=Number(summary.rating||0);
    const row=document.createElement('div'); row.className='sc-card-reputation';
    row.innerHTML=total ? `<span class="sc-card-reputation__stars">${stars(rating)}</span><span class="sc-card-reputation__score">${rating.toFixed(1)}</span><span>· ${total} ${total===1?'reseña':'reseñas'}</span>${summary.verified?'<span class="sc-card-reputation__verified">✓ Verificada</span>':''}` : '<span class="sc-card-reputation__new">✦ Nuevo en ServiCuba</span>';
    card.querySelector('.task-card__meta')?.insertAdjacentElement('afterend',row) || card.appendChild(row);
}

let timer=null, running=false;
async function enrichOfferCards() {
    if(running) return;
    const container=document.getElementById('listaOfertasCercanas');
    if(!container || container.closest('.hidden')) return;
    const cards=Array.from(container.querySelectorAll('.task-card[data-id]'));
    if(!cards.length) return;
    running=true;
    try { const params=new URLSearchParams(); cards.map(c=>c.dataset.id).filter(Boolean).slice(0,50).forEach(id=>params.append('task_ids',id)); const summaries=await apiFetch(`/reviews/tasks/summaries?${params.toString()}`); cards.forEach(c=>summaries?.[c.dataset.id]&&renderCardReputation(c,summaries[c.dataset.id])); } catch (_) {} finally { running=false; }
}
function schedule(){clearTimeout(timer);timer=setTimeout(enrichOfferCards,80);}

function init(){
    ensureStyles();
    document.addEventListener('click',event=>{if(event.target.closest('.bottom-nav__item[data-view="perfil"]'))setTimeout(refreshProfileReputation,80);});
    const host=document.getElementById('perfilContenido');
    if(host)new MutationObserver(()=>{if(host.children.length)setTimeout(refreshProfileReputation,0);}).observe(host,{childList:true});
    const offers=document.getElementById('listaOfertasCercanas');
    if(offers){new MutationObserver(schedule).observe(offers,{childList:true,subtree:true});schedule();}
}

document.addEventListener('DOMContentLoaded',init);
