import './dashboard-visual-polish.js';
import './landing-public-experience.js';

const STYLE_ID = 'servicuba-dashboard-card-ux';

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .task-card--live { position: relative; transition: transform .18s ease, box-shadow .18s ease, opacity .18s ease; }
        .task-card--live:hover { transform: translateY(-2px); }
        .task-card--live::after { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; opacity: 0; transition: opacity .18s ease; box-shadow: 0 0 0 1px currentColor; }
        .task-card--updated::after { opacity: .16; }
        .task-card__live-row { display:flex; align-items:center; justify-content:space-between; gap:.5rem; margin-top:.5rem; font-size:.78rem; opacity:.72; }
        .task-card__live-dot { display:inline-flex; align-items:center; gap:.35rem; }
        .task-card__live-dot::before { content:''; width:7px; height:7px; border-radius:50%; background:currentColor; box-shadow:0 0 0 4px color-mix(in srgb, currentColor 12%, transparent); }
        .task-card__action-loading { opacity:.7; pointer-events:none; }
        .task-card__action-loading::after { content:' '; display:inline-block; width:12px; height:12px; margin-left:6px; border:2px solid currentColor; border-right-color:transparent; border-radius:50%; animation:servicuba-spin .7s linear infinite; vertical-align:-2px; }
        @keyframes servicuba-spin { to { transform:rotate(360deg); } }
        .skeleton-card { min-height:92px; overflow:hidden; }
        .skeleton-card .skeleton-line { height:12px; margin:10px 0; border-radius:8px; background:linear-gradient(90deg, rgba(127,127,127,.10), rgba(127,127,127,.22), rgba(127,127,127,.10)); background-size:200% 100%; animation:servicuba-shimmer 1.2s infinite; }
        @keyframes servicuba-shimmer { to { background-position:-200% 0; } }
    `;
    document.head.appendChild(style);
}

function decorateContainer(container) {
    if (!container) return;
    container.querySelectorAll('.task-card').forEach((card) => {
        card.classList.add('task-card--live');
        if (!card.querySelector('.task-card__live-row')) {
            const meta = card.querySelector('.task-card__meta');
            const row = document.createElement('div');
            row.className = 'task-card__live-row';
            row.innerHTML = '<span class="task-card__live-dot">Disponible en tiempo real</span><span>Actualizado ahora</span>';
            meta?.after(row) || card.appendChild(row);
        }
    });
}

function wireActionFeedback(container) {
    if (!container || container.dataset.uxFeedbackAttached) return;
    container.dataset.uxFeedbackAttached = 'true';
    container.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-id]');
        if (!button || button.disabled) return;
        button.classList.add('task-card__action-loading');
        button.dataset.originalText = button.textContent.trim();
        button.textContent = 'Procesando';
        const card = button.closest('.task-card');
        card?.classList.add('task-card--updated');
        window.setTimeout(() => card?.classList.remove('task-card--updated'), 900);
    });
}

export function enhanceDashboardCards() {
    injectStyles();
    ['listaTareas', 'listaOfertasCercanas'].forEach(id => {
        const container = document.getElementById(id);
        decorateContainer(container);
        wireActionFeedback(container);
    });
}

export function initDashboardCardUx() {
    enhanceDashboardCards();
    const root = document.getElementById('views') || document.body;
    const observer = new MutationObserver(() => enhanceDashboardCards());
    observer.observe(root, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDashboardCardUx, { once: true });
else initDashboardCardUx();