import { apiFetch, notify } from './core.js';
import { getLocationWithFallback } from './location.js';

let map = null;
let marker = null;
let taskMarkers = [];

const taskIcon = L.divIcon({
    className: '',
    html: '<span style="display:block;width:18px;height:18px;border-radius:50%;background:#D9A441;border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45)"></span>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12]
});

function clearTaskMarkers() {
    taskMarkers.forEach(m => map.removeLayer(m));
    taskMarkers = [];
}

function getMapMode() {
    const mode = document.querySelector('.mode-switch__btn.is-active')?.dataset.modo;
    return mode === 'trabajador' ? 'trabajador' : 'cliente';
}

function getMapFilters() {
    const mode = getMapMode();
    const radiusId = mode === 'trabajador' ? 'filtroRadio' : 'filtroRadioOfertas';
    const categoryId = mode === 'trabajador' ? 'filtroCategoria' : 'filtroCategoriaOfertas';
    return {
        radius: document.getElementById(radiusId)?.value || 5,
        category: document.getElementById(categoryId)?.value || ''
    };
}

async function loadMapItems(lat, lng) {
    const { radius, category } = getMapFilters();
    const mode = getMapMode();
    const params = new URLSearchParams({ lat: String(lat), lng: String(lng), radius_km: String(radius) });
    if (category) params.set('category_id', category);

    const authenticated = !!localStorage.getItem('token');
    let endpoint;
    if (!authenticated) {
        endpoint = mode === 'trabajador' ? '/api/discovery/tasks/map' : '/api/discovery/offers/map';
    } else {
        endpoint = mode === 'trabajador' ? '/api/tasks/nearby' : '/api/tasks/ofertas/nearby';
    }

    try {
        const items = await apiFetch(`${endpoint}?${params.toString()}`);
        clearTaskMarkers();
        if (!Array.isArray(items) || !items.length) return 0;

        items.forEach(item => {
            const itemLat = Number(item.lat);
            const itemLng = Number(item.lng);
            if (!Number.isFinite(itemLat) || !Number.isFinite(itemLng)) return;

            const title = item.titulo || item.titulo_oferta || item.categoria_nombre || 'Servicio disponible';
            const price = item.precio ?? item.precio_hora ?? 0;
            const distance = item.distancia_km ?? '';
            const markerItem = L.marker([itemLat, itemLng], { icon: taskIcon })
                .addTo(map)
                .bindPopup(
                    `<strong>${item.destacada ? '★ ' : ''}${escapeHtmlLocal(title)}</strong><br>`
                    + `$${escapeHtmlLocal(String(price))} · ${escapeHtmlLocal(String(distance))} km`
                    + (!authenticated ? '<br><small>Ubicación aproximada · inicia sesión para contactar</small>' : '')
                );
            taskMarkers.push(markerItem);
        });

        if (taskMarkers.length > 0) {
            const bounds = L.latLngBounds([[lat, lng]]);
            taskMarkers.forEach(m => bounds.extend(m.getLatLng()));
            map.fitBounds(bounds, { padding: [35, 35], maxZoom: 14 });
        }
        return taskMarkers.length;
    } catch (err) {
        clearTaskMarkers();
        notify(`No se pudieron cargar los elementos en el mapa: ${err.message}`, 'error');
        return 0;
    }
}

async function refreshMapTasks() {
    const location = await getLocationWithFallback();
    if (!location || !map) return;

    map.setView([location.lat, location.lng], 13);
    if (marker) map.removeLayer(marker);
    marker = L.marker([location.lat, location.lng])
        .addTo(map)
        .bindPopup(location.source === 'manual' ? 'Ubicación seleccionada' : 'Tu ubicación');

    const count = await loadMapItems(location.lat, location.lng);
    if (!count) notify('No hay resultados dentro del radio seleccionado.', 'info');
}

function ensureClientMapEntry() {
    const panel = document.getElementById('ofertasCercanasPanel');
    const mapDiv = document.getElementById('map');
    if (!panel || !mapDiv || document.getElementById('toggleMapBtnClient')) return;

    const button = document.createElement('button');
    button.id = 'toggleMapBtnClient';
    button.type = 'button';
    button.className = 'btn btn-secondary btn-block mt-md';
    button.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6Z"/><path d="M9 4v14M15 6v14"/></svg> Ver ofertas en mapa';
    panel.appendChild(button);
    button.addEventListener('click', toggleMap);
}

function mountMapInActivePanel() {
    const mapDiv = document.getElementById('map');
    if (!mapDiv) return;
    const mode = getMapMode();
    const panelId = mode === 'trabajador' ? 'tareasCercanasPanel' : 'ofertasCercanasPanel';
    const panel = document.getElementById(panelId);
    if (!panel) return;

    if (mapDiv.parentElement !== panel) {
        panel.appendChild(mapDiv);
    }
}

function toggleMap() {
    const mapDiv = document.getElementById('map');
    if (!mapDiv) return;

    mountMapInActivePanel();
    const opening = mapDiv.classList.contains('hidden');
    mapDiv.classList.toggle('hidden', !opening);
    if (!opening) return;

    if (!map) {
        map = L.map('map').setView([22.145, -80.450], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(map);
    }
    setTimeout(() => map.invalidateSize(), 0);
    refreshMapTasks();
}

export function initMap() {
    ensureClientMapEntry();
    document.getElementById('toggleMapBtn')?.addEventListener('click', toggleMap);

    ['filtroRadio', 'filtroCategoria', 'filtroRadioOfertas', 'filtroCategoriaOfertas'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', async () => {
            if (!map || document.getElementById('map')?.classList.contains('hidden')) return;
            await refreshMapTasks();
        });
    });

    document.getElementById('modoSwitch')?.addEventListener('click', event => {
        const button = event.target.closest('.mode-switch__btn');
        if (!button || button.classList.contains('is-active')) return;
        setTimeout(async () => {
            const mapDiv = document.getElementById('map');
            if (!map || !mapDiv || mapDiv.classList.contains('hidden')) return;
            mountMapInActivePanel();
            map.invalidateSize();
            await refreshMapTasks();
        }, 0);
    });
}

function escapeHtmlLocal(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}