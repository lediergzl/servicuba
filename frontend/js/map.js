import { apiFetch, notify } from './core.js';

let map = null;
let marker = null;
let taskMarkers = [];

// Icono propio (dorado, el acento de la marca) para tareas/ofertas en el
// mapa, distinto del azul por defecto de Leaflet usado para "Tu
// ubicación" — evita que un marcador de tarea muy cercano (o en el
// mismo punto) quede tapado exactamente debajo del de "Tu ubicación".
const taskIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-gold.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

function clearTaskMarkers() {
    taskMarkers.forEach(m => map.removeLayer(m));
    taskMarkers = [];
}

export function initMap() {
    document.getElementById('toggleMapBtn')?.addEventListener('click', () => {
        const mapDiv = document.getElementById('map');
        if (mapDiv.classList.contains('hidden')) {
            mapDiv.classList.remove('hidden');
            if (!map) {
                map = L.map('map').setView([22.145, -80.450], 13);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap'
                }).addTo(map);
                setTimeout(() => map.invalidateSize(), 0);
            } else {
                setTimeout(() => map.invalidateSize(), 0);
            }

            const token = localStorage.getItem('token');
            if (!token) return;
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    map.setView([lat, lng], 13);
                    if (marker) map.removeLayer(marker);
                    marker = L.marker([lat, lng]).addTo(map)
                        .bindPopup('Tu ubicación');

                    const radius = document.getElementById('filtroRadio')?.value || 5;
                    const category = document.getElementById('filtroCategoria')?.value || '';
                    const params = new URLSearchParams({ lat, lng, radius_km: radius });
                    if (category) params.set('category_id', category);

                    apiFetch(`/tasks/nearby?${params.toString()}`)
                        .then(tasks => {
                            clearTaskMarkers();
                            if (!tasks || !tasks.length) return;
                            tasks.forEach(t => {
                                if (t.lat == null || t.lng == null) return;
                                const taskMarker = L.marker([t.lat, t.lng], { icon: taskIcon }).addTo(map)
                                    .bindPopup(
                                        `<strong>${t.destacada ? '★ ' : ''}${escapeHtmlLocal(t.titulo)}</strong><br>`
                                        + `$${escapeHtmlLocal(String(t.precio ?? 0))} · ${escapeHtmlLocal(String(t.distancia_km))} km`
                                    );
                                taskMarkers.push(taskMarker);
                            });
                        })
                        .catch(err => {
                            notify(`No se pudieron cargar las tareas en el mapa: ${err.message}`, 'error');
                        });
                },
                () => alert('Activa el GPS para ver el mapa.')
            );
        } else {
            mapDiv.classList.add('hidden');
        }
    });
}

function escapeHtmlLocal(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}
