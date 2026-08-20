import { apiFetch, notify, showFormModal, showConfirm, escapeHtml } from './core.js';

let pricingCache = null;
let observerInstalled = false;

function formatDate(iso) {
    return iso ? new Date(iso).toLocaleDateString('es-CU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

async function getPricing() {
    if (pricingCache) return pricingCache;
    try { pricingCache = await apiFetch('/payments/pricing'); } catch { pricingCache = null; }
    return pricingCache;
}

function effectivePlan(user) {
    const p = String(user?.plan || 'BASE').toLowerCase();
    if (p === 'premium' && user?.plan_expira && new Date(user.plan_expira) <= new Date()) return 'base';
    return p;
}

function premiumCard(user, state) {
    const plan = effectivePlan(user);
    const info = state?.plan || state || {};
    const limit = Number(info.limite_diario ?? (plan === 'premium' ? 10 : plan === 'free' ? 0 : 1));
    const used = Number(info.publicaciones_hoy ?? 0);
    const remaining = Number(info.restantes_hoy ?? Math.max(0, limit - used));
    const radius = Number(info.coverage_radius_km ?? (plan === 'premium' ? 20 : 5));
    if (plan === 'premium') {
        return `<div class="task-card premium-benefits-card"><div class="task-card__row"><h3 class="task-card__title">⭐ PREMIUM</h3><span class="chip">Activo</span></div><p class="task-card__meta">Cobertura Premium: <strong>${radius} km</strong></p><p class="task-card__meta">Te quedan <strong>${remaining} de ${limit}</strong> publicaciones hoy</p>${user.plan_expira ? `<p class="task-card__meta">Vence el ${escapeHtml(formatDate(user.plan_expira))}</p>` : ''}<button id="premiumPromoteBtn" class="btn btn-accent btn-block btn-sm">📣 Promocionar mi servicio</button><button id="myPromotionalAdsBtn" class="btn btn-secondary btn-block btn-sm">Mis anuncios</button></div>`;
    }
    const title = plan === 'free' ? 'Plan FREE' : 'Plan BASE';
    return `<div class="task-card"><div class="task-card__row"><h3 class="task-card__title">${title}</h3><span class="chip">${remaining} de ${limit}</span></div><p class="task-card__meta">Cobertura actual: ${radius} km · ${remaining} publicación${remaining === 1 ? '' : 'es'} disponible${remaining === 1 ? '' : 's'} hoy.</p><button id="upgradePremiumBtn" class="btn btn-accent btn-block btn-sm">⭐ Ver ventajas PREMIUM</button></div>`;
}

async function fetchPlanState() {
    try { return await apiFetch('/dashboard/state'); } catch { return null; }
}

export async function renderPremiumSection() {
    const el = document.getElementById('premiumSection');
    if (!el) return;
    try {
        const user = await apiFetch('/users/profile');
        if (!user.es_trabajador) { el.innerHTML = ''; return; }
        const state = await fetchPlanState();
        el.innerHTML = premiumCard(user, state);
        bindPlanButtons(user);
    } catch {
        el.innerHTML = '';
    }
}

function bindPlanButtons(user) {
    document.getElementById('premiumPromoteBtn')?.addEventListener('click', openPromotionalAdForm);
    document.getElementById('myPromotionalAdsBtn')?.addEventListener('click', showMyPromotionalAds);
    document.getElementById('upgradePremiumBtn')?.addEventListener('click', showPremiumUpsell);
}

async function showPremiumUpsell() {
    const pricing = await getPricing();
    const p = pricing?.premium;
    const label = p ? `$${p.precio} ${pricing.moneda} / ${p.dias} días` : 'precio disponible al solicitar';
    const ok = await showConfirm({ title: '⭐ Más alcance con PREMIUM', message: `Con PREMIUM puedes publicar hasta 10 servicios al día, alcanzar clientes en un radio de 20 km y crear anuncios promocionales. ${label}.`, confirmLabel: 'Solicitar PREMIUM' });
    if (!ok) return;
    try {
        const payment = await apiFetch('/payments/subscribe', { method: 'POST' });
        notify(`Solicitud enviada. ${payment.notas || 'Un administrador confirmará el pago.'}`, 'success');
    } catch (err) { notify(err.message || 'No se pudo solicitar PREMIUM.', 'error'); }
}

async function openPromotionalAdForm() {
    const result = await showFormModal({
        title: '📣 Crear anuncio promocional', confirmLabel: 'Crear anuncio', fields: [
            { name: 'titulo', label: 'Título', type: 'text', required: true, placeholder: 'Ej: Electricista disponible hoy' },
            { name: 'descripcion', label: 'Descripción', type: 'textarea', required: true, placeholder: 'Describe tu servicio y por qué elegirte' },
            { name: 'imagen', label: 'URL de imagen (opcional)', type: 'text', placeholder: 'https://...' },
            { name: 'precio_servicio', label: 'Precio del servicio (CUP)', type: 'number', min: 0, required: true },
            { name: 'contacto', label: 'Teléfono de contacto (opcional)', type: 'text' },
            { name: 'categoria_id', label: 'ID de categoría (opcional)', type: 'number', min: 1 }
        ]
    });
    if (result === null) return;
    try {
        const payload = {
            titulo: String(result.titulo || '').trim(), descripcion: String(result.descripcion || '').trim(),
            imagen: String(result.imagen || '').trim() || null, precio_servicio: Number(result.precio_servicio),
            contacto: String(result.contacto || '').trim() || null,
            categoria_id: result.categoria_id ? Number(result.categoria_id) : null
        };
        const ad = await apiFetch('/ads/promotional', { method: 'POST', body: JSON.stringify(payload) });
        notify(`Anuncio creado y pendiente de pago. Estado: ${ad.estado || 'pendiente_pago'}.`, 'success');
        showMyPromotionalAds();
    } catch (err) { notify(err.message || 'No se pudo crear el anuncio.', 'error'); }
}

async function showMyPromotionalAds() {
    const el = document.getElementById('premiumSection');
    if (!el) return;
    el.innerHTML = '<div class="task-card"><p class="task-card__meta">Cargando anuncios…</p></div>';
    try {
        const ads = await apiFetch('/ads/mine');
        const rows = ads.length ? ads.map(ad => `<div class="task-card"><div class="task-card__row"><strong>${escapeHtml(ad.titulo || ad.marca || 'Anuncio')}</strong><span class="chip">${escapeHtml(ad.estado || 'pendiente')}</span></div><p class="task-card__meta">${escapeHtml(ad.texto || '')}</p><p class="task-card__meta">${ad.precio_servicio != null ? `${escapeHtml(String(ad.precio_servicio))} CUP` : ''}</p></div>`).join('') : '<div class="task-card"><p class="task-card__meta">Todavía no tienes anuncios promocionales.</p></div>';
        el.innerHTML = `<div class="view-header-row"><h3 class="task-card__title">Mis anuncios</h3><button id="premiumPromoteBtn" class="btn btn-accent btn-sm">+ Crear</button></div><div class="stack-sm">${rows}</div><button id="premiumBackBtn" class="btn btn-secondary btn-block btn-sm">Volver a beneficios</button>`;
        document.getElementById('premiumPromoteBtn')?.addEventListener('click', openPromotionalAdForm);
        document.getElementById('premiumBackBtn')?.addEventListener('click', renderPremiumSection);
    } catch (err) { el.innerHTML = '<p class="empty-state">No pudimos cargar tus anuncios.</p>'; notify(err.message || 'Error cargando anuncios.', 'error'); }
}

export async function requestFeatureTask(taskId) {
    const pricing = await getPricing();
    const p = pricing?.tarea_destacada;
    const label = p ? `$${p.precio} ${pricing.moneda} por ${p.dias} días` : 'el precio vigente';
    const ok = await showConfirm({ title: 'Destacar esta publicación', message: `Este es un servicio extra independiente del plan PREMIUM. Costo: ${label}.`, confirmLabel: 'Solicitar' });
    if (!ok) return;
    try { const payment = await apiFetch(`/payments/feature-task/${encodeURIComponent(taskId)}`, { method: 'POST' }); notify(`Solicitud enviada. ${payment.notas || ''}`, 'success'); }
    catch (err) { notify(err.message || 'No se pudo solicitar el destacado.', 'error'); }
}

function installProfileObserver() {
    if (observerInstalled) return;
    observerInstalled = true;
    const target = document.getElementById('perfilView');
    if (!target) return;
    new MutationObserver(() => {
        if (!target.classList.contains('hidden') && document.getElementById('premiumSection')?.innerHTML.trim() === '') renderPremiumSection();
    }).observe(target, { attributes: true, attributeFilter: ['class'] });
}

export function initSponsorAdEntry() {
    document.getElementById('sponsorAdBtn')?.addEventListener('click', async () => {
        const pricing = await getPricing();
        const p = pricing?.anuncio;
        const result = await showFormModal({ title: 'Anunciar tu negocio', confirmLabel: 'Solicitar', fields: [
            { name: 'marca', label: 'Nombre del negocio', type: 'text', required: true },
            { name: 'texto', label: 'Texto del anuncio', type: 'textarea', required: true },
            { name: 'url_destino', label: 'Enlace (opcional)', type: 'text' },
            { name: 'contacto', label: 'Teléfono / WhatsApp', type: 'text' },
            { name: 'dias', label: p ? `Días (US$${p.precio_por_dia}/día)` : 'Días', type: 'number', min: 1, required: true, value: 7 }
        ] });
        if (!result) return;
        try { const payment = await apiFetch('/payments/sponsor-ad', { method: 'POST', body: JSON.stringify({ ...result, dias: Math.trunc(result.dias) }) }); notify(`Solicitud enviada — ${payment.notas || ''}`, 'success'); }
        catch (err) { notify(err.message || 'No se pudo solicitar el anuncio.', 'error'); }
    });
    installProfileObserver();
    document.addEventListener('servicuba:premium-upsell', showPremiumUpsell);
}

export async function loadAdBanner(containerId, categoryId = null) {
    const container = document.getElementById(containerId);
    if (!container) return;
    try {
        const q = categoryId ? `?category_id=${encodeURIComponent(categoryId)}` : '';
        const ad = await apiFetch(`/ads/active${q}`);
        if (!ad) { container.innerHTML = ''; return; }
        container.innerHTML = `<div class="ad-banner"><span class="ad-banner__tag">Patrocinado</span><strong>${escapeHtml(ad.marca || ad.titulo || '')}</strong><p>${escapeHtml(ad.texto || '')}</p>${ad.precio_servicio != null ? `<span>${escapeHtml(String(ad.precio_servicio))} CUP</span>` : ''}</div>`;
    } catch { container.innerHTML = ''; }
}
