import { apiFetch, notify } from './core.js';

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

async function loadMapTasks(lat, lng) {
    const radius = document.getElementById('filtroRadio')?.value || 5;
    const category = document.getElementById('filtroCategoria')?.value || '';
    const params = new URLSearchParams({ lat: String(lat), lng: String(lng), radius_km: String(radius) });
    if (category) params.set('category_id', category);

    try {
        const tasks = await apiFetch(`/tasks/nearby?${params.toString()}`);
        clearTaskMarkers();
        if (!Array.isArray(tasks) || !tasks.length) return 0;

        tasks.forEach(t => {
            const taskLat = Number(t.lat);
            const taskLng = Number(t.lng);
            if (!Number.isFinite(taskLat) || !Number.isFinite(taskLng)) return;

            const taskMarker = L.marker([taskLat, taskLng], { icon: taskIcon })
                .addTo(map)
                .bindPopup(
                    `<strong>${t.destacada ? '★ ' : ''}${escapeHtmlLocal(t.titulo)}</strong><br>`
                    + `$${escapeHtmlLocal(String(t.precio ?? 0))} · ${escapeHtmlLocal(String(t.distancia_km ?? ''))} km`
                );
            taskMarkers.push(taskMarker);
        });

        if (taskMarkers.length > 0) {
            const bounds = L.latLngBounds([[lat, lng]]);
            taskMarkers.forEach(m => bounds.extend(m.getLatLng()));
            map.fitBounds(bounds, { padding: [35, 35], maxZoom: 14 });
        }
        return taskMarkers.length;
    } catch (err) {
        clearTaskMarkers();
        notify(`No se pudieron cargar las tareas en el mapa: ${err.message}`, 'error');
        return 0;
    }
}

async function getCurrentPosition() {
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
        });
    });
}

export function initMap() {
    document.getElementById('toggleMapBtn')?.addEventListener('click', async () => {
        const mapDiv = document.getElementById('map');
        if (!mapDiv) return;

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

        if (!localStorage.getItem('token')) {
            notify('Inicia sesión para ver las tareas en el mapa.', 'error');
            return;
        }

        try {
            const pos = await getCurrentPosition();
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            map.setView([lat, lng], 13);

            if (marker) map.removeLayer(marker);
            marker = L.marker([lat, lng]).addTo(map).bindPopup('Tu ubicación');

            const count = await loadMapTasks(lat, lng);
            if (!count) notify('No hay tareas activas dentro del radio seleccionado.', 'info');
        } catch (err) {
            if (err?.code != null) {
                notify('Activa el GPS para ver las tareas cercanas en el mapa.', 'error');
            } else {
                notify(`No se pudo cargar el mapa: ${err.message || 'error desconocido'}`, 'error');
            }
        }
    });

    ['filtroRadio', 'filtroCategoria'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', async () => {
            if (!map || document.getElementById('map')?.classList.contains('hidden')) return;
            try {
                const pos = await getCurrentPosition();
                await loadMapTasks(pos.coords.latitude, pos.coords.longitude);
            } catch {
                // La lista principal gestiona el error de geolocalización.
            }
        });
    });
}

function escapeHtmlLocal(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}
