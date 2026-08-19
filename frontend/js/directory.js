import { apiFetch, escapeHtml, notify } from './core.js';

function ensureDirectoryView() {
    let view = document.getElementById('municipioDirectory');
    if (view) return view;
    const main = document.getElementById('views');
    if (!main) return null;
    view = document.createElement('section'); view.id='municipioDirectory'; view.className='view hidden directory-view';
    view.innerHTML=`<div class="view-header-row"><div><h2 class="view-title">Trabajadores por municipio</h2><p class="view-subtitle">Encuentra trabajadores con perfil profesional activo.</p></div><button id="directoryBackBtn" class="btn btn-ghost btn-sm" type="button">Atrás</button></div><div class="directory-controls"><select id="directoryMunicipio" class="field-input"><option value="">Cargando municipios…</option></select></div><div id="directoryResults" class="stack-sm"></div>`;
    main.appendChild(view);
    view.querySelector('#directoryMunicipio').addEventListener('change',loadDirectoryResults);
    view.querySelector('#directoryBackBtn').addEventListener('click',()=>{view.classList.add('hidden');document.getElementById('landing')?.classList.remove('hidden');});
    return view;
}

export async function openMunicipioDirectory(){const view=ensureDirectoryView();if(!view)return;document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));view.classList.remove('hidden');await loadMunicipios();}

async function loadMunicipios(){
    const select=document.getElementById('directoryMunicipio'),list=document.getElementById('directoryResults');if(!select||!list)return;
    list.innerHTML='<p class="view-subtitle">Cargando trabajadores…</p>';
    try{const municipios=await apiFetch('/discovery/directory/municipios');select.innerHTML='<option value="">Selecciona un municipio</option>'+municipios.map(m=>`<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');if(municipios.length){select.value=municipios[0];await loadDirectoryResults();}else list.innerHTML='<p class="view-subtitle">Todavía no hay trabajadores con perfil activo.</p>';}catch(err){list.innerHTML='<p class="view-subtitle">No pudimos cargar los municipios. Inténtalo de nuevo.</p>';notify('No se pudo cargar el directorio.','error');}
}

async function loadDirectoryResults(){
    const select=document.getElementById('directoryMunicipio'),list=document.getElementById('directoryResults');if(!select||!list||!select.value)return;
    list.innerHTML='<p class="view-subtitle">Buscando trabajadores…</p>';
    try{const items=await apiFetch(`/discovery/directory?municipio=${encodeURIComponent(select.value)}`);if(!items.length){list.innerHTML='<p class="view-subtitle">No hay trabajadores disponibles en este municipio.</p>';return;}
    list.innerHTML=items.map(item=>`<article class="directory-item"><div class="directory-item__top"><strong>${escapeHtml(item.nombre||'Trabajador')}</strong>${item.verificado?'<span>✓ Verificado</span>':''}</div>${item.categoria_nombre?`<p>${escapeHtml(item.categoria_icono||'🛠')} ${escapeHtml(item.categoria_nombre)}</p>`:''}${item.descripcion_trabajador?`<p>${escapeHtml(item.descripcion_trabajador)}</p>`:''}<div class="directory-item__meta"><span>⭐ ${Number(item.rating||0).toFixed(1)}</span>${item.precio_hora!=null?`<span>${escapeHtml(String(item.precio_hora))} CUP/h</span>`:''}${item.zona?`<span>${escapeHtml(item.zona)}</span>`:''}</div></article>`).join('');
    }catch(err){list.innerHTML='<p class="view-subtitle">No pudimos cargar los trabajadores.</p>';}
}

export function initDirectory(){ensureDirectoryView();}
