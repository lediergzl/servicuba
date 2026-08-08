// ============================================================
// Módulo de Tareas — Cliente / Trabajador
// ============================================================
import {
    apiFetch, notify, showFormModal, showConfirm, escapeHtml,
    getGeolocation, geolocationErrorMessage
} from './core.js';
import { openChatForTask } from './chat.js';
import { requestFeatureTask } from './monetization.js';

// Evita que dos cargas de "tareas cercanas" se pisen entre sí.
let nearbyTasksAbortController = null;

// ---------- Categorías ----------

export async function loadCategories() {
    let cats;
    try {
        cats = await apiFetch('/categories');
    } catch (err) {
        notify(`No se pudieron cargar las categorías: ${err.message}`, 'error');
        return;
    }

    const selects = ['regCategoria', 'filtroCategoria'];
    selects.forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;

        sel.innerHTML = '';
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = id === 'filtroCategoria' ? 'Todas las categorías' : 'Selecciona tu oficio';
        sel.appendChild(defaultOpt);

        cats.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = `${c.icono ? c.icono + ' ' : ''}${c.nombre}`;
            sel.appendChild(opt);
        });
    });
}

// ---------- Tareas cercanas (trabajador) ----------

export async function loadNearbyTasks() {
    const token = localStorage.getItem('token');
    if (!token) {
        notify('Inicia sesión primero.', 'error');
        return;
    }

    const container = document.getElementById('listaTareas');
    if (container) container.innerHTML = renderSkeletonCards(3);

    let pos;
    try {
        pos = await getGeolocation();
    } catch (err) {
        notify(geolocationErrorMessage(err), 'error');
        if (container) container.innerHTML = '<p class="empty-state">No se pudo obtener tu ubicación.</p>';
        return;
    }

    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
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

    tasks.forEach(t => {
        const card = document.createElement('div');
        card.className = t.destacada ? 'task-card task-card--featured' : 'task-card';
        card.innerHTML = `
            <div class="task-card__row">
                <h3 class="task-card__title">${t.destacada ? '★ ' : ''}${escapeHtml(t.titulo)}</h3>
                <span class="task-card__price">$${escapeHtml(String(t.precio ?? 0))}</span>
            </div>
            <p class="task-card__meta">
                <span class="chip">${escapeHtml(String(t.distancia_km))} km</span>
                <span class="chip chip--estado-${escapeHtml(t.estado)}">${escapeHtml(t.estado)}</span>
            </p>
            <button class="btn btn-primary btn-block" data-id="${escapeHtml(String(t.id))}">
                Postular
            </button>
        `;
        container.appendChild(card);
    });
}

// Un único listener delegado en el contenedor (evita fugas al re-renderizar).
function setupTaskListDelegation() {
    const container = document.getElementById('listaTareas');
    if (!container || container.dataset.delegated) return;
    container.dataset.delegated = 'true';

    container.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-id]');
        if (!btn) return;
        applyToTask(btn.dataset.id, btn);
    });
}

async function applyToTask(taskId, buttonEl) {
    const token = localStorage.getItem('token');
    if (!token) {
        notify('Inicia sesión primero.', 'error');
        return;
    }

    const result = await showFormModal({
        title: 'Postularte a esta tarea',
        confirmLabel: 'Enviar',
        fields: [
            {
                name: 'mensaje',
                label: 'Mensaje para el cliente (opcional)',
                type: 'textarea',
                placeholder: 'Ej: Tengo experiencia en este tipo de trabajos...'
            }
        ]
    });

    if (result === null) return;

    if (buttonEl) {
        buttonEl.disabled = true;
        buttonEl.textContent = 'Enviando…';
    }

    try {
        await apiFetch(`/applications/${encodeURIComponent(taskId)}/apply`, {
            method: 'POST',
            body: JSON.stringify({ mensaje: result.mensaje || '' })
        });
        notify('Postulación enviada correctamente.', 'success');
        await loadNearbyTasks();
    } catch (err) {
        notify(`Error: ${err.message}`, 'error');
        if (buttonEl) {
            buttonEl.disabled = false;
            buttonEl.textContent = 'Postular';
        }
    }
}

// ---------- Dashboards ----------

export function showDashboardCliente() {
    switchView('dashboardCliente');
    loadMyTasks();
}

export function showDashboardTrabajador() {
    switchView('dashboardTrabajador');
    setupTaskListDelegation();
    loadNearbyTasks();
}

export function switchView(viewId) {
    document.querySelectorAll('#views > div').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(viewId);
    if (target) target.classList.remove('hidden');
    document.querySelectorAll('.bottom-nav__item').forEach(el => {
        el.classList.toggle('is-active', el.dataset.view === viewId);
    });
}

const ESTADO_LABELS = {
    activa: 'Buscando trabajador',
    asignada: 'Asignada — coordina por chat',
    en_proceso: 'En proceso',
    completada: 'Completada',
    cancelada: 'Cancelada'
};

async function loadMyTasks() {
    const token = localStorage.getItem('token');
    if (!token) return;

    const container = document.getElementById('misTareas');
    if (container) container.innerHTML = renderSkeletonCards(2);

    let tasks;
    try {
        tasks = await apiFetch('/tasks/my');
    } catch (err) {
        if (container) container.innerHTML = `<p class="empty-state">Error: ${escapeHtml(err.message)}</p>`;
        return;
    }

    if (!container) return;
    container.innerHTML = '';

    if (!tasks.length) {
        container.innerHTML = '<p class="empty-state">Todavía no tienes tareas publicadas. Toca "+ Nueva tarea" para empezar.</p>';
        return;
    }

    tasks.forEach(t => {
        const card = document.createElement('div');
        card.className = 'task-card';

        const canChat = t.estado === 'asignada' || t.estado === 'en_proceso' || t.estado === 'completada';
        const canComplete = t.estado === 'asignada' || t.estado === 'en_proceso';
        const canFeature = t.estado === 'activa' && !t.destacada;

        card.innerHTML = `
            <div class="task-card__row">
                <h3 class="task-card__title">${escapeHtml(t.titulo)}</h3>
                <span class="task-card__price">$${escapeHtml(String(t.precio ?? 0))}</span>
            </div>
            <p class="task-card__meta">
                <span class="chip chip--estado-${escapeHtml(t.estado)}">${escapeHtml(ESTADO_LABELS[t.estado] || t.estado)}</span>
                ${t.destacada ? '<span class="chip" style="color:var(--copper);border-color:var(--copper)">★ Destacada</span>' : ''}
            </p>
            <div class="task-card__actions">
                ${canChat ? `<button class="btn btn-secondary btn-sm" data-action="chat" data-id="${t.id}">
                    <svg class="icon" viewBox="0 0 24 24"><path d="M4 5h16v11H9l-4 4V5Z"/></svg>
                    Chat
                </button>` : ''}
                ${canComplete ? `<button class="btn btn-primary btn-sm" data-action="complete" data-id="${t.id}">Marcar completada</button>` : ''}
                ${canFeature ? `<button class="btn btn-secondary btn-sm" data-action="feature" data-id="${t.id}">★ Destacar</button>` : ''}
            </div>
        `;
        container.appendChild(card);
    });

    if (!container.dataset.delegated) {
        container.dataset.delegated = 'true';
        container.addEventListener('click', async (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const taskId = btn.dataset.id;
            if (btn.dataset.action === 'chat') {
                openChatForTask(taskId);
            } else if (btn.dataset.action === 'feature') {
                await requestFeatureTask(taskId);
            } else if (btn.dataset.action === 'complete') {
                const ok = await showConfirm({
                    title: 'Marcar tarea como completada',
                    message: 'Confirma que el trabajo terminó. Después podrás dejar una reseña.',
                    confirmLabel: 'Sí, completar'
                });
                if (!ok) return;
                try {
                    await apiFetch(`/tasks/${encodeURIComponent(taskId)}/complete`, { method: 'POST' });
                    notify('Tarea marcada como completada.', 'success');
                    await loadMyTasks();
                } catch (err) {
                    notify(`Error: ${err.message}`, 'error');
                }
            }
        });
    }
}

// ---------- Crear tarea ----------

const VALID_CATEGORY_IDS = [1, 2, 3, 4];

export function initTasks() {
    document.getElementById('newTaskBtn')?.addEventListener('click', handleNewTaskClick);
}

async function handleNewTaskClick() {
    const result = await showFormModal({
        title: 'Nueva tarea',
        confirmLabel: 'Continuar',
        fields: [
            { name: 'titulo', label: 'Título', type: 'text', required: true, placeholder: 'Ej: Armar mueble de IKEA' },
            { name: 'descripcion', label: 'Descripción', type: 'textarea', placeholder: 'Detalles del trabajo...' },
            { name: 'precio', label: 'Precio estimado', type: 'number', min: 0, step: '0.01', placeholder: '0.00' },
            { name: 'categoria_id', label: 'ID de categoría (1-4)', type: 'number', min: 1, required: true, placeholder: '1' }
        ]
    });

    if (result === null) return;

    const categoria = Math.trunc(result.categoria_id);
    if (!VALID_CATEGORY_IDS.includes(categoria)) {
        notify('La categoría debe ser un número entre 1 y 4.', 'error');
        return;
    }

    let pos;
    try {
        pos = await getGeolocation();
    } catch (err) {
        notify(geolocationErrorMessage(err), 'error');
        return;
    }

    const data = {
        titulo: result.titulo,
        descripcion: result.descripcion || '',
        precio: result.precio || 0,
        categoria_id: categoria,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
    };

    try {
        await apiFetch('/tasks', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        notify('Tarea creada exitosamente.', 'success');
        await loadMyTasks();
    } catch (err) {
        notify(`Error: ${err.message}`, 'error');
    }
}
