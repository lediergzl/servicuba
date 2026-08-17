// ============================================================
// Módulo de Tareas — Cliente / Trabajador
// Incluye el marketplace de OFERTAS (trabajador publica un servicio,
// cliente lo busca y solicita) reutilizando la misma infraestructura de
// postulaciones/chat/aceptar que las NECESIDADES.
// ============================================================
import {
    apiFetch, notify, showFormModal, showConfirm, escapeHtml,
    getGeolocation, geolocationErrorMessage, ensureUiRoot
} from './core.js';
import { getLocationWithFallback } from './location.js';
import { openChatForTask } from './chat.js';
import { requestFeatureTask } from './monetization.js';

let nearbyTasksAbortController = null;
let nearbyOfertasAbortController = null;
let loadedCategories = [];
const appliedTaskIds = new Set();

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
    } catch {}

    const location = await getLocationWithFallback();
    if (!location) {
        if (container) container.innerHTML = '<p class="empty-state">Necesitamos tu ubicación para mostrar tareas cercanas.</p>';
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

export async function loadNearbyOfertas() {
    const token = localStorage.getItem('token');
    if (!token) return;
    const container = document.getElementById('listaOfertasCercanas');
    if (container) container.innerHTML = renderSkeletonCards(3);
    try {
        const mine = await apiFetch('/applications/mine');
        mine.forEach(id => appliedTaskIds.add(String(id)));
    } catch {}

    const location = await getLocationWithFallback();
    if (!location) {
        if (container) container.innerHTML = '<p class="empty-state">Necesitamos tu ubicación para mostrar servicios cercanos.</p>';
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
        container.innerHTML = '<p class="empty-state">No hay servicios ofrecidos cerca. Ajusta el radio o la categoría.</p>';
        return;
    }
    ofertas.forEach((o, i) => {
        const yaSolicitado = appliedTaskIds.has(String(o.id));
        const card = document.createElement('div');
        card.className = o.destacada ? 'task-card task-card--featured' : 'task-card';
        card.style.setProperty('--i', i);
        card.innerHTML = `
            <div class="task-card__row">
                <h3 class="task-card__title">${o.destacada ? '★ ' : ''}${escapeHtml(o.titulo)}</h3>
                <span class="task-card__price">$${escapeHtml(String(o.precio ?? 0))}</span>
            </div>
            ${o.descripcion ? `<p class="task-card__meta">${escapeHtml(o.descripcion)}</p>` : ''}
            <p class="task-card__meta">
                <span class="chip">${escapeHtml(String(o.distancia_km))} km</span>
                ${yaSolicitado ? '<span class="chip chip--estado-asignada">Ya solicitado</span>' : ''}
            </p>
            <button class="btn ${yaSolicitado ? 'btn-secondary' : 'btn-primary'} btn-block" data-id="${escapeHtml(String(o.id))}" ${yaSolicitado ? 'disabled' : ''}>
                ${yaSolicitado ? 'Solicitud enviada ✓' : 'Solicitar'}
            </button>
        `;
        container.appendChild(card);
    });
}

function setupOfertaListDelegation() {
    const container = document.getElementById('listaOfertasCercanas');
    if (!container || container.dataset.delegated) return;
    container.dataset.delegated = 'true';
    container.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-id]');
        if (!btn || btn.disabled) return;
        applyToTask(btn.dataset.id, btn, 'oferta');
    });
}

function setupOfertaFiltersListeners() {
    const radioSel = document.getElementById('filtroRadioOfertas');
    const catSel = document.getElementById('filtroCategoriaOfertas');
    [radioSel, catSel].forEach(sel => {
        if (!sel || sel.dataset.listenerAttached) return;
        sel.dataset.listenerAttached = 'true';
        sel.addEventListener('change', () => loadNearbyOfertas());
    });
}

async function applyToTask(taskId, buttonEl, tipo = 'necesidad') {
    const token = localStorage.getItem('token');
    if (!token) {
        notify('Inicia sesión primero.', 'error');
        return;
    }
    const esOferta = tipo === 'oferta';
    const result = await showFormModal({
        title: esOferta ? 'Solicitar este servicio' : 'Postularte a esta tarea',
        confirmLabel: 'Enviar',
        fields: [{
            name: 'mensaje', label: esOferta ? 'Mensaje para el trabajador (opcional)' : 'Mensaje para el cliente (opcional)',
            type: 'textarea',
            placeholder: esOferta ? 'Ej: Necesito este servicio para el fin de semana...' : 'Ej: Tengo experiencia en este tipo de trabajos...'
        }]
    });
    if (result === null) return;
    if (buttonEl) { buttonEl.disabled = true; buttonEl.textContent = 'Enviando…'; }
    try {
        await apiFetch(`/applications/${encodeURIComponent(taskId)}/apply`, { method: 'POST', body: JSON.stringify({ mensaje: result.mensaje || '' }) });
        appliedTaskIds.add(String(taskId));
        notify(esOferta ? 'Solicitud enviada correctamente.' : 'Postulación enviada correctamente.', 'success');
        if (esOferta) await loadNearbyOfertas(); else await loadNearbyTasks();
    } catch (err) {
        notify(`Error: ${err.message}`, 'error');
        if (err.message === 'Ya hiciste esta solicitud') {
            appliedTaskIds.add(String(taskId));
            if (esOferta) await loadNearbyOfertas(); else await loadNearbyTasks();
            return;
        }
        if (buttonEl) { buttonEl.disabled = false; buttonEl.textContent = esOferta ? 'Solicitar' : 'Postular'; }
    }
}

export function showDashboardCliente() {
    switchView('dashboardCliente');
    setupClienteSubTabs();
    document.querySelectorAll('.sub-tab[data-clientetab]').forEach(t => t.classList.toggle('is-active', t.dataset.clientetab === 'tareas'));
    document.getElementById('misTareasPanel')?.classList.remove('hidden');
    document.getElementById('ofertasCercanasPanel')?.classList.add('hidden');
    loadMyTasks();
}

export function showDashboardTrabajador() {
    switchView('dashboardTrabajador');
    setupTaskListDelegation();
    setupNearbyFiltersListeners();
    setupTrabajadorSubTabs();
    document.querySelectorAll('.sub-tab[data-trabajadortab]').forEach(t => t.classList.toggle('is-active', t.dataset.trabajadortab === 'cercanas'));
    document.getElementById('tareasCercanasPanel')?.classList.remove('hidden');
    document.getElementById('misOfertasPanel')?.classList.add('hidden');
    loadNearbyTasks();
}

function setupClienteSubTabs() {
    const tabs = document.querySelectorAll('.sub-tab[data-clientetab]');
    if (!tabs.length || tabs[0].dataset.wired) return;
    tabs.forEach(tab => {
        tab.dataset.wired = 'true';
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.toggle('is-active', t === tab));
            const showOfertas = tab.dataset.clientetab === 'ofertas';
            document.getElementById('misTareasPanel')?.classList.toggle('hidden', showOfertas);
            document.getElementById('ofertasCercanasPanel')?.classList.toggle('hidden', !showOfertas);
            if (showOfertas) {
                setupOfertaListDelegation();
                setupOfertaFiltersListeners();
                loadNearbyOfertas();
            }
        });
    });
}

function setupTrabajadorSubTabs() {
    const tabs = document.querySelectorAll('.sub-tab[data-trabajadortab]');
    if (!tabs.length || tabs[0].dataset.wired) return;
    tabs.forEach(tab => {
        tab.dataset.wired = 'true';
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.toggle('is-active', t === tab));
            const showOfertas = tab.dataset.trabajadortab === 'ofertas';
            document.getElementById('tareasCercanasPanel')?.classList.toggle('hidden', showOfertas);
            document.getElementById('misOfertasPanel')?.classList.toggle('hidden', !showOfertas);
            if (showOfertas) loadMyOfertas();
        });
    });
}

export function switchView(viewId) {
    document.querySelectorAll('#views > div').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(viewId);
    if (target) target.classList.remove('hidden');
    document.querySelectorAll('.bottom-nav__item').forEach(el => el.classList.toggle('is-active', el.dataset.view === viewId));
}

// ---------- Mis tareas (cliente) ----------
let myTasksCache = [];
let myOfertasCache = [];

const ESTADO_LABELS = {
    activa: 'Buscando trabajador', asignada: 'Asignada — coordina por chat', en_proceso: 'En proceso', completada: 'Completada', cancelada: 'Cancelada'
};

async function loadMyTasks() {
    const token = localStorage.getItem('token');
    if (!token) return;
    const container = document.getElementById('misTareas');
    if (container) container.innerHTML = renderSkeletonCards(2);
    let tasks;
    try { tasks = await apiFetch('/tasks/my'); }
    catch (err) { if (container) container.innerHTML = `<p class="empty-state">Error: ${escapeHtml(err.message)}</p>`; return; }
    if (!container) return;
    container.innerHTML = '';
    myTasksCache = tasks;
    if (!tasks.length) { container.innerHTML = '<p class="empty-state">Todavía no tienes tareas publicadas. Toca "+ Nueva tarea" para empezar.</p>'; return; }
    tasks.forEach((t, i) => {
        const card = document.createElement('div');
        card.className = 'task-card';
        card.style.setProperty('--i', i);
        const canChat = t.estado === 'asignada' || t.estado === 'en_proceso' || t.estado === 'completada';
        const canComplete = t.estado === 'asignada' || t.estado === 'en_proceso';
        const canFeature = t.estado === 'activa' && !t.destacada;
        const canViewApplications = t.estado === 'activa';
        const canReview = t.estado === 'completada' && !t.ya_reseniada && t.trabajador_id;
        const canEdit = t.estado === 'activa';
        const canCancel = t.estado === 'activa' || t.estado === 'asignada' || t.estado === 'en_proceso';
        card.innerHTML = `
            <div class="task-card__row"><h3 class="task-card__title">${escapeHtml(t.titulo)}</h3><span class="task-card__price">$${escapeHtml(String(t.precio ?? 0))}</span></div>
            <p class="task-card__meta">${escapeHtml(ESTADO_LABELS[t.estado] || t.estado)}</p>
            <div class="task-card__actions">
                ${canViewApplications ? `<button class="btn btn-secondary" data-action="applications" data-id="${t.id}">Postulantes</button>` : ''}
                ${canEdit ? `<button class="btn btn-secondary" data-action="edit-task" data-id="${t.id}">Editar</button>` : ''}
                ${canCancel ? `<button class="btn btn-danger" data-action="cancel-task" data-id="${t.id}">Cancelar</button>` : ''}
                ${canComplete ? `<button class="btn btn-primary" data-action="complete-task" data-id="${t.id}">Completar</button>` : ''}
                ${canChat ? `<button class="btn btn-secondary" data-action="chat-task" data-id="${t.id}">Chat</button>` : ''}
                ${canFeature ? `<button class="btn btn-secondary" data-action="feature-task" data-id="${t.id}">Destacar</button>` : ''}
                ${canReview ? `<button class="btn btn-secondary" data-action="review-task" data-id="${t.id}">Valorar</button>` : ''}
            </div>`;
        container.appendChild(card);
    });
}

// Resto del módulo permanece sin cambios.