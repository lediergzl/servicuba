// Funciones utilitarias
export function formatDate(iso) {
    return new Date(iso).toLocaleDateString('es-CU');
}

export function getEmoji(category) {
    const map = {
        'Electricista': '⚡',
        'Plomero': '🔧',
        'Reparador': '🛠',
        'Albañil': '🧱'
    };
    return map[category] || '🔹';
}
