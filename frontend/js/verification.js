// ============================================================
// Verificación de cuenta por correo electrónico
// ============================================================
import { apiFetch, notify, showFormModal } from './core.js';

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

async function sendVerificationCode(email) {
    return apiFetch('/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email: normalizeEmail(email) })
    });
}

async function verifyCode(email, codigo) {
    return apiFetch('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ email: normalizeEmail(email), codigo: String(codigo || '').trim() })
    });
}

export async function refreshVerificationBanner() {
    const banner = document.getElementById('verificationBanner');
    if (!banner) return;
    if (!localStorage.getItem('token')) {
        banner.classList.add('hidden');
        return;
    }

    try {
        const profile = await apiFetch('/users/profile');
        banner.classList.toggle('hidden', !!profile?.verificado);
        const emailTarget = banner.querySelector('[data-verification-email]');
        if (emailTarget && profile?.email) emailTarget.textContent = profile.email;
    } catch {
        // Un fallo temporal del perfil nunca debe bloquear la navegación.
        banner.classList.add('hidden');
    }
}

export function initVerification() {
    const banner = document.getElementById('verificationBanner');
    const btn = document.getElementById('verifyNowBtn');
    if (!btn || btn.dataset.verificationWired === '1') return;
    btn.dataset.verificationWired = '1';

    btn.addEventListener('click', async () => {
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Enviando código…';

        try {
            const profile = await apiFetch('/users/profile');
            const email = normalizeEmail(profile?.email);
            if (!validEmail(email)) {
                notify('Tu cuenta no tiene un correo electrónico válido configurado.', 'error');
                return;
            }

            // Usa exactamente el mismo mecanismo que el registro.
            // El código nunca se devuelve ni se muestra en la interfaz.
            const resp = await sendVerificationCode(email);
            notify(resp?.message || 'Hemos enviado un nuevo código a tu correo.', 'info');

            const result = await showFormModal({
                title: 'Verifica tu correo',
                confirmLabel: 'Verificar cuenta',
                fields: [{
                    name: 'codigo',
                    label: `Código de 6 dígitos enviado a ${email} (válido ${resp?.expira_en_minutos || 10} min)`,
                    type: 'text',
                    inputmode: 'numeric',
                    required: true,
                    placeholder: '123456',
                    maxlength: 6
                }]
            });
            if (result === null) return;

            const codigo = String(result.codigo || '').trim();
            if (!/^\d{6}$/.test(codigo)) {
                notify('El código debe tener exactamente 6 dígitos.', 'error');
                return;
            }

            await verifyCode(email, codigo);
            notify('¡Cuenta verificada correctamente!', 'success');
            banner?.classList.add('hidden');
        } catch (err) {
            notify(err?.message || 'El código es incorrecto o expiró.', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });
}
