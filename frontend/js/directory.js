import { apiFetch, escapeHtml, notify } from './core.js';

export async function openMunicipioDirectory() {
    const view = document.getElementById('municipioDirectory');
    if (!view) return;
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    view.classList.remove('hidden');
    await loadMunicipios();
}

async function loadMunicipios() {
    const select = document.getElementById('directoryMunicipio');
    const list = document.getElementById('directoryResults');
    if (!select || !list) return;
    list.innerHTML = '<p class="view-subtitle">Cargando servicios disponibles…</p>';
    try {
        const municipios = await apiFetch('/discovery/directory/municipios');
        select.innerHTML = '<option value="">Selecciona un municipio</option>' + municipios.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
        if (municipios.length) {
            select.value = municipios[0];
            await loadDirectoryResults();
        } else {
            list.innerHTML = '<p class="view-subtitle">Todavía no hay publicaciones activas por municipio.</p>';
        }
    } catch (err) {
        list.innerHTML = '<p class="view-subtitle">No pudimos cargar el directorio. Inténtalo de nuevo.</p>';
        notify('No se pudo cargar el directorio.', 'error');
    }
}

async function loadDirectoryResults() {
    const select = document.getElementById('directoryMunicipio');
    const type = document.getElementById('directoryTipo');
    const list = document.getElementById('directoryResults');
    if (!select || !list || !select.value) return;
    list.innerHTML = '<p class="view-subtitle">Buscando…</p>';
    try {
        const items = await apiFetch(`/discovery/directory?municipio=${encodeURIComponent(select.value)}&tipo=${encodeURIComponent(type?.value || 'oferta')}`);
        if (!items.length) {
            list.innerHTML = '<p class="view-subtitle">No hay publicaciones de este tipo en este municipio.</p>';
            return;
        }
        list.innerHTML = items.map(item => `
            <article class="directory-item ${item.destacada ? 'directory-item--featured' : ''}">
                <div class="directory-item__top"><strong>${escapeHtml(item.titulo || 'Servicio')}</strong>${item.categoria_nombre ? `<span>${escapeHtml(item.categoria_nombre)}</span>` : ''}</div>
                ${item.descripcion ? `<p>${escapeHtml(item.descripcion)}</p>` : ''}
                <div class="directory-item__meta"><span>${item.destacada ? 'Destacado' : 'Disponible'}</span>${item.precio != null ? `<span>${escapeHtml(String(item.precio))}</span>` : ''}</div>
            </article>
        `).join('');
    } catch (err) {
        list.innerHTML = '<p class="view-subtitle">No pudimos cargar las publicaciones.</p>';
    }
}

export function initDirectory() {
    document.getElementById('directoryMunicipio')?.addEventListener('change', loadDirectoryResults);
    document.getElementById('directoryTipo')?.addEventListener('change', loadDirectoryResults);
    document.getElementById('directoryBackBtn')?.addEventListener('click', () => {
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        document.getElementById('landing')?.classList.remove('hidden');
    });
}
