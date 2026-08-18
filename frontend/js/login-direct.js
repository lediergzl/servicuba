export async function loginDirect(apiBase, telefono, password) {
    const response = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefono, password })
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        const detail = data?.detail;
        if (response.status === 401) throw new Error(typeof detail === 'string' ? detail : 'Credenciales inválidas');
        if (response.status === 422 && Array.isArray(detail)) {
            throw new Error(detail.map(item => `${item.loc?.join('.') || 'campo'}: ${item.msg}`).join('; '));
        }
        throw new Error(typeof detail === 'string' ? detail : `Error ${response.status}`);
    }
    if (!data?.access_token) throw new Error('El servidor no devolvió un token de acceso.');
    return data;
}
