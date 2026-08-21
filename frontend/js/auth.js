// ============================================================
// Registro / Login / Logout
// La sesión vive en cookie HttpOnly; nunca se guarda el JWT en localStorage.
// ============================================================
import { apiFetch, notify, showFormModal, getGeolocation, API_BASE } from './core.js';
import { switchView } from './tasks.js';
import { initLandingPublicExperience } from './landing-public-experience.js';

export let currentUser = null;

// Compatibilidad de transición: añade credenciales y CSRF a las llamadas API
// aunque algún módulo antiguo siga usando fetch() directamente.
(function installSecureFetch(){
    if (window.__servicubaSecureFetch) return;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init={}) => {
        const url = typeof input === 'string' ? input : input?.url || '';
        const sameOriginApi = url.startsWith('/api/') || url.startsWith(window.location.origin + '/api/');
        if (!sameOriginApi) return nativeFetch(input, init);
        const method = String(init.method || (typeof input !== 'string' ? input.method : 'GET')).toUpperCase();
        const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
        const match = document.cookie.match(/(?:^|; )servicuba_csrf=([^;]+)/);
        if (sameOriginApi && !['GET','HEAD','OPTIONS'].includes(method) && match && !headers.has('X-CSRF-Token')) headers.set('X-CSRF-Token', decodeURIComponent(match[1]));
        return nativeFetch(input, {...init, headers, credentials: 'include'});
    };
    window.__servicubaSecureFetch = true;
})();

function normalizePhone(value) { return String(value || '').replace(/[\s().-]/g, ''); }
function normalizeEmail(value) { return String(value || '').trim().toLowerCase(); }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value)); }
function ensureRegistrationEmailField() {
    const form = document.getElementById('registerForm'); if (!form || document.getElementById('regEmail')) return;
    const phone = document.getElementById('regTelefono'); const input = document.createElement('input');
    input.type='email'; input.id='regEmail'; input.name='email'; input.className='field-input'; input.placeholder='Correo electrónico'; input.autocomplete='email'; input.required=true;
    if(phone?.parentNode===form) phone.insertAdjacentElement('afterend',input); else form.insertBefore(input,form.firstChild);
}
function validateRegistration(data, esTrabajador) {
    if(!data.nombre||data.nombre.trim().length<2)return'Escribe tu nombre completo.';
    if(!/^\+?[0-9]{7,20}$/.test(normalizePhone(data.telefono)))return'Escribe un teléfono válido.';
    if(!validEmail(data.email))return'Escribe un correo electrónico válido.';
    if(!data.password||data.password.length<8)return'La contraseña debe tener al menos 8 caracteres.';
    if(!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(data.password)||!/[0-9]/.test(data.password))return'La contraseña debe incluir al menos una letra y un número.';
    if(esTrabajador&&!data.categoria_id)return'Selecciona el oficio o categoría que ofreces.'; return null;
}
function ensureAuthNavigation(){
    const addBackLink=(viewId,text)=>{const view=document.getElementById(viewId);if(!view||view.querySelector('[data-action="back-home"]'))return;const link=document.createElement('button');link.type='button';link.className='btn btn-ghost btn-sm auth-back-home';link.dataset.action='back-home';link.innerHTML='<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H6M11 6l-6 6 6 6"/></svg>'+text;view.insertBefore(link,view.firstChild);};
    addBackLink('login','Volver al inicio');addBackLink('register','Volver al inicio');document.querySelectorAll('[data-action="back-home"]').forEach(btn=>{if(btn.dataset.wired==='1')return;btn.dataset.wired='1';btn.addEventListener('click',()=>showLanding());});
}
async function verifyEmailFlow(email){
    const normalized=normalizeEmail(email);const step=await showFormModal({title:'Verifica tu correo',confirmLabel:'Verificar cuenta',fields:[{name:'codigo',label:'Código de 6 dígitos enviado a tu correo',type:'text',required:true,placeholder:'123456'}]});
    if(step===null)return false;const codigo=String(step.codigo||'').trim();if(!/^\d{6}$/.test(codigo)){notify('El código debe tener 6 dígitos.','error');return false;}
    try{await apiFetch('/auth/verify-email',{method:'POST',body:JSON.stringify({email:normalized,codigo})});notify('Correo verificado correctamente. Ya puedes iniciar sesión.','success');return true;}catch(err){notify(err.message||'Código incorrecto o expirado.','error');return false;}
}
async function resendAndVerify(email){const normalized=normalizeEmail(email);try{const resp=await apiFetch('/auth/resend-verification',{method:'POST',body:JSON.stringify({email:normalized})});notify(resp.message||'Nuevo código enviado.','info');return verifyEmailFlow(normalized);}catch(err){notify(err.message||'No se pudo enviar un nuevo código.','error');return false;}}
async function promptPendingVerification(){const data=await showFormModal({title:'Verificar correo pendiente',confirmLabel:'Continuar',fields:[{name:'email',label:'Correo electrónico',type:'email',required:true,placeholder:'tu@email.com'}]});if(data===null)return;const email=normalizeEmail(data.email);if(!validEmail(email))return notify('Escribe un correo electrónico válido.','error');const verified=await verifyEmailFlow(email);if(!verified){const resend=await showFormModal({title:'Código no válido o expirado',confirmLabel:'Enviar nuevo código',fields:[{name:'email',label:'Confirma tu correo',type:'email',required:true,value:email}]});if(resend!==null)await resendAndVerify(normalizeEmail(resend.email));}}

export function initAuth(){
    const registerForm=document.getElementById('registerForm'),loginForm=document.getElementById('loginForm'),regEsTrabajador=document.getElementById('regEsTrabajador');let regLastLat=null,regLastLng=null;ensureAuthNavigation();ensureRegistrationEmailField();
    regEsTrabajador?.addEventListener('change',e=>{const show=e.target.checked;document.getElementById('categoriaField')?.classList.toggle('hidden',!show);document.getElementById('ubicacionField')?.classList.toggle('hidden',!show);});
    registerForm?.addEventListener('submit',async e=>{e.preventDefault();const submitBtn=registerForm.querySelector('button[type="submit"]'),esTrabajador=document.getElementById('regEsTrabajador')?.checked||false,data={nombre:document.getElementById('regNombre')?.value.trim()||'',telefono:normalizePhone(document.getElementById('regTelefono')?.value||''),email:normalizeEmail(document.getElementById('regEmail')?.value||''),password:document.getElementById('regPassword')?.value||'',es_trabajador:esTrabajador,categoria_id:esTrabajador?(parseInt(document.getElementById('regCategoria')?.value||'',10)||null):null,municipio:document.getElementById('regMunicipio')?.value.trim()||null,zona:document.getElementById('regZona')?.value.trim()||null,lat:Number.isFinite(regLastLat)?regLastLat:null,lng:Number.isFinite(regLastLng)?regLastLng:null};const validationError=validateRegistration(data,esTrabajador);if(validationError)return notify(validationError,'error');if(submitBtn){submitBtn.disabled=true;submitBtn.textContent='Creando cuenta…';}try{await apiFetch('/auth/register',{method:'POST',body:JSON.stringify(data)});notify('Cuenta creada. Revisa tu correo: te enviamos un código de verificación.','success');const verified=await verifyEmailFlow(data.email);if(!verified){const resend=await showFormModal({title:'¿No recibiste el código?',confirmLabel:'Enviar nuevo código',fields:[{name:'email',label:'Correo electrónico',type:'email',required:true,value:data.email}]});if(resend!==null)await resendAndVerify(normalizeEmail(resend.email));}showLogin();}catch(err){notify(err.message||'No se pudo crear la cuenta.','error');}finally{if(submitBtn){submitBtn.disabled=false;submitBtn.textContent='Registrarse';}}});
    loginForm?.addEventListener('submit',async e=>{e.preventDefault();const submitBtn=loginForm.querySelector('button[type="submit"]'),telefono=normalizePhone(document.getElementById('logTelefono')?.value||''),password=document.getElementById('logPassword')?.value||'';if(!/^\+?[0-9]{7,20}$/.test(telefono))return notify('Escribe un teléfono válido.','error');if(!password)return notify('Escribe tu contraseña.','error');if(submitBtn){submitBtn.disabled=true;submitBtn.textContent='Ingresando…';}try{const res=await fetch(`${API_BASE}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({telefono,password})});const body=await res.json().catch(()=>null);if(!res.ok){if(res.status===401)throw new Error(body?.detail||'Credenciales inválidas');if(res.status===422&&Array.isArray(body?.detail))throw new Error(body.detail.map(x=>`${x.loc?.join('.')||'campo'}: ${x.msg}`).join('; '));throw new Error(body?.detail||`Error ${res.status}`);}if(!body)throw new Error('Respuesta inválida del servidor.');window.location.reload();}catch(err){notify(`Error: ${err.message}`,'error');}finally{if(submitBtn){submitBtn.disabled=false;submitBtn.textContent='Ingresar';}}});
    document.getElementById('verifyPendingBtn')?.addEventListener('click',promptPendingVerification);
    document.getElementById('getGpsBtn')?.addEventListener('click',async()=>{const btn=document.getElementById('getGpsBtn');if(!btn)return;const originalText=btn.textContent;btn.disabled=true;btn.textContent='Obteniendo ubicación…';try{const pos=await getGeolocation();const lat=Number(pos.coords.latitude),lng=Number(pos.coords.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lng))throw new Error('Coordenadas inválidas');regLastLat=lat;regLastLng=lng;btn.textContent='✓ Ubicación obtenida';notify('Ubicación GPS obtenida correctamente.','success');}catch(err){notify('No se pudo obtener la ubicación. Puedes continuar sin ella.','error');btn.textContent=originalText;}finally{btn.disabled=false;}});initForgotPassword();
}
function initForgotPassword(){document.getElementById('forgotPasswordBtn')?.addEventListener('click',async()=>{const step1=await showFormModal({title:'Recuperar contraseña',confirmLabel:'Enviar código',fields:[{name:'email',label:'Correo electrónico',type:'email',required:true,placeholder:'tu@email.com'}]});if(step1===null)return;const email=normalizeEmail(step1.email);if(!validEmail(email))return notify('Escribe un correo electrónico válido.','error');let resp;try{resp=await apiFetch('/auth/forgot-password',{method:'POST',body:JSON.stringify({email})});}catch(err){return notify(`Error: ${err.message}`,'error');}notify(resp.message||'Revisa tu correo.','info');const step2=await showFormModal({title:'Nueva contraseña',confirmLabel:'Restablecer',fields:[{name:'codigo',label:`Código de 6 dígitos (válido ${resp.expira_en_minutos} min)`,type:'text',required:true,placeholder:'123456'},{name:'nueva_password',label:'Nueva contraseña',type:'password',required:true}]});if(step2===null)return;try{await apiFetch('/auth/reset-password',{method:'POST',body:JSON.stringify({email,codigo:step2.codigo.trim(),nueva_password:step2.nueva_password})});notify('Contraseña actualizada. Ya puedes iniciar sesión.','success');}catch(err){notify(`Error: ${err.message}`,'error');}});}
export function showLanding(){switchView('landing');requestAnimationFrame(()=>initLandingPublicExperience());}
export function showRegister(){switchView('register');}
export function showLogin(){switchView('login');}
export async function logout(){try{await apiFetch('/auth/logout',{method:'POST'});}catch(err){console.warn('[ServiCuba] logout:',err);}window.location.reload();}
