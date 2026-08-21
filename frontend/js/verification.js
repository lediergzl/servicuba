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

async function promptForCode(email) {
    return showFormModal({
        title: 'Verifica tu correo',
        confirmLabel: 'Verificar cuenta',
        fields: [{
            name: 'codigo',
            label: `Código de 6 dígitos enviado a ${email}`,
            type: 'text',
            inputmode: 'numeric',
            required: true,
            placeholder: '123456',
            maxlength: 6,
            autocomplete: 'one-time-code'
        }]
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
        btn.textContent = 'Verificar…';

        try {
            const profile = await apiFetch('/users/profile');
            const email = normalizeEmail(profile?.email);
            if (!validEmail(email)) {
                notify('Tu cuenta no tiene un correo electrónico válido configurado.', 'error');
                return;
            }

            // IMPORTANTE: no reenviamos automáticamente aquí. Si el usuario
            // ya recibió el código durante el registro, ese código sigue siendo
            // válido. Generar otro código antes de pedirlo invalidaría el
            // anterior y provocaría falsos "Código incorrecto".
            let result = await promptForCode(email);
            if (result === null) return;

            let codigo = String(result.codigo || '').trim();
            if (!/^\d{6}$/.test(codigo)) {
                notify('El código debe tener exactamente 6 dígitos.', 'error');
                return;
            }

            try {
                await verifyCode(email, codigo);
                notify('¡Cuenta verificada correctamente!', 'success');
                banner?.classList.add('hidden');
                return;
            } catch (err) {
                // Si el código anterior expiró o fue invalidado, ofrecemos
                // explícitamente generar uno nuevo. No se genera silenciosamente.
                const retry = await showFormModal({
                    title: 'Código no válido o expirado',
                    confirmLabel: 'Enviar nuevo código',
                    fields: [{
                        name: 'confirmar',
                        label: `Enviar un nuevo código a ${email}. El código anterior dejará de ser válido.`,
                        type: 'checkbox',
                        required: true
                    }]
                });
                if (retry === null) return;

                const sent = await sendVerificationCode(email);
                notify(sent?.message || 'Nuevo código enviado. Revisa tu correo.', 'info');

                result = await promptForCode(email);
                if (result === null) return;
                codigo = String(result.codigo || '').trim();
                if (!/^\d{6}$/.test(codigo)) {
                    notify('El código debe tener exactamente 6 dígitos.', 'error');
                    return;
                }

                await verifyCode(email, codigo);
                notify('¡Cuenta verificada correctamente!', 'success');
                banner?.classList.add('hidden');
            }
        } catch (err) {
            notify(err?.message || 'No se pudo verificar la cuenta. Inténtalo nuevamente.', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });
}