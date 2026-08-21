// ============================================================
// Landing: mecanismo real de ServiCuba + descubrimiento público.
// ============================================================
import { apiFetch, escapeHtml, notify } from './core.js';
import { showLogin, showRegister } from './auth.js';
import { showDashboardCliente } from './tasks.js';
import { getLocationWithFallback } from './location.js';

let categoriesCache = null;
let countsCache = null;
let initialized = false;
let pendingSearchApplied = false;

function normalize(str) { return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function pluralize(n, singular, plural) { return n === 1 ? singular : plural; }
function timeAgo(iso) {
    if (!iso) return '';
    const diffMs = Math.max(0, Date.now() - new Date(iso).getTime());
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'justo ahora';
    if (mins < 60) return `hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs} h`;
    return `hace ${Math.floor(mins / 1440)} d`;
}
function freshnessMinutes(iso) {
    if (!iso) return Infinity;
    const timestamp = new Date(iso).getTime();
    if (!Number.isFinite(timestamp)) return Infinity;
    return Math.floor((Date.now() - timestamp) / 60000);
}

function ensureLandingStyles() {
    if (document.getElementById('servicuba-landing-product-style')) return;
    const style = document.createElement('style');
    style.id = 'servicuba-landing-product-style';
    style.textContent = `
#landing.landing-product{max-width:1100px;margin:0 auto;padding:38px 24px 56px;display:block;text-align:left}
.landing-product__grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(330px,.85fr);gap:48px;align-items:start}
.landing-product__intro{min-width:0}
.landing-product__eyebrow{display:flex;align-items:center;gap:8px;margin:0 0 14px;font:700 11px var(--font-body);letter-spacing:.12em;text-transform:uppercase;color:var(--copper)}
.landing-product__eyebrow:before{content:'';width:26px;height:1px;background:var(--copper)}
.landing-product__title{display:block;width:100%;max-width:720px;min-width:0;margin:0;color:var(--ink);font-family:var(--font-display);font-size:clamp(42px,6vw,76px);line-height:.9;letter-spacing:.01em;text-wrap:balance;white-space:normal;word-break:normal;overflow-wrap:normal}
.landing-product__title span{display:block;color:var(--copper)}
.landing-product__mechanism{max-width:650px;margin:22px 0 8px;color:var(--ink);font-size:clamp(17px,2vw,21px);line-height:1.45}
.landing-product__proof{display:flex;align-items:center;gap:8px;margin:12px 0 26px;font-size:13px;color:var(--muted)}
.landing-product__proof strong{color:var(--ink)}
.landing-product__actions{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:22px}
.landing-product__primary{width:auto!important;min-width:230px}
.landing-product__login{border:0;background:none;color:var(--copper);font:700 13px var(--font-body);cursor:pointer;padding:10px 4px}
.landing-product__worker{display:inline-flex;align-items:center;gap:6px;margin-top:18px;color:var(--muted);font-size:13px;font-weight:600;text-decoration:none}
.landing-product__worker:hover{color:var(--copper);text-decoration:underline}
.landing-product__worker .icon{width:15px;height:15px}
.landing-product__search{margin-top:28px;max-width:650px}
.landing-product__search-label{margin:0 0 7px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.landing-product__activity{border-left:1px solid var(--line);padding-left:26px;min-width:0;min-height:280px}
.landing-product__activity-label{display:flex;align-items:center;gap:8px;margin:0 0 12px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.landing-product__activity-label .live-dot{width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:var(--success);animation:servicuba-live-pulse 1.8s ease-in-out infinite}
@keyframes servicuba-live-pulse{0%,100%{opacity:1}50%{opacity:.35}}
.landing-product__activity-list{border-top:1px solid var(--line)}
.landing-product__activity-item{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:baseline;padding:13px 0;border-bottom:1px solid var(--line);font-size:13px}
.landing-product__activity-icon{font-size:14px;line-height:1}
.landing-product__activity-main{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink)}
.landing-product__activity-time{white-space:nowrap;font:500 10px var(--font-mono);color:var(--muted)}
.landing-product__activity-empty{padding:18px 0;color:var(--muted);font-size:13px;line-height:1.5}
.landing-product__roles{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line);margin-top:46px;border:1px solid var(--line)}
.landing-product__role{background:var(--paper-raised);padding:22px 24px}
.landing-product__role:first-child{border-left:3px solid var(--accent)}
.landing-product__role:last-child{border-left:3px solid var(--copper)}
.landing-product__role-kicker{margin:0 0 7px;font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.landing-product__role-title{margin:0 0 6px;font:800 24px/1 var(--font-display);color:var(--ink)}
.landing-product__role-text{margin:0;color:var(--muted);font-size:13px;line-height:1.45}
.landing-product__directory{display:inline-flex;align-items:center;gap:6px;margin-top:12px;border:0;background:none;padding:5px 0;color:var(--copper);font:600 12px var(--font-body);cursor:pointer}
.landing-product__directory .icon{width:14px;height:14px}
@media (min-width:761px){
    #landing.landing-product{
        position:relative;
        left:50%;
        width:calc(100vw - 32px);
        max-width:1100px;
        margin-left:0;
        margin-right:0;
        transform:translateX(-50%);
    }
    .landing-product__grid{grid-template-columns:minmax(0,1.15fr) minmax(330px,.85fr)}
    .landing-product__intro{flex:1 1 auto;min-width:0}
}
@media(max-width:760px){#landing.landing-product{padding:26px 16px 40px}.landing-product__grid{grid-template-columns:1fr;gap:30px}.landing-product__title{font-size:48px}.landing-product__activity{border-left:0;border-top:1px solid var(--line);padding:24px 0 0}.landing-product__roles{grid-template-columns:1fr;margin-top:32px}.landing-product__role{padding:18px 20px}.landing-product__actions{align-items:stretch;flex-direction:column}.landing-product__primary{width:100%!important}.landing-product__login{align-self:flex-start}.landing-product__activity-item{grid-template-columns:auto minmax(0,1fr)}.landing-product__activity-time{grid-column:2}}
`;
    document.head.appendChild(style);
}

function makeIcon(type) {
    const icons = {
        worker:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2-2 2.5-2.5Z"/></svg>',
        location:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.3"/></svg>',
        arrow:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>'
    };
    return icons[type] || '';
}

function openLoginWithWorkerIntent() {
    sessionStorage.setItem('servicuba_intent','trabajador');
    showLogin();
}

async function openPublicTasks() {
    const location = await getLocationWithFallback();
    if (!location) { notify('Para ver tareas cercanas necesitamos tu ubicación. También puedes iniciar sesión y completar tu zona después.','info'); return; }
    try {
        const response = await apiFetch(`/discovery/tasks?lat=${encodeURIComponent(location.lat)}&lng=${encodeURIComponent(location.lng)}&radius_km=10`);
        const items = Array.isArray(response) ? response : [];
        const overlay = document.createElement('div'); overlay.className = 'modal-overlay';
        const modal = document.createElement('div'); modal.className = 'modal-card';
        modal.innerHTML = `<h2 class="modal-title">Tareas cerca de ti</h2><p class="modal-message">${items.length ? `${items.length} necesidad${items.length === 1 ? '' : 'es'} publicada${items.length === 1 ? '' : 's'} cerca.` : 'No hay tareas activas en este radio ahora mismo.'}</p>`;
        const list = document.createElement('div'); list.className = 'stack-sm';
        items.slice(0,12).forEach(item => { const row=document.createElement('div'); row.className='task-card'; row.innerHTML=`<div class="task-card__row"><h3 class="task-card__title">${escapeHtml(item.titulo || 'Nueva tarea')}</h3>${item.precio != null ? `<span class="task-card__price">$${escapeHtml(String(item.precio))}</span>` : ''}</div><p class="task-card__meta">${escapeHtml(item.distancia_km != null ? `${item.distancia_km} km` : 'Cerca de ti')} · ${timeAgo(item.created_at)}</p>`; list.appendChild(row); });
        modal.appendChild(list);
        const actions=document.createElement('div'); actions.className='modal-actions'; const login=document.createElement('button'); login.className='btn btn-accent'; login.textContent='Iniciar sesión para postularme'; const close=document.createElement('button'); close.className='btn btn-ghost'; close.textContent='Cerrar'; actions.append(login,close); modal.appendChild(actions);
        overlay.appendChild(modal); document.body.appendChild(overlay);
        close.addEventListener('click',()=>overlay.remove()); overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove()}); login.addEventListener('click',()=>{overlay.remove();openLoginWithWorkerIntent()});
    } catch(err) { notify(`No pudimos cargar las tareas cercanas: ${err.message}`,'error'); }
}

function buildProductLanding() {
    const landing=document.getElementById('landing');
    if(!landing || landing.dataset.productLanding==='1') return;
    ensureLandingStyles(); landing.dataset.productLanding='1'; landing.classList.remove('view--centered'); landing.classList.add('landing-product');
    landing.innerHTML=`<div class="landing-product__grid"><section class="landing-product__intro"><p class="landing-product__eyebrow">Servicios locales que conectan</p><h2 class="landing-product__title">¿Se te rompió algo?<span>Publícalo.</span></h2><p class="landing-product__mechanism">Cuenta qué necesitas, indica tu zona y deja que trabajadores cercanos encuentren tu publicación. Hablan dentro de ServiCuba y acuerdan el trabajo directamente.</p><p id="heroWorkerCount" class="landing-product__proof">Buscando trabajadores disponibles…</p><div class="landing-product__actions"><button id="registerBtn" class="btn btn-accent landing-product__primary">Publicar lo que necesito</button><button id="loginBtn2" class="landing-product__login">Ya tengo cuenta</button></div><a href="#" id="landingWorkerLink" class="landing-product__worker">${makeIcon('worker')} ¿Buscas trabajo? Mira las tareas cerca de ti ${makeIcon('arrow')}</a><div class="landing-product__search"><p class="landing-product__search-label">¿Prefieres buscar directamente?</p><div class="hero-search"><input type="text" id="heroSearchInput" class="field-input" placeholder="Electricista, plomero, albañil…" autocomplete="off"><div id="heroSearchResults" class="hero-search__results hidden"></div></div><button type="button" id="browseByMunicipioBtn" class="landing-product__directory">${makeIcon('location')} Ver servicios por municipio, sin GPS ni registro ${makeIcon('arrow')}</button></div></section><aside class="landing-product__activity" id="landingLiveFeed"><p class="landing-product__activity-label" id="liveFeedLabel"><span class="live-dot"></span>Actividad reciente en ServiCuba</p><div id="liveFeedList" class="landing-product__activity-list"></div><p id="liveFeedEmpty" class="landing-product__activity-empty hidden">Todavía no hay suficiente actividad reciente para mostrarla aquí. Cuando haya movimiento real, aparecerá en este espacio.</p></aside></div><section class="landing-product__roles" aria-label="Dos formas de usar ServiCuba"><div class="landing-product__role"><p class="landing-product__role-kicker">Para quien necesita ayuda</p><h3 class="landing-product__role-title">Publica una necesidad</h3><p class="landing-product__role-text">Describe el problema, señala tu zona y recibe contacto de trabajadores que pueden resolverlo.</p></div><div class="landing-product__role"><p class="landing-product__role-kicker">Para quien ofrece un oficio</p><h3 class="landing-product__role-title">Encuentra trabajo cerca</h3><p class="landing-product__role-text">Explora tareas por distancia y categoría, revisa lo que necesitan y postúlate cuando te interese.</p></div></section>`;
    document.getElementById('registerBtn')?.addEventListener('click',showRegister);
    document.getElementById('loginBtn2')?.addEventListener('click',showLogin);
    document.getElementById('landingWorkerLink')?.addEventListener('click',e=>{e.preventDefault();openPublicTasks()});
}

function renderLiveFeed(items) {
    buildProductLanding();
    const container=document.getElementById('liveFeedList'),label=document.getElementById('liveFeedLabel'),empty=document.getElementById('liveFeedEmpty');
    if(!container)return;
    const safeItems=Array.isArray(items)?items:[];
    const mostRecentMins=safeItems.length?freshnessMinutes(safeItems[0].created_at):Infinity;
    const isTrulyLive=safeItems.length>=2 && mostRecentMins<60*24*3;
    if(!isTrulyLive){container.innerHTML='';label?.classList.add('hidden');empty?.classList.remove('hidden');return;}
    label?.classList.remove('hidden');empty?.classList.add('hidden');
    if(label)label.innerHTML=`<span class="live-dot"></span>${mostRecentMins<60?'Esto está pasando ahora mismo':'Actividad reciente en ServiCuba'}`;
    container.innerHTML=safeItems.slice(0,5).map(item=>{const verbo=item.tipo==='oferta'?'Ofrece':'Busca';const icono=item.categoria_icono?escapeHtml(item.categoria_icono):'';const titulo=escapeHtml(item.titulo||'Nueva publicación');const municipio=item.municipio?` · ${escapeHtml(item.municipio)}`:'';return `<div class="landing-product__activity-item"><span class="landing-product__activity-icon">${icono}</span><span class="landing-product__activity-main"><strong>${verbo}:</strong> ${titulo}${municipio}</span><span class="landing-product__activity-time">${timeAgo(item.created_at)}</span></div>`}).join('');
}

function applyPendingCategorySearch(){if(pendingSearchApplied)return true;const categoryId=sessionStorage.getItem('heroSelectedCategoriaId');if(!categoryId)return false;const select=document.getElementById('filtroCategoriaOfertas'),offersTab=document.querySelector('.sub-tab[data-clientetab="ofertas"]');if(!select||!offersTab)return false;const option=Array.from(select.options).find(o=>String(o.value)===String(categoryId));if(!option)return false;select.value=String(categoryId);pendingSearchApplied=true;sessionStorage.removeItem('heroSelectedCategoriaId');sessionStorage.removeItem('heroSelectedCategoriaNombre');offersTab.click();select.dispatchEvent(new Event('change',{bubbles:true}));return true}

function ensureAuthenticatedSearch(){const dashboard=document.getElementById('dashboardCliente')||document.getElementById('dashboardTrabajador');if(!dashboard)return null;const existing=document.getElementById('heroSearchInputAuth');if(existing){const wrapper=existing.closest('.hero-search--dashboard'),tabs=dashboard.querySelector('.sub-tabs');if(wrapper&&tabs&&wrapper.parentNode!==dashboard)tabs.parentNode.insertBefore(wrapper,tabs);return existing}const tabs=dashboard.querySelector('.sub-tabs');if(!tabs)return null;const wrapper=document.createElement('div');wrapper.className='hero-search hero-search--dashboard';wrapper.innerHTML='<input type="text" id="heroSearchInputAuth" class="field-input" placeholder="Buscar un oficio: plomero, electricista, albañil…" autocomplete="off"><div id="heroSearchResultsAuth" class="hero-search__results hidden"></div>';tabs.parentNode.insertBefore(wrapper,tabs);return wrapper.querySelector('#heroSearchInputAuth')}

async function showPublicCategoryResults(categoryId,categoryName){const location=await getLocationWithFallback();if(!location){notify('No pudimos usar tu ubicación. Puedes explorar por municipio sin compartir GPS.','info');document.getElementById('browseByMunicipioBtn')?.click();return}let results;try{results=await apiFetch(`/discovery/offers?lat=${encodeURIComponent(location.lat)}&lng=${encodeURIComponent(location.lng)}&radius_km=10&category_id=${encodeURIComponent(categoryId)}`)}catch(err){notify(`No pudimos buscar servicios de ${categoryName}: ${err.message}`,'error');return}const items=Array.isArray(results)?results:[];const overlay=document.createElement('div');overlay.className='modal-overlay';const modal=document.createElement('div');modal.className='modal-card';const heading=document.createElement('h2');heading.className='modal-title';heading.textContent=`${categoryName} cerca de ti`;modal.appendChild(heading);const subtitle=document.createElement('p');subtitle.className='modal-message';
    // El badge "N disponibles" del buscador cuenta perfiles registrados en
    // TODO el pais (GET /users/stats/workers-count); esta busqueda solo
    // muestra servicios YA PUBLICADOS dentro de 10 km. Son cosas distintas,
    // asi que 0 resultados aqui no contradice ese numero -- pero dejar al
    // usuario en un callejon sin salida si es un mal cierre. Se ofrece la
    // alternativa que SI cubre todo el pais: el directorio por municipio
    // (sin limite de radio).
    subtitle.textContent=items.length?`${items.length} servicio${items.length===1?'':'s'} encontrado${items.length===1?'':'s'} dentro de 10 km. Inicia sesión para contactar al trabajador.`:'No encontramos servicios de este oficio publicados dentro de 10 km de tu ubicación. Puede haber profesionales en otras zonas del país — prueba el directorio por municipio, sin límite de distancia.';modal.appendChild(subtitle);const list=document.createElement('div');list.className='stack-sm';if(items.length)items.slice(0,20).forEach(t=>{const row=document.createElement('div');row.className='task-card';row.innerHTML=`<div class="task-card__row"><h3 class="task-card__title">${t.destacada?'★ ':''}${escapeHtml(t.titulo)}</h3><span class="task-card__price">$${escapeHtml(String(t.precio??0))}</span></div><p class="task-card__meta"><span class="chip">${escapeHtml(String(t.distancia_km??''))} km</span></p><button type="button" class="btn btn-primary btn-block" data-action="login">Iniciar sesión para contactar</button>`;list.appendChild(row)});modal.appendChild(list);const actions=document.createElement('div');actions.className='modal-actions';
    if(!items.length){const directoryBtn=document.createElement('button');directoryBtn.type='button';directoryBtn.className='btn btn-accent';directoryBtn.textContent='Ver por municipio (sin límite de distancia)';actions.appendChild(directoryBtn);directoryBtn.addEventListener('click',()=>{close();document.getElementById('browseByMunicipioBtn')?.click();});}
    const closeBtn=document.createElement('button');closeBtn.type='button';closeBtn.className='btn btn-ghost';closeBtn.textContent='Cerrar';actions.appendChild(closeBtn);modal.appendChild(actions);overlay.appendChild(modal);document.body.appendChild(overlay);const close=()=>overlay.remove();closeBtn.addEventListener('click',close);overlay.addEventListener('click',e=>{if(e.target===overlay)close()});list.addEventListener('click',e=>{if(!e.target.closest('[data-action="login"]'))return;close();showLogin()})}

function bindSearch(input,resultsBox){if(!input||!resultsBox||input.dataset.searchBound==='1')return;input.dataset.searchBound='1';const renderResults=query=>{if(!categoriesCache)return;const q=normalize(query.trim());if(!q){resultsBox.classList.add('hidden');resultsBox.innerHTML='';return}const matches=categoriesCache.filter(c=>normalize(c.nombre).includes(q));if(!matches.length){resultsBox.innerHTML='<p class="empty-state">No encontramos ese oficio todavía.</p>';resultsBox.classList.remove('hidden');return}resultsBox.innerHTML=matches.slice(0,6).map(c=>{const count=(countsCache?.por_categoria&&countsCache.por_categoria[String(c.id)])||0;return `<button type="button" class="hero-search__item" data-cat-id="${c.id}" data-cat-nombre="${escapeHtml(c.nombre)}"><span class="hero-search__item-icon">${c.icono?escapeHtml(c.icono):''}</span><span class="hero-search__item-text"><span class="hero-search__item-name">${escapeHtml(c.nombre)}</span><span class="hero-search__item-count">${count} ${pluralize(count,'disponible','disponibles')}</span></span></button>`}).join('');resultsBox.classList.remove('hidden');resultsBox.querySelectorAll('.hero-search__item').forEach(btn=>btn.addEventListener('click',async()=>{const categoryId=String(btn.dataset.catId),categoryName=btn.dataset.catNombre;sessionStorage.setItem('heroSelectedCategoriaId',categoryId);sessionStorage.setItem('heroSelectedCategoriaNombre',categoryName);resultsBox.classList.add('hidden');input.value='';const token=localStorage.getItem('token');if(token){try{await apiFetch('/users/profile');const clientModeBtn=document.querySelector('.mode-switch__btn[data-modo="cliente"]');if(clientModeBtn&&!clientModeBtn.classList.contains('is-active')){clientModeBtn.click();await new Promise(resolve=>setTimeout(resolve,50))}showDashboardCliente();pendingSearchApplied=false;if(!applyPendingCategorySearch()){setTimeout(applyPendingCategorySearch,50);setTimeout(applyPendingCategorySearch,250);setTimeout(applyPendingCategorySearch,1000)}notify(`Mostrando servicios de ${categoryName}.`,'info');return}catch{}}await showPublicCategoryResults(categoryId,categoryName)}))};input.addEventListener('input',()=>renderResults(input.value));input.addEventListener('focus',()=>renderResults(input.value));resultsBox.addEventListener('click',e=>e.stopPropagation());document.addEventListener('click',e=>{if(e.target===input||resultsBox.contains(e.target))return;resultsBox.classList.add('hidden')})}

export async function initLandingSearch(){buildProductLanding();const input=document.getElementById('heroSearchInput'),resultsBox=document.getElementById('heroSearchResults'),countEl=document.getElementById('heroWorkerCount');try{const [cats,stats,activity]=await Promise.all([apiFetch('/categories'),apiFetch('/users/stats/workers-count'),apiFetch('/discovery/recent-activity').catch(()=>[])]);categoriesCache=cats;countsCache=stats;renderLiveFeed(activity);if(countEl)countEl.innerHTML=stats.total>0?`<strong>${stats.total}</strong> ${pluralize(stats.total,'trabajador disponible','trabajadores disponibles')} ahora mismo`:'Publica tu necesidad y recibe postulaciones en minutos.'}catch{if(countEl)countEl.textContent='Publica tu necesidad y recibe postulaciones en minutos.';return}bindSearch(input,resultsBox);ensureAuthenticatedSearch();bindSearch(document.getElementById('heroSearchInputAuth'),document.getElementById('heroSearchResultsAuth'));applyPendingCategorySearch();if(initialized)return;initialized=true;const observerTarget=document.getElementById('views');if(!observerTarget)return;const observer=new MutationObserver(()=>{const authInputNow=ensureAuthenticatedSearch();bindSearch(authInputNow,document.getElementById('heroSearchResultsAuth'));applyPendingCategorySearch()});observer.observe(observerTarget,{subtree:true,childList:true})}