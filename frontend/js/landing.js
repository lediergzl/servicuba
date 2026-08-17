// ============================================================
// Hero de la landing: descubrimiento público de oficios + contador
// dinámico de trabajadores disponibles + actividad real.
// ============================================================
import { apiFetch, escapeHtml, notify } from './core.js';
import { showLogin } from './auth.js';
import { showDashboardCliente } from './tasks.js';
import { getLocationWithFallback } from './location.js';

let categoriesCache = null;
let countsCache = null;
let initialized = false;
let pendingSearchApplied = false;

function normalize(str) { return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function pluralize(n, singular, plural) { return n === 1 ? singular : plural; }

function timeAgo(iso) {
    if (!iso) return '';
    const diffMs = Math.max(0, Date.now() - new Date(iso).getTime());
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'justo ahora';
    if (mins < 60) return `hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs} h`;
    return `hace ${Math.floor(hrs / 24)} d`;
}

function freshnessMinutes(iso) {
    if (!iso) return Infinity;
    const timestamp = new Date(iso).getTime();
    if (!Number.isFinite(timestamp)) return Infinity;
    return Math.floor((Date.now() - timestamp) / 60000);
}

function ensureLiveFeedStyles() {
    if (document.getElementById('landing-live-feed-fix-style')) return;
    const style = document.createElement('style');
    style.id = 'landing-live-feed-fix-style';
    style.textContent = `.live-feed__item{display:flex;align-items:baseline;gap:8px;padding:9px 0;border-bottom:1px solid var(--line);font-size:13px}.live-feed__text{flex:1;min-width:0;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.live-feed__time{flex-shrink:0;font-size:11px;color:var(--muted)}.live-feed__icon{flex-shrink:0;font-size:14px}.live-feed__label{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin:0 0 8px}.live-dot{width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:var(--success);animation:live-pulse 1.8s ease-in-out infinite}@keyframes live-pulse{0%,100%{opacity:1}50%{opacity:.35}}`;
    document.head.appendChild(style);
}

function ensureLiveFeed() {
    ensureLiveFeedStyles();
    const landing = document.getElementById('landing');
    if (!landing || document.getElementById('landingLiveFeed')) return;
    const feed = document.createElement('section');
    feed.id = 'landingLiveFeed';
    feed.className = 'live-feed hidden';
    feed.innerHTML = '<p class="live-feed__label" id="liveFeedLabel"><span class="live-dot"></span>Actividad reciente en ServiCuba</p><div id="liveFeedList" class="live-feed__list"></div>';
    const search = landing.querySelector('.hero-search');
    const actions = landing.querySelector('.stack-md');
    if (search) search.after(feed); else if (actions) actions.before(feed); else landing.appendChild(feed);
}

function renderLiveFeed(items) {
    ensureLiveFeed();
    const container = document.getElementById('liveFeedList');
    const wrapper = document.getElementById('landingLiveFeed');
    const label = document.getElementById('liveFeedLabel');
    if (!container || !wrapper) return;

    const safeItems = Array.isArray(items) ? items : [];
    const mostRecentMins = safeItems.length ? freshnessMinutes(safeItems[0].created_at) : Infinity;
    const isTrulyLive = safeItems.length >= 2 && mostRecentMins < 60 * 24 * 3;
    if (!isTrulyLive) {
        wrapper.classList.add('hidden');
        return;
    }

    wrapper.classList.remove('hidden');
    if (label) {
        label.innerHTML = mostRecentMins < 60
            ? '<span class="live-dot"></span>Esto está pasando ahora mismo'
            : '<span class="live-dot"></span>Actividad reciente en ServiCuba';
    }

    container.innerHTML = safeItems.slice(0, 5).map(item => {
        const verbo = item.tipo === 'oferta' ? 'Ofrece' : 'Busca';
        const icono = item.categoria_icono ? escapeHtml(item.categoria_icono) : '';
        const titulo = escapeHtml(item.titulo || 'Nueva publicación');
        const municipio = item.municipio ? escapeHtml(item.municipio) : '';
        const textParts = [titulo];
        if (municipio) textParts.push(municipio);
        return `<div class="live-feed__item"><span class="live-feed__icon">${icono}</span><span class="live-feed__text"><strong>${verbo}:</strong> ${textParts.join(' · ')}</span><span class="live-feed__time mono">${timeAgo(item.created_at)}</span></div>`;
    }).join('');
}

function applyPendingCategorySearch() {
    if (pendingSearchApplied) return true;
    const categoryId = sessionStorage.getItem('heroSelectedCategoriaId');
    if (!categoryId) return false;
    const select = document.getElementById('filtroCategoriaOfertas');
    const offersTab = document.querySelector('.sub-tab[data-clientetab="ofertas"]');
    if (!select || !offersTab) return false;
    const option = Array.from(select.options).find(o => String(o.value) === String(categoryId));
    if (!option) return false;
    select.value = String(categoryId); pendingSearchApplied = true;
    sessionStorage.removeItem('heroSelectedCategoriaId'); sessionStorage.removeItem('heroSelectedCategoriaNombre');
    offersTab.click(); select.dispatchEvent(new Event('change', { bubbles: true })); return true;
}

function ensureAuthenticatedSearch() {
    const dashboard = document.getElementById('dashboardCliente') || document.getElementById('dashboardTrabajador');
    if (!dashboard) return null;
    const existing = document.getElementById('heroSearchInputAuth');
    if (existing) { const wrapper = existing.closest('.hero-search--dashboard'); const tabs = dashboard.querySelector('.sub-tabs'); if (wrapper && tabs && wrapper.parentNode !== dashboard) tabs.parentNode.insertBefore(wrapper, tabs); return existing; }
    const tabs = dashboard.querySelector('.sub-tabs'); if (!tabs) return null;
    const wrapper = document.createElement('div'); wrapper.className = 'hero-search hero-search--dashboard';
    wrapper.innerHTML = '<input type="text" id="heroSearchInputAuth" class="field-input" placeholder="Buscar un oficio: plomero, electricista, albañil…" autocomplete="off"><div id="heroSearchResultsAuth" class="hero-search__results hidden"></div>';
    tabs.parentNode.insertBefore(wrapper, tabs); return wrapper.querySelector('#heroSearchInputAuth');
}

async function showPublicCategoryResults(categoryId, categoryName) {
    const location = await getLocationWithFallback();
    if (!location) { notify('No pudimos usar tu ubicación. Puedes explorar por municipio sin compartir GPS.', 'info'); document.getElementById('landingPublicDirectoryBtn')?.click(); return; }
    let results;
    try { results = await apiFetch(`/discovery/offers?lat=${encodeURIComponent(location.lat)}&lng=${encodeURIComponent(location.lng)}&radius_km=10&category_id=${encodeURIComponent(categoryId)}`); }
    catch (err) { notify(`No pudimos buscar servicios de ${categoryName}: ${err.message}`, 'error'); return; }
    const items = Array.isArray(results) ? results : [];
    const overlay = document.createElement('div'); overlay.className = 'modal-overlay';
    const modal = document.createElement('div'); modal.className = 'modal-card';
    const heading = document.createElement('h2'); heading.className = 'modal-title'; heading.textContent = `${categoryName} cerca de ti`; modal.appendChild(heading);
    const subtitle = document.createElement('p'); subtitle.className = 'modal-message'; subtitle.textContent = items.length ? `${items.length} servicio${items.length === 1 ? '' : 's'} encontrado${items.length === 1 ? '' : 's'}. Inicia sesión para contactar al trabajador.` : 'No encontramos servicios de este oficio dentro del radio de búsqueda.'; modal.appendChild(subtitle);
    const list = document.createElement('div'); list.className = 'stack-sm';
    if (items.length) items.slice(0, 20).forEach(t => { const row = document.createElement('div'); row.className = 'task-card'; row.innerHTML = `<div class="task-card__row"><h3 class="task-card__title">${t.destacada ? '★ ' : ''}${escapeHtml(t.titulo)}</h3><span class="task-card__price">$${escapeHtml(String(t.precio ?? 0))}</span></div><p class="task-card__meta"><span class="chip">${escapeHtml(String(t.distancia_km ?? ''))} km</span></p><button type="button" class="btn btn-primary btn-block" data-action="login">Iniciar sesión para contactar</button>`; list.appendChild(row); });
    modal.appendChild(list);
    const actions = document.createElement('div'); actions.className = 'modal-actions'; const closeBtn = document.createElement('button'); closeBtn.type = 'button'; closeBtn.className = 'btn btn-ghost'; closeBtn.textContent = 'Cerrar'; actions.appendChild(closeBtn); modal.appendChild(actions);
    overlay.appendChild(modal); document.body.appendChild(overlay); const close = () => overlay.remove(); closeBtn.addEventListener('click', close); overlay.addEventListener('click', e => { if (e.target === overlay) close(); }); list.addEventListener('click', e => { if (!e.target.closest('[data-action="login"]')) return; close(); showLogin(); });
}

function bindSearch(input, resultsBox) {
    if (!input || !resultsBox || input.dataset.searchBound === '1') return; input.dataset.searchBound = '1';
    const renderResults = query => {
        if (!categoriesCache) return; const q = normalize(query.trim());
        if (!q) { resultsBox.classList.add('hidden'); resultsBox.innerHTML = ''; return; }
        const matches = categoriesCache.filter(c => normalize(c.nombre).includes(q));
        if (!matches.length) { resultsBox.innerHTML = '<p class="empty-state">No encontramos ese oficio todavía.</p>'; resultsBox.classList.remove('hidden'); return; }
        resultsBox.innerHTML = matches.slice(0, 6).map(c => { const count = (countsCache?.por_categoria && countsCache.por_categoria[String(c.id)]) || 0; return `<button type="button" class="hero-search__item" data-cat-id="${c.id}" data-cat-nombre="${escapeHtml(c.nombre)}"><span class="hero-search__item-icon">${c.icono ? escapeHtml(c.icono) : ''}</span><span class="hero-search__item-text"><span class="hero-search__item-name">${escapeHtml(c.nombre)}</span><span class="hero-search__item-count">${count} ${pluralize(count, 'disponible', 'disponibles')}</span></span></button>`; }).join('');
        resultsBox.classList.remove('hidden');
        resultsBox.querySelectorAll('.hero-search__item').forEach(btn => btn.addEventListener('click', async () => {
            const categoryId = String(btn.dataset.catId); const categoryName = btn.dataset.catNombre; sessionStorage.setItem('heroSelectedCategoriaId', categoryId); sessionStorage.setItem('heroSelectedCategoriaNombre', categoryName); resultsBox.classList.add('hidden'); input.value = '';
            const token = localStorage.getItem('token');
            if (token) { try { await apiFetch('/users/profile'); const clientModeBtn = document.querySelector('.mode-switch__btn[data-modo="cliente"]'); if (clientModeBtn && !clientModeBtn.classList.contains('is-active')) { clientModeBtn.click(); await new Promise(resolve => setTimeout(resolve, 50)); } showDashboardCliente(); pendingSearchApplied = false; if (!applyPendingCategorySearch()) { setTimeout(applyPendingCategorySearch, 50); setTimeout(applyPendingCategorySearch, 250); setTimeout(applyPendingCategorySearch, 1000); } notify(`Mostrando servicios de ${categoryName}.`, 'info'); return; } catch {} }
            await showPublicCategoryResults(categoryId, categoryName);
        }));
    };
    input.addEventListener('input', () => renderResults(input.value)); input.addEventListener('focus', () => renderResults(input.value)); resultsBox.addEventListener('click', e => e.stopPropagation()); document.addEventListener('click', e => { if (e.target === input || resultsBox.contains(e.target)) return; resultsBox.classList.add('hidden'); });
}

export async function initLandingSearch() {
    const input = document.getElementById('heroSearchInput'); const resultsBox = document.getElementById('heroSearchResults'); const countEl = document.getElementById('heroWorkerCount');
    ensureLiveFeed();
    try {
        const [cats, stats, activity] = await Promise.all([apiFetch('/categories'), apiFetch('/users/stats/workers-count'), apiFetch('/discovery/recent-activity').catch(() => [])]);
        categoriesCache = cats; countsCache = stats; renderLiveFeed(activity);
        if (countEl) countEl.textContent = stats.total > 0 ? `${stats.total} ${pluralize(stats.total, 'trabajador disponible', 'trabajadores disponibles')} ahora mismo` : 'Publica tu necesidad y recibe postulaciones en minutos.';
    } catch { if (countEl) countEl.textContent = 'Publica tu necesidad y recibe postulaciones en minutos.'; return; }
    bindSearch(input, resultsBox); ensureAuthenticatedSearch(); bindSearch(document.getElementById('heroSearchInputAuth'), document.getElementById('heroSearchResultsAuth')); applyPendingCategorySearch();
    if (initialized) return; initialized = true;
    const observerTarget = document.getElementById('views'); if (!observerTarget) return;
    const observer = new MutationObserver(() => { const authInputNow = ensureAuthenticatedSearch(); bindSearch(authInputNow, document.getElementById('heroSearchResultsAuth')); applyPendingCategorySearch(); }); observer.observe(observerTarget, { subtree: true, childList: true });
}