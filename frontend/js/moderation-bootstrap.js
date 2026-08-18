import { initModerationUi } from './moderation-ui.js';

function installModerationStyles() {
    if (document.getElementById('moderationUiStyles')) return;
    const style = document.createElement('style');
    style.id = 'moderationUiStyles';
    style.textContent = `
        .task-card__secondary-actions { margin-top: 8px; display:flex; justify-content:flex-end; }
        .report-task-btn { border:0; background:none; padding:4px 0; color:var(--muted); font:600 11px var(--font-body); cursor:pointer; }
        .report-task-btn:hover { color:var(--brick); text-decoration:underline; }
        .moderation-report__details { margin:8px 0; padding:8px 10px; border-left:2px solid var(--copper); background:var(--paper-raised); font-size:12px; line-height:1.4; }
    `;
    document.head.appendChild(style);
}

function boot() {
    installModerationStyles();
    initModerationUi();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
