// ============================================================
// Hero de la landing: buscador instantáneo de oficios + contador
// dinámico de trabajadores disponibles.
// ============================================================
import { apiFetch, escapeHtml, notify } from './core.js';
import { showLogin } from './auth.js';
import { showDashboardCliente } from './tasks.js';

let categoriesCache = null;
let countsCache = null;
let initialized = false;

function normalize(str) {
    return (str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function pluralize(n, singular, plural) {
    return n === 1 ? singular : plural;
}

function ensureAuthenticatedSearch() {
    if (!document.getElementById('dashboardCliente')) return null;
    if (document.getElementById('heroSearchInputAuth')) return document.getElementById('heroSearchInputAuth');

    const dashboard = document.getElementById('dashboardCliente');
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
                        showDashboardCliente({ categoryId });
                        notify(`Mostrando servicios de ${categoryName}.`, 'info');
                        return;
                    } catch {
                        // Sesión realmente expirada: continuar al login.
                    }
                }

                // No forzamos registro: el usuario puede iniciar sesión y
                // conservar la búsqueda para continuar directamente con el
                // servicio/categoría seleccionado.
                notify(`Inicia sesión para ver servicios de ${categoryName} cerca de ti.`, 'info');
                showLogin();
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

    if (initialized) return;
    initialized = true;

    const observer = new MutationObserver(() => {
        const authInputNow = ensureAuthenticatedSearch();
        const authResultsNow = document.getElementById('heroSearchResultsAuth');
        bindSearch(authInputNow, authResultsNow);
    });
    observer.observe(document.getElementById('views') || document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
    });
}
