import { apiFetch, escapeHtml, notify } from './core.js';

function ensureDirectoryView() {
    let view = document.getElementById('municipioDirectory');
    if (view) return view;
    const main = document.getElementById('views');
    if (!main) return null;
    view = document.createElement('section');
    view.id = 'municipioDirectory';
    view.className = 'view hidden directory-view';
    view.innerHTML = `
        <div class="view-header-row">
            <div><h2 class="view-title">Servicios por municipio</h2><p class="view-subtitle">Explora ofertas públicas sin GPS y sin registrarte.</p></div>
            <button id="directoryBackBtn" class="btn btn-ghost btn-sm" type="button">Atrás</button>
        </div>
        <div class="directory-controls">
            <select id="directoryMunicipio" class="field-input"><option value="">Cargando municipios…</option></select>
            <select id="directoryTipo" class="field-input"><option value="oferta">Servicios ofrecidos</option><option value="necesidad">Personas que buscan un servicio</option></select>
        </div>
        <div id="directoryResults" class="stack-sm"></div>`;
    main.appendChild(view);
    view.querySelector('#directoryMunicipio').addEventListener('change', loadDirectoryResults);
    view.querySelector('#directoryTipo').addEventListener('change', loadDirectoryResults);
    view.querySelector('#directoryBackBtn').addEventListener('click', () => {
        view.classList.add('hidden');
        document.getElementById('landing')?.classList.remove('hidden');
    });
    return view;
}

export async function openMunicipioDirectory() {
    const view = ensureDirectoryView();
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
        if (municipios.length) { select.value = municipios[0]; await loadDirectoryResults(); }
        else list.innerHTML = '<p class="view-subtitle">Todavía no hay publicaciones activas por municipio.</p>';
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
        if (!items.length) { list.innerHTML = '<p class="view-subtitle">No hay publicaciones de este tipo en este municipio.</p>'; return; }
        list.innerHTML = items.map(item => `<article class="directory-item ${item.destacada ? 'directory-item--featured' : ''}"><div class="directory-item__top"><strong>${escapeHtml(item.titulo || 'Servicio')}</strong>${item.categoria_nombre ? `<span>${escapeHtml(item.categoria_nombre)}</span>` : ''}</div>${item.descripcion ? `<p>${escapeHtml(item.descripcion)}</p>` : ''}<div class="directory-item__meta"><span>${item.destacada ? 'Destacado' : 'Disponible'}</span>${item.precio != null ? `<span>${escapeHtml(String(item.precio))}</span>` : ''}</div></article>`).join('');
    } catch (err) { list.innerHTML = '<p class="view-subtitle">No pudimos cargar las publicaciones.</p>'; }
}

export function initDirectory() { ensureDirectoryView(); }
