// ============================================================
// Módulo de Tareas — Cliente / Trabajador
// ============================================================
import {
    apiFetch, notify, showFormModal, showConfirm, escapeHtml,
    getGeolocation, geolocationErrorMessage, ensureUiRoot
} from './core.js';
import { openChatForTask } from './chat.js';
import { requestFeatureTask } from './monetization.js';

// Evita que dos cargas de "tareas cercanas" se pisen entre sí.
let nearbyTasksAbortController = null;

// Categorías cargadas por loadCategories(); se reutilizan para construir
// el selector de "Nueva tarea" sin volver a pedirlas al backend.
let loadedCategories = [];

// IDs de tareas a las que YA se postuló en esta sesión (del lado
// trabajador). apply_to_task no cambia el estado de la tarea (sigue
// "activa" hasta que el cliente acepte a alguien), así que al recargar
// la lista la tarjeta se veía idéntica y parecía que el clic no había
// hecho nada. Se usa esto para mostrar "Ya postulado" en vez de
// "Postular" sin tener que exponer un endpoint nuevo de "mis
// postulaciones" para esto.
const appliedTaskIds = new Set();

// ---------- Categorías ----------

// GET /categories ahora trae Cache-Control: max-age=3600 (ver
// routers/categories.py) para evitarle a la app ese round-trip en cada
// carga en conexiones lentas. Eso significa que, si el admin acaba de
// crear o pausar una categoría, un fetch normal podría devolver la copia
// vieja del navegador hasta por una hora. forceRefresh=true (usado sólo
// desde admin.js justo después de esas dos acciones) le pide al
// navegador que ignore esa caché y vaya sí o sí a la red.
export async function loadCategories(forceRefresh = false) {
    let cats;
    try {
        cats = await apiFetch('/categories', forceRefresh ? { cache: 'reload' } : undefined);
    } catch (err) {
        notify(`No se pudieron cargar las categorías: ${err.message}`, 'error');
        return;
    }

    loadedCategories = cats;

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

    // Trae las postulaciones reales del trabajador para que "Ya postulado"
    // sobreviva a un refresh de página (antes sólo vivía en el Set en
    // memoria, así que tras recargar el botón volvía a mostrar "Postular"
    // para tareas ya postuladas y el backend rechazaba el reintento con 400).
    try {
        const mine = await apiFetch('/applications/mine');
        mine.forEach(id => appliedTaskIds.add(String(id)));
    } catch {
        // fallo silencioso: en el peor caso el botón no se marca como
        // "ya postulado" hasta que el usuario intente de nuevo.
    }

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
        const yaPostulado = appliedTaskIds.has(String(t.id));
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
                ${yaPostulado ? '<span class="chip chip--estado-asignada">Ya postulado</span>' : ''}
            </p>
            <button class="btn ${yaPostulado ? 'btn-secondary' : 'btn-primary'} btn-block" data-id="${escapeHtml(String(t.id))}" ${yaPostulado ? 'disabled' : ''}>
                ${yaPostulado ? 'Postulación enviada ✓' : 'Postular'}
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
        if (!btn || btn.disabled) return;
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
        appliedTaskIds.add(String(taskId));
        notify('Postulación enviada correctamente.', 'success');
        await loadNearbyTasks();
    } catch (err) {
        notify(`Error: ${err.message}`, 'error');
        if (err.message === 'Ya te has postulado a esta tarea') {
            // El backend tiene razón y nuestro estado local estaba
            // desactualizado (p.ej. otra pestaña, o un caché de
            // /applications/mine viejo) — lo corregimos en vez de dejar
            // el botón en "Enviando…" para siempre.
            appliedTaskIds.add(String(taskId));
            await loadNearbyTasks();
            return;
        }
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
    setupNearbyFiltersListeners();
    loadNearbyTasks();
}

// Los <select> de radio/categoría no disparaban ninguna recarga: sus
// valores sólo se leían dentro de loadNearbyTasks(), pero nada llamaba
// a esa función al cambiarlos, así que el filtro parecía no hacer nada
// hasta refrescar la página entera.
function setupNearbyFiltersListeners() {
    const radioSel = document.getElementById('filtroRadio');
    const catSel = document.getElementById('filtroCategoria');
    [radioSel, catSel].forEach(sel => {
        if (!sel || sel.dataset.listenerAttached) return;
        sel.dataset.listenerAttached = 'true';
        sel.addEventListener('change', () => loadNearbyTasks());
    });
}

export function switchView(viewId) {
    document.querySelectorAll('#views > div').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(viewId);
    if (target) target.classList.remove('hidden');
    document.querySelectorAll('.bottom-nav__item').forEach(el => {
        el.classList.toggle('is-active', el.dataset.view === viewId);
    });
}

// Última lista de "mis tareas" cargada — el listener delegado de
// #misTareas se registra una sola vez (ver dataset.delegated más abajo),
// así que si leyera el array `tasks` por closure quedaría atado a la
// PRIMERA carga para siempre. Se guarda aquí y se refresca en cada
// loadMyTasks() para que el listener siempre vea los datos actuales.
let myTasksCache = [];

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
    myTasksCache = tasks;

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
        const canViewApplications = t.estado === 'activa';
        const canReview = t.estado === 'completada' && !t.ya_reseniada && t.trabajador_id;
        const canEdit = t.estado === 'activa';
        const canCancel = t.estado === 'activa' || t.estado === 'asignada' || t.estado === 'en_proceso';

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
                ${canViewApplications ? `<button class="btn btn-accent btn-sm" data-action="applications" data-id="${t.id}">Ver postulaciones</button>` : ''}
                ${canChat ? `<button class="btn btn-secondary btn-sm" data-action="chat" data-id="${t.id}">
                    <svg class="icon" viewBox="0 0 24 24"><path d="M4 5h16v11H9l-4 4V5Z"/></svg>
                    Chat
                </button>` : ''}
                ${canComplete ? `<button class="btn btn-primary btn-sm" data-action="complete" data-id="${t.id}">Marcar completada</button>` : ''}
                ${canFeature ? `<button class="btn btn-secondary btn-sm" data-action="feature" data-id="${t.id}">★ Destacar</button>` : ''}
                ${canReview ? `<button class="btn btn-accent btn-sm" data-action="review" data-id="${t.id}">★ Dejar reseña</button>` : ''}
                ${t.estado === 'completada' && t.ya_reseniada ? '<span class="chip" style="color:var(--success);border-color:var(--success)">✓ Reseñada</span>' : ''}
                ${canEdit ? `<button class="btn btn-secondary btn-sm" data-action="edit" data-id="${t.id}">Editar</button>` : ''}
                ${canCancel ? `<button class="btn btn-ghost btn-sm" data-action="cancel" data-id="${t.id}" style="color:var(--brick)">Cancelar</button>` : ''}
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
                const t = myTasksCache.find(tt => String(tt.id) === String(taskId));
                openChatForTask(taskId, t?.titulo || '', t?.trabajador_nombre || 'Trabajador');
            } else if (btn.dataset.action === 'feature') {
                await requestFeatureTask(taskId);
            } else if (btn.dataset.action === 'applications') {
                const titulo = btn.closest('.task-card')?.querySelector('.task-card__title')?.textContent || '';
                await viewApplications(taskId, titulo);
            } else if (btn.dataset.action === 'review') {
                const t = myTasksCache.find(tt => String(tt.id) === String(taskId));
                await leaveReview(taskId, t?.trabajador_id, t?.trabajador_nombre || 'el trabajador');
            } else if (btn.dataset.action === 'edit') {
                const t = myTasksCache.find(tt => String(tt.id) === String(taskId));
                await editTask(taskId, t);
            } else if (btn.dataset.action === 'cancel') {
                const ok = await showConfirm({
                    title: 'Cancelar esta tarea',
                    message: 'Los trabajadores que ya se postularon dejarán de poder aceptarla. Esta acción no se puede deshacer.',
                    confirmLabel: 'Sí, cancelar',
                    danger: true
                });
                if (!ok) return;
                try {
                    await apiFetch(`/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
                    notify('Tarea cancelada.', 'success');
                    await loadMyTasks();
                } catch (err) {
                    notify(`Error: ${err.message}`, 'error');
                }
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

// ---------- Ver / aceptar postulaciones (cliente) ----------

async function viewApplications(taskId, tituloTarea) {
    let apps;
    try {
        apps = await apiFetch(`/applications/task/${encodeURIComponent(taskId)}`);
    } catch (err) {
        notify(`Error: ${err.message}`, 'error');
        return;
    }

    if (!apps.length) {
        notify('Todavía no tienes postulaciones para esta tarea.', 'info');
        return;
    }

    ensureUiRoot();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal-card';

    const heading = document.createElement('h2');
    heading.className = 'modal-title';
    heading.textContent = tituloTarea ? `Postulaciones — ${tituloTarea}` : 'Postulaciones';
    modal.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'stack-sm';
    apps.forEach(app => {
        const row = document.createElement('div');
        row.className = 'admin-row';
        row.dataset.appId = app.id;
        row.innerHTML = `
            <div class="admin-row__top">
                <span class="admin-row__type">${escapeHtml(app.worker_nombre)}${app.worker_verificado ? ' ✓' : ''}</span>
                <span class="chip">★ ${(app.worker_rating ?? 0).toFixed(1)}</span>
            </div>
            ${app.mensaje ? `<p class="admin-row__meta">${escapeHtml(app.mensaje)}</p>` : '<p class="admin-row__meta">Sin mensaje adicional.</p>'}
            <div class="admin-row__actions">
                <button class="btn btn-primary btn-sm" data-action="accept" data-app-id="${app.id}">Aceptar</button>
            </div>
        `;
        list.appendChild(row);
    });
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

    function close() { overlay.remove(); }
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    list.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action="accept"]');
        if (!btn) return;
        const ok = await showConfirm({
            title: 'Aceptar a este trabajador',
            message: 'Se asignará la tarea y podrán coordinar por chat. Las demás postulaciones seguirán pendientes pero la tarea dejará de estar disponible.',
            confirmLabel: 'Sí, aceptar'
        });
        if (!ok) return;

        btn.disabled = true;
        btn.textContent = 'Aceptando…';
        try {
            await apiFetch(`/applications/${encodeURIComponent(btn.dataset.appId)}/accept`, { method: 'POST' });
            notify('Trabajador aceptado. Ya pueden coordinar por chat.', 'success');
            close();
            await loadMyTasks();
        } catch (err) {
            notify(`Error: ${err.message}`, 'error');
            btn.disabled = false;
            btn.textContent = 'Aceptar';
        }
    });
}

// ---------- Editar tarea (cliente) ----------
// Antes no había ninguna forma de editar una tarea ya creada. Sólo se
// permite mientras está "activa" (ver PUT /tasks/{id} en el backend) —
// no se edita categoría/ubicación acá, para eso conviene cancelar y
// crear una nueva.
async function editTask(taskId, t) {
    if (!t) return;

    const result = await showFormModal({
        title: 'Editar tarea',
        confirmLabel: 'Guardar cambios',
        fields: [
            { name: 'titulo', label: 'Título', type: 'text', required: true, value: t.titulo },
            { name: 'descripcion', label: 'Descripción', type: 'textarea', value: t.descripcion || '' },
            { name: 'precio', label: 'Precio estimado', type: 'number', min: 0, step: '0.01', value: t.precio ?? '' },
        ]
    });

    if (result === null) return;

    try {
        await apiFetch(`/tasks/${encodeURIComponent(taskId)}`, {
            method: 'PUT',
            body: JSON.stringify({
                titulo: result.titulo,
                descripcion: result.descripcion || '',
                precio: result.precio || 0,
            })
        });
        notify('Tarea actualizada.', 'success');
        await loadMyTasks();
    } catch (err) {
        notify(`Error: ${err.message}`, 'error');
    }
}

// ---------- Dejar reseña (cliente) ----------
// El endpoint POST /api/reviews/ existía en el backend desde el
// principio, pero ningún archivo del frontend lo llamaba — no había
// ninguna forma de dejar una reseña en toda la app.
async function leaveReview(taskId, trabajadorId, trabajadorNombre) {
    if (!trabajadorId) {
        notify('No se pudo identificar al trabajador de esta tarea.', 'error');
        return;
    }

    const result = await showFormModal({
        title: `Reseña para ${trabajadorNombre}`,
        confirmLabel: 'Enviar reseña',
        fields: [
            {
                name: 'rating',
                label: 'Calificación',
                type: 'select',
                required: true,
                value: '5',
                options: [
                    { value: '5', label: '★★★★★ Excelente' },
                    { value: '4', label: '★★★★ Muy bueno' },
                    { value: '3', label: '★★★ Bueno' },
                    { value: '2', label: '★★ Regular' },
                    { value: '1', label: '★ Malo' },
                ]
            },
            {
                name: 'comentario',
                label: 'Comentario (opcional)',
                type: 'textarea',
                placeholder: 'Ej: Muy puntual y buen trabajo.'
            }
        ]
    });

    if (result === null) return;

    try {
        await apiFetch('/reviews', {
            method: 'POST',
            body: JSON.stringify({
                task_id: taskId,
                trabajador_id: trabajadorId,
                rating: parseInt(result.rating, 10),
                comentario: result.comentario || null
            })
        });
        notify('Reseña enviada. ¡Gracias!', 'success');
        await loadMyTasks();
    } catch (err) {
        notify(`Error: ${err.message}`, 'error');
    }
}

// ---------- Crear tarea ----------

export function initTasks() {
    document.getElementById('newTaskBtn')?.addEventListener('click', handleNewTaskClick);
}

async function handleNewTaskClick() {
    // Si por algún motivo todavía no se cargaron (p.ej. loadCategories()
    // falló), se vuelve a intentar aquí antes de abrir el modal — sin
    // categorías no hay nada que mostrar en el selector.
    if (!loadedCategories.length) {
        try {
            loadedCategories = await apiFetch('/categories');
        } catch (err) {
            notify(`No se pudieron cargar las categorías: ${err.message}`, 'error');
            return;
        }
    }
    if (!loadedCategories.length) {
        notify('No hay categorías disponibles todavía.', 'error');
        return;
    }

    const categoryOptions = loadedCategories.map(c => ({
        value: String(c.id),
        label: `${c.icono ? c.icono + ' ' : ''}${c.nombre}`
    }));

    const result = await showFormModal({
        title: 'Nueva tarea',
        confirmLabel: 'Continuar',
        fields: [
            { name: 'titulo', label: 'Título', type: 'text', required: true, placeholder: 'Ej: Armar mueble de IKEA' },
            { name: 'descripcion', label: 'Descripción', type: 'textarea', placeholder: 'Detalles del trabajo...' },
            { name: 'precio', label: 'Precio estimado', type: 'number', min: 0, step: '0.01', placeholder: '0.00' },
            { name: 'categoria_id', label: 'Categoría', type: 'select', required: true, options: categoryOptions }
        ]
    });

    if (result === null) return;

    const categoria = parseInt(result.categoria_id, 10);
    if (!loadedCategories.some(c => c.id === categoria)) {
        notify('Selecciona una categoría válida.', 'error');
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
