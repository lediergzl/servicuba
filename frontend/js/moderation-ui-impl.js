import { apiFetch, notify, showConfirm, showFormModal, escapeHtml } from './core.js';

const REPORT_REASONS = [
    { value: 'spam', label: 'Spam o contenido repetitivo' },
    { value: 'inapropiado', label: 'Contenido inapropiado' },
    { value: 'estafa', label: 'Posible estafa o fraude' },
    { value: 'fuera_de_proposito', label: 'No corresponde a un servicio' },
    { value: 'otro', label: 'Otro motivo' },
];

async function reportTask(taskId) {
    const result = await showFormModal({ title: 'Denunciar publicación', confirmLabel: 'Enviar denuncia', fields: [
        { name: 'reason', label: 'Motivo', type: 'select', required: true, options: REPORT_REASONS },
        { name: 'details', label: 'Detalles (opcional)', type: 'textarea', placeholder: 'Cuéntanos brevemente qué sucede…' },
    ]});
    if (result === null) return;
    try {
        await apiFetch(`/reports/${encodeURIComponent(taskId)}`, { method: 'POST', body: JSON.stringify({ reason: result.reason, details: result.details || null }) });
        notify('Denuncia recibida. Gracias por ayudarnos a mantener ServiCuba útil y seguro.', 'success');
    } catch (err) { notify(`No se pudo enviar la denuncia: ${err.message}`, 'error'); }
}

function injectReportButtons(root = document) {
    root.querySelectorAll('.task-card').forEach(card => {
        if (card.querySelector('.report-task-btn')) return;
        const applyButton = card.querySelector('button[data-id]');
        if (!applyButton?.dataset.id) return;
        const actions = document.createElement('div');
        actions.className = 'task-card__secondary-actions';
        actions.innerHTML = `<button type="button" class="report-task-btn" data-report-task-id="${escapeHtml(applyButton.dataset.id)}">Denunciar publicación</button>`;
        card.appendChild(actions);
    });
}

export function initModerationUi() {
    document.addEventListener('click', async event => {
        const reportButton = event.target.closest('.report-task-btn');
        if (reportButton) { event.preventDefault(); await reportTask(reportButton.dataset.reportTaskId); return; }
        const tab = event.target.closest('.admin-tab[data-tab="moderacion"]');
        if (!tab) return;
        document.querySelectorAll('.admin-tab').forEach(item => item.classList.toggle('is-active', item === tab));
        document.querySelectorAll('#adminView > .stack-sm').forEach(panel => panel.classList.add('hidden'));
        const panel = document.getElementById('adminModeracion'); panel?.classList.remove('hidden'); loadModerationReports();
    });
    const observer = new MutationObserver(() => injectReportButtons());
    observer.observe(document.getElementById('views') || document.body, { childList: true, subtree: true });
    injectReportButtons();
    const tabs = document.querySelector('.admin-tabs');
    if (tabs && !tabs.querySelector('[data-tab="moderacion"]')) tabs.insertAdjacentHTML('beforeend', '<button class="admin-tab" data-tab="moderacion" type="button">Moderación</button>');
}

export async function loadModerationReports(status = 'pendiente') {
    const panel = document.getElementById('adminModeracion'); if (!panel) return;
    panel.innerHTML = '<p class="empty-state">Cargando denuncias…</p>';
    try {
        const reports = await apiFetch(`/admin/moderation/reports?status=${encodeURIComponent(status)}`);
        if (!reports.length) { panel.innerHTML = '<p class="empty-state">No hay denuncias pendientes.</p>'; return; }
        panel.innerHTML = reports.map(report => `<article class="admin-row moderation-report" data-report-id="${escapeHtml(report.id)}"><div class="admin-row__top"><strong>${escapeHtml(report.task_title)}</strong><span class="chip">${escapeHtml(report.reason)}</span></div><p class="admin-row__meta">${escapeHtml(report.task_type)} · ${escapeHtml(report.reporter_name)} · ${escapeHtml(formatDate(report.created_at))}</p>${report.details ? `<p class="moderation-report__details">${escapeHtml(report.details)}</p>` : ''}<div class="admin-row__actions"><button class="btn btn-ghost btn-sm" data-mod-action="dismiss">Descartar</button><button class="btn btn-primary btn-sm" data-mod-action="hide">Ocultar</button><button class="btn btn-ghost btn-sm" data-mod-action="suspend-user">Suspender usuario</button></div></article>`).join('');
        panel.querySelectorAll('[data-mod-action]').forEach(button => button.addEventListener('click', () => moderateReport(button)));
    } catch (err) { panel.innerHTML = `<p class="empty-state">Error: ${escapeHtml(err.message)}</p>`; }
}

async function moderateReport(button) {
    const row = button.closest('[data-report-id]'); if (!row) return;
    const action = button.dataset.modAction; const labels = { dismiss: 'Descartar denuncia', hide: 'Ocultar publicación', 'suspend-user': 'Suspender usuario' };
    const ok = await showConfirm({ title: labels[action] || 'Aplicar acción', message: action === 'dismiss' ? 'La denuncia quedará descartada.' : 'Esta acción quedará registrada en la auditoría de administración.', confirmLabel: labels[action] || 'Confirmar', danger: action !== 'dismiss' });
    if (!ok) return; button.disabled = true;
    try { await apiFetch(`/admin/moderation/reports/${encodeURIComponent(row.dataset.reportId)}/${action}`, { method: 'POST' }); notify('Acción de moderación aplicada.', 'success'); row.remove(); }
    catch (err) { notify(`No se pudo aplicar la acción: ${err.message}`, 'error'); button.disabled = false; }
}

function formatDate(value) { if (!value) return ''; const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('es-CU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
