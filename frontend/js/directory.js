import { apiFetch, escapeHtml, notify, showConfirm } from './core.js';

let directoryObserver = null;
function hideDirectory(){ document.getElementById('municipioDirectory')?.classList.add('hidden'); }
function watchOtherViews(){
    if(directoryObserver) return;
    directoryObserver=new MutationObserver(()=>{
        const dir=document.getElementById('municipioDirectory');
        if(!dir || dir.classList.contains('hidden')) return;
        const another=[...document.querySelectorAll('.view')].some(v=>v!==dir && !v.classList.contains('hidden'));
        if(another) dir.classList.add('hidden');
    });
    directoryObserver.observe(document.getElementById('views')||document.body,{subtree:true,attributes:true,attributeFilter:['class']});
}
function ensureDirectoryView() {
    let view=document.getElementById('municipioDirectory'); if(view) return view;
    const main=document.getElementById('views'); if(!main) return null;
    view=document.createElement('section'); view.id='municipioDirectory'; view.className='view hidden directory-view';
    view.innerHTML=`
      <div class="view-header-row directory-view__header">
        <div><h2 class="view-title">Trabajadores por municipio</h2><p class="view-subtitle">Encuentra trabajadores con perfil profesional activo.</p></div>
        <button id="directoryBackBtn" class="btn btn-ghost btn-sm" type="button">Atrás</button>
      </div>
      <div class="directory-controls"><label class="sr-only" for="directoryMunicipio">Municipio</label><select id="directoryMunicipio" class="field-input"><option value="">Cargando municipios…</option></select></div>
      <div id="directoryResults" class="directory-results"></div>`;
    main.appendChild(view); watchOtherViews();
    view.querySelector('#directoryMunicipio').addEventListener('change',loadDirectoryResults);
    view.querySelector('#directoryBackBtn').addEventListener('click',()=>{hideDirectory();document.getElementById('landing')?.classList.remove('hidden');});
    view.querySelector('#directoryResults').addEventListener('click',async e=>{const card=e.target.closest('[data-worker-id]');if(card) await openWorkerProfile(card.dataset.workerId);});
    view.querySelector('#directoryResults').addEventListener('keydown',async e=>{if(e.key==='Enter'||e.key===' '){const card=e.target.closest('[data-worker-id]');if(card){e.preventDefault();await openWorkerProfile(card.dataset.workerId);}}});
    return view;
}
export async function openMunicipioDirectory(){const view=ensureDirectoryView();if(!view)return;document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));view.classList.remove('hidden');await loadMunicipios();}
async function loadMunicipios(){const select=document.getElementById('directoryMunicipio'),list=document.getElementById('directoryResults');if(!select||!list)return;list.innerHTML='<p class="directory-state">Cargando trabajadores…</p>';try{const municipios=await apiFetch('/discovery/directory/municipios');select.innerHTML='<option value="">Selecciona un municipio</option>'+municipios.map(m=>`<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');if(municipios.length){select.value=municipios[0];await loadDirectoryResults();}else list.innerHTML='<p class="directory-state">Todavía no hay trabajadores con perfil activo.</p>';}catch(err){list.innerHTML='<p class="directory-state">No pudimos cargar los municipios. Inténtalo de nuevo.</p>';notify('No se pudo cargar el directorio.','error');}}
function workerCard(item){
    const rating=Number(item.rating||0).toFixed(1);
    const price=item.precio_hora!=null ? `${escapeHtml(String(item.precio_hora))} CUP/h` : 'Precio a consultar';
    const zone=item.zona ? escapeHtml(item.zona) : 'Zona no especificada';
    const category=item.categoria_nombre ? `${escapeHtml(item.categoria_icono||'🛠')} ${escapeHtml(item.categoria_nombre)}` : 'Profesional';
    return `<article class="directory-item" data-worker-id="${escapeHtml(String(item.id))}" role="button" tabindex="0" aria-label="Ver perfil de ${escapeHtml(item.nombre||'trabajador')}">
      <div class="directory-item__top"><strong>${escapeHtml(item.nombre||'Trabajador')}</strong>${item.verificado?'<span class="directory-item__verified">✓ Verificado</span>':''}</div>
      <div class="directory-item__category">${category}</div>
      ${item.descripcion_trabajador?`<p class="directory-item__description">${escapeHtml(item.descripcion_trabajador)}</p>`:''}
      <div class="directory-item__meta">
        <span>⭐ ${rating}</span><span>💰 ${price}</span><span>📍 ${zone}</span>
      </div>
      <span class="directory-item__action">Ver perfil <span aria-hidden="true">→</span></span>
    </article>`;
}
async function loadDirectoryResults(){const select=document.getElementById('directoryMunicipio'),list=document.getElementById('directoryResults');if(!select||!list||!select.value)return;list.innerHTML='<p class="directory-state">Buscando trabajadores…</p>';try{const items=await apiFetch(`/discovery/directory?municipio=${encodeURIComponent(select.value)}`);if(!items.length){list.innerHTML='<p class="directory-state">No hay trabajadores disponibles en este municipio.</p>';return;}list.innerHTML=items.map(workerCard).join('');}catch(err){list.innerHTML='<p class="directory-state">No pudimos cargar los trabajadores.</p>';}}
async function openWorkerProfile(id){try{const w=await apiFetch(`/users/public/${encodeURIComponent(id)}`);const details=[w.verificado?'✓ Cuenta verificada':null,w.categoria_nombre?`${w.categoria_icono||'🛠'} ${w.categoria_nombre}`:'Profesional',w.descripcion_trabajador||'Sin descripción profesional.',`⭐ ${Number(w.rating||0).toFixed(1)}`,w.precio_hora!=null?`💰 ${w.precio_hora} CUP/h`:null,w.municipio?`📍 ${w.municipio}${w.zona?` · ${w.zona}`:''}`:null].filter(Boolean).join('\n\n');await showConfirm({title:w.nombre||'Perfil del trabajador',message:details,confirmLabel:'Cerrar',cancelLabel:'Cerrar'});}catch(err){notify(err?.message||'No se pudo cargar el perfil del trabajador.','error');}}
export function initDirectory(){ensureDirectoryView();}
export { hideDirectory };
