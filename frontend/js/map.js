let map = null;
let marker = null;
let taskMarkers = [];

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

                    fetch(`/api/tasks/nearby?${params.toString()}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    })
                    .then(res => res.json())
                    .then(tasks => {
                        clearTaskMarkers();
                        tasks.forEach(t => {
                            if (t.lat == null || t.lng == null) return;
                            const taskMarker = L.marker([t.lat, t.lng]).addTo(map)
                                .bindPopup(
                                    `<strong>${t.destacada ? '★ ' : ''}${escapeHtmlLocal(t.titulo)}</strong><br>`
                                    + `$${escapeHtmlLocal(String(t.precio ?? 0))} · ${escapeHtmlLocal(String(t.distancia_km))} km`
                                );
                            taskMarkers.push(taskMarker);
                        });
                    });
                },
                () => alert('Activa el GPS para ver el mapa.')
            );
        } else {
            mapDiv.classList.add('hidden');
        }
    });
}

// Pequeño escape local para no depender de core.js dentro de un innerHTML
// de Leaflet (bindPopup no pasa por el DOM normal de la app).
function escapeHtmlLocal(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}
