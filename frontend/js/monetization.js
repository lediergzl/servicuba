// ============================================================
// Monetización: plan premium, tareas destacadas, anuncios de marca
// ============================================================
import { apiFetch, notify, showFormModal, showConfirm, escapeHtml } from './core.js';

// Todo esto usa pagos "pendientes de confirmación manual" (ver
// backend/app/routers/payments.py) porque todavía no hay una pasarela de
// pago digital conectada — es intencional, no un bug.

function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('es-CU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------- Sección premium en el perfil ----------

export async function renderPremiumSection() {
    const el = document.getElementById('premiumSection');
    if (!el) return;

    let user;
    try {
        user = await apiFetch('/users/profile');
    } catch {
        el.innerHTML = '';
        return;
    }

    if (user.rol !== 'trabajador') {
        el.innerHTML = '';
        return;
    }

    if (user.plan === 'premium' && user.plan_expira) {
        el.innerHTML = `
            <div class="task-card">
                <p class="task-card__title">⭐ Plan Premium activo</p>
                <p class="task-card__meta" style="margin-top:4px">Vence el ${escapeHtml(formatDate(user.plan_expira))}</p>
            </div>
        `;
        return;
    }

    el.innerHTML = `
        <div class="task-card">
            <p class="task-card__title">Plan gratis</p>
            <p class="task-card__meta" style="margin:6px 0 10px">
                Postulaciones limitadas por semana y radio de búsqueda reducido.
                Hazte Premium para postularte sin límite y ver tareas más lejos.
            </p>
            <button id="subscribePremiumBtn" class="btn btn-accent btn-block btn-sm">Hazte Premium</button>
        </div>
    `;

    document.getElementById('subscribePremiumBtn')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
            const payment = await apiFetch('/payments/subscribe', { method: 'POST' });
            notify(`Solicitud enviada (pago #${payment.id.slice(0, 8)}). ${payment.notas}`, 'info');
        } catch (err) {
            notify(`Error: ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
        }
    });
}

// ---------- Destacar una tarea (llamado desde tasks.js) ----------

export async function requestFeatureTask(taskId) {
    const ok = await showConfirm({
        title: 'Destacar esta tarea',
        message: 'Tu tarea aparecerá primero en los resultados de los trabajadores cercanos.',
        confirmLabel: 'Solicitar'
    });
    if (!ok) return;

    try {
        const payment = await apiFetch(`/payments/feature-task/${encodeURIComponent(taskId)}`, { method: 'POST' });
        notify(`Solicitud enviada (pago #${payment.id.slice(0, 8)}). ${payment.notas}`, 'info');
    } catch (err) {
        notify(`Error: ${err.message}`, 'error');
    }
}

// ---------- Solicitar patrocinar un anuncio ----------

export function initSponsorAdEntry() {
    document.getElementById('sponsorAdBtn')?.addEventListener('click', async () => {
        const result = await showFormModal({
            title: 'Anunciar tu negocio',
            confirmLabel: 'Solicitar',
            fields: [
                { name: 'marca', label: 'Nombre de tu marca/negocio', type: 'text', required: true },
                { name: 'texto', label: 'Texto del anuncio', type: 'textarea', required: true, placeholder: 'Ej: 20% de descuento esta semana' },
                { name: 'url_destino', label: 'Enlace (opcional)', type: 'text', placeholder: 'https://...' },
                { name: 'dias', label: 'Días de duración', type: 'number', min: 1, required: true, value: 7 }
            ]
        });
        if (result === null) return;

        try {
            const payment = await apiFetch('/payments/sponsor-ad', {
                method: 'POST',
                body: JSON.stringify({
                    marca: result.marca,
                    texto: result.texto,
                    url_destino: result.url_destino || null,
                    dias: Math.trunc(result.dias)
                })
            });
            notify(`Solicitud enviada — total $${payment.monto} ${payment.moneda}. ${payment.notas}`, 'info');
        } catch (err) {
            notify(`Error: ${err.message}`, 'error');
        }
    });
}

// ---------- Banner de anuncio de marca ----------

export async function loadAdBanner(containerId, categoryId = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let ad;
    try {
        const params = categoryId ? `?category_id=${encodeURIComponent(categoryId)}` : '';
        ad = await apiFetch(`/ads/active${params}`);
    } catch {
        container.innerHTML = '';
        return;
    }

    if (!ad) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <div class="ad-banner" role="complementary" aria-label="Anuncio">
            <span class="ad-banner__tag">Patrocinado</span>
            <p class="ad-banner__brand">${escapeHtml(ad.marca)}</p>
            <p class="ad-banner__text">${escapeHtml(ad.texto)}</p>
        </div>
    `;

    if (ad.url_destino) {
        const banner = container.querySelector('.ad-banner');
        banner.style.cursor = 'pointer';
        banner.addEventListener('click', async () => {
            try {
                const { url_destino } = await apiFetch(`/ads/${ad.id}/click`, { method: 'POST' });
                if (url_destino) window.open(url_destino, '_blank', 'noopener');
            } catch {
                // fallo silencioso — no bloquea la navegación del usuario
            }
        });
    }
}
