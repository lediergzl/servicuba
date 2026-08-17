import { loadConversations } from './chat.js';

let timer = null;
let inFlight = false;
let started = false;

function dashboardVisible() {
    return Boolean(
        document.getElementById('dashboardCliente')?.classList.contains('hidden') === false ||
        document.getElementById('dashboardTrabajador')?.classList.contains('hidden') === false
    );
}

async function refreshMessagingState() {
    if (inFlight || !dashboardVisible() || !localStorage.getItem('token')) return;
    inFlight = true;
    try {
        await loadConversations();
        document.dispatchEvent(new CustomEvent('servicuba:messaging-refreshed', {
            detail: { at: Date.now() }
        }));
    } catch (_) {
        // Messaging is auxiliary to the dashboard; do not break workspace refresh.
    } finally {
        inFlight = false;
    }
}

function start() {
    if (timer !== null) clearInterval(timer);
    timer = window.setInterval(refreshMessagingState, 10000);
    refreshMessagingState();
}

function stop() {
    if (timer !== null) {
        clearInterval(timer);
        timer = null;
    }
}

export function initDashboardMessagingSync() {
    if (started) return;
    started = true;

    document.addEventListener('servicuba:data-refreshed', refreshMessagingState);
    document.addEventListener('chat:closed', refreshMessagingState);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stop();
        else start();
    });

    if (!document.hidden) start();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboardMessagingSync, { once: true });
} else {
    initDashboardMessagingSync();
}
