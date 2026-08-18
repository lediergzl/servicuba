// Login requests must not treat HTTP 401 as an expired authenticated session.
export async function requestLogin(apiBase, credentials) {
    const response = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        if (response.status === 401) throw new Error(data?.detail || 'Credenciales inválidas');
        if (response.status === 422 && Array.isArray(data?.detail)) {
            throw new Error(data.detail.map(item => `${item.loc?.join('.') || 'campo'}: ${item.msg}`).join('; '));
        }
        throw new Error(data?.detail || `Error ${response.status}`);
    }
    return data;
}
