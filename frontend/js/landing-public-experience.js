import { apiFetch, escapeHtml } from './core.js';
import { showLogin } from './auth.js';

const STYLE_ID = 'servicuba-public-landing-experience';

function clearExpiredToken() {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload?.exp && Date.now() >= Number(payload.exp) * 1000) localStorage.removeItem('token');
    } catch {}
}
clearExpiredToken();

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .landing-public-explore{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;max-width:360px;margin:10px auto 0;padding:6px;background:none;border:0;font-family:var(--font-body);font-size:12.5px;font-weight:600;color:var(--copper);cursor:pointer}.landing-public-explore:hover{text-decoration:underline}.landing-public-explore .icon{width:14px;height:14px}.landing-public-directory{width:100%;max-width:760px;margin:16px auto 0}.landing-public-directory .modal-card{max-height:82vh;overflow:auto}.landing-public-directory__hint{margin:0 0 10px;color:var(--muted);font-size:.78rem}
        .public-header-nav{display:none}
        @media (min-width:761px){body:has(#landing:not(.hidden)) .app-shell{max-width:none;width:100%;min-height:100vh}body:has(#landing:not(.hidden)) .app-main{padding:0}body:has(#landing:not(.hidden)) .app-header{width:100%;padding:15px max(28px,calc((100vw - 1160px)/2));gap:32px;justify-content:flex-start}body:has(#landing:not(.hidden)) .app-header__brand{flex:0 0 auto;gap:10px}body:has(#landing:not(.hidden)) .logo-mark{width:32px;height:32px}body:has(#landing:not(.hidden)) .app-header__wordmark{font-size:24px;letter-spacing:.015em}body:has(#landing:not(.hidden)) #user-menu-guest{margin-left:auto}.public-header-nav{display:flex;align-items:center;gap:22px;flex:1}.public-header-nav button{appearance:none;border:0;background:none;color:rgba(255,255,255,.76);font:600 12px var(--font-body);cursor:pointer;padding:7px 0;white-space:nowrap}.public-header-nav button:hover{color:var(--accent)}body:has(#landing:not(.hidden)) #landing.landing-product{padding-top:72px;padding-bottom:70px}body:has(#landing:not(.hidden)) .landing-product__grid{gap:72px}body:has(#landing:not(.hidden)) .landing-product__activity{padding-left:34px}body:has(#landing:not(.hidden)) .landing-product__title{font-size:clamp(54px,6.4vw,82px);max-width:760px}body:has(#landing:not(.hidden)) .landing-product__mechanism{max-width:680px;font-size:19px}body:has(#landing:not(.hidden)) .landing-product__roles{margin-top:58px}}
        @media(max-width:760px){.public-header-nav{display:none!important}}
    `;
    document.head.appendChild(style);
}

function getLanding(){return document.getElementById('landing')}
const ICON_LOCATION='<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.3"/></svg>';

function ensurePublicChrome(){
    const header=document.querySelector('.app-header');const brand=header?.querySelector('.app-header__brand');
    if(!header||!brand||header.querySelector('.public-header-nav'))return;
    const nav=document.createElement('nav');nav.className='public-header-nav';nav.setAttribute('aria-label','Navegación pública');
    nav.innerHTML='<button type="button" data-public-nav="buscar">Buscar servicios</button><button type="button" data-public-nav="actividad">Actividad</button><button type="button" data-public-nav="trabajo">Busco trabajo</button><button type="button" data-public-nav="municipio">Por municipio</button>';
    brand.after(nav);
    nav.addEventListener('click',e=>{const target=e.target.closest('[data-public-nav]')?.dataset.publicNav;const landing=getLanding();if(!target||!landing||landing.classList.contains('hidden'))return;if(target==='buscar')landing.querySelector('#heroSearchInput')?.focus();if(target==='actividad')landing.querySelector('#landingLiveFeed')?.scrollIntoView({behavior:'smooth',block:'center'});if(target==='trabajo')landing.querySelector('#landingWorkerLink')?.click();if(target==='municipio')landing.querySelector('#browseByMunicipioBtn,#landingPublicDirectoryBtn')?.click()});
}

function consolidateHeadline(){const landing=getLanding();if(landing?.classList.contains('landing-product'))return;const title=landing?.querySelector('.view-title');if(title)title.textContent='Tus problemas, mis soluciones.'}
function injectExploreLink(){const landing=getLanding();if(!landing||landing.classList.contains('landing-product')||landing.querySelector('.landing-public-explore'))return;const search=landing.querySelector('.hero-search');if(!search)return;const link=document.createElement('button');link.type='button';link.id='landingPublicDirectoryBtn';link.className='landing-public-explore';link.innerHTML=`${ICON_LOCATION}<span>Ver directorio por municipio — sin GPS, sin registrarte</span>`;search.after(link);link.addEventListener('click',openMunicipioDirectory)}

async function openMunicipioDirectory(){
 const overlay=document.createElement('div');overlay.className='modal-overlay landing-public-directory';const modal=document.createElement('div');modal.className='modal-card';modal.innerHTML='<h2 class="modal-title">Explorar sin GPS</h2><p class="modal-message">Elige un municipio para ver servicios públicos. No necesitamos tu ubicación ni tu cuenta.</p><p class="landing-public-directory__hint">Municipio</p><input id="publicMunicipioInput" class="field-input" placeholder="Ej: Plaza, Playa, Centro Habana…"><select id="publicMunicipioTipo" class="field-input mt-sm"><option value="oferta">Servicios ofrecidos</option><option value="necesidad">Tareas publicadas</option></select><div id="publicMunicipioResults" class="stack-sm mt-md"></div><div class="modal-actions"><button type="button" class="btn btn-ghost" id="publicMunicipioClose">Cerrar</button></div>';overlay.appendChild(modal);document.body.appendChild(overlay);const input=modal.querySelector('#publicMunicipioInput'),tipo=modal.querySelector('#publicMunicipioTipo'),results=modal.querySelector('#publicMunicipioResults'),close=()=>overlay.remove();modal.querySelector('#publicMunicipioClose').addEventListener('click',close);overlay.addEventListener('click',e=>{if(e.target===overlay)close()});let timer=null;const load=async()=>{const municipio=input.value.trim();if(municipio.length<2){results.innerHTML='<p class="empty-state">Escribe al menos 2 letras del municipio.</p>';return}results.innerHTML='<p class="empty-state">Buscando opciones públicas…</p>';try{const data=await apiFetch(`/discovery/directory?municipio=${encodeURIComponent(municipio)}&tipo=${encodeURIComponent(tipo.value)}`);const items=Array.isArray(data)?data:[];if(!items.length){results.innerHTML='<p class="empty-state">No encontramos publicaciones públicas en ese municipio todavía.</p>';return}results.innerHTML=items.slice(0,20).map(item=>`<article class="task-card"><div class="task-card__row"><h3 class="task-card__title">${item.destacada?'★ ':''}${escapeHtml(item.titulo)}</h3></div><p class="task-card__meta">${escapeHtml(item.municipio||municipio)} · ${escapeHtml(item.categoria_nombre||'Servicio')}</p><p class="task-card__description">${escapeHtml(item.descripcion||'Consulta los detalles al contactar.')}</p><button type="button" class="btn btn-primary btn-block" data-public-login>Crear cuenta para contactar</button></article>`).join('')}catch(err){results.innerHTML=`<p class="empty-state">No pudimos cargar el directorio ahora. ${escapeHtml(err.message||'')}</p>`}};input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(load,350)});tipo.addEventListener('change',load);results.addEventListener('click',e=>{if(!e.target.closest('[data-public-login]'))return;close();showLogin()});input.focus();
}

export function initLandingPublicExperience(){injectStyles();ensurePublicChrome();consolidateHeadline();injectExploreLink()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initLandingPublicExperience,{once:true});else initLandingPublicExperience();
