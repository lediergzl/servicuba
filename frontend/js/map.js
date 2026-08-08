let map = null;
let marker = null;

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
                    fetch(`/api/tasks/nearby?lat=${lat}&lng=${lng}&radius_km=5`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    })
                    .then(res => res.json())
                    .then(tasks => {
                        tasks.forEach(t => {
                            // Nota: la API no devuelve lat/lng en esta versión,
                            // se puede extender.
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
