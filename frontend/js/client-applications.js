// ============================================================
// Gestión de postulantes del cliente
// Cierra el flujo: Mis tareas -> Ver postulantes -> Contratar -> Chat.
// ============================================================
import { apiFetch, notify, escapeHtml } from './core.js';
import { openChatForTask } from './chat.js';

let refreshTimer = null;
let loading = false;

function formatDate(value) {
    if (!value) return '';
    try { return new Date(value).toLocaleString('es-CU', { dateStyle: 'short', timeStyle: 'short' }); }
    catch { return ''; }
}

function ensurePanel() {
    const dashboard = document.getElementById('dashboardCliente');
    const anchor = document.getElementById('misTareasPanel');
    if (!dashboard || !anchor) return null;
    let panel = document.getElementById('taskApplicationsPanel');
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = 'taskApplicationsPanel';
    panel.className = 'mt-md hidden';
    anchor.after(panel);
    return panel;
}

async function getMyTasks() {
    return apiFetch('/tasks/my');
}

async function getApplications(taskId) {
    return apiFetch(`/applications/task/${encodeURIComponent(taskId)}`);
}

function taskIdOf(task) {
    return task?.id || task?.task_id || task?.uuid || null;
}

export async function refreshClientApplications() {
    const dashboard = document.getElementById('dashboardCliente');
    if (!dashboard || dashboard.classList.contains('hidden') || loading) return;
    loading = true;
    const panel = ensurePanel();
    if (!panel) { loading = false; return; }

    try {
        const tasks = await getMyTasks();
        const active = (Array.isArray(tasks) ? tasks : []).filter(task => taskIdOf(task));
        if (!active.length) {
            panel.classList.add('hidden');
            panel.innerHTML = '';
            return;
        }

        const settled = await Promise.all(active.map(async task => {
            try { return { task, applications: await getApplications(taskIdOf(task)) }; }
            catch (error) { return { task, applications: [], error }; }
        }));
        const withApplications = settled.filter(row => Array.isArray(row.applications) && row.applications.length);

        if (!withApplications.length) {
            panel.classList.add('hidden');
            panel.innerHTML = '';
            return;
        }

        panel.classList.remove('hidden');
        panel.innerHTML = `
            <div class="view-header-row"><h2 class="view-title">Postulantes</h2><span class="chip">${withApplications.reduce((n, row) => n + row.applications.length, 0)} nuevos</span></div>
            <div class="stack-sm">
                ${withApplications.map(({ task, applications }) => `
                    <article class="task-card" data-app-task="${escapeHtml(String(taskIdOf(task)))}">
                        <div class="task-card__row">
                            <h3 class="task-card__title">${escapeHtml(task.titulo || 'Publicación')}</h3>
                            <span class="chip">${applications.length} postulante${applications.length === 1 ? '' : 's'}</span>
                        </div>
                        <div class="stack-sm task-applications-list">
                            ${applications.map(app => `
                                <div class="task-card" style="margin-top:8px">
                                    <div class="task-card__row">
                                        <strong>${escapeHtml(app.worker_nombre || 'Trabajador')}</strong>
                                        ${app.worker_verificado ? '<span class="chip">✓ Verificado</span>' : ''}
                                    </div>
                                    <p class="task-card__meta">⭐ ${escapeHtml(String(app.worker_rating ?? 0))}${app.created_at ? ` · ${escapeHtml(formatDate(app.created_at))}` : ''}</p>
                                    ${app.mensaje ? `<p>${escapeHtml(app.mensaje)}</p>` : ''}
                                    <div class="task-card__row" style="margin-top:10px">
                                        <button type="button" class="btn btn-accent btn-sm" data-accept-application="${escapeHtml(String(app.id))}" data-task-id="${escapeHtml(String(taskIdOf(task)))}" data-worker-name="${escapeHtml(app.worker_nombre || '')}">Contratar</button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </article>
                `).join('')}
            </div>`;
    } catch (error) {
        // No bloqueamos el dashboard por un fallo secundario.
        console.warn('[ServiCuba] No se pudieron cargar postulantes', error);
    } finally {
        loading = false;
    }
}

async function acceptApplication(button) {
    if (button.disabled) return;
    const applicationId = button.dataset.acceptApplication;
    const taskId = button.dataset.taskId;
    const workerName = button.dataset.workerName || 'trabajador';
    if (!applicationId || !taskId) return;

    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Contratando…';
    try {
        await apiFetch(`/applications/${encodeURIComponent(applicationId)}/accept`, { method: 'POST' });
        notify(`✓ ${workerName} fue contratado. Ya pueden conversar por Mensajes.`, 'success');
        await refreshClientApplications();
        document.dispatchEvent(new CustomEvent('servicuba:data-refreshed'));

        const open = window.confirm(`Contrataste a ${workerName}. ¿Quieres abrir el chat ahora?`);
        if (open) await openChatForTask(taskId, '', workerName);
    } catch (error) {
        notify(`No se pudo contratar: ${error.message}`, 'error');
        button.disabled = false;
        button.textContent = original;
    }
}

export function initClientApplications() {
    document.addEventListener('click', event => {
        const button = event.target.closest('[data-accept-application]');
        if (button) acceptApplication(button);
    });
    document.addEventListener('servicuba:data-refreshed', () => {
        window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(refreshClientApplications, 300);
    });
    new MutationObserver(() => {
        const dashboard = document.getElementById('dashboardCliente');
        if (dashboard && !dashboard.classList.contains('hidden')) refreshClientApplications();
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
}
