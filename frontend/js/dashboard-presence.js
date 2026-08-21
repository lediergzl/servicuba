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
        /* Si sólo queda un pendiente (el otro ya está resuelto), que ocupe
           todo el ancho en vez de dejar una columna vacía a su lado. */
        .dashboard-presence:has(> :only-child) { grid-template-columns:1fr; }
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
        .dashboard-presence__button:disabled { opacity:.45; cursor:wait; }
        @media (max-width:640px) { .dashboard-presence { grid-template-columns:1fr; } }
        /* dashboard-presence.js hace shell.prepend(panel) dentro de
           .dashboard-live, que ahora es una tarjeta oscura — sin esto el
           texto quedaba oscuro sobre fondo oscuro, ilegible. */
        .dashboard-live .dashboard-presence { margin:0 0 14px; }
        .dashboard-live .dashboard-presence__item { border-color:rgba(255,255,255,.16); background:rgba(255,255,255,.06); }
        .dashboard-live .dashboard-presence__copy strong { color:#fff; }
        .dashboard-live .dashboard-presence__copy span { color:rgba(255,255,255,.6); opacity:1; }
        .dashboard-live .dashboard-presence__button { color:var(--accent,#F2B705); opacity:1; }
        .dashboard-live .dashboard-presence__button:hover { color:#fff; }
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
    if (!('Notification' in window) || !('PushManager' in window)) return { live:false, label:'No compatible', action:null, actionLabel:'' };
    if (Notification.permission === 'granted') return { live:true, label:'Activas en este dispositivo', action:'push', actionLabel:'Revisar' };
    if (Notification.permission === 'denied') return { live:false, label:'Bloqueadas por el navegador', action:null, actionLabel:'' };
    return { live:false, label:'Activa avisos de nuevas solicitudes', action:'push', actionLabel:'Activar' };
}

function locationState() {
    const location = getSavedLocation();
    if (!location) return { live:false, label:'Ubicación no disponible', action:'location', actionLabel:'Activar' };
    const accuracy = location.accuracy ? `±${Math.round(location.accuracy)} m` : 'posición guardada';
    const source = location.source === 'gps' ? 'GPS' : 'ubicación guardada';
    return { live:true, label:`${source} · ${accuracy}`, action:'location', actionLabel:'Actualizar' };
}

// Antes este panel se mostraba SIEMPRE, incluso con ubicación y
// notificaciones ya activas — un usuario con la cuenta perfectamente
// configurada seguía viendo dos casillas "todo bien" ocupando espacio
// arriba de lo que realmente importa (sus tareas). Ahora sólo aparece
// cuando hay algo pendiente por resolver; si todo está en orden, se
// oculta por completo.
function renderPresence(shell) {
    const loc = { key: 'location', title: 'Tu ubicación', ...locationState() };
    const push = { key: 'push', title: 'Notificaciones', ...notificationState() };
    const pending = [loc, push].filter(item => !item.live && item.action);

    let panel = shell.querySelector('.dashboard-presence');
    if (!pending.length) {
        panel?.remove();
        return;
    }
    if (!panel) {
        panel = document.createElement('section');
        panel.className = 'dashboard-presence';
        panel.setAttribute('aria-label', 'Pendientes de tu cuenta');
        shell.prepend(panel);
    }

    panel.innerHTML = pending.map(item => `
        <div class="dashboard-presence__item">
            <div class="dashboard-presence__main">
                <span class="dashboard-presence__dot is-warn"></span>
                <span class="dashboard-presence__copy"><strong>${item.title}</strong><span>${item.label}</span></span>
            </div>
            <button class="dashboard-presence__button" type="button" data-presence-action="${item.action}">${item.actionLabel}</button>
        </div>
    `).join('');
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
