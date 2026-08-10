// ============================================================
// Panel de administración: pagos pendientes + anuncios + categorías + usuarios
// ============================================================
import { apiFetch, notify, showConfirm, showFormModal, escapeHtml } from './core.js';
import { loadCategories } from './tasks.js';

const TIPO_LABELS = {
    suscripcion_trabajador: 'Suscripción premium',
    tarea_destacada: 'Destacar publicación',
    anuncio: 'Anuncio de marca',
};

function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('es-CU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export async function checkAndShowAdminEntry() {
    const btn = document.getElementById('adminPanelBtn');
    if (!btn) return;
    try {
        const user = await apiFetch('/users/profile');
        btn.classList.toggle('hidden', !user.es_admin);
    } catch {
        btn.classList.add('hidden');
    }
}

export async function loadPendingPayments() {
    const container = document.getElementById('adminPagos');
    if (!container) return;
    container.innerHTML = '<p class="empty-state">Cargando…</p>';

    let payments;
    try {
        payments = await apiFetch('/payments/pending');
    } catch (err) {
        container.innerHTML = `<p class="empty-state">Error: ${escapeHtml(err.message)}</p>`;
        return;
    }

    if (!payments.length) {
        container.innerHTML = '<p class="empty-state">No hay pagos pendientes.</p>';
        return;
    }

    container.innerHTML = payments.map(p => `
        <div class="admin-row" data-payment-id="${p.id}">
            <div class="admin-row__top">
                <span class="admin-row__type">${escapeHtml(TIPO_LABELS[p.tipo] || p.tipo)}</span>
                <span class="admin-row__amount">$${p.monto} ${escapeHtml(p.moneda)}</span>
            </div>
            <p class="admin-row__meta">
                Usuario: <span class="mono">${escapeHtml(p.user_id.slice(0, 8))}</span> ·
                ${escapeHtml(formatDate(p.created_at))}
                ${p.referencia ? `· ref: <span class="mono">${escapeHtml(p.referencia.slice(0, 8))}</span>` : ''}
            </p>
            <div class="admin-row__actions">
                <button class="btn btn-primary btn-sm" data-action="confirm">Confirmar</button>
                <button class="btn btn-ghost btn-sm" data-action="reject">Rechazar</button>
            </div>
        </div>
    `).join('');

    if (!container.dataset.delegated) {
        container.dataset.delegated = 'true';
        container.addEventListener('click', async (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const row = btn.closest('[data-payment-id]');
            const paymentId = row.dataset.paymentId;
            const action = btn.dataset.action;

            if (action === 'reject') {
                const ok = await showConfirm({
                    title: 'Rechazar pago',
                    message: 'El usuario no recibirá el beneficio solicitado.',
                    confirmLabel: 'Rechazar',
                    danger: true,
                });
                if (!ok) return;
            }

            btn.disabled = true;
            try {
                await apiFetch(`/payments/${encodeURIComponent(paymentId)}/${action}`, { method: 'POST' });
                notify(action === 'confirm' ? 'Pago confirmado.' : 'Pago rechazado.', 'success');
                row.remove();
                if (!container.querySelector('[data-payment-id]')) {
                    container.innerHTML = '<p class="empty-state">No hay pagos pendientes.</p>';
                }
            } catch (err) {
                notify(`Error: ${err.message}`, 'error');
                btn.disabled = false;
            }
        });
    }
}

export async function loadAdsAdmin() {
    const container = document.getElementById('adminAnuncios');
    if (!container) return;
    container.innerHTML = '<p class="empty-state">Cargando…</p>';

    let ads;
    try {
        ads = await apiFetch('/ads/');
    } catch (err) {
        container.innerHTML = `<p class="empty-state">Error: ${escapeHtml(err.message)}</p>`;
        return;
    }

    if (!ads.length) {
        container.innerHTML = '<p class="empty-state">No hay anuncios todavía.</p>';
        return;
    }

    container.innerHTML = ads.map(ad => `
        <div class="admin-row" data-ad-id="${ad.id}">
            <div class="admin-row__top">
                <span class="admin-row__type">${escapeHtml(ad.marca)}</span>
                <span class="chip ${ad.activo ? 'chip--estado-activa' : 'chip--estado-cancelada'}">${ad.activo ? 'Activo' : 'Pausado'}</span>
            </div>
            <p class="admin-row__meta">
                ${escapeHtml(ad.texto)}<br>
                👁 ${ad.impresiones} · 🖱 ${ad.clics}
                ${ad.fecha_fin ? `· vence ${escapeHtml(formatDate(ad.fecha_fin))}` : ''}
            </p>
            <div class="admin-row__actions">
                <button class="btn ${ad.activo ? 'btn-ghost' : 'btn-primary'} btn-sm" data-action="toggle">
                    ${ad.activo ? 'Pausar' : 'Activar'}
                </button>
            </div>
        </div>
    `).join('');

    if (!container.dataset.delegated) {
        container.dataset.delegated = 'true';
        container.addEventListener('click', async (e) => {
            const btn = e.target.closest('button[data-action="toggle"]');
            if (!btn) return;
            const row = btn.closest('[data-ad-id]');
            btn.disabled = true;
            try {
                await apiFetch(`/ads/${encodeURIComponent(row.dataset.adId)}/toggle`, { method: 'POST' });
                loadAdsAdmin();
            } catch (err) {
                notify(`Error: ${err.message}`, 'error');
                btn.disabled = false;
            }
        });
    }
}

// ---------- Categorías ----------

export async function loadCategoriesAdmin() {
    const container = document.getElementById('adminCategorias');
    if (!container) return;
    container.innerHTML = '<p class="empty-state">Cargando…</p>';

    let cats;
    try {
        cats = await apiFetch('/categories/all');
    } catch (err) {
        container.innerHTML = `<p class="empty-state">Error: ${escapeHtml(err.message)}</p>`;
        return;
    }

    const listHtml = cats.length
        ? cats.map(c => `
            <div class="admin-row" data-cat-id="${c.id}">
                <div class="admin-row__top">
                    <span class="admin-row__type">${c.icono ? escapeHtml(c.icono) + ' ' : ''}${escapeHtml(c.nombre)}</span>
                    <span class="chip ${c.activo ? 'chip--estado-activa' : 'chip--estado-cancelada'}">${c.activo ? 'Activa' : 'Pausada'}</span>
                </div>
                <div class="admin-row__actions">
                    <button class="btn ${c.activo ? 'btn-ghost' : 'btn-primary'} btn-sm" data-action="toggle-cat">
                        ${c.activo ? 'Pausar' : 'Activar'}
                    </button>
                </div>
            </div>
        `).join('')
        : '<p class="empty-state">No hay categorías todavía.</p>';

    container.innerHTML = `
        <button id="newCategoryBtn" class="btn btn-accent btn-block btn-sm">+ Nueva categoría</button>
        <div class="stack-sm mt-md">${listHtml}</div>
    `;

    document.getElementById('newCategoryBtn')?.addEventListener('click', async () => {
        const result = await showFormModal({
            title: 'Nueva categoría',
            confirmLabel: 'Crear',
            fields: [
                { name: 'nombre', label: 'Nombre', type: 'text', required: true, placeholder: 'Ej: Carpintero' },
                { name: 'icono', label: 'Emoji (opcional)', type: 'text', placeholder: '🪚' },
            ]
        });
        if (result === null) return;

        try {
            await apiFetch('/categories', {
                method: 'POST',
                body: JSON.stringify({ nombre: result.nombre, icono: result.icono || null })
            });
            notify('Categoría creada.', 'success');
            await loadCategoriesAdmin();
            // Refresca los <select> de categoría del resto de la app
            // (crear tarea, publicar servicio, filtros, registro) sin
            // necesidad de recargar la página.
            await loadCategories();
        } catch (err) {
            notify(`Error: ${err.message}`, 'error');
        }
    });

    const list = container.querySelector('.stack-sm');
    if (list && !list.dataset.delegated) {
        list.dataset.delegated = 'true';
        list.addEventListener('click', async (e) => {
            const btn = e.target.closest('button[data-action="toggle-cat"]');
            if (!btn) return;
            const row = btn.closest('[data-cat-id]');
            btn.disabled = true;
            try {
                await apiFetch(`/categories/${encodeURIComponent(row.dataset.catId)}/toggle`, { method: 'POST' });
                await loadCategoriesAdmin();
                await loadCategories();
            } catch (err) {
                notify(`Error: ${err.message}`, 'error');
                btn.disabled = false;
            }
        });
    }
}

// ---------- Usuarios ----------
// Antes no existía NINGUNA pantalla para ver/gestionar usuarios en el
// panel de admin (sólo pagos/anuncios/categorías) — ver
// GET /users/admin/list y POST /users/admin/{id}/toggle-verificado.

let userSearchTimeout = null;

export async function loadUsersAdmin() {
    const container = document.getElementById('adminUsuarios');
    if (!container) return;
    container.innerHTML = '<p class="empty-state">Cargando…</p>';

    let usuarios;
    try {
        usuarios = await apiFetch('/users/admin/list');
    } catch (err) {
        container.innerHTML = `<p class="empty-state">Error: ${escapeHtml(err.message)}</p>`;
        return;
    }
    renderUsersAdmin(usuarios);
}

function renderUsersAdmin(usuarios) {
    const container = document.getElementById('adminUsuarios');
    if (!container) return;

    const listHtml = usuarios.length
        ? usuarios.map(u => `
            <div class="admin-row" data-user-id="${u.id}">
                <div class="admin-row__top">
                    <span class="admin-row__type">${escapeHtml(u.nombre)}</span>
                    <span class="chip mono">★ ${(u.rating ?? 0).toFixed(1)}</span>
                </div>
                <p class="admin-row__meta">
                    <span class="mono">${escapeHtml(u.telefono)}</span><br>
                    ${u.es_cliente ? '<span class="chip chip--estado-activa">Cliente</span>' : ''}
                    ${u.es_trabajador ? '<span class="chip chip--estado-activa">Trabajador</span>' : ''}
                    ${u.es_admin ? '<span class="chip" style="color:var(--copper);border-color:var(--copper)">Admin</span>' : ''}
                    ${u.verificado ? '<span class="chip" style="color:var(--success);border-color:var(--success)">✓ Verificado</span>' : ''}
                    ${u.plan === 'premium' ? '<span class="chip" style="border-color:var(--accent)">⭐ Premium</span>' : ''}
                </p>
                <div class="admin-row__actions">
                    <button class="btn ${u.verificado ? 'btn-ghost' : 'btn-primary'} btn-sm" data-action="toggle-verificado">
                        ${u.verificado ? 'Quitar verificación' : 'Verificar'}
                    </button>
                </div>
            </div>
        `).join('')
        : '<p class="empty-state">No se encontraron usuarios.</p>';

    container.innerHTML = `
        <input type="search" id="userSearchInput" class="field-input" placeholder="Buscar por nombre o teléfono…">
        <div class="stack-sm mt-md">${listHtml}</div>
    `;

    const searchInput = document.getElementById('userSearchInput');
    searchInput?.addEventListener('input', () => {
        clearTimeout(userSearchTimeout);
        const q = searchInput.value.trim();
        userSearchTimeout = setTimeout(async () => {
            let usuarios;
            try {
                usuarios = await apiFetch(`/users/admin/list${q ? `?q=${encodeURIComponent(q)}` : ''}`);
            } catch (err) {
                notify(`Error: ${err.message}`, 'error');
                return;
            }
            renderUsersAdmin(usuarios);
            document.getElementById('userSearchInput')?.focus();
        }, 300);
    });

    const list = container.querySelector('.stack-sm');
    list?.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action="toggle-verificado"]');
        if (!btn) return;
        const row = btn.closest('[data-user-id]');
        btn.disabled = true;
        try {
            await apiFetch(`/users/admin/${encodeURIComponent(row.dataset.userId)}/toggle-verificado`, { method: 'POST' });
            await loadUsersAdmin();
        } catch (err) {
            notify(`Error: ${err.message}`, 'error');
            btn.disabled = false;
        }
    });
}

export function initAdminPanel() {
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('is-active', t === tab));
            document.getElementById('adminPagos')?.classList.toggle('hidden', tab.dataset.tab !== 'pagos');
            document.getElementById('adminAnuncios')?.classList.toggle('hidden', tab.dataset.tab !== 'anuncios');
            document.getElementById('adminCategorias')?.classList.toggle('hidden', tab.dataset.tab !== 'categorias');
            document.getElementById('adminUsuarios')?.classList.toggle('hidden', tab.dataset.tab !== 'usuarios');

            if (tab.dataset.tab === 'pagos') loadPendingPayments();
            else if (tab.dataset.tab === 'anuncios') loadAdsAdmin();
            else if (tab.dataset.tab === 'categorias') loadCategoriesAdmin();
            else if (tab.dataset.tab === 'usuarios') loadUsersAdmin();
        });
    });
}
