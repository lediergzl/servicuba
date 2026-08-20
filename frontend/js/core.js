// ============================================================
// Núcleo compartido: fetch autenticado, UI (toasts/modales), geolocalización.
// Optimizado para conexiones lentas: timeout, deduplicación, caché y fotos ligeras.
// ============================================================
import { isNativeApp, nativeGetCurrentPosition } from './native.js';
export const API_BASE = '/api';
export function escapeHtml(str){const d=document.createElement('div');d.textContent=str??'';return d.innerHTML;}
function getAnonymousEntitlements(){return{plan:'gratis',plan_expira:null,es_cliente:false,es_trabajador:false,can_discover:true,can_contact:false,can_apply:false,can_publish_need:false,can_publish_service:false,services_daily_limit:0,max_radius_km:null,can_publish_ads:false,ads_daily_limit:0,priority_notifications:false,anonymous:true};}

const inflightGetRequests=new Map();
const responseCache=new Map();
const CACHE_TTL={
    '/applications/mine':15000,
    '/categories':300000,
    '/users/me':30000,
    '/users/profile':60000,
    '/users/entitlements':30000
};
function cacheTtl(path){const base=path.split('?')[0];return CACHE_TTL[base]||0;}
function cacheKey(url,token){return `${token||'anon'}:${url}`;}
function getCached(path,token=localStorage.getItem('token')){const key=cacheKey(`${API_BASE}${path}`,token),cached=responseCache.get(key);return cached&&cached.expires>Date.now()?cached.data:null;}
function putCached(path,data,ttl=cacheTtl(path),token=localStorage.getItem('token')){if(!ttl)return;responseCache.set(cacheKey(`${API_BASE}${path}`,token),{data,expires:Date.now()+ttl});}
function createTimeoutSignal(options,timeoutMs){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(new DOMException('Tiempo de espera agotado','TimeoutError')),timeoutMs);
    const external=options.signal;
    const abortExternal=()=>controller.abort(external?.reason||new DOMException('Solicitud cancelada','AbortError'));
    if(external){if(external.aborted)abortExternal();else external.addEventListener('abort',abortExternal,{once:true});}
    return{signal:controller.signal,cleanup(){clearTimeout(timer);external?.removeEventListener('abort',abortExternal);}};
}
async function requestApi(url,headers,options,method){
    const timeoutMs=Number(options.timeoutMs)||(method==='GET'?15000:30000);
    const {signal,cleanup}=createTimeoutSignal(options,timeoutMs);
    try{return await fetch(url,{...options,headers,signal});}
    finally{cleanup();}
}
export async function apiFetch(path,options={}){
    const token=localStorage.getItem('token'),method=(options.method||'GET').toUpperCase();
    if(!token&&method==='GET'&&path==='/users/entitlements')return getAnonymousEntitlements();
    const headers={...(options.body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{ }),...options.headers},url=`${API_BASE}${path}`;
    const key=cacheKey(url,token),ttl=method==='GET'&&!options.signal&&!options.cacheBypass?cacheTtl(path):0;
    if(ttl){const cached=responseCache.get(key);if(cached&&cached.expires>Date.now())return cached.data;}
    const perform=async()=>{
        let res;
        try{res=await requestApi(url,headers,options,method);}
        catch(networkError){
            if(networkError?.name==='AbortError'||networkError?.name==='TimeoutError')throw networkError;
            console.error('[ServiCuba API] Network error',{url,method,networkError});
            throw new Error('No se pudo conectar con el servidor. Revisa tu conexión.');
        }
        if(res.status===401){if(token){localStorage.removeItem('token');responseCache.clear();notify('Tu sesión expiró. Inicia sesión de nuevo.','error');document.dispatchEvent(new CustomEvent('auth:expired'));}throw new Error('No autorizado');}
        let data=null;const ct=res.headers.get('content-type')||'';if(ct.includes('application/json'))data=await res.json().catch(()=>null);
        if(!res.ok){const detail=data?.detail,validation=Array.isArray(detail)?detail.map(i=>({location:i.loc?.join('.')||'unknown',message:i.msg,type:i.type,input:i.input})):null;
            if(!(options.silentStatuses||[]).includes(res.status)){console.error('[ServiCuba API] Request failed',{url,status:res.status,method,response:data,validation});}
            if(res.status===422&&validation?.length)throw new Error(`Solicitud inválida en ${validation.map(v=>`${v.location}: ${v.message}`).join('; ')}`);
            throw new Error(typeof detail==='string'?detail:`Error ${res.status}`);
        }
        if(ttl)responseCache.set(key,{data,expires:Date.now()+ttl});
        if(method!=='GET')responseCache.clear();
        return data;
    };
    if(method==='GET'&&!options.signal){const running=inflightGetRequests.get(key);if(running)return running;const promise=perform().finally(()=>inflightGetRequests.delete(key));inflightGetRequests.set(key,promise);return promise;}
    return perform();
}
export function ensureUiRoot(){let r=document.getElementById('ui-overlay-root');if(r)return r;r=document.createElement('div');r.id='ui-overlay-root';document.body.appendChild(r);const c=document.createElement('div');c.id='toast-container';c.className='toast-container';r.appendChild(c);return r;}
export function notify(message,type='info'){ensureUiRoot();const c=document.getElementById('toast-container'),t=document.createElement('div');t.className=`toast toast--${type}`;t.textContent=message;t.setAttribute('role','status');c.appendChild(t);setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),300);},3500);}
export function showFormModal({title,fields,confirmLabel='Guardar',cancelLabel='Cancelar'}){ensureUiRoot();return new Promise(resolve=>{const o=document.createElement('div'),m=document.createElement('form');o.className='modal-overlay';m.className='modal-card';m.noValidate=true;const h=document.createElement('h2');h.className='modal-title';h.textContent=title;m.appendChild(h);const inputs={};let dirty=false;fields.forEach(f=>{const w=document.createElement('div'),l=document.createElement('label');w.className='field-wrapper';l.className='field-label';l.textContent=f.label;w.appendChild(l);let i;if(f.type==='textarea'){i=document.createElement('textarea');i.rows=3;}else if(f.type==='select'){i=document.createElement('select');(f.options||[]).forEach(x=>{const q=document.createElement('option');q.value=x.value;q.textContent=x.label;i.appendChild(q);});}else{i=document.createElement('input');i.type=f.type||'text';if(f.min!==undefined)i.min=f.min;if(f.step!==undefined)i.step=f.step;}i.className='field-input';if(f.type!=='select')i.placeholder=f.placeholder||'';if(f.required)i.required=true;if(f.value!==undefined)i.value=f.value;const initialValue=i.value;const markDirty=()=>{if(i.value!==initialValue)dirty=true;};i.addEventListener('input',markDirty);i.addEventListener('change',markDirty);const e=document.createElement('p');e.className='field-error hidden';w.append(i,e);inputs[f.name]={input:i,errorMsg:e,field:f};m.appendChild(w);});const a=document.createElement('div'),x=document.createElement('button'),s=document.createElement('button');a.className='modal-actions';x.type='button';x.className='btn btn-ghost';x.textContent=cancelLabel;s.type='submit';s.className='btn btn-primary';s.textContent=confirmLabel;a.append(x,s);m.appendChild(a);o.appendChild(m);document.body.appendChild(o);Object.values(inputs)[0]?.input.focus();const forceClose=v=>{o.remove();document.removeEventListener('keydown',key);resolve(v);};
        // Antes: un click fuera del modal (o Escape, o el propio botón
        // Cancelar) cerraba y descartaba todo lo escrito sin avisar — un
        // click accidental afuera perdía el formulario entero y había que
        // volver a empezar. Ahora, si el usuario ya modificó algo, se pide
        // confirmación explícita antes de tirar los datos.
        let closing=false;
        const attemptClose=async()=>{
            if(closing)return;
            if(dirty){
                closing=true;
                const discard=await showConfirm({title:'¿Descartar este formulario?',message:'Todavía no lo guardaste. Si sales ahora, se pierde lo que escribiste.',confirmLabel:'Descartar',cancelLabel:'Seguir editando',danger:true});
                closing=false;
                if(!discard)return;
            }
            forceClose(null);
        };
        const key=e=>{if(e.key==='Escape')attemptClose();};document.addEventListener('keydown',key);x.onclick=()=>attemptClose();o.onclick=e=>{if(e.target===o)attemptClose();};m.onsubmit=e=>{e.preventDefault();let ok=true;const v={};for(const[n,{input,errorMsg,field}]of Object.entries(inputs)){errorMsg.classList.add('hidden');if(field.type==='select'){v[n]=input.value;continue;}const raw=input.value.trim();if(field.required&&!raw){errorMsg.textContent='Este campo es obligatorio.';errorMsg.classList.remove('hidden');ok=false;continue;}if(field.type==='number'&&raw){const num=parseFloat(raw);if(isNaN(num)||(field.min!==undefined&&num<field.min)){errorMsg.textContent='Debe ser un número válido.';errorMsg.classList.remove('hidden');ok=false;continue;}v[n]=num;}else v[n]=raw;}if(ok)forceClose(v);};});}
export function showConfirm({title,message,confirmLabel='Confirmar',cancelLabel='Cancelar',danger=false}){ensureUiRoot();return new Promise(resolve=>{const o=document.createElement('div'),m=document.createElement('div'),h=document.createElement('h2'),p=document.createElement('p'),a=document.createElement('div'),x=document.createElement('button'),c=document.createElement('button');o.className='modal-overlay';m.className='modal-card';h.className='modal-title';h.textContent=title;m.appendChild(h);if(message){p.className='modal-message';p.textContent=message;m.appendChild(p);}a.className='modal-actions';x.type='button';x.className='btn btn-ghost';x.textContent=cancelLabel;c.type='button';c.className=danger?'btn btn-danger':'btn btn-primary';c.textContent=confirmLabel;a.append(x,c);m.appendChild(a);o.appendChild(m);document.body.appendChild(o);c.focus();const close=v=>{o.remove();resolve(v);};x.onclick=()=>close(false);c.onclick=()=>close(true);o.onclick=e=>{if(e.target===o)close(false);};});}
const KEY='servicuba:lastLocation';function readSavedLocation(){try{const v=JSON.parse(localStorage.getItem(KEY)||'null');return v&&Number.isFinite(Number(v.lat))&&Number.isFinite(Number(v.lng))?{lat:Number(v.lat),lng:Number(v.lng),accuracy:v.accuracy||null,source:v.source||'saved'}:null;}catch{return null;}}function saveLocation(v){localStorage.setItem(KEY,JSON.stringify(v));}function toPosition(v){return{coords:{latitude:v.lat,longitude:v.lng,accuracy:v.accuracy||null},_servicubaSource:v.source||'saved'};}function requestBrowserGeolocation(){return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(new Error('Tu navegador no soporta geolocalización.'));navigator.geolocation.getCurrentPosition(p=>{const v={lat:Number(p.coords.latitude),lng:Number(p.coords.longitude),accuracy:p.coords.accuracy||null,source:'gps'};saveLocation(v);p._servicubaSource='gps';resolve(p);},reject,{enableHighAccuracy:true,timeout:10000,maximumAge:60000});});}
async function recoverGeolocation(error){let e=error;while(true){const saved=readSavedLocation(),r=await showFormModal({title:'Necesitamos tu ubicación',confirmLabel:'Continuar',cancelLabel:'Cancelar',fields:[{name:'action',label:'Cómo quieres continuar',type:'select',required:true,value:saved?'saved':'retry',options:[{value:'retry',label:'Volver a intentar ubicación del navegador'},...(saved?[{value:'saved',label:'Usar última ubicación guardada'}]:[]),{value:'manual',label:'Introducir ubicación manualmente'}]},{name:'lat',label:'Latitud',type:'number',step:'0.000001'},{name:'lng',label:'Longitud',type:'number',step:'0.000001'}]});if(!r)throw e;if(r.action==='saved'&&saved)return toPosition(saved);if(r.action==='manual'){const lat=Number(r.lat),lng=Number(r.lng);if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<-90||lat>90||lng<-180||lng>180){notify('La latitud o longitud no es válida.','error');continue;}const v={lat,lng,accuracy:null,source:'manual'};saveLocation(v);return toPosition(v);}try{return await requestBrowserGeolocation();}catch(x){e=x;notify(`${geolocationErrorMessage(x)} Puedes volver a intentarlo, usar una ubicación guardada o introducirla manualmente.`,'error');}}}
export async function getGeolocation(){const saved=readSavedLocation();if(saved)return toPosition(saved);if(isNativeApp())try{const p=await nativeGetCurrentPosition();if(p?.coords){const v={lat:Number(p.coords.latitude),lng:Number(p.coords.longitude),accuracy:p.coords.accuracy||null,source:'native-gps'};saveLocation(v);return toPosition(v);}}catch(e){console.warn('[ServiCuba] GPS nativo falló; usando navegador:',e);}try{return await requestBrowserGeolocation();}catch(e){return recoverGeolocation(e);}}
export async function refreshGeolocation(){try{if(isNativeApp()){const p=await nativeGetCurrentPosition();if(p?.coords){const v={lat:Number(p.coords.latitude),lng:Number(p.coords.longitude),accuracy:p.coords.accuracy||null,source:'native-gps'};saveLocation(v);return toPosition(v);}}return await requestBrowserGeolocation();}catch(e){return recoverGeolocation(e);}}
export function getSavedLocation(){const v=readSavedLocation();return v?toPosition(v):null;}export function geolocationErrorMessage(e){if(!e)return'No se pudo obtener tu ubicación.';switch(e.code){case 1:return'Activa el permiso de ubicación para continuar.';case 2:return'No se pudo determinar tu ubicación. Verifica el GPS.';case 3:return'La solicitud de ubicación tardó demasiado. Intenta de nuevo.';default:return e.message||'No se pudo obtener tu ubicación.';}}

async function optimizeProfileImage(file){
    if(!file||!file.type?.startsWith('image/'))return file;
    // Las fotos de perfil no necesitan resolución de cámara. Reducir antes del upload
    // evita varios MB de transferencia y bloqueos perceptibles en redes móviles lentas.
    if(file.size<=900*1024)return file;
    if(!('createImageBitmap' in window))return file;
    let bitmap;
    try{bitmap=await createImageBitmap(file);}catch{return file;}
    const maxSide=1280,scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
    const width=Math.max(1,Math.round(bitmap.width*scale)),height=Math.max(1,Math.round(bitmap.height*scale));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{alpha:false});if(!ctx){bitmap.close?.();return file;}
    ctx.drawImage(bitmap,0,0,width,height);bitmap.close?.();
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.82));
    return blob&&blob.size<file.size?new File([blob],`${file.name.replace(/\.[^.]+$/,'')||'perfil'}.jpg`,{type:'image/jpeg'}):file;
}
export async function uploadProfilePhoto(file){
    if(!file||!file.type?.startsWith('image/'))throw new Error('Selecciona un archivo de imagen válido.');
    if(file.size>8*1024*1024)throw new Error('La imagen no puede superar 8 MB.');
    const uploadFile=await optimizeProfileImage(file);
    const sig=await apiFetch('/uploads/signature?kind=profile');const form=new FormData();form.append('file',uploadFile);form.append('api_key',sig.api_key);form.append('timestamp',String(sig.timestamp));form.append('signature',sig.signature);form.append('folder',sig.folder);let res;try{res=await fetch(`https://api.cloudinary.com/v1_1/${sig.cloud_name}/image/upload`,{method:'POST',body:form});}catch{throw new Error('No se pudo conectar con el servicio de imágenes.');}const data=await res.json().catch(()=>null);if(!res.ok||!data?.secure_url)throw new Error(data?.error?.message||'No se pudo subir la foto.');
    const previousProfile=getCached('/users/profile');
    const updated=await apiFetch('/users/foto',{method:'PUT',body:JSON.stringify({foto:data.secure_url})});
    if(previousProfile)putCached('/users/profile',{...previousProfile,foto:updated.foto||data.secure_url});
    return updated.foto||data.secure_url;
}
import('./admin-bootstrap.js').catch(err=>console.error('admin bootstrap',err));
import('./premium-radius.js').catch(err=>console.error('premium radius bootstrap',err));