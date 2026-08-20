import { apiFetch, notify } from './core.js';
import { getLocationWithFallback } from './location.js';

let map = null;
let marker = null;
let taskMarkers = [];
let taskIcon = null;
let leafletPromise = null;
let mapRequestController = null;

function ensureLeaflet() {
    if (window.L?.map) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;

    leafletPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-servicuba-leaflet]');
        if (existing) {
            existing.addEventListener('load', () => window.L ? resolve(window.L) : reject(new Error('Leaflet no se inicializó.')), { once: true });
            existing.addEventListener('error', () => reject(new Error('No se pudo cargar el mapa.')), { once: true });
            return;
        }

        if (!document.querySelector('link[data-servicuba-leaflet]')) {
            const css = document.createElement('link');
            css.rel = 'stylesheet';
            css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            css.setAttribute('data-servicuba-leaflet', 'true');
            document.head.appendChild(css);
        }

        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.async = true;
        script.setAttribute('data-servicuba-leaflet', 'true');
        const timeout = setTimeout(() => reject(new Error('La carga del mapa tardó demasiado.')), 15000);
        script.onload = () => { clearTimeout(timeout); window.L ? resolve(window.L) : reject(new Error('Leaflet no se inicializó.')); };
        script.onerror = () => { clearTimeout(timeout); reject(new Error('No se pudo cargar el mapa.')); };
        document.head.appendChild(script);
    }).catch(error => {
        leafletPromise = null;
        throw error;
    });
    return leafletPromise;
}

function getTaskIcon() {
    if (taskIcon || !window.L) return taskIcon;
    taskIcon = window.L.divIcon({
        className: '',
        html: '<span style="display:block;width:18px;height:18px;border-radius:50%;background:#D9A441;border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45)"></span>',
        iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -12]
    });
    return taskIcon;
}

function clearTaskMarkers() {
    if (!map) return;
    taskMarkers.forEach(m => map.removeLayer(m));
    taskMarkers = [];
}

function getMapMode() {
    return document.querySelector('.mode-switch__btn.is-active')?.dataset.modo === 'trabajador' ? 'trabajador' : 'cliente';
}

function getMapFilters() {
    const mode = getMapMode();
    return {
        radius: document.getElementById(mode === 'trabajador' ? 'filtroRadio' : 'filtroRadioOfertas')?.value || 5,
        category: document.getElementById(mode === 'trabajador' ? 'filtroCategoria' : 'filtroCategoriaOfertas')?.value || ''
    };
}

async function loadMapItems(lat, lng) {
    if (mapRequestController) mapRequestController.abort();
    mapRequestController = new AbortController();
    const signal = mapRequestController.signal;
    const { radius, category } = getMapFilters();
    const mode = getMapMode();
    const params = new URLSearchParams({ lat: String(lat), lng: String(lng), radius_km: String(radius) });
    if (category) params.set('category_id', category);

    const authenticated = !!localStorage.getItem('token');
    const endpoint = !authenticated
        ? (mode === 'trabajador' ? '/discovery/tasks/map' : '/discovery/offers/map')
        : (mode === 'trabajador' ? '/tasks/nearby' : '/tasks/ofertas/nearby');

    try {
        const items = await apiFetch(`${endpoint}?${params}`, { signal });
        if (signal.aborted) return 0;
        clearTaskMarkers();
        if (!Array.isArray(items) || !items.length) return 0;
        const icon = getTaskIcon();
        items.forEach(item => {
            const itemLat = Number(item.lat), itemLng = Number(item.lng);
            if (!Number.isFinite(itemLat) || !Number.isFinite(itemLng)) return;
            const title = item.titulo || item.titulo_oferta || item.categoria_nombre || 'Servicio disponible';
            const price = item.precio ?? item.precio_hora ?? 0;
            const distance = item.distancia_km ?? '';
            const markerItem = window.L.marker([itemLat, itemLng], { icon }).addTo(map).bindPopup(
                `<strong>${item.destacada ? '★ ' : ''}${escapeHtmlLocal(title)}</strong><br>$${escapeHtmlLocal(String(price))} · ${escapeHtmlLocal(String(distance))} km${!authenticated ? '<br><small>Ubicación aproximada · inicia sesión para contactar</small>' : ''}`
            );
            taskMarkers.push(markerItem);
        });
        if (taskMarkers.length) {
            const bounds = window.L.latLngBounds([[lat, lng]]);
            taskMarkers.forEach(m => bounds.extend(m.getLatLng()));
            map.fitBounds(bounds, { padding: [35, 35], maxZoom: 14 });
        }
        return taskMarkers.length;
    } catch (err) {
        if (err?.name === 'AbortError') return 0;
        clearTaskMarkers();
        notify(`No se pudieron cargar los elementos en el mapa: ${err.message}`, 'error');
        return 0;
    } finally {
        if (mapRequestController?.signal === signal) mapRequestController = null;
    }
}

async function refreshMapTasks() {
    const location = await getLocationWithFallback();
    if (!location || !map) return;
    map.setView([location.lat, location.lng], 13);
    if (marker) map.removeLayer(marker);
    marker = window.L.marker([location.lat, location.lng]).addTo(map).bindPopup(location.source === 'manual' ? 'Ubicación seleccionada' : 'Tu ubicación');
    const count = await loadMapItems(location.lat, location.lng);
    if (!count && !mapRequestController) notify('No hay resultados dentro del radio seleccionado.', 'info');
}

function ensureClientMapEntry() {
    const panel = document.getElementById('ofertasCercanasPanel'), mapDiv = document.getElementById('map');
    if (!panel || !mapDiv || document.getElementById('toggleMapBtnClient')) return;
    const button = document.createElement('button');
    button.id = 'toggleMapBtnClient'; button.type = 'button'; button.className = 'btn btn-secondary btn-block mt-md';
    button.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6Z"/><path d="M9 4v14M15 6v14"/></svg> Ver ofertas en mapa';
    panel.appendChild(button); button.addEventListener('click', toggleMap);
}

function mountMapInActivePanel() {
    const mapDiv = document.getElementById('map');
    const panel = document.getElementById(getMapMode() === 'trabajador' ? 'tareasCercanasPanel' : 'ofertasCercanasPanel');
    if (mapDiv && panel && mapDiv.parentElement !== panel) panel.appendChild(mapDiv);
}

async function toggleMap() {
    const mapDiv = document.getElementById('map');
    if (!mapDiv) return;
    mountMapInActivePanel();
    const opening = mapDiv.classList.contains('hidden');
    mapDiv.classList.toggle('hidden', !opening);
    if (!opening) return;

    try {
        await ensureLeaflet();
        if (!map) {
            map = window.L.map('map').setView([22.145, -80.450], 13);
            window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
        }
        requestAnimationFrame(() => map?.invalidateSize());
        await refreshMapTasks();
    } catch (err) {
        mapDiv.classList.add('hidden');
        notify(err.message || 'No se pudo cargar el mapa. Inténtalo nuevamente.', 'error');
    }
}

export function initMap() {
    ensureClientMapEntry();
    document.getElementById('toggleMapBtn')?.addEventListener('click', toggleMap);
    ['filtroRadio', 'filtroCategoria', 'filtroRadioOfertas', 'filtroCategoriaOfertas'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => {
            if (map && !document.getElementById('map')?.classList.contains('hidden')) refreshMapTasks();
        });
    });
    document.getElementById('modoSwitch')?.addEventListener('click', event => {
        const button = event.target.closest('.mode-switch__btn');
        if (!button || button.classList.contains('is-active')) return;
        setTimeout(() => {
            const mapDiv = document.getElementById('map');
            if (!map || !mapDiv || mapDiv.classList.contains('hidden')) return;
            mountMapInActivePanel(); map.invalidateSize(); refreshMapTasks();
        }, 0);
    });
}

function escapeHtmlLocal(str) {
    const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML;
}
