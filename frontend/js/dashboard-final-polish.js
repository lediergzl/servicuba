const STYLE_ID = 'servicuba-dashboard-final-polish';

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .dashboard-live { isolation:isolate; }
        .dashboard-live__kpi { transform:translateZ(0); }
        .dashboard-live__kpi[data-state="positive"] { border-color:color-mix(in srgb, var(--accent,#F2B705) 42%, var(--line,#DEE3DF)); }
        .dashboard-live__kpi[data-state="attention"] { border-color:color-mix(in srgb, #d99a2b 48%, var(--line,#DEE3DF)); }
        .dashboard-live__kpi strong { transition:transform .22s ease, opacity .22s ease; }
        .dashboard-live__kpi.is-changing strong { transform:scale(1.06); }
        .dashboard-live__activity { position:relative; }
        .dashboard-live__activity::before { content:'Actividad reciente'; display:block; padding:12px 14px 9px; font-size:.74rem; font-weight:800; letter-spacing:.05em; text-transform:uppercase; color:var(--muted,#64726D); border-bottom:1px solid var(--line,#DEE3DF); }
        .dashboard-live__activity-item { position:relative; }
        .dashboard-live__activity-icon { flex-shrink:0; }
        .dashboard-live__last-sync { display:flex; align-items:center; justify-content:flex-end; gap:6px; margin-top:8px; font-size:.68rem; color:var(--muted,#64726D); }
        .dashboard-live__last-sync-dot { width:6px; height:6px; border-radius:50%; background:#20b26b; box-shadow:0 0 0 3px rgba(32,178,107,.12); }
        .dashboard-live__empty-action { margin-top:10px; }
        .dashboard-live__context { transition:background .2s ease, border-color .2s ease; }
        @media (prefers-reduced-motion: reduce) { .dashboard-live__kpi strong, .dashboard-live__kpi, .dashboard-live__activity-item { transition:none!important; animation:none!important; } }
    `;
    document.head.appendChild(style);
}

function getShells() {
    return [...document.querySelectorAll('#dashboardCliente .dashboard-live, #dashboardTrabajador .dashboard-live')];
}

function updateKpiStates() {
    getShells().forEach(shell => {
        shell.querySelectorAll('.dashboard-live__kpi').forEach(card => {
            const value = Number(card.querySelector('strong')?.textContent || 0);
            const label = (card.querySelector('span')?.textContent || '').toLowerCase();
            card.dataset.state = value > 0 && /(pend|espera|postul|solic|mensaje)/.test(label) ? 'attention' : value > 0 ? 'positive' : 'neutral';
        });
    });
}

function addSyncCue() {
    getShells().forEach(shell => {
        let cue = shell.querySelector('.dashboard-live__last-sync');
        if (!cue) {
            cue = document.createElement('div');
            cue.className = 'dashboard-live__last-sync';
            shell.appendChild(cue);
        }
        cue.innerHTML = '<span class="dashboard-live__last-sync-dot"></span><span>Datos en tiempo real</span>';
    });
}

function refresh() {
    injectStyles();
    updateKpiStates();
    addSyncCue();
}

export function initDashboardFinalPolish() {
    refresh();
    document.addEventListener('servicuba:data-refreshed', () => {
        refresh();
        getShells().forEach(shell => {
            shell.querySelectorAll('.dashboard-live__kpi').forEach(card => {
                card.classList.add('is-changing');
                window.setTimeout(() => card.classList.remove('is-changing'), 260);
            });
        });
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDashboardFinalPolish, { once:true });
else initDashboardFinalPolish();