// ============================================================
// Hero de la landing: descubrimiento público de oficios + contador
// dinámico de trabajadores disponibles.
// ============================================================
import { apiFetch, escapeHtml, notify, showFormModal } from './core.js';
import { showLogin } from './auth.js';
import { showDashboardCliente } from './tasks.js';
import { getLocationWithFallback } from './location.js';

let categoriesCache = null;
let countsCache = null;
let initialized = false;
let pendingSearchApplied = false;

function normalize(str) {
    return (str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function pluralize(n, singular, plural) {
    return n === 1 ? singular : plural;
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

    select.value = String(categoryId);
    pendingSearchApplied = true;
    sessionStorage.removeItem('heroSelectedCategoriaId');
    sessionStorage.removeItem('heroSelectedCategoriaNombre');

    offersTab.click();
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
}

function ensureAuthenticatedSearch() {
    const dashboard = document.getElementById('dashboardCliente') || document.getElementById('dashboardTrabajador');
    if (!dashboard) return null;

    const existing = document.getElementById('heroSearchInputAuth');
    if (existing) {
        const wrapper = existing.closest('.hero-search--dashboard');
        const tabs = dashboard.querySelector('.sub-tabs');
        if (wrapper && tabs && wrapper.parentNode !== dashboard) {
            tabs.parentNode.insertBefore(wrapper, tabs);
        }
        return existing;
    }

    const tabs = dashboard.querySelector('.sub-tabs');
    if (!tabs) return null;

    const wrapper = document.createElement('div');
    wrapper.className = 'hero-search hero-search--dashboard';
    wrapper.innerHTML = `
        <input type="text" id="heroSearchInputAuth" class="field-input"
               placeholder="Buscar un oficio: plomero, electricista, albañil…" autocomplete="off">
        <div id="heroSearchResultsAuth" class="hero-search__results hidden"></div>
    `;
    tabs.parentNode.insertBefore(wrapper, tabs);
    return wrapper.querySelector('#heroSearchInputAuth');
}

async function showPublicCategoryResults(categoryId, categoryName) {
    const location = await getLocationWithFallback();
    if (!location) return;

    let results;
    try {
        results = await apiFetch(`/discovery/offers?lat=${encodeURIComponent(location.lat)}&lng=${encodeURIComponent(location.lng)}&radius_km=10&category_id=${encodeURIComponent(categoryId)}`);
    } catch (err) {
        notify(`No pudimos buscar servicios de ${categoryName}: ${err.message}`, 'error');
        return;
    }

    const items = Array.isArray(results) ? results : [];
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const modal = document.createElement('div');
    modal.className = 'modal-card';

    const heading = document.createElement('h2');
    heading.className = 'modal-title';
    heading.textContent = `${categoryName} cerca de ti`;
    modal.appendChild(heading);

    const subtitle = document.createElement('p');
    subtitle.className = 'modal-message';
    subtitle.textContent = items.length
        ? `${items.length} servicio${items.length === 1 ? '' : 's'} encontrado${items.length === 1 ? '' : 's'}. Inicia sesión para contactar al trabajador.`
        : 'No encontramos servicios de este oficio dentro del radio de búsqueda.';
    modal.appendChild(subtitle);

    const list = document.createElement('div');
    list.className = 'stack-sm';
    if (items.length) {
        items.slice(0, 20).forEach(t => {
            const row = document.createElement('div');
            row.className = 'task-card';
            row.innerHTML = `
                <div class="task-card__row">
                    <h3 class="task-card__title">${t.destacada ? '★ ' : ''}${escapeHtml(t.titulo)}</h3>
                    <span class="task-card__price">$${escapeHtml(String(t.precio ?? 0))}</span>
                </div>
                <p class="task-card__meta"><span class="chip">${escapeHtml(String(t.distancia_km ?? ''))} km</span></p>
                <button type="button" class="btn btn-primary btn-block" data-action="login">Iniciar sesión para contactar</button>
            `;
            list.appendChild(row);
        });
    }
    modal.appendChild(list);

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn btn-ghost';
    closeBtn.textContent = 'Cerrar';
    actions.appendChild(closeBtn);
    modal.appendChild(actions);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    list.addEventListener('click', e => {
        if (!e.target.closest('[data-action="login"]')) return;
        close();
        showLogin();
    });
}

function bindSearch(input, resultsBox) {
    if (!input || !resultsBox || input.dataset.searchBound === '1') return;
    input.dataset.searchBound = '1';

    const renderResults = (query) => {
        if (!categoriesCache) return;
        const q = normalize(query.trim());
        if (!q) {
            resultsBox.classList.add('hidden');
            resultsBox.innerHTML = '';
            return;
        }

        const matches = categoriesCache.filter(c => normalize(c.nombre).includes(q));
        if (!matches.length) {
            resultsBox.innerHTML = '<p class="empty-state">No encontramos ese oficio todavía.</p>';
            resultsBox.classList.remove('hidden');
            return;
        }

        resultsBox.innerHTML = matches.slice(0, 6).map(c => {
            const count = (countsCache?.por_categoria && countsCache.por_categoria[String(c.id)]) || 0;
            return `
                <button type="button" class="hero-search__item" data-cat-id="${c.id}" data-cat-nombre="${escapeHtml(c.nombre)}">
                    <span class="hero-search__item-icon">${c.icono ? escapeHtml(c.icono) : '🔹'}</span>
                    <span class="hero-search__item-text">
                        <span class="hero-search__item-name">${escapeHtml(c.nombre)}</span>
                        <span class="hero-search__item-count">${count} ${pluralize(count, 'disponible', 'disponibles')}</span>
                    </span>
                </button>
            `;
        }).join('');
        resultsBox.classList.remove('hidden');

        resultsBox.querySelectorAll('.hero-search__item').forEach(btn => {
            btn.addEventListener('click', async () => {
                const categoryId = String(btn.dataset.catId);
                const categoryName = btn.dataset.catNombre;
                sessionStorage.setItem('heroSelectedCategoriaId', categoryId);
                sessionStorage.setItem('heroSelectedCategoriaNombre', categoryName);
                resultsBox.classList.add('hidden');
                input.value = '';

                const token = localStorage.getItem('token');
                if (token) {
                    try {
                        await apiFetch('/users/profile');
                        const clientModeBtn = document.querySelector('.mode-switch__btn[data-modo="cliente"]');
                        if (clientModeBtn && !clientModeBtn.classList.contains('is-active')) {
                            clientModeBtn.click();
                            await new Promise(resolve => setTimeout(resolve, 50));
                        }
                        showDashboardCliente();
                        pendingSearchApplied = false;
                        if (!applyPendingCategorySearch()) {
                            setTimeout(applyPendingCategorySearch, 50);
                            setTimeout(applyPendingCategorySearch, 250);
                            setTimeout(applyPendingCategorySearch, 1000);
                        }
                        notify(`Mostrando servicios de ${categoryName}.`, 'info');
                        return;
                    } catch {
                        // Sesión realmente expirada: continuar al descubrimiento público.
                    }
                }

                await showPublicCategoryResults(categoryId, categoryName);
            });
        });
    };

    input.addEventListener('input', () => renderResults(input.value));
    input.addEventListener('focus', () => renderResults(input.value));

    resultsBox.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', e => {
        if (e.target === input || resultsBox.contains(e.target)) return;
        resultsBox.classList.add('hidden');
    });
}

export async function initLandingSearch() {
    const input = document.getElementById('heroSearchInput');
    const resultsBox = document.getElementById('heroSearchResults');
    const countEl = document.getElementById('heroWorkerCount');

    try {
        const [cats, stats] = await Promise.all([
            apiFetch('/categories'),
            apiFetch('/users/stats/workers-count'),
        ]);
        categoriesCache = cats;
        countsCache = stats;
        if (countEl) {
            countEl.textContent = stats.total > 0
                ? `${stats.total} ${pluralize(stats.total, 'trabajador disponible', 'trabajadores disponibles')} ahora mismo`
                : 'Publica tu necesidad y recibe postulaciones en minutos.';
        }
    } catch {
        if (countEl) countEl.textContent = 'Publica tu necesidad y recibe postulaciones en minutos.';
        return;
    }

    bindSearch(input, resultsBox);
    ensureAuthenticatedSearch();
    const authInput = document.getElementById('heroSearchInputAuth');
    const authResults = document.getElementById('heroSearchResultsAuth');
    bindSearch(authInput, authResults);
    applyPendingCategorySearch();

    if (initialized) return;
    initialized = true;

    const observer = new MutationObserver(() => {
        const authInputNow = ensureAuthenticatedSearch();
        const authResultsNow = document.getElementById('heroSearchResultsAuth');
        bindSearch(authInputNow, authResultsNow);
        if (!applyPendingCategorySearch() && sessionStorage.getItem('heroSelectedCategoriaId')) {
            setTimeout(applyPendingCategorySearch, 50);
            setTimeout(applyPendingCategorySearch, 250);
            setTimeout(applyPendingCategorySearch, 1000);
        }
    });
    observer.observe(document.getElementById('views') || document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class']
    });
}