import './landing-experience.js';

const STYLE_ID = 'servicuba-dashboard-visual-polish';

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .dashboard-live { position: relative; }
        .dashboard-live__kpis { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin:12px 0 16px; }
        .dashboard-live__kpi { position:relative; overflow:hidden; min-height:92px; padding:14px; border:1px solid var(--line,#DEE3DF); border-radius:14px; background:var(--paper-raised,#fff); box-shadow:var(--shadow-card,0 6px 16px rgba(18,40,38,.08)); transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease; }
        .dashboard-live__kpi:hover { transform:translateY(-2px); box-shadow:var(--shadow-card-hover,0 14px 28px rgba(18,40,38,.12)); }
        .dashboard-live__kpi::after { content:''; position:absolute; width:54px; height:54px; right:-18px; bottom:-22px; border-radius:50%; background:var(--accent,#F2B705); opacity:.12; }
        .dashboard-live__kpi span { display:block; font-size:.75rem; font-weight:700; color:var(--muted,#64726D); text-transform:uppercase; letter-spacing:.04em; }
        .dashboard-live__kpi strong { display:block; margin-top:4px; font-family:var(--font-display,sans-serif); font-size:2rem; line-height:1; color:var(--ink,#12302E); }
        .dashboard-live__kpi small { display:block; margin-top:7px; font-size:.72rem; color:var(--muted,#64726D); }
        .dashboard-live__activity { border:1px solid var(--line,#DEE3DF); border-radius:14px; overflow:hidden; background:var(--paper-raised,#fff); box-shadow:var(--shadow-xs,0 1px 2px rgba(18,40,38,.06)); }
        .dashboard-live__activity-item { display:flex; align-items:flex-start; gap:10px; padding:12px 14px; border-bottom:1px solid var(--line,#DEE3DF); animation:servicuba-dashboard-in .24s ease both; }
        .dashboard-live__activity-item:last-child { border-bottom:0; }
        .dashboard-live__activity-item > div:last-child { min-width:0; display:flex; flex-direction:column; gap:2px; }
        .dashboard-live__activity-item strong { font-size:.82rem; }
        .dashboard-live__activity-item span { font-size:.74rem; color:var(--muted,#64726D); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .dashboard-live__activity-icon { width:26px; height:26px; flex:0 0 26px; display:grid; place-items:center; border-radius:50%; background:var(--accent-soft,#FCE8A6); color:var(--accent-ink,#12302E); font-size:.65rem; }
        .dashboard-live__activity-icon--muted { background:var(--paper,#EEF1EF); color:var(--muted,#64726D); }
        .dashboard-live__context { padding:13px 14px; margin-bottom:12px; border-left:3px solid var(--accent,#F2B705); border-radius:0 10px 10px 0; background:rgba(242,183,5,.08); color:var(--ink,#12302E); font-size:.84rem; }
        .dashboard-live__refresh.is-loading { pointer-events:none; opacity:.7; }
        .dashboard-live__refresh.is-loading::after { content:''; width:12px; height:12px; border:2px solid currentColor; border-right-color:transparent; border-radius:50%; animation:servicuba-dashboard-spin .7s linear infinite; }
        @keyframes servicuba-dashboard-spin { to { transform:rotate(360deg); } }
        @keyframes servicuba-dashboard-in { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }
        @media (max-width:360px) { .dashboard-live__kpis { grid-template-columns:1fr; } }
    `;
    document.head.appendChild(style);
}

function refresh() { injectStyles(); }

export function initDashboardVisualPolish() {
    refresh();
    document.addEventListener('servicuba:data-refreshed', refresh);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDashboardVisualPolish, { once:true });
else initDashboardVisualPolish();