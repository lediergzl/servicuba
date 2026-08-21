import { apiFetch, notify, showFormModal, getGeolocation, API_BASE } from './core.js';
import { switchView } from './tasks.js';
import { initLandingPublicExperience } from './landing-public-experience.js';

export let currentUser = null;

// La autenticación real vive exclusivamente en la cookie HttpOnly. Este marcador
// NO contiene un token ni credenciales: sólo mantiene compatibilidad con módulos
// antiguos que todavía preguntaban si existía localStorage.token.
const SESSION_MARKER = 'servicuba_session';
const markSession = () => localStorage.setItem(SESSION_MARKER, '1');
const clearSessionMark = () => localStorage.removeItem(SESSION_MARKER);

(function installSecureFetch(){
    if (window.__servicubaSecureFetch) return;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init={}) => {
        const url = typeof input === 'string' ? input : input?.url || '';
        const apiUrl = url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`);
        if (!apiUrl) return nativeFetch(input, init);
        const method = String(init.method || (typeof input !== 'string' ? input.method : 'GET')).toUpperCase();
        const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
        const csrf = document.cookie.match(/(?:^|; )servicuba_csrf=([^;]+)/);
        if (!['GET','HEAD','OPTIONS'].includes(method) && csrf && !headers.has('X-CSRF-Token')) headers.set('X-CSRF-Token', decodeURIComponent(csrf[1]));
        const response = await nativeFetch(input, {...init, headers, credentials:'include'});
        // Compatibilidad durante la migración cookie HttpOnly -> frontend.
        if (response.ok && /\/api\/auth\/(login|me)(?:[/?#]|$)/.test(url)) markSession();
        if (response.status === 401 && /\/api\//.test(url)) clearSessionMark();
        return response;
    };
    window.__servicubaSecureFetch = true;
})();

const normalizePhone = value => String(value || '').replace(/[\s().-]/g, '');
const normalizeEmail = value => String(value || '').trim().toLowerCase();
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));

function ensureRegistrationEmailField(){
    const form=document.getElementById('registerForm');
    if(!form || document.getElementById('regEmail')) return;
    const phone=document.getElementById('regTelefono'), input=document.createElement('input');
    input.type='email'; input.id='regEmail'; input.name='email'; input.className='field-input';
    input.placeholder='Correo electrónico'; input.autocomplete='email'; input.required=true;
    phone?.parentNode===form ? phone.insertAdjacentElement('afterend',input) : form.insertBefore(input,form.firstChild);
}

function validateRegistration(data, worker){
    if(!data.nombre || data.nombre.trim().length<2) return 'Escribe tu nombre completo.';
    if(!/^\+?[0-9]{7,20}$/.test(normalizePhone(data.telefono))) return 'Escribe un teléfono válido.';
    if(!validEmail(data.email)) return 'Escribe un correo electrónico válido.';
    if(!data.password || data.password.length<8) return 'La contraseña debe tener al menos 8 caracteres.';
    if(!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(data.password)||!/[0-9]/.test(data.password)) return 'La contraseña debe incluir al menos una letra y un número.';
    if(worker&&!data.categoria_id) return 'Selecciona el oficio o categoría que ofreces.';
    return null;
}

async function verifyEmailFlow(email){
    const normalized=normalizeEmail(email);
    const data=await showFormModal({title:'Verifica tu correo',confirmLabel:'Verificar cuenta',fields:[{name:'codigo',label:'Código de 6 dígitos enviado a tu correo',type:'text',required:true,placeholder:'123456'}]});
    if(data===null) return false;
    const codigo=String(data.codigo||'').trim();
    if(!/^\d{6}$/.test(codigo)){notify('El código debe tener 6 dígitos.','error');return false;}
    try{await apiFetch('/auth/verify-email',{method:'POST',body:JSON.stringify({email:normalized,codigo})});notify('Correo verificado correctamente. Ya puedes iniciar sesión.','success');return true;}
    catch(err){notify(err.message||'Código incorrecto o expirado.','error');return false;}
}

async function resendAndVerify(email){
    const normalized=normalizeEmail(email);
    try{const r=await apiFetch('/auth/resend-verification',{method:'POST',body:JSON.stringify({email:normalized})});notify(r.message||'Nuevo código enviado.','info');return verifyEmailFlow(normalized);}
    catch(err){notify(err.message||'No se pudo enviar un nuevo código.','error');return false;}
}

async function promptPendingVerification(){
    const data=await showFormModal({title:'Verificar correo pendiente',confirmLabel:'Continuar',fields:[{name:'email',label:'Correo electrónico',type:'email',required:true,placeholder:'tu@email.com'}]});
    if(data===null)return;
    const email=normalizeEmail(data.email);
    if(!validEmail(email))return notify('Escribe un correo electrónico válido.','error');
    if(!(await verifyEmailFlow(email))) await resendAndVerify(email);
}

export function initAuth(){
    const registerForm=document.getElementById('registerForm');
    const loginForm=document.getElementById('loginForm');
    const workerCheck=document.getElementById('regEsTrabajador');
    let regLastLat=null,regLastLng=null;
    ensureRegistrationEmailField();

    document.querySelectorAll('[data-action="back-home"]').forEach(btn=>btn.addEventListener('click',showLanding));
    workerCheck?.addEventListener('change',e=>{
        document.getElementById('categoriaField')?.classList.toggle('hidden',!e.target.checked);
        document.getElementById('ubicacionField')?.classList.toggle('hidden',!e.target.checked);
    });

    registerForm?.addEventListener('submit',async e=>{
        e.preventDefault();
        const submit=registerForm.querySelector('button[type="submit"]');
        const es_trabajador=!!workerCheck?.checked;
        const data={nombre:document.getElementById('regNombre')?.value.trim()||'',telefono:normalizePhone(document.getElementById('regTelefono')?.value),email:normalizeEmail(document.getElementById('regEmail')?.value),password:document.getElementById('regPassword')?.value||'',es_trabajador,categoria_id:es_trabajador?(Number(document.getElementById('regCategoria')?.value)||null):null,municipio:document.getElementById('regMunicipio')?.value.trim()||null,zona:document.getElementById('regZona')?.value.trim()||null,lat:Number.isFinite(regLastLat)?regLastLat:null,lng:Number.isFinite(regLastLng)?regLastLng:null};
        const error=validateRegistration(data,es_trabajador); if(error)return notify(error,'error');
        if(submit){submit.disabled=true;submit.textContent='Creando cuenta…';}
        try{await apiFetch('/auth/register',{method:'POST',body:JSON.stringify(data)});notify('Cuenta creada. Revisa tu correo: te enviamos un código de verificación.','success');await verifyEmailFlow(data.email);showLogin();}
        catch(err){notify(err.message||'No se pudo crear la cuenta.','error');}
        finally{if(submit){submit.disabled=false;submit.textContent='Registrarse';}}
    });

    loginForm?.addEventListener('submit',async e=>{
        e.preventDefault();
        const submit=loginForm.querySelector('button[type="submit"]');
        const telefono=normalizePhone(document.getElementById('logTelefono')?.value),password=document.getElementById('logPassword')?.value||'';
        if(!/^\+?[0-9]{7,20}$/.test(telefono))return notify('Escribe un teléfono válido.','error');
        if(!password)return notify('Escribe tu contraseña.','error');
        if(submit){submit.disabled=true;submit.textContent='Ingresando…';}
        try{
            const res=await fetch(`${API_BASE}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({telefono,password}),credentials:'include'});
            const body=await res.json().catch(()=>null);
            if(!res.ok)throw new Error(body?.detail||`Error ${res.status}`);
            // El marcador sólo evita que código heredado confunda cookie HttpOnly con sesión inexistente.
            markSession();
            // Verificamos inmediatamente que la cookie quedó disponible antes de cambiar la UI.
            const me=await apiFetch('/auth/me');
            currentUser=me;
            document.getElementById('user-menu-guest')?.classList.add('hidden');
            document.getElementById('user-menu-auth')?.classList.remove('hidden');
            document.getElementById('bottomNav')?.classList.remove('hidden');
            document.getElementById('modoSwitch')?.classList.remove('hidden');
            document.body.classList.add('is-authenticated');
            notify(`Bienvenido${me?.nombre?`, ${me.nombre}`:''}.`,'success');
            window.location.reload();
        }catch(err){clearSessionMark();notify(`Error: ${err.message}`,'error');}
        finally{if(submit){submit.disabled=false;submit.textContent='Ingresar';}}
    });

    document.getElementById('verifyPendingBtn')?.addEventListener('click',promptPendingVerification);
    document.getElementById('getGpsBtn')?.addEventListener('click',async()=>{
        const btn=document.getElementById('getGpsBtn');if(!btn)return;
        const original=btn.textContent;btn.disabled=true;btn.textContent='Obteniendo ubicación…';
        try{const p=await getGeolocation();regLastLat=Number(p.coords.latitude);regLastLng=Number(p.coords.longitude);btn.textContent='✓ Ubicación obtenida';notify('Ubicación GPS obtenida correctamente.','success');}
        catch(err){btn.textContent=original;notify('No se pudo obtener la ubicación. Puedes continuar sin ella.','error');}
        finally{btn.disabled=false;}
    });

    document.getElementById('forgotPasswordBtn')?.addEventListener('click',async()=>{
        const step1=await showFormModal({title:'Recuperar contraseña',confirmLabel:'Enviar código',fields:[{name:'email',label:'Correo electrónico',type:'email',required:true,placeholder:'tu@email.com'}]});
        if(step1===null)return;
        const email=normalizeEmail(step1.email);if(!validEmail(email))return notify('Escribe un correo electrónico válido.','error');
        try{const r=await apiFetch('/auth/forgot-password',{method:'POST',body:JSON.stringify({email})});notify(r.message||'Revisa tu correo.','info');const step2=await showFormModal({title:'Nueva contraseña',confirmLabel:'Restablecer',fields:[{name:'codigo',label:`Código de 6 dígitos (válido ${r.expira_en_minutos} min)`,type:'text',required:true},{name:'nueva_password',label:'Nueva contraseña',type:'password',required:true}]});if(step2===null)return;await apiFetch('/auth/reset-password',{method:'POST',body:JSON.stringify({email,codigo:String(step2.codigo||'').trim(),nueva_password:step2.nueva_password})});notify('Contraseña actualizada. Ya puedes iniciar sesión.','success');}
        catch(err){notify(`Error: ${err.message}`,'error');}
    });
}

export function showLanding(){switchView('landing');requestAnimationFrame(()=>initLandingPublicExperience());}
export function showRegister(){switchView('register');}
export function showLogin(){switchView('login');}
export async function logout(){try{await apiFetch('/auth/logout',{method:'POST'});}catch(err){console.warn('[ServiCuba] logout:',err);}finally{clearSessionMark();localStorage.removeItem('token');}window.location.reload();}
