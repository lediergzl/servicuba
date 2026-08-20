import { apiFetch, escapeHtml, notify } from './core.js';
import { showRegister } from './auth.js';

const PLAN_COPY = {
    gratis: {
        name: 'FREE',
        title: 'Busca y contrata servicios',
        items: ['Descubrir servicios cercanos', 'Contactar trabajadores', 'Postularte a servicios publicados'],
    },
    base: {
        name: 'BASE',
        title: 'Publica tu servicio',
        items: ['Todo lo de FREE', '1 servicio publicado al día', 'Perfil profesional visible'],
    },
    premium: {
        name: 'PREMIUM',
        title: 'Haz que te encuentren',
        items: ['Todo lo de BASE', 'Hasta 10 servicios al día', 'Anuncios y promociones', 'Mayor alcance y prioridad'],
    },
};

let entitlements = null;
// Precio real de la suscripción — GET /payments/pricing es público (sin
// Depends(get_current_user) en el backend), así que se puede pedir incluso
// sin sesión para mostrar el precio en el CTA del plan Premium.
let pricingCache = null;

function installStyles() {
    if (document.getElementById('plansUiStyles')) return;
    const style = document.createElement('style');
    style.id = 'plansUiStyles';
    style.textContent = `
      .plans-entry{position:fixed;right:14px;bottom:14px;z-index:1000;border:1px solid var(--line);background:var(--paper-raised);color:var(--ink);padding:7px 11px;border-radius:999px;font:700 11px var(--font-body);cursor:pointer;box-shadow:var(--shadow-xs)}
      .plans-entry:hover{border-color:var(--copper);color:var(--copper)}
      .plans-modal{position:fixed;inset:0;z-index:1100;background:rgba(0,0,0,.42);display:flex;align-items:center;justify-content:center;padding:18px}
      .plans-panel{width:min(560px,100%);max-height:90vh;overflow:auto;background:var(--paper);border:1px solid var(--line);box-shadow:var(--shadow-md);padding:22px}
      .plans-panel__head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:18px}
      .plans-panel__title{margin:0;font:800 24px var(--font-display);color:var(--ink)}
      .plans-panel__close{border:0;background:none;color:var(--muted);font-size:22px;cursor:pointer}
      .plans-current{padding:10px 12px;margin-bottom:14px;border-left:3px solid var(--accent);background:var(--paper-raised);font-size:13px}
      .plans-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .plan-option{border:1px solid var(--line);padding:13px;text-align:left;background:var(--paper-raised);display:flex;flex-direction:column}
      .plan-option.is-current{border-color:var(--copper);box-shadow:inset 0 0 0 1px var(--copper)}
      .plan-option__name{font:800 15px var(--font-display);color:var(--ink)}
      .plan-option__title{font-size:12px;font-weight:700;margin:4px 0 9px;color:var(--ink)}
      .plan-option ul{padding-left:16px;margin:0;color:var(--muted);font-size:11.5px;line-height:1.55;flex:1}
      .plan-option__price{margin:8px 0 0;font-family:var(--font-mono);font-size:11px;color:var(--success);font-weight:700}
      .plan-option__badge{display:inline-block;margin-top:10px;font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--copper)}
      .plan-option__cta{margin-top:10px;width:100%;border:1.5px solid var(--ink);background:var(--ink);color:var(--accent);font:700 11.5px var(--font-body);padding:8px 10px;border-radius:var(--radius-sm);cursor:pointer;transition:filter .15s var(--ease)}
      .plan-option__cta:hover{filter:brightness(1.2)}
      .plan-option__cta:disabled{opacity:.6;cursor:wait}
      .plan-note{margin-top:15px;font-size:11px;color:var(--muted);line-height:1.45}
      @media(max-width:560px){.plans-grid{grid-template-columns:1fr}.plans-entry{right:10px;bottom:10px}}
    `;
    document.head.appendChild(style);
}

async function getPricing() {
    if (pricingCache) return pricingCache;
    try {
        pricingCache = await apiFetch('/payments/pricing');
    } catch (_) {
        pricingCache = null;
    }
    return pricingCache;
}

// Marca el checkbox "¿También ofreces servicios?" del formulario de
// registro y dispara el evento que ya escucha auth.js (initAuth) para
// revelar los campos de categoría/ubicación — así quien llega desde
// "quiero suscribirme a Premium" no tiene que descubrir por su cuenta
// que debe activar esa casilla.
function goToRegisterAsWorker() {
    showRegister();
    setTimeout(() => {
        const checkbox = document.getElementById('regEsTrabajador');
        if (checkbox && !checkbox.checked) {
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change'));
        }
    }, 30);
}

// Perfil ya autenticado pero sin perfil de trabajador activo: no hay
// forma de suscribirse a Premium sin antes tener ese perfil, así que se
// delega la navegación a app.js (que ya sabe cómo abrir/renderizar el
// formulario de activación) vía un evento en vez de duplicar esa lógica.
function goToWorkerActivation() {
    document.dispatchEvent(new CustomEvent('servicuba:open-worker-activation'));
}

async function subscribeToPremium(button) {
    button.disabled = true;
    const original = button.textContent;
    button.textContent = 'Enviando…';
    try {
        const payment = await apiFetch('/payments/subscribe', { method: 'POST' });
        notify(`Solicitud enviada (pago #${payment.id.slice(0, 8)}). ${payment.notas}`, 'info');
        document.querySelector('.plans-modal')?.remove();
    } catch (err) {
        notify(`Error: ${err.message}`, 'error');
        button.disabled = false;
        button.textContent = original;
    }
}

// Decide qué CTA (si corresponde) mostrar en cada tarjeta de plan según
// el estado real de la cuenta — nunca se deja al modal como un callejón
// sin salida para quien mira un plan que no tiene.
function ctaFor(key, current, pricing) {
    if (key === current || key === 'gratis') return null;

    const anonymous = !!entitlements?.anonymous;
    const esTrabajador = !!entitlements?.es_trabajador;

    if (anonymous) {
        return { action: 'register-worker', label: key === 'premium' ? 'Crear cuenta para suscribirme' : 'Crear cuenta para publicar' };
    }
    if (!esTrabajador) {
        return { action: 'activate-worker', label: 'Activa tu perfil primero' };
    }
    if (key === 'premium') {
        const precioTexto = pricing ? `Suscribirme — $${pricing.premium.precio}/${pricing.premium.dias}d` : 'Suscribirme ahora';
        return { action: 'subscribe', label: precioTexto };
    }
    // Ya es trabajador (plan BASE efectivo): no hay downgrade autoservicio
    // desde acá, así que BASE queda sin botón cuando el actual es PREMIUM.
    return null;
}

async function openPlans() {
    if (!entitlements) return;
    const current = entitlements.plan;
    const pricing = await getPricing();

    const modal = document.createElement('div');
    modal.className = 'plans-modal';
    modal.innerHTML = `
      <section class="plans-panel" role="dialog" aria-modal="true" aria-label="Planes de ServiCuba">
        <div class="plans-panel__head">
          <div><h2 class="plans-panel__title">Planes de ServiCuba</h2><p style="margin:5px 0 0;color:var(--muted);font-size:12px">Cada plan tiene un propósito distinto.</p></div>
          <button type="button" class="plans-panel__close" aria-label="Cerrar">×</button>
        </div>
        ${!entitlements.anonymous ? `<div class="plans-current"><strong>Tu plan: ${escapeHtml((PLAN_COPY[current]?.name || current).toUpperCase())}</strong>${entitlements.plan_expira ? ` · vence ${escapeHtml(new Date(entitlements.plan_expira).toLocaleDateString('es-CU'))}` : ''}</div>` : ''}
        <div class="plans-grid">
          ${Object.entries(PLAN_COPY).map(([key, plan]) => {
              const isCurrent = key === current && !entitlements.anonymous;
              const cta = ctaFor(key, entitlements.anonymous ? null : current, pricing);
              const priceLine = key === 'premium' && pricing ? `<p class="plan-option__price">$${pricing.premium.precio} ${pricing.moneda} / ${pricing.premium.dias} días</p>` : '';
              return `
                <article class="plan-option ${isCurrent ? 'is-current' : ''}">
                  <div class="plan-option__name">${escapeHtml(plan.name)}</div>
                  <div class="plan-option__title">${escapeHtml(plan.title)}</div>
                  <ul>${plan.items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
                  ${priceLine}
                  ${isCurrent ? '<span class="plan-option__badge">Tu plan actual</span>' : ''}
                  ${cta ? `<button type="button" class="plan-option__cta" data-plan-action="${cta.action}">${escapeHtml(cta.label)}</button>` : ''}
                </article>
              `;
          }).join('')}
        </div>
        <p class="plan-note">FREE está pensado para quien llega a ServiCuba a buscar y contratar. BASE es para profesionales que quieren publicar sus servicios. PREMIUM añade promoción, anuncios y mayor visibilidad.</p>
      </section>`;

    const close = () => modal.remove();
    modal.addEventListener('click', event => {
        if (event.target === modal || event.target.closest('.plans-panel__close')) { close(); return; }
        const ctaBtn = event.target.closest('[data-plan-action]');
        if (!ctaBtn) return;
        const action = ctaBtn.dataset.planAction;
        if (action === 'register-worker') { close(); goToRegisterAsWorker(); }
        else if (action === 'activate-worker') { close(); goToWorkerActivation(); }
        else if (action === 'subscribe') { subscribeToPremium(ctaBtn); }
    });
    document.body.appendChild(modal);
}

async function loadEntitlements() {
    try {
        entitlements = await apiFetch('/users/entitlements');
    } catch (_) {
        entitlements = null;
        return;
    }
    installStyles();
    let entry = document.getElementById('plansEntry');
    if (!entry) {
        entry = document.createElement('button');
        entry.id = 'plansEntry';
        entry.className = 'plans-entry';
        document.body.appendChild(entry);
    }
    const name = PLAN_COPY[entitlements.plan]?.name || entitlements.plan;
    entry.textContent = `Plan ${name.toUpperCase()} · Ver planes`;
    entry.onclick = openPlans;
}

export function initPlansUi() {
    loadEntitlements();
    // Si el usuario recién inició sesión, activó su perfil de trabajador o
    // se suscribió, el badge/plan mostrado puede haber quedado
    // desactualizado — se refresca en esos momentos sin que el usuario
    // tenga que recargar la página.
    document.addEventListener('auth:changed', loadEntitlements);
    document.addEventListener('servicuba:data-refreshed', loadEntitlements);
}
