import { apiFetch } from './core.js';
import { initAuth, showLanding, showRegister, showLogin, logout } from './auth.js';
import { initTasks, loadCategories, showDashboardCliente, showDashboardTrabajador, switchView } from './tasks.js';
import { initMap } from './map.js';
import { initChat, loadConversations, setCurrentUserId } from './chat.js';
import { initPush, enablePushNotifications } from './push.js';
import { initVerification, refreshVerificationBanner } from './verification.js';
import { renderPremiumSection, initSponsorAdEntry, loadAdBanner } from './monetization.js';
import { checkAndShowAdminEntry, initAdminPanel, loadPendingPayments } from './admin.js';

let currentRole = null;

async function bootstrap() {
    const token = localStorage.getItem('token');
    document.getElementById('user-menu-guest')?.classList.toggle('hidden', !!token);
    document.getElementById('user-menu-auth')?.classList.toggle('hidden', !token);
    document.getElementById('bottomNav')?.classList.toggle('hidden', !token);

    if (token) {
        try {
            const user = await apiFetch('/users/profile');
            currentRole = user.rol;
            setCurrentUserId(user.id);
            if (user.rol === 'cliente') {
                showDashboardCliente();
            } else {
                showDashboardTrabajador();
                loadAdBanner('adBannerTrabajador');
            }
            refreshVerificationBanner();
            initPush();
            checkAndShowAdminEntry();
            // Se carga acá (además de al entrar a la pestaña "Mensajes")
            // para que el badge de no-leídos del bottom nav ya esté
            // correcto desde que abres la app — antes sólo se calculaba
            // al visitar Mensajes manualmente, así que un chat nuevo era
            // invisible ("ninguna burbuja") hasta que uno entraba ahí por
            // curiosidad. Escribe en el contenedor de Mensajes aunque
            // esté oculto — es inofensivo y queda ya listo cuando el
            // usuario abra esa pestaña.
            loadConversations();
        } catch {
            showLanding();
        }
    } else {
        showLanding();
    }
}

function initBottomNav() {
    document.querySelectorAll('.bottom-nav__item').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            if (view === 'dashboardCliente' || view === 'dashboardTrabajador') {
                if (currentRole === 'cliente') showDashboardCliente();
                else showDashboardTrabajador();
            } else if (view === 'mensajes') {
                switchView('mensajesView');
                document.querySelectorAll('.bottom-nav__item').forEach(el => el.classList.toggle('is-active', el === btn));
                loadConversations();
            } else if (view === 'perfil') {
                switchView('perfilView');
                document.querySelectorAll('.bottom-nav__item').forEach(el => el.classList.toggle('is-active', el === btn));
                loadProfile();
                renderPremiumSection();
            }
        });
    });

    document.getElementById('adminPanelBtn')?.addEventListener('click', () => {
        switchView('adminView');
        loadPendingPayments();
    });

    document.getElementById('adminBackBtn')?.addEventListener('click', () => {
        switchView('perfilView');
        document.querySelectorAll('.bottom-nav__item').forEach(el => el.classList.toggle('is-active', el.dataset.view === 'perfil'));
    });

    document.addEventListener('chat:closed', () => {
        switchView('mensajesView');
        loadConversations();
    });
}

const STAR_ICON = '<svg class="icon" viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.3 6.9.7-5.2 4.7 1.5 6.8L12 17.6l-6.1 3.4 1.5-6.8L2.2 9.5l6.9-.7Z"/></svg>';

function renderStarRating(rating) {
    const rounded = Math.round(rating || 0);
    return `<span class="star-rating">${
        Array.from({ length: 5 }, (_, i) =>
            STAR_ICON.replace('class="icon"', `class="icon${i < rounded ? ' icon--filled' : ''}"`)
        ).join('')
    }</span>`;
}

async function loadProfile() {
    const el = document.getElementById('perfilContenido');
    if (!el) return;
    el.innerHTML = '<p class="empty-state">Cargando…</p>';
    try {
        const user = await apiFetch('/users/profile');
        const esTrabajador = user.rol === 'trabajador';

        // Antes el perfil se veía IDÉNTICO para cliente y trabajador
        // (mismo nombre/rol/rating/teléfono, sin ningún dato propio del
        // rol). Se agregan datos específicos: para el trabajador, su
        // oficio/categoría; para el cliente, un resumen de sus tareas
        // publicadas — así ambos perfiles se distinguen a simple vista.
        let roleDetail = '';
        if (esTrabajador && user.categoria_nombre) {
            roleDetail = `<p class="profile-card__meta">${user.categoria_icono ? user.categoria_icono + ' ' : ''}${user.categoria_nombre}</p>`;
        }

        el.innerHTML = `
            <div class="profile-card">
                <div class="profile-card__avatar">${user.nombre.charAt(0).toUpperCase()}</div>
                <h2 class="profile-card__name">${user.nombre} ${user.verificado ? '<span class="verified-stamp" title="Cuenta verificada">✓ VERIFICADO</span>' : ''}</h2>
                <p class="profile-card__meta">${user.rol === 'cliente' ? 'Cliente' : 'Trabajador'}</p>
                ${roleDetail}
                <p class="profile-card__meta">${renderStarRating(user.rating)} <span class="mono">${(user.rating ?? 0).toFixed(1)}</span></p>
                <p class="profile-card__meta mono">${user.telefono}</p>
            </div>
        `;
    } catch (err) {
        el.innerHTML = `<p class="empty-state">Error: ${err.message}</p>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    }

    loadCategories();
    initAuth();
    initTasks();
    initMap();
    initChat();
    initVerification();
    initBottomNav();
    initSponsorAdEntry();
    initAdminPanel();

    document.getElementById('loginBtn')?.addEventListener('click', showLogin);
    document.getElementById('loginBtn2')?.addEventListener('click', showLogin);
    document.getElementById('registerBtn')?.addEventListener('click', showRegister);
    document.getElementById('logoutBtn')?.addEventListener('click', logout);
    document.getElementById('enablePushBtn')?.addEventListener('click', enablePushNotifications);

    document.addEventListener('auth:expired', () => {
        document.getElementById('bottomNav')?.classList.add('hidden');
        showLanding();
    });

    bootstrap();
});
