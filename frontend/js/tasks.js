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
import { openChatForTask } from './chat.js';
import { requestFeatureTask, loadAdBanner } from './monetization.js';

// Evita que dos cargas de "cercanas" (tareas u ofertas) se pisen entre sí.
let nearbyTasksAbortController = null;
let nearbyOfertasAbortController = null;

// Categorías cargadas por loadCategories(); se reutilizan para construir
// los selectores de "Nueva tarea"/"Publicar servicio" sin volver a
// pedirlas al backend.
let loadedCategories = [];

// ---------- Helpers de presentación (precio, categoría) ----------
// Antes cada tarjeta mostraba "$3000" sin separador y sin ícono de
// categoría (getEmoji() en utils.js existía pero nadie la llamaba desde
// aquí). categoryIcon() usa loadedCategories en vez del mapa fijo de
// utils.js para que funcione también con categorías creadas desde el
// panel de admin, no sólo las 4 semilla.

function formatPrice(precio) {
    return new Intl.NumberFormat('es-CU').format(Number(precio) || 0);
}

function categoryIcon(categoriaId) {
    if (categoriaId == null) return '';
    const cat = loadedCategories.find(c => String(c.id) === String(categoriaId));
    return cat?.icono ? `${escapeHtml(cat.icono)} ` : '';
}

// ---------- Categorías ----------

// GET /categories ahora trae Cache-Control: max-age=3600 (ver
// routers/categories.py) para evitarle a la app ese round-trip en cada
// carga en conexiones lentas. forceRefresh=true (usado sólo desde
// admin.js justo después de crear/pausar una categoría) le pide al
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

    // filtroCategoriaOfertas: filtro de "Ofertas cercanas" en el
    // dashboard del cliente — mismo patrón que filtroCategoria
    // (trabajador) y regCategoria (registro).
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
// Antes: al crear una tarea/oferta, la ubicación se pedía DESPUÉS de
// cerrar el modal con los datos ya llenados. Si el GPS tardaba o
// fallaba (el timeout de getGeolocation() en core.js es de 10s), el
// catch cortaba la función entera y el usuario tenía que volver a
// escribir todo desde cero. Ahora:
//   1) la ubicación se empieza a pedir EN PARALELO mientras el usuario
//      todavía está llenando el formulario (normalmente ya resuelve
//      antes de que toque "Continuar"), y
//   2) si falla igual, se ofrece reintentar SIN perder los datos: el
//      `result` del formulario sigue vivo en memoria porque nunca se
//      sale de la función que lo generó.
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
    await ensureCategoriesLoaded();

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

    // El banner de anuncios se carga en paralelo, sin bloquear la lista de
    // tareas: un anuncio patrocinado nunca debe hacer esperar el contenido
    // principal ni bloquear la carga si el endpoint falla.
    loadAdBanner('adBannerTrabajador', category || null).catch(() => {});

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
        // Fade-in escalonado (ver .task-card en style.css): cada tarjeta
        // arranca su animación un poco después que la anterior en vez de
        // que la lista entera "salte" de golpe al renderizarse.
        card.style.setProperty('--i', i);
        card.innerHTML = `
            <div class="task-card__row">
                <h3 class="task-card__title">${t.destacada ? '★ ' : ''}${categoryIcon(t.categoria_id)}${escapeHtml(t.titulo)}</h3>
                <span class="task-card__price">$${formatPrice(t.precio)}</span>
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
    await ensureCategoriesLoaded();

    try {
        const mine = await apiFetch('/applications/mine');
        mine.forEach(id => appliedTaskIds.add(String(id)));
    } catch {
        // fallo silencioso
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
    const radius = document.getElementById('filtroRadioOfertas')?.value || 3;
    const category = document.getElementById('filtroCategoriaOfertas')?.value || '';

    loadAdBanner('adBannerCliente', category || null).catch(() => {});

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
                <h3 class="task-card__title">${o.destacada ? '★ ' : ''}${categoryIcon(o.categoria_id)}${escapeHtml(o.titulo)}</h3>
                <span class="task-card__price">$${formatPrice(o.precio)}</span>
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

// ---------- Postularse / solicitar (genérico para ambas direcciones) ----------
// POST /applications/{id}/apply ya distingue internamente si es una
// necesidad (postula un trabajador) o una oferta (solicita un cliente)
// según el tipo de la publicación — acá sólo cambia el texto mostrado.

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
        fields: [
            {
                name: 'mensaje',
                label: esOferta ? 'Mensaje para el trabajador (opcional)' : 'Mensaje para el cliente (opcional)',
                type: 'textarea',
                placeholder: esOferta ? 'Ej: Necesito este servicio para el fin de semana...' : 'Ej: Tengo experiencia en este tipo de trabajos...'
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
        notify(esOferta ? 'Solicitud enviada correctamente.' : 'Postulación enviada correctamente.', 'success');
        if (esOferta) await loadNearbyOfertas(); else await loadNearbyTasks();
    } catch (err) {
        notify(`Error: ${err.message}`, 'error');
        if (err.message === 'Ya hiciste esta solicitud') {
            // El backend tiene razón y nuestro estado local estaba
            // desactualizado (p.ej. otra pestaña) — lo corregimos en vez
            // de dejar el botón en "Enviando…" para siempre.
            appliedTaskIds.add(String(taskId));
            if (esOferta) await loadNearbyOfertas(); else await loadNearbyTasks();
            return;
        }
        if (buttonEl) {
            buttonEl.disabled = false;
            buttonEl.textContent = esOferta ? 'Solicitar' : 'Postular';
        }
    }
}

// ---------- Dashboards ----------

export function showDashboardCliente() {
    switchView('dashboardCliente');
    setupClienteSubTabs();
    // Siempre vuelve a "Mis tareas" al entrar — evita quedar mostrando
    // el panel de ofertas con datos de una visita anterior.
    document.querySelectorAll('.sub-tab[data-clientetab]').forEach(t =>
        t.classList.toggle('is-active', t.dataset.clientetab === 'tareas'));
    document.getElementById('misTareasPanel')?.classList.remove('hidden');
    document.getElementById('ofertasCercanasPanel')?.classList.add('hidden');
    loadMyTasks();
}

export function showDashboardTrabajador() {
    switchView('dashboardTrabajador');
    setupTaskListDelegation();
    setupNearbyFiltersListeners();
    setupTrabajadorSubTabs();
    document.querySelectorAll('.sub-tab[data-trabajadortab]').forEach(t =>
        t.classList.toggle('is-active', t.dataset.trabajadortab === 'cercanas'));
    document.getElementById('tareasCercanasPanel')?.classList.remove('hidden');
    document.getElementById('misOfertasPanel')?.classList.add('hidden');
    loadNearbyTasks();
}

// Sub-pestañas dentro de cada dashboard — NO reutilizan la clase
// .admin-tab a propósito (ver comentario en style.css: el listener de
// admin.js está acoplado globalmente a esa clase).
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
    document.querySelectorAll('.bottom-nav__item').forEach(el => {
        el.classList.toggle('is-active', el.dataset.view === viewId);
    });
}

// ---------- Mis tareas (cliente) ----------

// Última lista de "mis tareas" cargada — el listener delegado de
// #misTareas se registra una sola vez, así que si leyera el array
// `tasks` por closure quedaría atado a la PRIMERA carga para siempre.
let myTasksCache = [];
let myOfertasCache = [];

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
        [tasks] = await Promise.all([apiFetch('/tasks/my'), ensureCategoriesLoaded()]);
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
            <div class="task-card__row">
                <h3 class="task-card__title">${categoryIcon(t.categoria_id)}${escapeHtml(t.titulo)}</h3>
                <span class="task-card__price">$${formatPrice(t.precio)}</span>
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
                await viewApplications(taskId, titulo, loadMyTasks);
            } else if (btn.dataset.action === 'review') {
                const t = myTasksCache.find(tt => String(tt.id) === String(taskId));
                await leaveReview(taskId, t?.trabajador_id, t?.trabajador_nombre || 'el trabajador');
            } else if (btn.dataset.action === 'edit') {
                const t = myTasksCache.find(tt => String(tt.id) === String(taskId));
                await editTask(taskId, t, loadMyTasks);
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

// ---------- Mis ofertas (trabajador) ----------
// Mismas acciones que "Mis tareas" (ver solicitudes/chat/completar/
// destacar/editar/cancelar), reutilizando los mismos endpoints
// genéricos PUT/DELETE/POST /tasks/{id}/... — sólo cambia de dónde se
// leen los datos (GET /tasks/ofertas/mine) y a quién se muestra en el
// chat (el cliente que contrató, no un trabajador).

async function loadMyOfertas() {
    const token = localStorage.getItem('token');
    if (!token) return;

    const container = document.getElementById('misOfertas');
    if (container) container.innerHTML = renderSkeletonCards(2);

    let ofertas;
    try {
        [ofertas] = await Promise.all([apiFetch('/tasks/ofertas/mine'), ensureCategoriesLoaded()]);
    } catch (err) {
        if (container) container.innerHTML = `<p class="empty-state">Error: ${escapeHtml(err.message)}</p>`;
        return;
    }

    if (!container) return;
    container.innerHTML = '';
    myOfertasCache = ofertas;

    if (!ofertas.length) {
        container.innerHTML = '<p class="empty-state">Todavía no publicaste ningún servicio. Toca "+ Publicar servicio" para empezar.</p>';
        return;
    }

    ofertas.forEach((o, i) => {
        const card = document.createElement('div');
        card.className = 'task-card';
        card.style.setProperty('--i', i);

        const canChat = o.estado === 'asignada' || o.estado === 'en_proceso' || o.estado === 'completada';
        const canComplete = o.estado === 'asignada' || o.estado === 'en_proceso';
        const canFeature = o.estado === 'activa' && !o.destacada;
        const canViewSolicitudes = o.estado === 'activa';
        const canEdit = o.estado === 'activa';
        const canCancel = o.estado === 'activa' || o.estado === 'asignada' || o.estado === 'en_proceso';

        card.innerHTML = `
            <div class="task-card__row">
                <h3 class="task-card__title">${categoryIcon(o.categoria_id)}${escapeHtml(o.titulo)}</h3>
                <span class="task-card__price">$${formatPrice(o.precio)}</span>
            </div>
            <p class="task-card__meta">
                <span class="chip chip--estado-${escapeHtml(o.estado)}">${escapeHtml(ESTADO_LABELS[o.estado] || o.estado)}</span>
                ${o.destacada ? '<span class="chip" style="color:var(--copper);border-color:var(--copper)">★ Destacada</span>' : ''}
            </p>
            <div class="task-card__actions">
                ${canViewSolicitudes ? `<button class="btn btn-accent btn-sm" data-action="solicitudes" data-id="${o.id}">Ver solicitudes</button>` : ''}
                ${canChat ? `<button class="btn btn-secondary btn-sm" data-action="chat" data-id="${o.id}">
                    <svg class="icon" viewBox="0 0 24 24"><path d="M4 5h16v11H9l-4 4V5Z"/></svg>
                    Chat
                </button>` : ''}
                ${canComplete ? `<button class="btn btn-primary btn-sm" data-action="complete" data-id="${o.id}">Marcar completada</button>` : ''}
                ${canFeature ? `<button class="btn btn-secondary btn-sm" data-action="feature" data-id="${o.id}">★ Destacar</button>` : ''}
                ${canEdit ? `<button class="btn btn-secondary btn-sm" data-action="edit" data-id="${o.id}">Editar</button>` : ''}
                ${canCancel ? `<button class="btn btn-ghost btn-sm" data-action="cancel" data-id="${o.id}" style="color:var(--brick)">Cancelar</button>` : ''}
            </div>
        `;
        container.appendChild(card);
    });

    if (!container.dataset.delegated) {
        container.dataset.delegated = 'true';
        container.addEventListener('click', async (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const ofertaId = btn.dataset.id;
            if (btn.dataset.action === 'chat') {
                const o = myOfertasCache.find(oo => String(oo.id) === String(ofertaId));
                openChatForTask(ofertaId, o?.titulo || '', o?.cliente_nombre || 'Cliente');
            } else if (btn.dataset.action === 'feature') {
                await requestFeatureTask(ofertaId);
            } else if (btn.dataset.action === 'solicitudes') {
                const titulo = btn.closest('.task-card')?.querySelector('.task-card__title')?.textContent || '';
                await viewApplications(ofertaId, titulo, loadMyOfertas);
            } else if (btn.dataset.action === 'edit') {
                const o = myOfertasCache.find(oo => String(oo.id) === String(ofertaId));
                await editTask(ofertaId, o, loadMyOfertas);
            } else if (btn.dataset.action === 'cancel') {
                const ok = await showConfirm({
                    title: 'Cancelar este servicio',
                    message: 'Los clientes que ya lo solicitaron dejarán de poder contratarlo. Esta acción no se puede deshacer.',
                    confirmLabel: 'Sí, cancelar',
                    danger: true
                });
                if (!ok) return;
                try {
                    await apiFetch(`/tasks/${encodeURIComponent(ofertaId)}`, { method: 'DELETE' });
                    notify('Servicio cancelado.', 'success');
                    await loadMyOfertas();
                } catch (err) {
                    notify(`Error: ${err.message}`, 'error');
                }
            } else if (btn.dataset.action === 'complete') {
                const ok = await showConfirm({
                    title: 'Marcar servicio como completado',
                    message: 'Confirma que el trabajo terminó.',
                    confirmLabel: 'Sí, completar'
                });
                if (!ok) return;
                try {
                    await apiFetch(`/tasks/${encodeURIComponent(ofertaId)}/complete`, { method: 'POST' });
                    notify('Servicio marcado como completado.', 'success');
                    await loadMyOfertas();
                } catch (err) {
                    notify(`Error: ${err.message}`, 'error');
                }
            }
        });
    }
}

// ---------- Ver / aceptar postulaciones o solicitudes (genérico) ----------
// Sirve tanto para "Mis tareas" (cliente ve postulaciones de
// trabajadores) como "Mis ofertas" (trabajador ve solicitudes de
// clientes) — GET /applications/task/{id} ya es genérico en el backend.
// onAccept es la función a llamar para refrescar la lista de fondo tras
// aceptar (loadMyTasks o loadMyOfertas, según quién llamó a esto).

async function viewApplications(taskId, tituloTarea, onAccept) {
    let apps;
    try {
        apps = await apiFetch(`/applications/task/${encodeURIComponent(taskId)}`);
    } catch (err) {
        notify(`Error: ${err.message}`, 'error');
        return;
    }

    if (!apps.length) {
        notify('Todavía no tienes solicitudes para esta publicación.', 'info');
        return;
    }

    ensureUiRoot();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal-card';

    const heading = document.createElement('h2');
    heading.className = 'modal-title';
    heading.textContent = tituloTarea ? `Solicitudes — ${tituloTarea}` : 'Solicitudes';
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
            title: 'Aceptar esta solicitud',
            message: 'Quedará asignado y podrán coordinar por chat. Las demás solicitudes seguirán pendientes pero la publicación dejará de estar disponible.',
            confirmLabel: 'Sí, aceptar'
        });
        if (!ok) return;

        btn.disabled = true;
        btn.textContent = 'Aceptando…';
        try {
            await apiFetch(`/applications/${encodeURIComponent(btn.dataset.appId)}/accept`, { method: 'POST' });
            notify('Solicitud aceptada. Ya pueden coordinar por chat.', 'success');
            close();
            if (onAccept) await onAccept();
        } catch (err) {
            notify(`Error: ${err.message}`, 'error');
            btn.disabled = false;
            btn.textContent = 'Aceptar';
        }
    });
}

// ---------- Editar tarea u oferta (genérico) ----------
// Sólo se permite mientras está "activa" (ver PUT /tasks/{id} en el
// backend) — no se edita categoría/ubicación acá, para eso conviene
// cancelar y crear una nueva. onSaved es la función a llamar para
// refrescar la lista de fondo (loadMyTasks o loadMyOfertas).
async function editTask(taskId, t, onSaved) {
    if (!t) return;

    const result = await showFormModal({
        title: 'Editar',
        confirmLabel: 'Guardar cambios',
        fields: [
            { name: 'titulo', label: 'Título', type: 'text', required: true, value: t.titulo },
            { name: 'descripcion', label: 'Descripción', type: 'textarea', value: t.descripcion || '' },
            { name: 'precio', label: 'Precio', type: 'number', min: 0, step: '0.01', value: t.precio ?? '' },
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
        notify('Actualizado correctamente.', 'success');
        if (onSaved) await onSaved();
    } catch (err) {
        notify(`Error: ${err.message}`, 'error');
    }
}

// ---------- Dejar reseña (cliente) ----------
// Sólo aplica a necesidades — ver la nota de alcance en
// routers/tasks.py sobre por qué las reseñas de servicios contratados
// vía oferta quedan fuera de esta pasada.
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

// ---------- Crear tarea (cliente) ----------

export function initTasks() {
    document.getElementById('newTaskBtn')?.addEventListener('click', handleNewTaskClick);
    document.getElementById('newOfertaBtn')?.addEventListener('click', handleNewOfertaClick);
}

async function ensureCategoriesLoaded() {
    if (!loadedCategories.length) {
        try {
            loadedCategories = await apiFetch('/categories');
        } catch (err) {
            notify(`No se pudieron cargar las categorías: ${err.message}`, 'error');
            return false;
        }
    }
    if (!loadedCategories.length) {
        notify('No hay categorías disponibles todavía.', 'error');
        return false;
    }
    return true;
}

async function handleNewTaskClick() {
    if (!(await ensureCategoriesLoaded())) return;

    // La ubicación se empieza a pedir EN PARALELO, antes de mostrar el
    // formulario — normalmente ya resuelve mientras el usuario está
    // escribiendo, en vez de sumar esa espera recién al final (ver
    // requestLocationWithRetry más arriba para el detalle del bug que
    // esto corrige).
    const locationPromise = getGeolocation();

    const categoryOptions = loadedCategories.map(c => ({
        value: String(c.id),
        label: `${c.icono ? c.icono + ' ' : ''}${c.nombre}`
    }));

    // Si el usuario vino del buscador del hero de la landing (ver
    // landing.js), ya eligió una categoría ahí — se preselecciona acá
    // para no hacerlo elegir dos veces. Se consume una sola vez.
    const preselectedCategoria = sessionStorage.getItem('heroSelectedCategoriaId');
    sessionStorage.removeItem('heroSelectedCategoriaId');

    const fields = [
        { name: 'titulo', label: 'Título', type: 'text', required: true, placeholder: 'Ej: Armar mueble de IKEA' },
        { name: 'descripcion', label: 'Descripción', type: 'textarea', placeholder: 'Detalles del trabajo...' },
        { name: 'precio', label: 'Precio estimado', type: 'number', min: 0, step: '0.01', placeholder: '0.00' },
        { name: 'categoria_id', label: 'Categoría', type: 'select', required: true, options: categoryOptions }
    ];
    if (preselectedCategoria) {
        fields.find(f => f.name === 'categoria_id').value = preselectedCategoria;
    }

    const result = await showFormModal({
        title: 'Nueva tarea',
        confirmLabel: 'Continuar',
        fields
    });

    if (result === null) return;

    const categoria = parseInt(result.categoria_id, 10);
    if (!loadedCategories.some(c => c.id === categoria)) {
        notify('Selecciona una categoría válida.', 'error');
        return;
    }

    const pos = await requestLocationWithRetry(locationPromise);
    if (!pos) {
        notify('No se publicó la tarea. Puedes intentarlo de nuevo con "+ Nueva tarea" cuando quieras.', 'info');
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

// ---------- Publicar un servicio / oferta (trabajador) ----------

async function handleNewOfertaClick() {
    if (!(await ensureCategoriesLoaded())) return;

    // Mismo motivo que en handleNewTaskClick: pedir la ubicación en
    // paralelo con el llenado del formulario, y con reintento si falla,
    // para no perder los datos ya escritos.
    const locationPromise = getGeolocation();

    const categoryOptions = loadedCategories.map(c => ({
        value: String(c.id),
        label: `${c.icono ? c.icono + ' ' : ''}${c.nombre}`
    }));

    const result = await showFormModal({
        title: 'Publicar un servicio',
        confirmLabel: 'Continuar',
        fields: [
            { name: 'titulo', label: 'Título', type: 'text', required: true, placeholder: 'Ej: Instalación eléctrica residencial' },
            { name: 'descripcion', label: 'Descripción', type: 'textarea', placeholder: 'Qué incluye el servicio, experiencia, etc.' },
            { name: 'precio', label: 'Precio (o desde)', type: 'number', min: 0, step: '0.01', placeholder: '0.00' },
            { name: 'categoria_id', label: 'Categoría', type: 'select', required: true, options: categoryOptions }
        ]
    });

    if (result === null) return;

    const categoria = parseInt(result.categoria_id, 10);
    if (!loadedCategories.some(c => c.id === categoria)) {
        notify('Selecciona una categoría válida.', 'error');
        return;
    }

    const pos = await requestLocationWithRetry(locationPromise);
    if (!pos) {
        notify('No se publicó el servicio. Puedes intentarlo de nuevo con "+ Publicar servicio" cuando quieras.', 'info');
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
        await apiFetch('/tasks/ofertas', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        notify('Servicio publicado exitosamente.', 'success');
        await loadMyOfertas();
    } catch (err) {
        notify(`Error: ${err.message}`, 'error');
    }
}
