// ============================================================
// Verificación de cuenta (código de un solo uso)
// ============================================================
import { apiFetch, notify, showFormModal } from './core.js';

export async function refreshVerificationBanner() {
    const banner = document.getElementById('verificationBanner');
    if (!banner) return;
    if (!localStorage.getItem('token')) {
        banner.classList.add('hidden');
        return;
    }

    let profile;
    try {
        profile = await apiFetch('/users/profile');
    } catch {
        banner.classList.add('hidden');
        return;
    }

    banner.classList.toggle('hidden', !!profile.verificado);
}

export function initVerification() {
    const banner = document.getElementById('verificationBanner');
    const btn = document.getElementById('verifyNowBtn');

    btn?.addEventListener('click', async () => {
        let resp;
        try {
            resp = await apiFetch('/verification/send', { method: 'POST' });
        } catch (err) {
            notify(`Error: ${err.message}`, 'error');
            return;
        }

        // NOTA: no hay pasarela SMS conectada — el backend devuelve el
        // código en la respuesta sólo para poder probar el flujo mientras
        // no exista un proveedor real. Se lo mostramos al usuario aquí
        // mismo en vez de fingir que llegó un SMS.
        notify(`Código de verificación (demo): ${resp.codigo_demo}`, 'info');

        const result = await showFormModal({
            title: 'Verifica tu cuenta',
            confirmLabel: 'Verificar',
            fields: [
                {
                    name: 'codigo',
                    label: `Código de 6 dígitos (válido ${resp.expira_en_minutos} min)`,
                    type: 'text',
                    required: true,
                    placeholder: '123456'
                }
            ]
        });
        if (result === null) return;

        try {
            await apiFetch('/verification/confirm', {
                method: 'POST',
                body: JSON.stringify({ codigo: result.codigo.trim() })
            });
            notify('¡Cuenta verificada!', 'success');
            banner?.classList.add('hidden');
        } catch (err) {
            notify(`Error: ${err.message}`, 'error');
        }
    });
}
