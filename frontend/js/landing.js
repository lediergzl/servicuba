// ============================================================
// Hero de la landing: buscador instantáneo de oficios + contador
// dinámico de trabajadores disponibles.
//
// Diseño pensado para conexiones lentas (mismo criterio que el resto
// de la app): UNA sola petición al cargar (categorías + conteos), y el
// filtrado por tecla se hace 100% en el cliente — nada de golpear la
// red en cada letra que el usuario escribe.
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
    if (!input) return; // la landing no está en el DOM (no debería pasar)

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
        // Sin conexión o falla la carga: el hero sigue funcionando como
        // landing simple, sin buscador activo.
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
            btn.addEventListener('click', () => {
                // Se guarda para poder pre-rellenar "Nueva tarea" apenas
                // el usuario tenga cuenta — no bloquea el registro si no
                // se usa en ningún otro lado todavía.
                sessionStorage.setItem('heroSelectedCategoriaId', btn.dataset.catId);
                resultsBox.classList.add('hidden');
                input.value = '';

                if (localStorage.getItem('token')) {
                    // Ya tiene cuenta — no tiene sentido mandarlo a "Crear cuenta".
                    notify(`Toca "+ Nueva tarea" para publicar tu necesidad de ${btn.dataset.catNombre}.`, 'info');
                    showDashboardCliente();
                    return;
                }

                notify(`Regístrate para publicar tu necesidad de ${btn.dataset.catNombre} y recibir postulaciones.`, 'info');
                showRegister();
            });
        });
    }
}
