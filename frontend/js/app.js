import { apiFetch, notify, showFormModal, getGeolocation } from './core.js';
import { initAuth, showLanding, showRegister, showLogin, logout } from './auth.js';
import { initTasks, loadCategories, showDashboardCliente, showDashboardTrabajador, switchView } from './tasks.js';
import { initMap } from './map.js';
import { initChat, loadConversations, setCurrentUserId } from './chat.js';
import { initPush, enablePushNotifications } from './push.js';
import { initVerification, refreshVerificationBanner } from './verification.js';
import { renderPremiumSection, initSponsorAdEntry, loadAdBanner } from './monetization.js';
import { checkAndShowAdminEntry, initAdminPanel, loadPendingPayments } from './admin.js';
import { initLandingSearch } from './landing.js';

// Dualidad de roles: reemplaza a la antigua variable `currentRole` (que
// asumía un rol fijo). currentModo es cuál panel se está mostrando
// ahora mismo; isCliente/isTrabajador reflejan qué perfiles tiene
// ACTIVOS el usuario (pueden ser ambos true a la vez).
let currentModo = 'cliente';
let isCliente = true;
let isTrabajador = false;

async function bootstrap() {
    const token = localStorage.getItem('token');
    document.getElementById('user-menu-guest')?.classList.toggle('hidden', !!token);
    document.getElementById('user-menu-auth')?.classList.toggle('hidden', !token);
    document.getElementById('bottomNav')?.classList.toggle('hidden', !token);
    document.getElementById('modoSwitch')?.classList.toggle('hidden', !token);

    if (token) {
        try {
            const user = await apiFetch('/users/profile');
            isCliente = user.es_cliente;
            isTrabajador = user.es_trabajador;
            // modo_activo se persiste en el servidor (ver PUT /users/modo-activo)
            // para que la app recuerde el último panel elegido entre
            // dispositivos/sesiones. Si por algún motivo apunta a un modo
            // que el usuario ya no tiene activo, se cae a "cliente" (que
            // siempre está disponible).
            currentModo = (user.modo_activo === 'trabajador' && isTrabajador) ? 'trabajador' : 'cliente';
            setCurrentUserId(user.id);
            updateModeSwitchUI();

            if (currentModo === 'cliente') {
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
            // correcto desde que abres la app.
            loadConversations();
        } catch {
            showLanding();
        }
    } else {
        showLanding();
    }
}

// ---------- Selector de modo (Cliente / Trabajador) ----------

function updateModeSwitchUI() {
    document.querySelectorAll('.mode-switch__btn').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.modo === currentModo);
    });
}

function initModeSwitch() {
    document.getElementById('modoSwitch')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('.mode-switch__btn');
        if (!btn || btn.classList.contains('is-active')) return;
        await switchModo(btn.dataset.modo);
    });
}

async function switchModo(modo) {
    if (modo === currentModo) return;

    // Tocar "Trabajador" sin tener ese perfil activo todavía abre el
    // formulario de activación en vez de fallar con un 403 silencioso.
    if (modo === 'trabajador' && !isTrabajador) {
        const activated = await promptActivateWorker();
        if (!activated) return;
        isTrabajador = true;
    }

    try {
        await apiFetch('/users/modo-activo', {
            method: 'PUT',
            body: JSON.stringify({ modo })
        });
    } catch (err) {
        notify(`Error: ${err.message}`, 'error');
        return;
    }

    currentModo = modo;
    updateModeSwitchUI();

    if (modo === 'cliente') {
        showDashboardCliente();
    } else {
        showDashboardTrabajador();
        loadAdBanner('adBannerTrabajador');
    }
    document.querySelectorAll('.bottom-nav__item').forEach(el => {
        el.classList.toggle('is-active', el.dataset.view === 'dashboardCliente');
    });
}

// Formulario para activar el perfil de trabajador — lo usan tanto el
// switch de modo (si se toca "Trabajador" sin tenerlo activo) como el
// botón dedicado en el perfil.
async function promptActivateWorker() {
    let categorias;
    try {
        categorias = await apiFetch('/categories');
    } catch (err) {
        notify(`No se pudieron cargar las categorías: ${err.message}`, 'error');
        return false;
    }
    if (!categorias.length) {
        notify('No hay categorías disponibles todavía.', 'error');
        return false;
    }

    const categoryOptions = categorias.map(c => ({
        value: String(c.id),
        label: `${c.icono ? c.icono + ' ' : ''}${c.nombre}`
    }));

    const result = await showFormModal({
        title: 'Activar modo Trabajador',
        confirmLabel: 'Activar',
        fields: [
            { name: 'categoria_id', label: 'Tu oficio', type: 'select', required: true, options: categoryOptions },
            { name: 'descripcion_trabajador', label: 'Descripción (opcional)', type: 'textarea', placeholder: 'Ej: Electricista con 10 años de experiencia...' },
            { name: 'precio_hora', label: 'Precio por hora (opcional)', type: 'number', min: 0, step: '0.01' },
            { name: 'municipio', label: 'Municipio', type: 'text' },
            { name: 'zona', label: 'Zona / Consejo popular', type: 'text' },
        ]
    });
    if (result === null) return false;

    const categoria = parseInt(result.categoria_id, 10);
    if (!categorias.some(c => c.id === categoria)) {
        notify('Selecciona un oficio válido.', 'error');
        return false;
    }

    let lat = null;
    let lng = null;
    try {
        const pos = await getGeolocation();
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
    } catch {
        // Sin GPS igual se puede activar el perfil.
    }

    try {
        await apiFetch('/users/activar-trabajador', {
            method: 'PUT',
            body: JSON.stringify({
                categoria_id: categoria,
                descripcion_trabajador: result.descripcion_trabajador || null,
                precio_hora: result.precio_hora || null,
                municipio: result.municipio || null,
                zona: result.zona || null,
                lat, lng
            })
        });
        notify('Perfil de trabajador activado.', 'success');
        return true;
    } catch (err) {
        notify(`Error: ${err.message}`, 'error');
        return false;
    }
}

function initBottomNav() {
    document.querySelectorAll('.bottom-nav__item').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            if (view === 'dashboardCliente' || view === 'dashboardTrabajador') {
                if (currentModo === 'cliente') showDashboardCliente();
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
    const workerSection = document.getElementById('workerActivationSection');
    if (!el) return;
    el.innerHTML = '<p class="empty-state">Cargando…</p>';
    try {
        const user = await apiFetch('/users/profile');
        isCliente = user.es_cliente;
        isTrabajador = user.es_trabajador;

        let roleDetail = '';
        if (user.es_trabajador && user.categoria_nombre) {
            roleDetail = `<p class="profile-card__meta">${user.categoria_icono ? user.categoria_icono + ' ' : ''}${user.categoria_nombre}</p>`;
        }

        const badges = [
            user.es_cliente ? '<span class="chip chip--estado-activa">Cliente</span>' : '',
            user.es_trabajador ? '<span class="chip chip--estado-activa">Trabajador</span>' : '',
        ].filter(Boolean).join(' ');

        el.innerHTML = `
            <div class="profile-card">
                <div class="profile-card__avatar">${user.nombre.charAt(0).toUpperCase()}</div>
                <h2 class="profile-card__name">${user.nombre} ${user.verificado ? '<span class="verified-stamp" title="Cuenta verificada">✓ VERIFICADO</span>' : ''}</h2>
                <p class="profile-card__meta">${badges}</p>
                ${roleDetail}
                <p class="profile-card__meta">${renderStarRating(user.rating)} <span class="mono">${(user.rating ?? 0).toFixed(1)}</span></p>
                <p class="profile-card__meta mono">${user.telefono}</p>
            </div>
        `;

        if (workerSection) {
            if (!user.es_trabajador) {
                workerSection.innerHTML = `
                    <div class="worker-status-card">
                        <p class="task-card__title">¿También ofreces servicios?</p>
                        <p class="task-card__meta" style="margin:6px 0 10px">Activa tu perfil de trabajador para aparecer en las búsquedas, postularte a tareas cercanas y publicar tus propios servicios.</p>
                        <button id="activateWorkerBtn" class="btn btn-accent btn-block btn-sm">Activar modo Trabajador</button>
                    </div>
                `;
                document.getElementById('activateWorkerBtn')?.addEventListener('click', async () => {
                    const activated = await promptActivateWorker();
                    if (activated) {
                        isTrabajador = true;
                        await loadProfile();
                    }
                });
            } else {
                workerSection.innerHTML = '';
            }
        }
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
    initModeSwitch();
    initSponsorAdEntry();
    initAdminPanel();
    // Sólo importa mientras el usuario esté deslogueado (landing) — no
    // hace daño llamarlo siempre, initLandingSearch resuelve solo si el
    // buscador del hero está en el DOM.
    initLandingSearch();

    document.getElementById('loginBtn')?.addEventListener('click', showLogin);
    document.getElementById('loginBtn2')?.addEventListener('click', showLogin);
    document.getElementById('registerBtn')?.addEventListener('click', showRegister);
    document.getElementById('logoutBtn')?.addEventListener('click', logout);
    document.getElementById('enablePushBtn')?.addEventListener('click', enablePushNotifications);

    document.addEventListener('auth:expired', () => {
        document.getElementById('bottomNav')?.classList.add('hidden');
        document.getElementById('modoSwitch')?.classList.add('hidden');
        showLanding();
    });

    bootstrap();
});
