// ============================================================
// Módulo de Tareas — Cliente / Trabajador
// Incluye el marketplace de OFERTAS (trabajador publica un servicio,
// cliente lo busca y solicita) reutilizando la misma infraestructura de
// postulaciones/chat/aceptar que las NECESIDADES — ver la nota grande
// en backend/app/routers/tasks.py sobre por qué casi todo es genérico.
// ============================================================
import {
    apiFetch, notify, showFormModal, showConfirm, escapeHtml,
    getGeolocation, geolocationErrorMessage, ensureUiRoot
} from './core.js';
import { getLocationWithFallback } from './location.js';
import { openChatForTask } from './chat.js';
import { requestFeatureTask } from './monetization.js';

// Evita que dos cargas de "cercanas" (tareas u ofertas) se pisen entre sí.
let nearbyTasksAbortController = null;
let nearbyOfertasAbortController = null;

// Categorías cargadas por loadCategories(); se reutilizan para construir
// los selectores de "Nueva tarea"/"Publicar servicio" sin volver a
// pedirlas al backend.
let loadedCategories = [];

// IDs de publicaciones (tareas U OFERTAS) a las que YA se postuló/
// solicitó en esta sesión. Un solo Set para ambas, porque
// GET /applications/mine ya devuelve ids de ambos tipos sin distinguir
// — ver nota en routers/applications.py.
const appliedTaskIds = new Set();

// ---------- Categorías ----------

export async function loadCategories(forceRefresh = false) {
    let cats;
    try {
        cats = await apiFetch('/categories', forceRefresh ? { cache: 'reload' } : undefined);
    } catch (err) {
        notify(`No se pudieron cargar las categorías: ${err.message}`, 'error');
        return;
    }

    loadedCategories = cats;

    const selects = ['regCategoria', 'filtroCategoria', 'filtroCategoriaOfertas'];
    selects.forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;

        sel.innerHTML = '';
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = id === 'regCategoria' ? 'Selecciona tu oficio' : 'Todas las categorías';
        sel.appendChild(defaultOpt);

        cats.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = `${c.icono ? c.icono + ' ' : ''}${c.nombre}`;
            sel.appendChild(opt);
        });
    });
}

// ---------- Ubicación con reintento (sin perder datos ya escritos) ----------
async function requestLocationWithRetry(firstAttempt) {
    let attempt = firstAttempt || getGeolocation();
    while (true) {
        try {
            return await attempt;
        } catch (err) {
            const retry = await showConfirm({
                title: 'No se pudo obtener tu ubicación',
                message: `${geolocationErrorMessage(err)} Tranquilo: lo que ya escribiste no se perdió, puedes intentar de nuevo.`,
                confirmLabel: 'Reintentar ubicación',
                cancelLabel: 'Cancelar'
            });
            if (!retry) return null;
            attempt = getGeolocation();
        }
    }
}

// ---------- Tareas cercanas (trabajador busca necesidades) ----------

export async function loadNearbyTasks() {
    const token = localStorage.getItem('token');
    if (!token) {
        notify('Inicia sesión primero.', 'error');
        return;
    }

    const container = document.getElementById('listaTareas');
    if (container) container.innerHTML = renderSkeletonCards(3);

    try {
        const mine = await apiFetch('/applications/mine');
        mine.forEach(id => appliedTaskIds.add(String(id)));
    } catch {
        // fallo silencioso
    }

    let location;
    try {
        location = await getLocationWithFallback();
    } catch (err) {
        notify(geolocationErrorMessage(err), 'error');
        if (container) container.innerHTML = '<p class="empty-state">No se pudo obtener tu ubicación.</p>';
        return;
    }
    if (!location) {
        if (container) container.innerHTML = '<p class="empty-state">Se canceló la selección de ubicación.</p>';
        return;
    }

    const lat = location.lat;
    const lng = location.lng;
    const radius = document.getElementById('filtroRadio')?.value || 3;
    const category = document.getElementById('filtroCategoria')?.value || '';

    const params = new URLSearchParams({ lat, lng, radius_km: radius });
    if (category) params.set('category_id', category);

    if (nearbyTasksAbortController) nearbyTasksAbortController.abort();
    nearbyTasksAbortController = new AbortController();

    let tasks;
    try {
        tasks = await apiFetch(`/tasks/nearby?${params.toString()}`, {
            signal: nearbyTasksAbortController.signal
        });
    } catch (err) {
        if (err.name === 'AbortError') return;
        notify(`No se pudieron cargar las tareas: ${err.message}`, 'error');
        if (container) container.innerHTML = '<p class="empty-state">Error al cargar tareas.</p>';
        return;
    }

    renderNearbyTasks(tasks);
}

function renderSkeletonCards(n) {
    return Array.from({ length: n }, () => `
        <div class="task-card skeleton-card">
            <div class="skeleton-line" style="width:60%"></div>
            <div class="skeleton-line" style="width:35%"></div>
        </div>
    `).join('');
}

function renderNearbyTasks(tasks) {
    const container = document.getElementById('listaTareas');
    if (!container) return;

    container.innerHTML = '';

    if (!tasks || !tasks.length) {
        container.innerHTML = '<p class="empty-state">No hay tareas cerca. Ajusta el radio o la categoría.</p>';
        return;
    }

    tasks.forEach((t, i) => {
        const yaPostulado = appliedTaskIds.has(String(t.id));
        const card = document.createElement('div');
        card.className = t.destacada ? 'task-card task-card--featured' : 'task-card';
        card.style.setProperty('--i', i);
        card.innerHTML = `
            <div class="task-card__row">
                <h3 class="task-card__title">${t.destacada ? '★ ' : ''}${escapeHtml(t.titulo)}</h3>
                <span class="task-card__price">$${escapeHtml(String(t.precio ?? 0))}</span>
            </div>
            <p class="task-card__meta">
                <span class="chip">${escapeHtml(String(t.distancia_km))} km</span>
                <span class="chip chip--estado-${escapeHtml(t.estado)}">${escapeHtml(t.estado)}</span>
                ${yaPostulado ? '<span class="chip chip--estado-asignada">Ya postulado</span>' : ''}
            </p>
            <button class="btn ${yaPostulado ? 'btn-secondary' : 'btn-primary'} btn-block" data-id="${escapeHtml(String(t.id))}" ${yaPostulado ? 'disabled' : ''}>
                ${yaPostulado ? 'Postulación enviada ✓' : 'Postular'}
            </button>
        `;
        container.appendChild(card);
    });
}

function setupTaskListDelegation() {
    const container = document.getElementById('listaTareas');
    if (!container || container.dataset.delegated) return;
    container.dataset.delegated = 'true';

    container.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-id]');
        if (!btn || btn.disabled) return;
        applyToTask(btn.dataset.id, btn, 'necesidad');
    });
}

function setupNearbyFiltersListeners() {
    const radioSel = document.getElementById('filtroRadio');
    const catSel = document.getElementById('filtroCategoria');
    [radioSel, catSel].forEach(sel => {
        if (!sel || sel.dataset.listenerAttached) return;
        sel.dataset.listenerAttached = 'true';
        sel.addEventListener('change', () => loadNearbyTasks());
    });
}

// ---------- Ofertas cercanas (cliente busca servicios) ----------

export async function loadNearbyOfertas() {
    const token = localStorage.getItem('token');
    if (!token) return;

    const container = document.getElementById('listaOfertasCercanas');
    if (container) container.innerHTML = renderSkeletonCards(3);

    try {
        const mine = await apiFetch('/applications/mine');
        mine.forEach(id => appliedTaskIds.add(String(id)));
    } catch {
        // fallo silencioso
    }

    let location;
    try {
        location = await getLocationWithFallback();
    } catch (err) {
        notify(geolocationErrorMessage(err), 'error');
        if (container) container.innerHTML = '<p class="empty-state">No se pudo obtener tu ubicación.</p>';
        return;
    }
    if (!location) {
        if (container) container.innerHTML = '<p class="empty-state">Se canceló la selección de ubicación.</p>';
        return;
    }

    const lat = location.lat;
    const lng = location.lng;
    const radius = document.getElementById('filtroRadioOfertas')?.value || 3;
    const category = document.getElementById('filtroCategoriaOfertas')?.value || '';

    const params = new URLSearchParams({ lat, lng, radius_km: radius });
    if (category) params.set('category_id', category);

    if (nearbyOfertasAbortController) nearbyOfertasAbortController.abort();
    nearbyOfertasAbortController = new AbortController();

    let ofertas;
    try {
        ofertas = await apiFetch(`/tasks/ofertas/nearby?${params.toString()}`, {
            signal: nearbyOfertasAbortController.signal
        });
    } catch (err) {
        if (err.name === 'AbortError') return;
        notify(`No se pudieron cargar las ofertas: ${err.message}`, 'error');
        if (container) container.innerHTML = '<p class="empty-state">Error al cargar ofertas.</p>';
        return;
    }

    renderNearbyOfertas(ofertas);
}

function renderNearbyOfertas(ofertas) {
    const container = document.getElementById('listaOfertasCercanas');
    if (!container) return;

    container.innerHTML = '';
    if (!ofertas || !ofertas.length) {
        container.innerHTML = '<p class="empty-state">No hay servicios cerca. Ajusta el radio o la categoría.</p>';
        return;
    }

    ofertas.forEach((o, i) => {
        const yaSolicitado = appliedTaskIds.has(String(o.id));
        const card = document.createElement('div');
        card.className = o.destacada ? 'task-card task-card--featured' : 'task-card';
        card.style.setProperty('--i', i);
        card.innerHTML = `
            <div class="task-card__row">
                <h3 class="task-card__title">${o.destacada ? '★ ' : ''}${escapeHtml(o.titulo || o.categoria_nombre || 'Servicio')}</h3>
                <span class="task-card__price">$${escapeHtml(String(o.precio_hora ?? o.precio ?? 0))}/h</span>
            </div>
            <p class="task-card__meta">
                <span class="chip">${escapeHtml(String(o.distancia_km))} km</span>
                <span class="chip chip--estado-${escapeHtml(o.estado)}">${escapeHtml(o.estado)}</span>
                ${o.categoria_nombre ? `<span class="chip">${escapeHtml(o.categoria_nombre)}</span>` : ''}
                ${yaSolicitado ? '<span class="chip chip--estado-asignada">Solicitud enviada</span>' : ''}
            </p>
            <button class="btn ${yaSolicitado ? 'btn-secondary' : 'btn-primary'} btn-block" data-id="${escapeHtml(String(o.id))}" ${yaSolicitado ? 'disabled' : ''}>
                ${yaSolicitado ? 'Solicitud enviada ✓' : 'Solicitar servicio'}
            </button>
        `;
        container.appendChild(card);
    });
}

function setupOfertasListDelegation() {
    const container = document.getElementById('listaOfertasCercanas');
    if (!container || container.dataset.delegated) return;
    container.dataset.delegated = 'true';
    container.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-id]');
        if (!btn || btn.disabled) return;
        applyToTask(btn.dataset.id, btn, 'oferta');
    });
}

function setupNearbyOfertasFiltersListeners() {
    const radioSel = document.getElementById('filtroRadioOfertas');
    const catSel = document.getElementById('filtroCategoriaOfertas');
    [radioSel, catSel].forEach(sel => {
        if (!sel || sel.dataset.listenerAttached) return;
        sel.dataset.listenerAttached = 'true';
        sel.addEventListener('change', () => loadNearbyOfertas());
    });
}

// ---------- Postulación / solicitud ----------

async function applyToTask(id, btn, kind) {
    try {
        await apiFetch('/applications', {
            method: 'POST',
            body: JSON.stringify({ task_id: Number(id), tipo: kind })
        });
        appliedTaskIds.add(String(id));
        btn.disabled = true;
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
        btn.textContent = kind === 'oferta' ? 'Solicitud enviada ✓' : 'Postulación enviada ✓';
        notify(kind === 'oferta' ? 'Solicitud enviada.' : 'Postulación enviada.', 'success');
    } catch (err) {
        notify(`No se pudo enviar: ${err.message}`, 'error');
    }
}
