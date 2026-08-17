import { apiFetch, escapeHtml, notify } from './core.js';
import { showLogin } from './auth.js';

const STYLE_ID = 'servicuba-public-landing-experience';

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .landing-product-story { width:100%; max-width:760px; margin:26px auto 0; }
        .landing-product-story__headline { margin:0 0 8px; font-family:var(--font-display); font-size:clamp(1.15rem,3vw,1.55rem); font-weight:800; color:var(--ink); }
        .landing-product-story__sub { margin:0 0 16px; color:var(--muted); font-size:.9rem; line-height:1.5; }
        .landing-product-story__steps { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
        .landing-product-story__step { position:relative; overflow:hidden; min-height:150px; padding:16px; text-align:left; background:var(--paper-raised,#fff); border:1px solid var(--line,#dfe5e2); border-radius:16px; box-shadow:var(--shadow-xs,0 2px 8px rgba(0,0,0,.05)); }
        .landing-product-story__step::after { content:''; position:absolute; right:-22px; bottom:-28px; width:90px; height:90px; border:1px solid color-mix(in srgb,var(--accent,#f2b705) 25%,transparent); border-radius:50%; opacity:.7; }
        .landing-product-story__number { display:inline-flex; width:30px; height:30px; align-items:center; justify-content:center; margin-bottom:10px; border-radius:50%; background:var(--ink,#12302e); color:var(--accent,#f2b705); font-weight:800; }
        .landing-product-story__visual { font-size:1.55rem; margin-bottom:8px; }
        .landing-product-story__step strong { display:block; margin-bottom:5px; font-size:.92rem; color:var(--ink); }
        .landing-product-story__step span:last-child { display:block; color:var(--muted); font-size:.78rem; line-height:1.45; }
        .landing-public-proof { width:100%; max-width:760px; margin:18px auto 0; padding:15px; text-align:left; background:linear-gradient(135deg,var(--paper-raised,#fff),color-mix(in srgb,var(--accent,#f2b705) 7%,#fff)); border:1px solid var(--line,#dfe5e2); border-radius:16px; }
        .landing-public-proof__row { display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .landing-public-proof__title { margin:0; font-weight:800; color:var(--ink); }
        .landing-public-proof__text { margin:4px 0 0; color:var(--muted); font-size:.78rem; line-height:1.4; }
        .landing-public-proof__badge { flex-shrink:0; padding:6px 9px; border-radius:999px; background:var(--ink,#12302e); color:var(--accent,#f2b705); font-size:.7rem; font-weight:800; }
        .landing-public-directory { width:100%; max-width:760px; margin:16px auto 0; }
        .landing-public-directory .modal-card { max-height:82vh; overflow:auto; }
        .landing-public-directory__hint { margin:0 0 10px; color:var(--muted); font-size:.78rem; }
        @media (max-width:700px) { .landing-product-story__steps { grid-template-columns:1fr; } .landing-product-story__step { min-height:auto; } .landing-public-proof__row { align-items:flex-start; } }
        @media (prefers-reduced-motion:reduce) { .landing-product-story__step { transition:none!important; } }
    `;
    document.head.appendChild(style);
}

function getLanding() { return document.getElementById('landing'); }

function injectStory() {
    const landing = getLanding();
    if (!landing || landing.querySelector('.landing-product-story')) return;
    const story = document.createElement('section');
    story.className = 'landing-product-story';
    story.setAttribute('aria-label', 'Cómo funciona ServiCuba');
    story.innerHTML = `
        <h3 class="landing-product-story__headline">Tus problemas, mis soluciones.</h3>
        <p class="landing-product-story__sub">Publica lo que necesitas — un trabajador cerca lo resuelve.</p>
        <div class="landing-product-story__steps">
            <article class="landing-product-story__step"><span class="landing-product-story__number">1</span><div class="landing-product-story__visual">🏠</div><strong>Publica lo que necesitas</strong><span>Plomero, electricista, repartidor o cualquier servicio. Cuenta qué necesitas y en qué zona.</span></article>
            <article class="landing-product-story__step"><span class="landing-product-story__number">2</span><div class="landing-product-story__visual">📍</div><strong>Encuentra opciones cerca</strong><span>Explora tareas y servicios por categoría y distancia, en lista o mapa cuando compartas ubicación.</span></article>
            <article class="landing-product-story__step"><span class="landing-product-story__number">3</span><div class="landing-product-story__visual">💬</div><strong>Conecten y acuerden</strong><span>Cuando quieras avanzar, crea tu cuenta y usa el chat interno para precio, horario y detalles.</span></article>
        </div>
    `;
    const search = landing.querySelector('.hero-search');
    const actions = landing.querySelector('.stack-md');
    if (search) search.after(story); else if (actions) actions.before(story); else landing.appendChild(story);
}

function injectPublicProof() {
    const landing = getLanding();
    if (!landing || landing.querySelector('.landing-public-proof')) return;
    const proof = document.createElement('section');
    proof.className = 'landing-public-proof';
    proof.innerHTML = `<div class="landing-public-proof__row"><div><p class="landing-public-proof__title">👀 Mira antes de registrarte</p><p class="landing-public-proof__text">Puedes descubrir servicios públicos sin entregar tus datos ni activar el GPS.</p></div><span class="landing-public-proof__badge">SIN CUENTA</span></div><button type="button" id="landingPublicDirectoryBtn" class="btn btn-secondary btn-block mt-md">Explorar por municipio</button>`;
    landing.appendChild(proof);
    proof.querySelector('#landingPublicDirectoryBtn')?.addEventListener('click', openMunicipioDirectory);
}

async function openMunicipioDirectory() {
    const overlay = document.createElement('div'); overlay.className = 'modal-overlay landing-public-directory';
    const modal = document.createElement('div'); modal.className = 'modal-card';
    modal.innerHTML = `<h2 class="modal-title">Explorar sin GPS</h2><p class="modal-message">Elige un municipio para ver servicios públicos. No necesitamos tu ubicación ni tu cuenta.</p><p class="landing-public-directory__hint">Municipio</p><input id="publicMunicipioInput" class="field-input" placeholder="Ej: Plaza, Playa, Centro Habana…" autocomplete="address-level2"><select id="publicMunicipioTipo" class="field-input mt-sm"><option value="oferta">Servicios ofrecidos</option><option value="necesidad">Tareas publicadas</option></select><div id="publicMunicipioResults" class="stack-sm mt-md"></div><div class="modal-actions"><button type="button" class="btn btn-ghost" id="publicMunicipioClose">Cerrar</button></div>`;
    overlay.appendChild(modal); document.body.appendChild(overlay);
    const input = modal.querySelector('#publicMunicipioInput'); const tipo = modal.querySelector('#publicMunicipioTipo'); const results = modal.querySelector('#publicMunicipioResults'); const close = () => overlay.remove();
    modal.querySelector('#publicMunicipioClose').addEventListener('click', close); overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    let timer = null;
    const load = async () => {
        const municipio = input.value.trim();
        if (municipio.length < 2) { results.innerHTML = '<p class="empty-state">Escribe al menos 2 letras del municipio.</p>'; return; }
        results.innerHTML = '<p class="empty-state">Buscando opciones públicas…</p>';
        try {
            const data = await apiFetch(`/discovery/directory?municipio=${encodeURIComponent(municipio)}&tipo=${encodeURIComponent(tipo.value)}`); const items = Array.isArray(data) ? data : [];
            if (!items.length) { results.innerHTML = '<p class="empty-state">No encontramos publicaciones públicas en ese municipio todavía.</p>'; return; }
            results.innerHTML = items.slice(0,20).map(item => `<article class="task-card"><div class="task-card__row"><h3 class="task-card__title">${item.destacada ? '★ ' : ''}${escapeHtml(item.titulo)}</h3><span class="task-card__price">$${escapeHtml(String(item.precio ?? 0))}</span></div><p class="task-card__meta">${escapeHtml(item.municipio || municipio)} · ${escapeHtml(item.categoria_nombre || 'Servicio')}</p><p class="task-card__description">${escapeHtml(item.descripcion || 'Consulta los detalles al contactar.')}</p><button type="button" class="btn btn-primary btn-block" data-public-login>Crear cuenta para contactar</button></article>`).join('');
        } catch (err) { results.innerHTML = `<p class="empty-state">No pudimos cargar el directorio ahora. ${escapeHtml(err.message || '')}</p>`; }
    };
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 350); }); tipo.addEventListener('change', load);
    results.addEventListener('click', e => { if (!e.target.closest('[data-public-login]')) return; close(); showLogin(); }); input.focus();
}

function showGpsFriendlyMessage() {
    const landing = getLanding(); if (!landing || landing.querySelector('.landing-gps-hint')) return;
    const hint = document.createElement('p'); hint.className = 'landing-gps-hint view-subtitle'; hint.style.cssText = 'margin:10px 0 0;font-size:.76rem'; hint.textContent = 'El GPS es opcional. Puedes explorar por municipio sin compartir tu ubicación.';
    landing.querySelector('.hero-search')?.after(hint);
}

export function initLandingPublicExperience() { injectStyles(); injectStory(); injectPublicProof(); showGpsFriendlyMessage(); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initLandingPublicExperience, { once:true }); else initLandingPublicExperience();