import './landing-experience.js';

const STYLE_ID = 'servicuba-dashboard-visual-polish';

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        /* Tarjeta contenedora — antes esta clase sólo era 'position:relative'
           porque el shell nunca se montaba en el HTML; ahora es la tarjeta
           de marca real que agrupa saludo, estado y actividad. */
        .dashboard-live { position:relative; margin-bottom:18px; padding:18px; border-radius:20px; background:linear-gradient(155deg, var(--ink,#12302E), var(--ink-soft,#1F4542)); box-shadow:0 10px 28px rgba(18,40,38,.28); overflow:hidden; }
        .dashboard-live::after { content:''; position:absolute; width:180px; height:180px; right:-70px; top:-90px; border-radius:50%; background:var(--accent,#F2B705); opacity:.08; pointer-events:none; }

        .dashboard-live__hero { position:relative; display:flex; align-items:flex-start; justify-content:space-between; gap:14px; }
        .dashboard-live__eyebrow { display:inline-flex; align-items:center; gap:7px; font:800 10.5px var(--font-body,sans-serif); letter-spacing:.09em; text-transform:uppercase; color:var(--accent,#F2B705); }
        .dashboard-live__pulse { width:7px; height:7px; border-radius:50%; background:var(--success,#2E7D5B); box-shadow:0 0 0 3px rgba(46,125,91,.35); animation:servicuba-dashboard-pulse 1.8s ease-in-out infinite; }
        @keyframes servicuba-dashboard-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .dashboard-live__greeting { margin:7px 0 4px; font-family:var(--font-display,sans-serif); font-weight:800; font-size:1.55rem; line-height:1.05; color:#fff; }
        .dashboard-live__hero .dashboard-live__context { padding:0; margin:0; border-left:0; background:none; color:rgba(255,255,255,.72); font-size:.82rem; line-height:1.4; }
        .dashboard-live__refresh { flex:0 0 auto; width:38px; height:38px; display:grid; place-items:center; border:1px solid rgba(255,255,255,.18); border-radius:50%; background:rgba(255,255,255,.08); color:var(--accent,#F2B705); font-size:17px; cursor:pointer; transition:transform .3s ease, background .15s ease; }
        .dashboard-live__refresh:hover { background:rgba(255,255,255,.16); transform:rotate(50deg); }
        .dashboard-live__refresh.is-loading { pointer-events:none; opacity:.85; animation:servicuba-dashboard-spin .7s linear infinite; }
        .dashboard-live__refresh.is-loading::after { content:none; }

        .dashboard-live__meta { position:relative; display:flex; margin-top:16px; padding-top:14px; border-top:1px solid rgba(255,255,255,.14); }
        .dashboard-live__meta-item { flex:1; display:flex; flex-direction:column; gap:3px; }
        .dashboard-live__meta-item + .dashboard-live__meta-item { padding-left:14px; border-left:1px solid rgba(255,255,255,.14); }
        .dashboard-live__meta-label { font-size:10.5px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:rgba(255,255,255,.55); }
        .dashboard-live__meta-item strong { font-family:var(--font-mono,monospace); font-weight:700; font-size:1.05rem; color:#fff; }
        .dashboard-live__meta-status { color:#7FE3AE !important; }
        .dashboard-live__meta-hint { font-size:.7rem; color:rgba(255,255,255,.5); }

        /* KPIs y actividad reciente, en modo 'glass' sobre el fondo oscuro
           en vez del estilo de tarjeta clara pensado originalmente para
           vivir sueltos sobre el papel de la página. */
        .dashboard-live__kpis { position:relative; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin:14px 0 0; }
        .dashboard-live__kpi { position:relative; overflow:hidden; min-height:84px; padding:12px 14px; border:1px solid rgba(255,255,255,.14); border-radius:14px; background:rgba(255,255,255,.07); box-shadow:none; transition:transform .18s ease, background .18s ease; }
        .dashboard-live__kpi:hover { transform:translateY(-2px); background:rgba(255,255,255,.11); }
        .dashboard-live__kpi::after { background:var(--accent,#F2B705); opacity:.1; }
        .dashboard-live__kpi span { color:rgba(255,255,255,.6); }
        .dashboard-live__kpi strong { color:#fff; font-size:1.7rem; }
        .dashboard-live__kpi small { color:rgba(255,255,255,.55); }
        .dashboard-live__kpi[data-state="attention"] { border-color:rgba(242,183,5,.55); }
        .dashboard-live__kpi[data-state="positive"] { border-color:rgba(127,227,174,.5); }

        .dashboard-live__activity { margin-top:10px; border:1px solid rgba(255,255,255,.14); border-radius:14px; overflow:hidden; background:rgba(255,255,255,.06); box-shadow:none; }
        .dashboard-live__activity-item { display:flex; align-items:flex-start; gap:10px; padding:12px 14px; border-bottom:1px solid rgba(255,255,255,.1); animation:servicuba-dashboard-in .24s ease both; }
        .dashboard-live__activity-item:last-child { border-bottom:0; }
        .dashboard-live__activity-item > div:last-child { min-width:0; display:flex; flex-direction:column; gap:2px; }
        .dashboard-live__activity-item strong { font-size:.82rem; color:#fff; }
        .dashboard-live__activity-item span { font-size:.74rem; color:rgba(255,255,255,.62); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .dashboard-live__activity-icon { width:26px; height:26px; flex:0 0 26px; display:grid; place-items:center; border-radius:50%; background:rgba(242,183,5,.22); color:var(--accent,#F2B705); font-size:.65rem; }
        .dashboard-live__activity-icon--muted { background:rgba(255,255,255,.1); color:rgba(255,255,255,.55); }
        .dashboard-live__last-sync { color:rgba(255,255,255,.55) !important; }
        .dashboard-live__last-sync-dot { box-shadow:0 0 0 3px rgba(32,178,107,.25) !important; }

        @keyframes servicuba-dashboard-spin { to { transform:rotate(360deg); } }
        @keyframes servicuba-dashboard-in { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }
        @media (max-width:360px) { .dashboard-live__kpis { grid-template-columns:1fr; } .dashboard-live__greeting { font-size:1.3rem; } }
        @media (prefers-reduced-motion: reduce) { .dashboard-live__pulse, .dashboard-live__refresh.is-loading { animation:none; } }
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