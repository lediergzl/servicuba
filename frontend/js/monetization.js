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

    // Antes: user.rol !== 'trabajador' (rol fijo). Con la dualidad de
    // roles, un usuario puede ser cliente Y trabajador a la vez — lo que
    // importa acá es si tiene el perfil de trabajador activo, no si
    // "es" exclusivamente trabajador.
    if (!user.es_trabajador) {
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
        title: 'Destacar esta publicación',
        message: `Aparecerá primero en los resultados de búsqueda cercana. Costo: ${precioTexto}.`,
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
                { name: 'contacto', label: 'Teléfono / WhatsApp de contacto (opcional si pones un enlace)', type: 'text', placeholder: 'Ej: 53512345' },
                { name: 'dias', label: precioLabel, type: 'number', min: 1, required: true, value: 7 }
            ]
        });
        if (result === null) return;

        if (!result.url_destino && !result.contacto) {
            notify('Agrega un enlace o un teléfono/WhatsApp de contacto.', 'error');
            return;
        }

        try {
            const payment = await apiFetch('/payments/sponsor-ad', {
                method: 'POST',
                body: JSON.stringify({
                    marca: result.marca,
                    texto: result.texto,
                    url_destino: result.url_destino || null,
                    contacto: result.contacto || null,
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
// Antes loadAdBanner() se llamaba UNA sola vez al entrar a la vista y el
// banner quedaba fijo ahí para siempre — la única forma de ver otro
// anuncio patrocinado era recargar toda la página (F5). Ahora rota solo,
// pidiendo un anuncio nuevo cada AD_ROTATION_MS mientras el contenedor
// siga existiendo Y esté realmente visible en pantalla.
//
// El "realmente visible" importa porque GET /ads/active cuenta una
// impresión en el servidor CADA VEZ que se llama (ver routers/ads.py) —
// si siguiéramos pidiendo en segundo plano mientras el usuario está en
// otra vista (chat, perfil, etc.), el contador de impresiones que ve el
// anunciante quedaría inflado con vistas que nunca ocurrieron.

const AD_ROTATION_MS = 25000;
// containerId -> intervalId, para poder cancelar un timer anterior si
// loadAdBanner se vuelve a llamar sobre el mismo contenedor (evita
// timers duplicados acumulándose en cada cambio de modo/vista).
const _adRotationTimers = new Map();

// containerId -> Set de ids de anuncio ya mostrados en el ciclo actual.
// Se manda como ?excluir=id1,id2,... para que el backend elija entre los
// que faltan (ver GET /ads/active en routers/ads.py) — así no se repite
// un anuncio hasta que se hayan mostrado todos los activos.
const _adShownIds = new Map();

function isElementVisible(el) {
    // offsetParent es null cuando el elemento (o un ancestro) tiene
    // display:none — que es exactamente cómo se ocultan las vistas acá
    // (.hidden { display: none !important }, ver style.css). Los
    // contenedores de vista NUNCA se sacan del DOM, sólo se ocultan, así
    // que document.getElementById seguiría encontrándolos aunque el
    // usuario esté mirando otra pantalla.
    return !!el && el.offsetParent !== null;
}

async function fetchAndRenderAd(containerId, categoryId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const shown = _adShownIds.get(containerId) || new Set();

    const searchParams = new URLSearchParams();
    if (categoryId) searchParams.set('category_id', categoryId);
    if (shown.size) searchParams.set('excluir', [...shown].join(','));
    const qs = searchParams.toString();

    let ad;
    try {
        ad = await apiFetch(`/ads/active${qs ? `?${qs}` : ''}`);
    } catch {
        container.innerHTML = '';
        return;
    }

    if (!ad) {
        container.innerHTML = '';
        return;
    }

    if (shown.has(ad.id)) {
        // El backend ya reinició el ciclo (mostró todos los que
        // teníamos anotados) — empezamos un ciclo de exclusión nuevo
        // desde este anuncio, en vez de seguir arrastrando el anterior.
        shown.clear();
    }
    shown.add(ad.id);
    _adShownIds.set(containerId, shown);

    // Antes: toda la tarjeta era clickeable para abrir url_destino, con
    // sólo un link de texto para el teléfono — poco profesional y con
    // affordance ambigua (¿qué parte del texto es "el botón"?). Ahora
    // hay un avatar con la inicial de la marca y botones de acción
    // explícitos, como cualquier tarjeta de anuncio real.
    const inicial = (ad.marca || '').trim().charAt(0).toUpperCase() || '★';

    container.innerHTML = `
        <div class="ad-banner" role="complementary" aria-label="Anuncio patrocinado">
            <div class="ad-banner__header">
                <span class="ad-banner__avatar">${escapeHtml(inicial)}</span>
                <div class="ad-banner__headerText">
                    <span class="ad-banner__tag">Patrocinado</span>
                    <p class="ad-banner__brand">${escapeHtml(ad.marca)}</p>
                </div>
            </div>
            <p class="ad-banner__text">${escapeHtml(ad.texto)}</p>
            <div class="ad-banner__actions">
                ${ad.contacto ? `<a class="ad-banner__cta ad-banner__cta--ghost" href="tel:${escapeHtml(ad.contacto)}">📞 Llamar</a>` : ''}
                ${ad.url_destino ? `<button type="button" class="ad-banner__cta" data-role="ad-cta">Ver más →</button>` : ''}
            </div>
        </div>
    `;

    if (ad.url_destino) {
        container.querySelector('[data-role="ad-cta"]')?.addEventListener('click', async () => {
            try {
                const { url_destino } = await apiFetch(`/ads/${ad.id}/click`, { method: 'POST' });
                if (url_destino) window.open(url_destino, '_blank', 'noopener');
            } catch {
                // fallo silencioso — no bloquea la navegación del usuario
            }
        });
    }
}

export async function loadAdBanner(containerId, categoryId = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    await fetchAndRenderAd(containerId, categoryId);

    // Si ya había un timer de rotación corriendo para este mismo
    // contenedor (ej. el usuario cambió de modo Cliente/Trabajador y
    // volvió), lo cancelamos antes de crear uno nuevo.
    if (_adRotationTimers.has(containerId)) {
        clearInterval(_adRotationTimers.get(containerId));
        _adRotationTimers.delete(containerId);
    }

    const intervalId = setInterval(() => {
        const el = document.getElementById(containerId);
        if (!el) {
            // La vista ya no existe (no debería pasar, pero por las
            // dudas) — dejamos de sondear.
            clearInterval(intervalId);
            _adRotationTimers.delete(containerId);
            return;
        }
        if (!isElementVisible(el)) {
            // El usuario está en otra vista ahora mismo: no pedimos el
            // anuncio (evita inflar impresiones), pero seguimos el
            // timer corriendo para retomar solo cuando vuelva.
            return;
        }
        fetchAndRenderAd(containerId, categoryId);
    }, AD_ROTATION_MS);
    _adRotationTimers.set(containerId, intervalId);
}
