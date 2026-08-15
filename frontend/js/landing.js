// ============================================================
// Hero de la landing: buscador instantáneo de oficios + contador
// dinámico de trabajadores disponibles.
// ============================================================
import { apiFetch, escapeHtml, notify } from './core.js';
import { showRegister } from './auth.js';
import { showDashboardCliente } from './tasks.js';

let categoriesCache = null;
let countsCache = null;

function normalize(str) {
    return (str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function pluralize(n, singular, plural) {
    return n === 1 ? singular : plural;
}

export async function initLandingSearch() {
    const input = document.getElementById('heroSearchInput');
    const resultsBox = document.getElementById('heroSearchResults');
    const countEl = document.getElementById('heroWorkerCount');
    if (!input) return;

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

    input.addEventListener('input', () => renderResults(input.value));
    input.addEventListener('focus', () => renderResults(input.value));

    document.addEventListener('click', (e) => {
        if (!resultsBox || resultsBox.classList.contains('hidden')) return;
        if (e.target === input || resultsBox.contains(e.target)) return;
        resultsBox.classList.add('hidden');
    });

    function renderResults(query) {
        if (!resultsBox || !categoriesCache) return;
        const q = normalize(query.trim());
        if (!q) {
            resultsBox.classList.add('hidden');
            resultsBox.innerHTML = '';
            return;
        }

        const matches = categoriesCache.filter(c => normalize(c.nombre).includes(q));
        if (!matches.length) {
            resultsBox.innerHTML = '<p class="empty-state">No encontramos ese oficio todavía. ¡Regístrate y publica tu tarea igual!</p>';
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
                sessionStorage.setItem('heroSelectedCategoriaId', btn.dataset.catId);
                resultsBox.classList.add('hidden');
                input.value = '';

                // No confiamos únicamente en la presencia del token: puede
                // haber expirado mientras la landing seguía abierta. Validar
                // la sesión aquí evita mandar a una cuenta autenticada al
                // registro por error.
                const token = localStorage.getItem('token');
                if (token) {
                    try {
                        await apiFetch('/users/profile');
                        notify(`Oficio seleccionado: ${btn.dataset.catNombre}.`, 'info');
                        showDashboardCliente();
                        return;
                    } catch {
                        // apiFetch ya elimina el token y emite auth:expired
                        // si la sesión realmente expiró. En ese caso sí debe
                        // continuar hacia registro/inicio de sesión.
                    }
                }

                sessionStorage.removeItem('heroSelectedCategoriaId');
                notify(`Regístrate para publicar tu necesidad de ${btn.dataset.catNombre} y recibir postulaciones.`, 'info');
                showRegister();
            });
        });
    }
}
