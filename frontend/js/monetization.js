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

// Cache simple en memoria — los precios no cambian durante la sesión y
// esto evita pedirlos de nuevo cada vez que se abre un modal.
let pricingCache = null;
async function getPricing() {
    if (pricingCache) return pricingCache;
    try {
        pricingCache = await apiFetch('/payments/pricing');
    } catch {
        pricingCache = null;
    }
    return pricingCache;
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

    // Antes el precio de hacerse premium sólo se veía DESPUÉS de tocar el
    // botón (en el toast de confirmación) — el usuario no sabía cuánto
    // costaba hasta comprometerse. Se muestra acá de entrada.
    const pricing = await getPricing();
    const precioTexto = pricing
        ? `$${pricing.premium.precio} ${pricing.moneda} / ${pricing.premium.dias} días`
        : 'Precio no disponible por ahora';

    el.innerHTML = `
        <div class="task-card">
            <p class="task-card__title">Plan gratis</p>
            <p class="task-card__meta" style="margin:6px 0 10px">
                Postulaciones limitadas por semana y radio de búsqueda reducido.
                Hazte Premium para postularte sin límite y ver tareas más lejos.
            </p>
            <p class="task-card__meta" style="margin-bottom:10px"><strong class="mono">${escapeHtml(precioTexto)}</strong></p>
            <button id="subscribePremiumBtn" class="btn btn-accent btn-block btn-sm">Hazte Premium — ${escapeHtml(precioTexto)}</button>
        </div>
    `;

    document.getElementById('subscribePremiumBtn')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const ok = await showConfirm({
            title: 'Hazte Premium',
            message: `Se creará una solicitud de pago por ${precioTexto}. Un administrador la confirma manualmente tras recibir el pago.`,
            confirmLabel: 'Solicitar'
        });
        if (!ok) return;

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
    const pricing = await getPricing();
    const precioTexto = pricing
        ? `$${pricing.tarea_destacada.precio} ${pricing.moneda} por ${pricing.tarea_destacada.dias} días`
        : 'precio no disponible por ahora';

    const ok = await showConfirm({
        title: 'Destacar esta tarea',
        message: `Tu tarea aparecerá primero en los resultados de los trabajadores cercanos. Costo: ${precioTexto}.`,
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
        const pricing = await getPricing();
        const precioDia = pricing ? pricing.anuncio.precio_por_dia : null;
        const precioLabel = precioDia != null
            ? `Días de duración (US$${precioDia}/día)`
            : 'Días de duración';

        const result = await showFormModal({
            title: precioDia != null ? `Anunciar tu negocio — US$${precioDia}/día` : 'Anunciar tu negocio',
            confirmLabel: 'Solicitar',
            fields: [
                { name: 'marca', label: 'Nombre de tu marca/negocio', type: 'text', required: true },
                { name: 'texto', label: 'Texto del anuncio', type: 'textarea', required: true, placeholder: 'Ej: 20% de descuento esta semana' },
                { name: 'url_destino', label: 'Enlace (opcional)', type: 'text', placeholder: 'https://...' },
                { name: 'dias', label: precioLabel, type: 'number', min: 1, required: true, value: 7 }
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
