// ============================================================
// Chat en tiempo real (WebSocket) por tarea
// ============================================================
import { apiFetch, notify, escapeHtml } from './core.js';

let currentSocket = null;
let currentTaskId = null;
let currentUserId = null;

export function setCurrentUserId(id) {
    currentUserId = id;
}

function wsUrl(taskId) {
    const token = localStorage.getItem('token');
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/api/chat/ws/${encodeURIComponent(taskId)}?token=${encodeURIComponent(token || '')}`;
}

// ---------- Vista "Mensajes": lista de conversaciones ----------

export async function loadConversations() {
    const container = document.getElementById('listaConversaciones');
    if (!container) return;
    container.innerHTML = '<p class="empty-state">Cargando conversaciones…</p>';

    let convs;
    try {
        convs = await apiFetch('/chat/conversations');
    } catch (err) {
        container.innerHTML = `<p class="empty-state">Error: ${escapeHtml(err.message)}</p>`;
        return;
    }

    if (!convs.length) {
        container.innerHTML = '<p class="empty-state">Todavía no tienes conversaciones. Aparecen aquí cuando una tarea tiene un trabajador asignado.</p>';
        updateUnreadBadge(0);
        return;
    }

    container.innerHTML = '';
    let totalUnread = 0;
    convs.forEach(c => {
        totalUnread += c.no_leidos || 0;
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'conversation-item';
        item.dataset.taskId = c.task_id;
        item.innerHTML = `
            <div class="conversation-item__main">
                <span class="conversation-item__title">${escapeHtml(c.titulo)}</span>
                <span class="conversation-item__other">${escapeHtml(c.otro_participante)}</span>
                <span class="conversation-item__last">${c.ultimo_mensaje ? escapeHtml(c.ultimo_mensaje) : 'Sin mensajes todavía'}</span>
            </div>
            ${c.no_leidos ? `<span class="badge-count">${c.no_leidos}</span>` : ''}
        `;
        item.addEventListener('click', () => openChatForTask(c.task_id, c.titulo, c.otro_participante));
        container.appendChild(item);
    });
    updateUnreadBadge(totalUnread);
}

function updateUnreadBadge(count) {
    const badge = document.getElementById('navMensajesBadge');
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count > 9 ? '9+' : String(count);
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// ---------- Panel de chat de una tarea ----------

export async function openChatForTask(taskId, titulo = '', otro = '') {
    currentTaskId = taskId;

    document.querySelectorAll('#views > div').forEach(el => el.classList.add('hidden'));
    const chatView = document.getElementById('chatView');
    if (chatView) chatView.classList.remove('hidden');

    const headerTitle = document.getElementById('chatOtroParticipante');
    if (headerTitle) headerTitle.textContent = otro || 'Chat';
    const headerTask = document.getElementById('chatTareaTitulo');
    if (headerTask) headerTask.textContent = titulo || '';

    const messagesEl = document.getElementById('chatMessages');
    if (messagesEl) messagesEl.innerHTML = '<p class="empty-state">Cargando mensajes…</p>';

    let history;
    try {
        history = await apiFetch(`/chat/${encodeURIComponent(taskId)}/messages`);
    } catch (err) {
        if (messagesEl) messagesEl.innerHTML = `<p class="empty-state">Error: ${escapeHtml(err.message)}</p>`;
        return;
    }

    if (messagesEl) {
        messagesEl.innerHTML = '';
        history.forEach(m => appendMessageBubble(m));
        scrollChatToBottom();
    }

    connectSocket(taskId);
}

function closeSocket() {
    if (currentSocket) {
        currentSocket.onclose = null;
        currentSocket.close();
        currentSocket = null;
    }
}

function connectSocket(taskId) {
    closeSocket();
    const socket = new WebSocket(wsUrl(taskId));
    currentSocket = socket;

    socket.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            appendMessageBubble(msg);
            scrollChatToBottom();
        } catch (e) {
            // ignorar mensajes no-JSON
        }
    };

    socket.onclose = () => {
        // Reintento simple si el usuario sigue en la vista de chat.
        if (currentTaskId === taskId) {
            setTimeout(() => {
                if (currentTaskId === taskId) connectSocket(taskId);
            }, 2000);
        }
    };

    socket.onerror = () => {
        // onclose se dispara después; no duplicar notificaciones aquí.
    };
}

function appendMessageBubble(msg) {
    const messagesEl = document.getElementById('chatMessages');
    if (!messagesEl) return;
    const isOwn = msg.sender_id === currentUserId;
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${isOwn ? 'chat-bubble--own' : 'chat-bubble--other'}`;
    const time = new Date(msg.created_at).toLocaleTimeString('es-CU', { hour: '2-digit', minute: '2-digit' });
    bubble.innerHTML = `
        <span class="chat-bubble__text">${escapeHtml(msg.contenido)}</span>
        <span class="chat-bubble__time">${escapeHtml(time)}</span>
    `;
    messagesEl.appendChild(bubble);
}

function scrollChatToBottom() {
    const messagesEl = document.getElementById('chatMessages');
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
}

export function initChat() {
    const form = document.getElementById('chatForm');
    const input = document.getElementById('chatInput');
    const backBtn = document.getElementById('chatBackBtn');

    form?.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text || !currentSocket || currentSocket.readyState !== WebSocket.OPEN) {
            if (!currentSocket || currentSocket.readyState !== WebSocket.OPEN) {
                notify('Conectando… intenta de nuevo en un segundo.', 'info');
            }
            return;
        }
        currentSocket.send(JSON.stringify({ contenido: text }));
        input.value = '';
    });

    backBtn?.addEventListener('click', () => {
        currentTaskId = null;
        closeSocket();
        document.dispatchEvent(new CustomEvent('chat:closed'));
    });
}
