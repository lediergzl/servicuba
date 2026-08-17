import { apiFetch, escapeHtml } from './core.js';
import { showLogin } from './auth.js';

const STYLE_ID = 'servicuba-public-landing-experience';

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .landing-product-story { width:100%; max-width:760px; margin:24px auto 0; }
        .landing-product-story__steps { display:flex; flex-direction:column; gap:10px; text-align:left; }
        .landing-product-story__step { display:flex; align-items:flex-start; gap:12px; padding:13px 14px; background:var(--paper-raised); border:1px solid var(--line); border-radius:var(--radius-md); box-shadow:var(--shadow-xs); }
        .landing-product-story__icon { flex-shrink:0; width:34px; height:34px; border-radius:var(--radius-sm); background:var(--ink); color:var(--accent); display:flex; align-items:center; justify-content:center; }
        .landing-product-story__icon .icon { width:17px; height:17px; }
        .landing-product-story__title { margin:0 0 2px; font-weight:700; font-size:var(--text-sm); color:var(--ink); }
        .landing-product-story__desc { margin:0; font-size:12.5px; color:var(--muted); line-height:1.4; }
        .landing-product-story__number { font-family:var(--font-mono); font-size:10px; font-weight:700; color:var(--copper); margin-right:5px; }
        .landing-public-explore { display:flex; align-items:center; justify-content:center; gap:6px; width:100%; max-width:360px; margin:10px auto 0; padding:6px; background:none; border:0; font-family:var(--font-body); font-size:12.5px; font-weight:600; color:var(--copper); cursor:pointer; }
        .landing-public-explore:hover { text-decoration:underline; }
        .landing-public-explore .icon { width:14px; height:14px; }
        .landing-public-directory { width:100%; max-width:760px; margin:16px auto 0; }
        .landing-public-directory .modal-card { max-height:82vh; overflow:auto; }
        .landing-public-directory__hint { margin:0 0 10px; color:var(--muted); font-size:.78rem; }
        @media (max-width:700px) { .landing-product-story__step { min-height:auto; } }
        @media (prefers-reduced-motion:reduce) { .landing-product-story__step { transition:none!important; } }
    `;
    document.head.appendChild(style);
}

function getLanding() { return document.getElementById('landing'); }

const ICONS = {
    home: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9h12v-9"/><rect x="10" y="14" width="4" height="5"/></svg>',
    location: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.3"/></svg>',
    chat: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-4 4V5Z"/></svg>'
};

function consolidateHeadline() {
    const landing = getLanding();
    const title = landing?.querySelector('.view-title');
    if (title) title.textContent = 'Tus problemas, mis soluciones.';
}

function injectExploreLink() {
    const landing = getLanding();
    if (!landing || landing.querySelector('.landing-public-explore')) return;
    const search = landing.querySelector('.hero-search');
    if (!search) return;
    const link = document.createElement('button');
    link.type = 'button';
    link.id = 'landingPublicDirectoryBtn';
    link.className = 'landing-public-explore';
    link.innerHTML = `${ICONS.location}<span>Prefiero explorar sin GPS ni registrarme — ver directorio por municipio</span>`;
    search.after(link);
    link.addEventListener('click', openMunicipioDirectory);
}

function injectStory() {
    const landing = getLanding();
    if (!landing || landing.querySelector('.landing-product-story')) return;
    const story = document.createElement('section');
    story.className = 'landing-product-story';
    story.setAttribute('aria-label', 'Cómo funciona ServiCuba');
    story.innerHTML = `
        <div class="landing-product-story__steps">
            <article class="landing-product-story__step">
                <span class="landing-product-story__icon">${ICONS.home}</span>
                <div><p class="landing-product-story__title"><span class="landing-product-story__number">01</span>Publica lo que necesitas</p><p class="landing-product-story__desc">Plomero, electricista, reparador o cualquier servicio. Cuenta qué necesitas y en qué zona.</p></div>
            </article>
            <article class="landing-product-story__step">
                <span class="landing-product-story__icon">${ICONS.location}</span>
                <div><p class="landing-product-story__title"><span class="landing-product-story__number">02</span>Encuentra opciones cerca</p><p class="landing-product-story__desc">Explora por distancia, categoría o municipio. El GPS es opcional.</p></div>
            </article>
            <article class="landing-product-story__step">
                <span class="landing-product-story__icon">${ICONS.chat}</span>
                <div><p class="landing-product-story__title"><span class="landing-product-story__number">03</span>Conecten y acuerden</p><p class="landing-product-story__desc">Cuando quieras avanzar, crea tu cuenta y usa el chat interno para precio, horario y detalles.</p></div>
            </article>
        </div>
    `;
    const search = landing.querySelector('.hero-search');
    const actions = landing.querySelector('.stack-md');
    if (search) search.after(story); else if (actions) actions.before(story); else landing.appendChild(story);
}

async function openMunicipioDirectory() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay landing-public-directory';
    const modal = document.createElement('div');
    modal.className = 'modal-card';
    modal.innerHTML = `<h2 class="modal-title">Explorar sin GPS</h2><p class="modal-message">Elige un municipio para ver servicios públicos. No necesitamos tu ubicación ni tu cuenta.</p><p class="landing-public-directory__hint">Municipio</p><input id="publicMunicipioInput" class="field-input" placeholder="Ej: Plaza, Playa, Centro Habana…" autocomplete="address-level2"><select id="publicMunicipioTipo" class="field-input mt-sm"><option value="oferta">Servicios ofrecidos</option><option value="necesidad">Tareas publicadas</option></select><div id="publicMunicipioResults" class="stack-sm mt-md"></div><div class="modal-actions"><button type="button" class="btn btn-ghost" id="publicMunicipioClose">Cerrar</button></div>`;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    const input = modal.querySelector('#publicMunicipioInput');
    const tipo = modal.querySelector('#publicMunicipioTipo');
    const results = modal.querySelector('#publicMunicipioResults');
    const close = () => overlay.remove();
    modal.querySelector('#publicMunicipioClose').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    let timer = null;
    const load = async () => {
        const municipio = input.value.trim();
        if (municipio.length < 2) { results.innerHTML = '<p class="empty-state">Escribe al menos 2 letras del municipio.</p>'; return; }
        results.innerHTML = '<p class="empty-state">Buscando opciones públicas…</p>';
        try {
            const data = await apiFetch(`/discovery/directory?municipio=${encodeURIComponent(municipio)}&tipo=${encodeURIComponent(tipo.value)}`);
            const items = Array.isArray(data) ? data : [];
            if (!items.length) { results.innerHTML = '<p class="empty-state">No encontramos publicaciones públicas en ese municipio todavía.</p>'; return; }
            results.innerHTML = items.slice(0,20).map(item => `<article class="task-card"><div class="task-card__row"><h3 class="task-card__title">${item.destacada ? '★ ' : ''}${escapeHtml(item.titulo)}</h3><span class="task-card__price">$${escapeHtml(String(item.precio ?? 0))}</span></div><p class="task-card__meta">${escapeHtml(item.municipio || municipio)} · ${escapeHtml(item.categoria_nombre || 'Servicio')}</p><p class="task-card__description">${escapeHtml(item.descripcion || 'Consulta los detalles al contactar.')}</p><button type="button" class="btn btn-primary btn-block" data-public-login>Crear cuenta para contactar</button></article>`).join('');
        } catch (err) {
            results.innerHTML = `<p class="empty-state">No pudimos cargar el directorio ahora. ${escapeHtml(err.message || '')}</p>`;
        }
    };
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 350); });
    tipo.addEventListener('change', load);
    results.addEventListener('click', e => { if (!e.target.closest('[data-public-login]')) return; close(); showLogin(); });
    input.focus();
}

export function initLandingPublicExperience() {
    injectStyles();
    consolidateHeadline();
    injectExploreLink();
    injectStory();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initLandingPublicExperience, { once:true });
else initLandingPublicExperience();