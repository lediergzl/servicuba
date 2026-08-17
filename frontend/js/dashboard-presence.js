import { getLocationWithFallback, getSavedLocation } from './location.js';
import { enablePushNotifications } from './push.js';
import { notify } from './core.js';

const STYLE_ID = 'servicuba-dashboard-presence';
let initialized = false;

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .dashboard-presence { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.7rem; margin:0 0 1rem; }
        .dashboard-presence__item { display:flex; align-items:center; justify-content:space-between; gap:.75rem; padding:.8rem .9rem; border:1px solid rgba(127,127,127,.14); border-radius:14px; background:rgba(127,127,127,.045); }
        .dashboard-presence__main { min-width:0; display:flex; align-items:center; gap:.65rem; }
        .dashboard-presence__dot { width:9px; height:9px; flex:0 0 9px; border-radius:50%; background:#8b8f98; box-shadow:0 0 0 4px rgba(139,143,152,.12); }
        .dashboard-presence__dot.is-live { background:#20b26b; box-shadow:0 0 0 4px rgba(32,178,107,.12); }
        .dashboard-presence__dot.is-warn { background:#d99a2b; box-shadow:0 0 0 4px rgba(217,154,43,.12); }
        .dashboard-presence__copy { min-width:0; display:flex; flex-direction:column; }
        .dashboard-presence__copy strong { font-size:.84rem; }
        .dashboard-presence__copy span { font-size:.74rem; opacity:.68; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .dashboard-presence__button { border:0; background:transparent; cursor:pointer; font:inherit; font-size:.74rem; font-weight:600; opacity:.82; }
        .dashboard-presence__button:hover { opacity:1; }
        @media (max-width:640px) { .dashboard-presence { grid-template-columns:1fr; } }
    `;
    document.head.appendChild(style);
}

function getShells() {
    return [
        document.querySelector('#dashboardCliente .dashboard-live'),
        document.querySelector('#dashboardTrabajador .dashboard-live')
    ].filter(Boolean);
}

function notificationState() {
    if (!('Notification' in window) || !('PushManager' in window)) return { live:false, label:'No compatible', action:null };
    if (Notification.permission === 'granted') return { live:true, label:'Activas en este dispositivo', action:'push' };
    if (Notification.permission === 'denied') return { live:false, label:'Bloqueadas por el navegador', action:null };
    return { live:false, label:'Activa avisos de nuevas solicitudes', action:'push' };
}

function locationState() {
    const location = getSavedLocation();
    if (!location) return { live:false, label:'Ubicación no disponible', action:'location' };
    const accuracy = location.accuracy ? `±${Math.round(location.accuracy)} m` : 'posición guardada';
    const source = location.source === 'gps' ? 'GPS' : 'ubicación guardada';
    return { live:true, label:`${source} · ${accuracy}`, action:'location' };
}

function renderPresence(shell) {
    let panel = shell.querySelector('.dashboard-presence');
    if (!panel) {
        panel = document.createElement('section');
        panel.className = 'dashboard-presence';
        panel.setAttribute('aria-label', 'Estado en tiempo real');
        shell.prepend(panel);
    }

    const loc = locationState();
    const push = notificationState();
    panel.innerHTML = `
        <div class="dashboard-presence__item">
            <div class="dashboard-presence__main">
                <span class="dashboard-presence__dot ${loc.live ? 'is-live' : 'is-warn'}"></span>
                <span class="dashboard-presence__copy"><strong>Tu ubicación</strong><span>${loc.label}</span></span>
            </div>
            ${loc.action ? '<button class="dashboard-presence__button" type="button" data-presence-action="location">Actualizar</button>' : ''}
        </div>
        <div class="dashboard-presence__item">
            <div class="dashboard-presence__main">
                <span class="dashboard-presence__dot ${push.live ? 'is-live' : ''}"></span>
                <span class="dashboard-presence__copy"><strong>Notificaciones</strong><span>${push.label}</span></span>
            </div>
            ${push.action ? '<button class="dashboard-presence__button" type="button" data-presence-action="push">${push.live ? 'Revisar' : 'Activar'}</button>' : ''}
        </div>
    `;
}

async function refreshLocation() {
    const location = await getLocationWithFallback();
    if (!location) {
        notify('No pudimos actualizar tu ubicación. Puedes intentarlo de nuevo.', 'info');
        return;
    }
    renderAll();
    document.dispatchEvent(new CustomEvent('servicuba:location-updated', { detail: location }));
    notify('Ubicación actualizada.', 'success');
}

async function refreshPush() {
    if (Notification.permission === 'granted') {
        notify('Las notificaciones ya están activas en este dispositivo.', 'info');
        return;
    }
    const enabled = await enablePushNotifications();
    if (enabled) renderAll();
}

function renderAll() {
    injectStyles();
    getShells().forEach(renderPresence);
}

function onClick(event) {
    const button = event.target.closest('[data-presence-action]');
    if (!button) return;
    const action = button.dataset.presenceAction;
    button.disabled = true;
    Promise.resolve(action === 'location' ? refreshLocation() : refreshPush()).finally(() => { button.disabled = false; });
}

export function initDashboardPresence() {
    if (initialized) return;
    initialized = true;
    document.addEventListener('click', onClick);
    document.addEventListener('servicuba:data-refreshed', renderAll);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) renderAll(); });
    renderAll();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDashboardPresence, { once:true });
else initDashboardPresence();