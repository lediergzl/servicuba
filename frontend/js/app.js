import { apiFetch, notify, escapeHtml, getGeolocation, uploadProfilePhoto } from './core.js';
import { initAuth, showLanding, showRegister, showLogin, logout } from './auth.js';
import { initTasks, loadCategories, loadNearbyTasks, showDashboardCliente, showDashboardTrabajador, switchView } from './tasks.js';
import { initMap } from './map.js';
import { initChat, setCurrentUserId, openChatForTask } from './chat.js';
import { initPush, enablePushNotifications } from './push-native.js';
import { initVerification, refreshVerificationBanner } from './verification.js';
import { initSponsorAdEntry } from './monetization.js';
import { initLandingSearch } from './landing.js';
import { initDirectory, openMunicipioDirectory } from './directory.js';
// Activa el panel oscuro "ServiCuba activo" (estilos + saludo real + KPIs +
// actividad reciente). Sin este import, dashboard-live-sync.js — y todo lo
// que encadena (dashboard-visual-polish.js, dashboard-card-ux.js,
// dashboard-presence.js, dashboard-messaging-sync.js,
// dashboard-action-feedback.js) — nunca se ejecuta, y la tarjeta queda con
// el HTML crudo de index.html: sin CSS y sin datos reales (saludo, reloj,
// KPIs). Ver comentario histórico de este bug en la conversación de soporte.
import './dashboard-live-sync.js';

let activeMode = 'cliente';
let navigationBusy = false;

function syncModeSwitch(modo) {
    activeMode = modo === 'trabajador' ? 'trabajador' : 'cliente';
    document.querySelectorAll('[data-modo]').forEach(btn => {
        const isActive = btn.dataset.modo === activeMode;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-pressed', String(isActive));
    });
}

function setModeFromUser(me) { syncModeSwitch(me?.modo_activo || (me?.es_trabajador ? 'trabajador' : 'cliente')); }

function setNavigationBusy(busy) {
    navigationBusy = busy;
    document.querySelectorAll('[data-view], [data-modo], [data-header-view], #loginBtn, #loginBtn2, #registerBtn, #logoutBtn').forEach(btn => {
        btn.toggleAttribute('data-navigation-busy', busy);
        if (busy) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy');
    });
}

async function runNavigation(action) { if (navigationBusy) return; setNavigationBusy(true); try { return await action(); } finally { setNavigationBusy(false); } }

function installHeaderResponsiveNav() {
    if (document.getElementById('servicubaHeaderNav')) return;
    const header = document.querySelector('.app-header'), brand = header?.querySelector('.app-header__brand');
    if (!header || !brand) return;
    const nav = document.createElement('nav'); nav.id = 'servicubaHeaderNav'; nav.className = 'app-header__nav'; nav.setAttribute('aria-label', 'Navegación principal');
    const items = [['landing', 'Buscar servicios'], ['mensajesView', 'Actividad'], ['dashboardTrabajador', 'Busco trabajo'], ['municipioDirectory', 'Por municipio']];
    let menuBtn = null, mobileMenu = null;
    const makeButton = (view, label, mobile = false) => {
        const btn = document.createElement('button'); btn.type = 'button'; btn.className = mobile ? 'app-header__mobile-link' : 'app-header__nav-link'; btn.dataset.headerView = view; btn.textContent = label; btn.setAttribute('aria-label', label);
        btn.addEventListener('click', () => runNavigation(async () => {
            if (view === 'municipioDirectory') await openMunicipioDirectory(); else if (view === 'landing') showLanding(); else if (view === 'dashboardTrabajador') await openWorkerView(); else if (view === 'mensajesView') await openMessagesView(); else switchView(view);
            mobileMenu?.classList.remove('is-open'); menuBtn?.setAttribute('aria-expanded', 'false');
        }));
        return btn;
    };
    items.forEach(([view, label]) => nav.appendChild(makeButton(view, label)));
    const accountGuest = document.getElementById('user-menu-guest'), accountAuth = document.getElementById('user-menu-auth'), account = accountGuest || accountAuth;
    if (account) account.classList.add('app-header__account'); if (accountAuth) accountAuth.classList.add('app-header__account-auth'); if (accountGuest) accountGuest.classList.add('app-header__account-guest');
    menuBtn = document.createElement('button'); menuBtn.type = 'button'; menuBtn.className = 'app-header__menu-btn'; menuBtn.setAttribute('aria-label', 'Abrir menú'); menuBtn.setAttribute('aria-expanded', 'false'); menuBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
    mobileMenu = document.createElement('div'); mobileMenu.className = 'app-header__mobile-menu'; mobileMenu.setAttribute('aria-label', 'Menú móvil'); items.forEach(([view, label]) => mobileMenu.appendChild(makeButton(view, label, true)));
    brand.after(nav); if (account) account.after(menuBtn); else header.appendChild(menuBtn); header.appendChild(mobileMenu);
    menuBtn.addEventListener('click', () => { if (navigationBusy) return; const open = mobileMenu.classList.toggle('is-open'); menuBtn.setAttribute('aria-expanded', String(open)); });
}

function setGuestUi() { document.getElementById('user-menu-guest')?.classList.remove('hidden'); document.getElementById('user-menu-auth')?.classList.add('hidden'); document.getElementById('bottomNav')?.classList.add('hidden'); document.getElementById('modoSwitch')?.classList.add('hidden'); document.body.classList.remove('is-authenticated'); syncModeSwitch('cliente'); }
function setAuthUi() { document.getElementById('user-menu-guest')?.classList.add('hidden'); document.getElementById('user-menu-auth')?.classList.remove('hidden'); document.getElementById('bottomNav')?.classList.remove('hidden'); document.getElementById('modoSwitch')?.classList.remove('hidden'); document.body.classList.add('is-authenticated'); }

async function renderWorkerActivationForm(profile = {}) {
    const container = document.getElementById('workerActivationSection'); if (!container || profile.es_trabajador) { if (container) container.innerHTML = ''; return; }
    container.innerHTML = `<div class="task-card worker-activation-card"><h3 class="task-card__title">👷 Activa tu perfil de trabajador</h3><p class="view-subtitle">Completa estos datos para poder buscar trabajos y ofrecer tus servicios en ServiCuba.</p><form id="workerActivationForm" class="stack-md"><select id="workerCategoria" class="field-input" required><option value="">Selecciona tu oficio</option></select><textarea id="workerDescripcion" class="field-input" rows="3" maxlength="2000" placeholder="Describe brevemente tus servicios"></textarea><input id="workerPrecioHora" class="field-input" type="number" min="0" step="0.01" placeholder="Precio por hora (CUP)"><input id="workerMunicipio" class="field-input" maxlength="120" placeholder="Municipio" value="${escapeHtml(profile.municipio || '')}"><input id="workerZona" class="field-input" maxlength="120" placeholder="Zona / Consejo popular" value="${escapeHtml(profile.zona || '')}"><button id="workerGpsBtn" type="button" class="btn btn-secondary btn-block">📍 Usar mi ubicación GPS</button><button type="submit" class="btn btn-accent btn-block">Activar perfil de trabajador</button></form></div>`;
    const select = document.getElementById('workerCategoria');
    try { const categories = await apiFetch('/categories'); categories.forEach(cat => { const option = document.createElement('option'); option.value = cat.id; option.textContent = `${cat.icono || ''} ${cat.nombre}`.trim(); if (String(cat.id) === String(profile.categoria_id || '')) option.selected = true; select.appendChild(option); }); }
    catch (err) { notify('No pudimos cargar los oficios. Inténtalo nuevamente.', 'error'); return; }
    let lat = null, lng = null;
    document.getElementById('workerGpsBtn')?.addEventListener('click', async () => { const btn = document.getElementById('workerGpsBtn'); if (!btn || btn.disabled) return; const original = btn.textContent; btn.disabled = true; btn.textContent = 'Obteniendo ubicación…'; try { const pos = await getGeolocation(); lat = Number(pos.coords.latitude); lng = Number(pos.coords.longitude); if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Coordenadas inválidas'); btn.textContent = '✓ Ubicación obtenida'; notify('Ubicación GPS obtenida correctamente.', 'success'); } catch (err) { btn.textContent = original; notify('No se pudo obtener la ubicación. Puedes continuar sin ella.', 'error'); } finally { btn.disabled = false; } });
    document.getElementById('workerActivationForm')?.addEventListener('submit', async e => { e.preventDefault(); if (navigationBusy) return; const form = e.currentTarget, submit = form.querySelector('button[type="submit"]'), categoria_id = Number(select.value); if (!categoria_id) return notify('Selecciona tu oficio.', 'error'); submit.disabled = true; submit.textContent = 'Activando perfil…'; try { const updated = await apiFetch('/users/activar-trabajador', { method: 'PUT', body: JSON.stringify({ categoria_id, descripcion_trabajador: document.getElementById('workerDescripcion').value.trim() || null, precio_hora: document.getElementById('workerPrecioHora').value ? Number(document.getElementById('workerPrecioHora').value) : null, municipio: document.getElementById('workerMunicipio').value.trim() || null, zona: document.getElementById('workerZona').value.trim() || null, lat, lng }) }); syncModeSwitch('trabajador'); setCurrentUserId(updated.id || updated.user_id); notify('Perfil de trabajador activado correctamente.', 'success'); showDashboardTrabajador(); } catch (err) { notify(`No se pudo activar el perfil: ${err.message}`, 'error'); } finally { submit.disabled = false; submit.textContent = 'Activar perfil de trabajador'; } });
}

async function openWorkerView() {
    if (!localStorage.getItem('token')) { sessionStorage.setItem('servicuba_intent', 'trabajador'); showLogin(); return; }
    try { const me = await apiFetch('/auth/me'); if (!me.es_trabajador) { syncModeSwitch('trabajador'); switchView('perfilView'); await loadProfileView(); notify('Completa tu perfil profesional aquí para activar el modo Trabajador.', 'info'); return; } setCurrentUserId(me.id || me.user_id); setAuthUi(); syncModeSwitch('trabajador'); showDashboardTrabajador(); }
    catch (err) { notify('No pudimos abrir la sección de trabajador. Inicia sesión nuevamente.', 'error'); }
}

async function loadProfileView() {
    const container = document.getElementById('perfilContenido'); if (!container) return; container.innerHTML = '<p class="view-subtitle">Cargando perfil…</p>';
    try { const profile = await apiFetch('/users/profile'); const role = profile.es_trabajador ? 'Trabajador' : 'Cliente'; const category = profile.categoria_nombre || profile.categoria || 'Sin oficio configurado'; const rating = profile.rating != null ? Number(profile.rating).toFixed(1) : '0.0'; const avatarHtml = profile.foto ? `<img src="${escapeHtml(profile.foto)}" alt="Foto de perfil" class="profile-photo__img">` : `<span class="profile-photo__placeholder" aria-hidden="true">${escapeHtml((profile.nombre || '?').trim().charAt(0).toUpperCase() || '?')}</span>`; container.innerHTML = `<div class="task-card"><div class="profile-photo"><div class="profile-photo__frame">${avatarHtml}</div><label class="btn btn-secondary btn-sm profile-photo__upload">📷 ${profile.foto ? 'Cambiar foto' : 'Agregar foto de perfil'}<input type="file" id="profilePhotoInput" accept="image/*" class="sr-only"></label></div><div class="task-card__row"><h3 class="task-card__title">${escapeHtml(profile.nombre || 'Usuario')}</h3><span class="chip">${escapeHtml(role)}</span></div><p class="task-card__meta">${escapeHtml(profile.telefono || '')}</p><p class="task-card__meta">${escapeHtml(category)} · ⭐ ${escapeHtml(rating)}</p>${profile.municipio ? `<p class="task-card__meta">${escapeHtml(profile.municipio)}${profile.zona ? ` · ${escapeHtml(profile.zona)}` : ''}</p>` : ''}${profile.descripcion_trabajador ? `<p>${escapeHtml(profile.descripcion_trabajador)}</p>` : ''}</div>`;
        document.getElementById('profilePhotoInput')?.addEventListener('change', async e => { const file = e.target.files?.[0]; if (!file) return; const label = e.target.closest('.profile-photo__upload'), original = label.textContent; label.textContent = 'Subiendo…'; label.setAttribute('aria-busy', 'true'); try { await uploadProfilePhoto(file); notify('Foto de perfil actualizada.', 'success'); await loadProfileView(); } catch (err) { notify(`No se pudo actualizar la foto: ${err.message}`, 'error'); label.textContent = original; label.removeAttribute('aria-busy'); } });
        await renderWorkerActivationForm(profile);
    } catch (err) { container.innerHTML = '<p class="empty-state">No pudimos cargar tu perfil. Inténtalo nuevamente.</p>'; notify(`No se pudo cargar el perfil: ${err.message}`, 'error'); }
}
async function openProfileView() { if (!localStorage.getItem('token')) { showLogin(); return; } switchView('perfilView'); await loadProfileView(); }

async function openMessagesView() {
    if (!localStorage.getItem('token')) { showLogin(); return; }
    switchView('mensajesView'); const list = document.getElementById('listaConversaciones'); if (!list) return; list.innerHTML = '<p class="view-subtitle">Cargando conversaciones…</p>';
    try { const conversations = await apiFetch('/chat/conversations'); if (!conversations.length) { list.innerHTML = '<p class="empty-state">Todavía no tienes conversaciones.</p>'; return; } list.innerHTML = conversations.map(c => `<button type="button" class="task-card conversation-card" data-chat-task="${escapeHtml(c.task_id)}" style="text-align:left;width:100%;border:0;cursor:pointer"><div class="task-card__row"><strong>${escapeHtml(c.otro_participante || 'Contacto')}</strong>${c.no_leidos ? `<span class="chip">${escapeHtml(String(c.no_leidos))} sin leer</span>` : ''}</div><p class="task-card__meta">${escapeHtml(c.titulo || 'Servicio')} · ${escapeHtml(c.estado || '')}</p><p class="task-card__meta">${escapeHtml(c.ultimo_mensaje || 'Sin mensajes todavía')}</p></button>`).join(''); list.querySelectorAll('[data-chat-task]').forEach(btn => btn.addEventListener('click', () => { if (!btn.disabled) { btn.disabled = true; Promise.resolve(openChatForTask(btn.dataset.chatTask)).finally(() => { btn.disabled = false; }); } })); }
    catch (err) { list.innerHTML = '<p class="empty-state">No pudimos cargar tus mensajes.</p>'; notify(`No se pudieron cargar los mensajes: ${err.message}`, 'error'); }
}

function addPremiumOpportunityBanner() {
    const panel = document.getElementById('tareasCercanasPanel'); if (!panel) return;
    let banner = document.getElementById('premiumOpportunityBanner');
    if (!banner) { banner = document.createElement('div'); banner.id = 'premiumOpportunityBanner'; banner.className = 'premium-opportunities-banner'; const list = document.getElementById('listaTareas'); panel.insertBefore(banner, list || null); }
    banner.innerHTML = '<div class="premium-opportunities-banner__title">⚡ Acceso Premium prioritario</div><div class="premium-opportunities-banner__text">Las mejores oportunidades aparecen aquí primero para ti durante su ventana prioritaria.</div>';
    banner.classList.remove('hidden');
}

async function openTaskFromNotification(taskId) {
    if (!taskId || !localStorage.getItem('token')) return false;
    try {
        const me = await apiFetch('/auth/me');
        if (!me.es_trabajador || !me.id) return false;
        setCurrentUserId(me.id); setAuthUi(); syncModeSwitch('trabajador');
        addPremiumOpportunityBanner();
        switchView('dashboardTrabajador');
        await loadNearbyTasks();
        const button = document.querySelector(`#listaTareas button[data-id="${CSS.escape(String(taskId))}"]`);
        const card = button?.closest('.task-card');
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.classList.add('task-card--notification-focus');
            const title = card.querySelector('.task-card__title')?.textContent?.trim() || 'Tarea prioritaria';
            notify(`⚡ ${title} — oportunidad Premium`, 'success');
            setTimeout(() => card.classList.remove('task-card--notification-focus'), 5000);
            return true;
        }
        notify('La tarea ya no está disponible en tu radio o fue cerrada.', 'info');
        return false;
    } catch (err) { console.warn('[ServiCuba] no se pudo abrir tarea de notificación', err); return false; }
}

async function handleTaskDeepLink() {
    const taskId = new URLSearchParams(window.location.search).get('task');
    if (!taskId) return;
    window.history.replaceState({}, document.title, window.location.pathname);
    await openTaskFromNotification(taskId);
}

function wireGlobalButtons() {
    document.addEventListener('servicuba:open-worker-activation', () => runNavigation(openWorkerView));
    document.getElementById('loginBtn')?.addEventListener('click', () => runNavigation(showLogin));
    document.getElementById('loginBtn2')?.addEventListener('click', () => runNavigation(showLogin));
    document.getElementById('registerBtn')?.addEventListener('click', () => runNavigation(showRegister));
    document.getElementById('logoutBtn')?.addEventListener('click', () => runNavigation(logout));
    document.getElementById('enablePushBtn')?.addEventListener('click', () => runNavigation(() => enablePushNotifications().catch(err => notify(err.message || 'No se pudieron activar las notificaciones.', 'error'))));
    document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => runNavigation(async () => { const view = btn.dataset.view; if (view === 'mensajes') return openMessagesView(); if (view === 'perfil') return openProfileView(); if (view === 'dashboardTrabajador') return openWorkerView(); return switchView(view); })));
    document.querySelectorAll('[data-modo]').forEach(btn => btn.addEventListener('click', () => runNavigation(async () => { const modo = btn.dataset.modo; if (modo === 'trabajador') return openWorkerView(); if (modo === 'cliente') { if (!localStorage.getItem('token')) return showLogin(); try { await apiFetch('/users/modo-activo', { method: 'PUT', body: JSON.stringify({ modo: 'cliente' }) }); syncModeSwitch('cliente'); showDashboardCliente(); } catch (err) { notify(`No se pudo cambiar al modo Cliente: ${err.message}`, 'error'); } } })));
}

async function restoreSession() {
    if (!localStorage.getItem('token')) return false;
    try { const me = await apiFetch('/auth/me'); setCurrentUserId(me.id || me.user_id); setAuthUi(); setModeFromUser(me); try { await refreshVerificationBanner(); } catch (err) { console.error('verification', err); } if (activeMode === 'trabajador' && me.es_trabajador) showDashboardTrabajador(); else { syncModeSwitch('cliente'); showDashboardCliente(); } return true; }
    catch (err) { localStorage.removeItem('token'); setGuestUi(); return false; }
}

async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    try {
        const registration = await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
        console.info('[ServiCuba] Service Worker registrado:', registration.scope);
        return registration;
    } catch (err) {
        console.warn('[ServiCuba] No se pudo registrar el Service Worker:', err);
        return null;
    }
}

async function boot() {
    setGuestUi(); showLanding();
    const headerCss = document.createElement('link'); headerCss.rel = 'stylesheet'; headerCss.href = '/css/header-responsive-fix.css?v=3'; document.head.appendChild(headerCss);
    installHeaderResponsiveNav();
    try { initDirectory(); } catch (err) { console.error('initDirectory', err); }
    try { await initLandingSearch(); } catch (err) { console.error('initLandingSearch', err); }
    try { initAuth(); } catch (err) { console.error('initAuth', err); }
    try { initTasks(); } catch (err) { console.error('initTasks', err); }
    try { initChat(); } catch (err) { console.error('initChat', err); }
    try { initMap(); } catch (err) { console.error('initMap', err); }
    try { initVerification(); } catch (err) { console.error('verification', err); }
    try { await registerServiceWorker(); } catch (err) { console.error('service worker', err); }
    try { await initPush(); } catch (err) { console.error('push', err); }
    try { initSponsorAdEntry(); } catch (err) { console.error('ads', err); }
    wireGlobalButtons();
    try { await loadCategories(); } catch (err) { console.error('loadCategories', err); }
    const restored = await restoreSession(); if (!restored) showLanding();
    try { await handleTaskDeepLink(); } catch (err) { console.warn('[ServiCuba] deep link', err); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
