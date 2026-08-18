import { apiFetch, escapeHtml, notify } from './core.js';

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
      .plan-option{border:1px solid var(--line);padding:13px;text-align:left;background:var(--paper-raised)}
      .plan-option.is-current{border-color:var(--copper);box-shadow:inset 0 0 0 1px var(--copper)}
      .plan-option__name{font:800 15px var(--font-display);color:var(--ink)}
      .plan-option__title{font-size:12px;font-weight:700;margin:4px 0 9px;color:var(--ink)}
      .plan-option ul{padding-left:16px;margin:0;color:var(--muted);font-size:11.5px;line-height:1.55}
      .plan-note{margin-top:15px;font-size:11px;color:var(--muted);line-height:1.45}
      @media(max-width:560px){.plans-grid{grid-template-columns:1fr}.plans-entry{right:10px;bottom:10px}}
    `;
    document.head.appendChild(style);
}

function openPlans() {
    if (!entitlements) return;
    const current = entitlements.plan;
    const modal = document.createElement('div');
    modal.className = 'plans-modal';
    modal.innerHTML = `
      <section class="plans-panel" role="dialog" aria-modal="true" aria-label="Planes de ServiCuba">
        <div class="plans-panel__head">
          <div><h2 class="plans-panel__title">Planes de ServiCuba</h2><p style="margin:5px 0 0;color:var(--muted);font-size:12px">Cada plan tiene un propósito distinto.</p></div>
          <button type="button" class="plans-panel__close" aria-label="Cerrar">×</button>
        </div>
        <div class="plans-current"><strong>Tu plan: ${escapeHtml((PLAN_COPY[current]?.name || current).toUpperCase())}</strong>${entitlements.plan_expira ? ` · vence ${escapeHtml(new Date(entitlements.plan_expira).toLocaleDateString('es-CU'))}` : ''}</div>
        <div class="plans-grid">
          ${Object.entries(PLAN_COPY).map(([key, plan]) => `
            <article class="plan-option ${key === current ? 'is-current' : ''}">
              <div class="plan-option__name">${escapeHtml(plan.name)}</div>
              <div class="plan-option__title">${escapeHtml(plan.title)}</div>
              <ul>${plan.items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
            </article>
          `).join('')}
        </div>
        <p class="plan-note">FREE está pensado para quien llega a ServiCuba a buscar y contratar. BASE es para profesionales que quieren publicar sus servicios. PREMIUM añade promoción, anuncios y mayor visibilidad.</p>
      </section>`;
    const close = () => modal.remove();
    modal.addEventListener('click', event => { if (event.target === modal || event.target.closest('.plans-panel__close')) close(); });
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
}
