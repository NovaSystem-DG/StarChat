/* ══ STARCHAT — script.js ══ */

/* ─────────────────────────────────
   STATE
───────────────────────────────── */
let chars       = [];
let ocs         = [];
let perfil      = {};
let currentChar = null;
let currentChatId = null;
let messages    = [];   // [{id, role, content, created_at}]
let editingMsgId = null;
let editingCharId = null;
let editingOcId  = null;
let charAvatarB64 = '';
let ocAvatarB64   = '';
let profileAvatarB64 = '';
let isLoading   = false;
let touchStartX = 0;
let swipeHideTimer = null;

/* ─────────────────────────────────
   INIT
───────────────────────────────── */
(async function init() {
  await Promise.all([loadPerfil(), loadChars(), loadOcs()]);
  renderCharList();
  renderOcList();
  renderOcSelect();
  updateUserAvatar();

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#charMenu') && !e.target.closest('.icon-btn[onclick*="openCharMenu"]')) {
      hideDropdown();
    }
  });

  // Swipe gestures (mobile)
  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchend',   onTouchEnd,   { passive: true });
})();

/* ─────────────────────────────────
   API HELPERS
───────────────────────────────── */
async function api(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  if (r.status === 401) { location.href = '/login'; return null; }
  return r.json();
}

/* ─────────────────────────────────
   LOAD DATA
───────────────────────────────── */
async function loadPerfil() {
  perfil = await api('/api/perfil') || {};
}
async function loadChars() {
  chars = await api('/api/personajes') || [];
}
async function loadOcs() {
  ocs = await api('/api/ocs') || [];
}

/* ─────────────────────────────────
   RENDER: CHAR LIST
───────────────────────────────── */
function renderCharList(filter = '') {
  const list = document.getElementById('charList');
  list.innerHTML = '';
  const q = filter.toLowerCase();

  const favs = chars.filter(c => c.favorito && (!q || c.nombre.toLowerCase().includes(q)));
  const rest = chars.filter(c => !c.favorito && (!q || c.nombre.toLowerCase().includes(q)));

  if (favs.length) {
    list.innerHTML += `<div class="section-label"><i class="fas fa-star" style="color:var(--gold)"></i> Favoritos</div>`;
    favs.forEach(c => list.appendChild(charItem(c)));
  }
  if (rest.length) {
    if (favs.length) list.innerHTML += `<div class="section-label"><i class="fas fa-comments"></i> Todos</div>`;
    rest.forEach(c => list.appendChild(charItem(c)));
  }
  if (!favs.length && !rest.length) {
    list.innerHTML = `<div style="padding:30px;text-align:center;color:var(--text3);font-size:13px">
      ${filter ? 'Sin resultados' : 'No hay personajes aún'}
    </div>`;
  }
}

function charItem(c) {
  const div = document.createElement('div');
  div.className = 'char-item' + (currentChar?.id === c.id ? ' active' : '');
  div.id = `char-item-${c.id}`;

  const avatarStyle = c.avatar
    ? `background-image:url(${c.avatar})`
    : `background:var(--blue-dim)`;
  const avatarInner = c.avatar ? '' : `<span style="font-size:1.3rem">${getInitial(c.nombre)}</span>`;
  const favBadge    = c.favorito ? `<div class="fav-badge"><i class="fas fa-star"></i></div>` : '';

  div.innerHTML = `
    <div class="char-item-avatar" style="${avatarStyle}">
      ${avatarInner}${favBadge}
    </div>
    <div class="char-item-body">
      <div class="char-item-name">${esc(c.nombre)}</div>
      <div class="char-item-preview">${esc(c.descripcion || '...')}</div>
    </div>
    <div class="char-item-side">
      <div class="char-item-actions">
        <button class="icon-btn" onclick="toggleFavById(${c.id}, event)" title="${c.favorito ? 'Quitar fav' : 'Favorito'}">
          <i class="fas fa-star" style="color:${c.favorito ? 'var(--gold)' : 'var(--text3)'}"></i>
        </button>
        <button class="icon-btn" onclick="editChar(${c.id}, event)" title="Editar">
          <i class="fas fa-pen"></i>
        </button>
        <button class="icon-btn" onclick="deleteChar(${c.id}, event)" title="Eliminar">
          <i class="fas fa-trash" style="color:var(--danger)"></i>
        </button>
      </div>
    </div>`;

  div.addEventListener('click', (e) => {
    if (e.target.closest('.icon-btn')) return;
    openChar(c);
  });
  return div;
}

function filterChars() {
  renderCharList(document.getElementById('searchInput').value);
}

/* ─────────────────────────────────
   OPEN CHARACTER / CHAT
───────────────────────────────── */
async function openChar(c) {
  currentChar = c;

  // Update active state in list
  document.querySelectorAll('.char-item').forEach(el => el.classList.remove('active'));
  const item = document.getElementById(`char-item-${c.id}`);
  if (item) item.classList.add('active');

  // Update header
  setHeaderForChar(c);

  // Show chat view
  document.getElementById('welcomeScreen').classList.add('hidden');
  document.getElementById('chatView').classList.remove('hidden');

  // Mobile: slide to right panel
  slideTo('right');

  // Load most recent chat or create one
  const chatList = await api(`/api/chats/${c.id}`);
  if (chatList && chatList.length > 0) {
    await loadChat(chatList[0].id);
  } else {
    const r = await api(`/api/chats/${c.id}/new`, 'POST', { title: 'Nueva conversación' });
    if (r) await loadChat(r.id);
  }
}

function setHeaderForChar(c) {
  const avatarStyle = c.avatar
    ? `background-image:url(${c.avatar})`
    : `background:var(--blue-dim)`;
  const avatarInner = c.avatar ? '' : `<span style="font-size:1.1rem">${getInitial(c.nombre)}</span>`;

  document.getElementById('chatHeaderAvatar').style.cssText = avatarStyle + ';display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:50%;background-size:cover;background-position:center';
  document.getElementById('chatHeaderAvatar').innerHTML = avatarInner;
  document.getElementById('chatHeaderName').textContent = c.nombre;

  const favBtn = document.getElementById('favBtn');
  if (c.favorito) favBtn.classList.add('active-fav'); else favBtn.classList.remove('active-fav');
  favBtn.querySelector('i').style.color = c.favorito ? 'var(--gold)' : '';

  updateOcSub();
}

function updateOcSub() {
  const ocSel = document.getElementById('ocSelect');
  const ocId  = ocSel.value;
  const oc = ocs.find(o => String(o.id) === ocId);
  const sub = oc ? `Jugando como ${oc.nombre}` : currentChar?.descripcion || 'Personaje de IA';
  document.getElementById('chatHeaderSub').textContent = sub;
}

async function loadChat(chatId) {
  currentChatId = chatId;
  const data = await api(`/api/chat/${chatId}/messages`);
  if (!data) return;
  messages = data.messages || [];
  renderMessages();
  document.getElementById('chatHeaderSub').textContent = data.chat?.title || 'Conversación';
  updateOcSub();
}

/* ─────────────────────────────────
   RENDER MESSAGES
───────────────────────────────── */
function renderMessages() {
  const container = document.getElementById('messages');
  container.innerHTML = '';

  // Greeting
  if (currentChar?.greeting) {
    const gb = document.createElement('div');
    gb.className = 'greeting-bubble';
    gb.innerHTML = `<div class="bubble-name">${esc(currentChar.nombre)}</div>${renderMarkdown(currentChar.greeting)}`;
    container.appendChild(gb);
  }

  messages.forEach(m => container.appendChild(buildBubble(m)));
  container.scrollTop = container.scrollHeight;
}

/* ─────────────────────────────────
   TYPEWRITER EFFECT
───────────────────────────────── */
function typewriterEffect(bubble, fullHtml, onDone) {
  // Strip HTML to get plain text length, then reveal HTML progressively
  const temp = document.createElement('div');
  temp.innerHTML = fullHtml;
  const plainText = temp.textContent || temp.innerText || '';
  const totalChars = plainText.length;
  
  if (totalChars === 0) { bubble.innerHTML = fullHtml; if (onDone) onDone(); return; }

  let charIndex = 0;
  const speed = Math.max(8, Math.min(18, Math.floor(2000 / totalChars))); // adaptive speed

  function revealNext() {
    charIndex += 2; // reveal 2 chars per tick for better speed
    // Find how many visible characters to show
    let shown = 0;
    let result = '';
    let inTag = false;
    for (let i = 0; i < fullHtml.length; i++) {
      const ch = fullHtml[i];
      if (ch === '<') inTag = true;
      if (inTag) { result += ch; if (ch === '>') inTag = false; continue; }
      if (shown < charIndex) { result += ch; shown++; }
      else break;
    }
    bubble.innerHTML = result;
    const msgContainer = document.getElementById('messages');
    msgContainer.scrollTop = msgContainer.scrollHeight;

    if (shown < totalChars) {
      setTimeout(revealNext, speed);
    } else {
      bubble.innerHTML = fullHtml; // ensure full content at end
      if (onDone) onDone();
    }
  }
  revealNext();
}


function buildBubble(m) {
  const isUser = m.role === 'user';
  const wrap = document.createElement('div');
  wrap.className = `msg-wrap ${isUser ? 'user' : 'bot'}`;
  wrap.dataset.msgId = m.id;

  // Action buttons
  const btns = document.createElement('div');
  btns.className = 'msg-btns';

  if (isUser) {
    btns.innerHTML = `
      <button class="msg-btn edit" onclick="openEdit(${m.id})" title="Editar"><i class="fas fa-pen"></i></button>
      <button class="msg-btn rew"  onclick="rewindTo(${m.id})" title="Rebobinar aquí"><i class="fas fa-rotate-left"></i></button>
      <button class="msg-btn del"  onclick="deleteMsg(${m.id})" title="Eliminar"><i class="fas fa-trash"></i></button>`;
  } else {
    btns.innerHTML = `
      <button class="msg-btn retry" onclick="retryFrom(${m.id})" title="Regenerar"><i class="fas fa-rotate-right"></i></button>
      <button class="msg-btn edit"  onclick="openEdit(${m.id})" title="Editar"><i class="fas fa-pen"></i></button>
      <button class="msg-btn rew"   onclick="rewindTo(${m.id})" title="Rebobinar aquí"><i class="fas fa-rotate-left"></i></button>
      <button class="msg-btn del"   onclick="deleteMsg(${m.id})" title="Eliminar"><i class="fas fa-trash"></i></button>`;
  }

  // Bubble
  const bubble = document.createElement('div');
  bubble.className = `bubble ${isUser ? 'user' : 'bot'}`;
  bubble.id = `bubble-${m.id}`;

  if (!isUser) {
    bubble.innerHTML = `<div class="bubble-name">${esc(currentChar?.nombre || 'Bot')}</div>`;
  }
  bubble.innerHTML += renderMarkdown(m.content);
  bubble.innerHTML += `<div class="bubble-time">${formatTime(m.created_at)}</div>`;

  wrap.appendChild(btns);
  wrap.appendChild(bubble);
  return wrap;
}

/* ─────────────────────────────────
   SEND MESSAGE
───────────────────────────────── */
async function sendMessage() {
  if (isLoading || !currentChatId) return;
  const inp = document.getElementById('msgInput');
  const content = inp.value.trim();
  if (!content) return;

  inp.value = '';
  autoResize(inp);
  inp.focus();

  const ocId = document.getElementById('ocSelect').value || null;

  // Optimistic: show user bubble
  const tempId = Date.now();
  const tempMsg = { id: tempId, role: 'user', content, created_at: Date.now() / 1000 };
  messages.push(tempMsg);
  const container = document.getElementById('messages');
  container.appendChild(buildBubble(tempMsg));

  // Typing indicator
  const typing = document.createElement('div');
  typing.className = 'typing-wrap';
  typing.id = 'typingIndicator';
  typing.innerHTML = `<div class="typing"><span></span><span></span><span></span></div>`;
  container.appendChild(typing);
  container.scrollTop = container.scrollHeight;

  setLoading(true);

  try {
    const r = await api(`/api/chat/${currentChatId}/send`, 'POST', {
      content,
      oc_id: ocId ? parseInt(ocId) : null
    });

    typing.remove();

    if (r?.response) {
      const data = await api(`/api/chat/${currentChatId}/messages`);
      if (data) {
        messages = data.messages;
        // Render all except last bot message (we'll typewrite it)
        const lastMsg = messages[messages.length - 1];
        const prevMsgs = messages.slice(0, -1);
        const container = document.getElementById('messages');
        container.innerHTML = '';
        if (currentChar?.greeting) {
          const gb = document.createElement('div');
          gb.className = 'greeting-bubble';
          gb.innerHTML = `<div class="bubble-name">${esc(currentChar.nombre)}</div>${renderMarkdown(currentChar.greeting)}`;
          container.appendChild(gb);
        }
        prevMsgs.forEach(m => container.appendChild(buildBubble(m)));
        // Build last bubble and typewrite it
        if (lastMsg && lastMsg.role === 'assistant') {
          const wrap = buildBubble(lastMsg);
          container.appendChild(wrap);
          const bubble = wrap.querySelector('.bubble.bot');
          if (bubble) {
            const nameDiv = bubble.querySelector('.bubble-name');
            const timeDiv = bubble.querySelector('.bubble-time');
            const fullHtml = renderMarkdown(lastMsg.content);
            bubble.innerHTML = '';
            if (nameDiv) bubble.appendChild(nameDiv);
            const contentSpan = document.createElement('span');
            bubble.appendChild(contentSpan);
            if (timeDiv) bubble.appendChild(timeDiv);
            typewriterEffect(contentSpan, fullHtml, null);
          }
        }
        container.scrollTop = container.scrollHeight;
      }
      showSwipeToast();
    } else {
      showToast('Error al responder');
      messages = messages.filter(m => m.id !== tempId);
      renderMessages();
    }
  } catch (err) {
    typing.remove();
    showToast('Error de conexión');
    messages = messages.filter(m => m.id !== tempId);
    renderMessages();
  } finally {
    setLoading(false);
  }
}

function onMsgKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function setLoading(v) {
  isLoading = v;
  document.getElementById('sendBtn').disabled = v;
}

/* ─────────────────────────────────
   MESSAGE ACTIONS
───────────────────────────────── */
async function deleteMsg(id) {
  if (!confirm('¿Eliminar este mensaje?')) return;
  await api(`/api/chat/${currentChatId}/message/${id}`, 'DELETE');
  messages = messages.filter(m => m.id !== id);
  renderMessages();
}

function openEdit(id) {
  const msg = messages.find(m => m.id === id);
  if (!msg) return;
  editingMsgId = id;
  document.getElementById('editContent').value = msg.content;
  openModal('editModal');
}
function closeEditModal() { closeModal('editModal'); }
async function confirmEdit() {
  const content = document.getElementById('editContent').value.trim();
  if (!content || !editingMsgId) return;
  await api(`/api/chat/${currentChatId}/message/${editingMsgId}`, 'PUT', { content });
  const msg = messages.find(m => m.id === editingMsgId);
  if (msg) msg.content = content;
  renderMessages();
  closeEditModal();
}

async function rewindTo(id) {
  if (!confirm('¿Rebobinar a este punto? Se eliminarán este mensaje y todos los siguientes.')) return;
  await api(`/api/chat/${currentChatId}/rewind/${id}`, 'POST');
  // Add visual divider then reload
  const data = await api(`/api/chat/${currentChatId}/messages`);
  if (data) { messages = data.messages; }

  renderMessages();
  // Add rewind line at end
  const rl = document.createElement('div');
  rl.className = 'rewind-line';
  rl.innerHTML = '<i class="fas fa-rotate-left"></i> Rebobinado';
  document.getElementById('messages').appendChild(rl);
  showToast('Rebobinado ✓');
}

async function retryFrom(id) {
  // Delete from this message onward and regenerate
  await api(`/api/chat/${currentChatId}/rewind/${id}`, 'POST');
  const data = await api(`/api/chat/${currentChatId}/messages`);
  if (data) messages = data.messages;
  renderMessages();
  // Trigger a new response (resend last user message)
  await retryLast();
}

async function retryLast() {
  hideSwipeToast();
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser) return;

  // Remove last assistant message if it exists
  const lastMsg = messages[messages.length - 1];
  if (lastMsg && lastMsg.role === 'assistant') {
    await api(`/api/chat/${currentChatId}/message/${lastMsg.id}`, 'DELETE');
    messages = messages.filter(m => m.id !== lastMsg.id);
    renderMessages();
  }

  // Resend
  const ocId = document.getElementById('ocSelect').value || null;
  const container = document.getElementById('messages');
  const typing = document.createElement('div');
  typing.className = 'typing-wrap';
  typing.id = 'typingIndicator';
  typing.innerHTML = `<div class="typing"><span></span><span></span><span></span></div>`;
  container.appendChild(typing);
  container.scrollTop = container.scrollHeight;
  setLoading(true);

  try {
    const r = await api(`/api/chat/${currentChatId}/send`, 'POST', {
      content: lastUser.content,
      oc_id: ocId ? parseInt(ocId) : null,
      _retry: true
    });
    typing.remove();
    if (r?.response) {
      // But we don't want to re-save the user message — need a different approach
      // Just reload messages
      const data = await api(`/api/chat/${currentChatId}/messages`);
      if (data) { messages = data.messages; renderMessages(); }
      showSwipeToast();
    }
  } finally {
    typing.remove();
    setLoading(false);
  }
}

/* ─────────────────────────────────
   SWIPE TOAST (regenerar)
───────────────────────────────── */
function showSwipeToast() {
  const t = document.getElementById('swipeToast');
  t.classList.remove('hidden');
  clearTimeout(swipeHideTimer);
  swipeHideTimer = setTimeout(hideSwipeToast, 4000);
}
function hideSwipeToast() {
  document.getElementById('swipeToast').classList.add('hidden');
}

/* ─────────────────────────────────
   CHAR MODAL
───────────────────────────────── */
function openCharModal() {
  editingCharId = null;
  charAvatarB64 = '';
  document.getElementById('charModalTitle').textContent = 'Nuevo personaje';
  ['charName','charDesc','charGreeting','charPersonality','charLore','charSystemOverride','charExamples'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('charTemp').value = 0.92;
  document.getElementById('charTempVal').textContent = '0.92';
  document.getElementById('charMaxTokens').value = 600;
  resetAvatarPreview('charAvatarPreview', '<i class="fas fa-robot" style="font-size:1.8rem;color:var(--text3)"></i>');
  switchTab('basic', document.querySelector('.tab'));
  openModal('charModal');
}

function editChar(id, e) {
  if (e) e.stopPropagation();
  const c = chars.find(x => x.id === id);
  if (!c) return;
  editingCharId = id;
  charAvatarB64 = c.avatar || '';
  document.getElementById('charModalTitle').textContent = 'Editar personaje';
  document.getElementById('charName').value      = c.nombre || '';
  document.getElementById('charDesc').value      = c.descripcion || '';
  document.getElementById('charGreeting').value  = c.greeting || '';
  document.getElementById('charPersonality').value = c.personalidad || '';
  document.getElementById('charLore').value      = c.historia || '';
  document.getElementById('charSystemOverride').value = c.system_override || '';
  document.getElementById('charExamples').value  = c.examples || '';
  document.getElementById('charTemp').value      = c.temperature || 0.92;
  document.getElementById('charTempVal').textContent = c.temperature || 0.92;
  document.getElementById('charMaxTokens').value = c.max_tokens || 600;

  const prev = document.getElementById('charAvatarPreview');
  if (c.avatar) { prev.style.backgroundImage = `url(${c.avatar})`; prev.innerHTML = ''; }
  else resetAvatarPreview('charAvatarPreview', '<i class="fas fa-robot" style="font-size:1.8rem;color:var(--text3)"></i>');

  switchTab('basic', document.querySelector('.tab'));
  openModal('charModal');
}

function editCurrentChar() {
  hideDropdown();
  if (currentChar) editChar(currentChar.id, null);
}

function closeCharModal() { closeModal('charModal'); }

async function saveChar() {
  const nombre = document.getElementById('charName').value.trim();
  if (!nombre) { showToast('El nombre es obligatorio'); return; }

  const payload = {
    id: editingCharId || undefined,
    nombre,
    descripcion:    document.getElementById('charDesc').value.trim(),
    greeting:       document.getElementById('charGreeting').value.trim(),
    personalidad:   document.getElementById('charPersonality').value.trim(),
    historia:       document.getElementById('charLore').value.trim(),
    systemOverride: document.getElementById('charSystemOverride').value.trim(),
    examples:       document.getElementById('charExamples').value.trim(),
    avatar:         charAvatarB64,
    temperature:    parseFloat(document.getElementById('charTemp').value),
    maxTokens:      parseInt(document.getElementById('charMaxTokens').value),
  };

  const r = await api('/api/personajes', 'POST', payload);
  if (r?.status === 'ok') {
    await loadChars();
    renderCharList(document.getElementById('searchInput').value);
    closeCharModal();
    showToast(editingCharId ? 'Personaje actualizado ✓' : 'Personaje creado ✓');
    // If editing current char, refresh header
    if (editingCharId && currentChar?.id === editingCharId) {
      currentChar = chars.find(c => c.id === editingCharId);
      setHeaderForChar(currentChar);
    }
  }
}

async function deleteChar(id, e) {
  if (e) e.stopPropagation();
  if (!confirm('¿Eliminar este personaje y todos sus chats?')) return;
  await api(`/api/personajes/${id}`, 'DELETE');
  await loadChars();
  renderCharList(document.getElementById('searchInput').value);
  if (currentChar?.id === id) {
    currentChar = null;
    currentChatId = null;
    document.getElementById('chatView').classList.add('hidden');
    document.getElementById('welcomeScreen').classList.remove('hidden');
    slideTo('left');
  }
  showToast('Personaje eliminado');
}

async function deleteCurrentChar() {
  hideDropdown();
  if (currentChar) await deleteChar(currentChar.id, null);
}

async function toggleFavById(id, e) {
  if (e) e.stopPropagation();
  await api(`/api/personajes/${id}/favorito`, 'POST');
  await loadChars();
  renderCharList(document.getElementById('searchInput').value);
  if (currentChar?.id === id) {
    currentChar = chars.find(c => c.id === id);
    setHeaderForChar(currentChar);
  }
}

async function toggleFav() {
  if (!currentChar) return;
  await toggleFavById(currentChar.id, null);
}

function onCharAvatarChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    charAvatarB64 = ev.target.result;
    const prev = document.getElementById('charAvatarPreview');
    prev.style.backgroundImage = `url(${charAvatarB64})`;
    prev.innerHTML = '';
  };
  reader.readAsDataURL(file);
}

/* ─────────────────────────────────
   CHAR MENU DROPDOWN
───────────────────────────────── */
function openCharMenu() {
  const btn = document.querySelector('.icon-btn[onclick*="openCharMenu"]');
  const menu = document.getElementById('charMenu');
  menu.classList.remove('hidden');
  const rect = btn.getBoundingClientRect();
  menu.style.top  = (rect.bottom + 6) + 'px';
  menu.style.right = (window.innerWidth - rect.right) + 'px';
  menu.style.left  = 'auto';
}
function hideDropdown() {
  document.getElementById('charMenu').classList.add('hidden');
}

/* ─────────────────────────────────
   CHAT HISTORY
───────────────────────────────── */
async function openChatHistory() {
  if (!currentChar) return;
  const chatList = await api(`/api/chats/${currentChar.id}`);
  const container = document.getElementById('historyList');
  container.innerHTML = '';
  (chatList || []).forEach(ch => {
    const item = document.createElement('div');
    item.className = 'history-item' + (ch.id === currentChatId ? ' active' : '');
    const date = ch.last_updated ? new Date(ch.last_updated * 1000).toLocaleDateString('es') : '';
    item.innerHTML = `
      <div class="history-item-info" onclick="selectChat(${ch.id})">
        <div class="history-item-title">${esc(ch.title || 'Conversación')}</div>
        <div class="history-item-preview">${esc(ch.last_message || 'Sin mensajes')}</div>
      </div>
      <div class="history-item-meta">${date}</div>
      <button class="history-del" onclick="deleteChatFromHistory(${ch.id})" title="Eliminar">
        <i class="fas fa-trash"></i>
      </button>`;
    container.appendChild(item);
  });
  openModal('historyModal');
}

async function selectChat(id) {
  closeHistoryModal();
  await loadChat(id);
}

async function deleteChatFromHistory(id) {
  if (!confirm('¿Eliminar esta conversación?')) return;
  await api(`/api/chat/${id}`, 'DELETE');
  if (id === currentChatId) {
    currentChatId = null;
    messages = [];
    document.getElementById('messages').innerHTML = '';
    if (currentChar?.greeting) {
      const gb = document.createElement('div');
      gb.className = 'greeting-bubble';
      gb.innerHTML = `<div class="bubble-name">${esc(currentChar.nombre)}</div>${renderMarkdown(currentChar.greeting)}`;
      document.getElementById('messages').appendChild(gb);
    }
  }
  await openChatHistory(); // refresh
}

function closeHistoryModal() { closeModal('historyModal'); }

async function newChatForChar() {
  closeHistoryModal();
  hideDropdown();
  if (!currentChar) return;
  const r = await api(`/api/chats/${currentChar.id}/new`, 'POST', { title: 'Nueva conversación' });
  if (r?.id) {
    await loadChat(r.id);
    showToast('Nueva conversación iniciada');
  }
}

async function clearCurrentChat() {
  hideDropdown();
  if (!currentChatId) return;
  if (!confirm('¿Vaciar el chat? Se eliminarán todos los mensajes.')) return;
  await api(`/api/chat/${currentChatId}/clear`, 'POST');
  messages = [];
  renderMessages();
  showToast('Chat vaciado ✓');
}

/* ─────────────────────────────────
   OC
───────────────────────────────── */
function renderOcList() {
  const container = document.getElementById('ocListSettings');
  if (!container) return;
  container.innerHTML = '';
  if (!ocs.length) {
    container.innerHTML = `<div style="font-size:12px;color:var(--text3);padding:8px 0">No tienes OCs aún</div>`;
    return;
  }
  ocs.forEach(o => {
    const card = document.createElement('div');
    card.className = 'oc-card';
    const avatarStyle = o.avatar ? `background-image:url(${o.avatar})` : '';
    const avatarInner = o.avatar ? '' : `<i class="fas fa-user"></i>`;
    card.innerHTML = `
      <div class="oc-card-avatar" style="${avatarStyle}">${avatarInner}</div>
      <div class="oc-card-info">
        <div class="oc-card-name">${esc(o.nombre)}</div>
        <div class="oc-card-role">${esc(o.rol || '')}</div>
      </div>
      <div class="oc-card-btns">
        <button class="icon-btn" onclick="editOc(${o.id})" title="Editar"><i class="fas fa-pen"></i></button>
        <button class="icon-btn" onclick="deleteOc(${o.id})" title="Eliminar"><i class="fas fa-trash" style="color:var(--danger)"></i></button>
      </div>`;
    container.appendChild(card);
  });
}

function renderOcSelect() {
  const sel = document.getElementById('ocSelect');
  const prev = sel.value;
  sel.innerHTML = '<option value="">Yo mismo</option>';
  ocs.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.id;
    opt.textContent = o.nombre;
    sel.appendChild(opt);
  });
  if (prev) sel.value = prev;
}

function onOcChange() { updateOcSub(); }

function openOcModal(id = null) {
  editingOcId = id;
  ocAvatarB64 = '';

  if (id) {
    const o = ocs.find(x => x.id === id);
    if (!o) return;
    ocAvatarB64 = o.avatar || '';
    document.getElementById('ocModalTitle').textContent = 'Editar OC';
    document.getElementById('ocName').value        = o.nombre || '';
    document.getElementById('ocRole').value        = o.rol || '';
    document.getElementById('ocAppearance').value  = o.apariencia || '';
    document.getElementById('ocPersonality').value = o.personalidad || '';
    document.getElementById('ocLore').value        = o.historia || '';
    const prev = document.getElementById('ocAvatarPreview');
    if (o.avatar) { prev.style.backgroundImage = `url(${o.avatar})`; prev.innerHTML = ''; }
    else resetAvatarPreview('ocAvatarPreview', '<i class="fas fa-user" style="font-size:1.8rem;color:var(--text3)"></i>');
  } else {
    document.getElementById('ocModalTitle').textContent = 'Nuevo OC';
    ['ocName','ocRole','ocAppearance','ocPersonality','ocLore'].forEach(id => document.getElementById(id).value = '');
    resetAvatarPreview('ocAvatarPreview', '<i class="fas fa-user" style="font-size:1.8rem;color:var(--text3)"></i>');
  }
  openModal('ocModal');
}
function editOc(id) { openOcModal(id); }
function closeOcModal() { closeModal('ocModal'); }

async function saveOc() {
  const nombre = document.getElementById('ocName').value.trim();
  if (!nombre) { showToast('El nombre es obligatorio'); return; }
  const payload = {
    id: editingOcId || undefined,
    nombre,
    rol:          document.getElementById('ocRole').value.trim(),
    apariencia:   document.getElementById('ocAppearance').value.trim(),
    personalidad: document.getElementById('ocPersonality').value.trim(),
    historia:     document.getElementById('ocLore').value.trim(),
    avatar:       ocAvatarB64,
  };
  const r = await api('/api/ocs', 'POST', payload);
  if (r?.status === 'ok') {
    await loadOcs();
    renderOcList();
    renderOcSelect();
    closeOcModal();
    showToast(editingOcId ? 'OC actualizado ✓' : 'OC creado ✓');
  }
}

async function deleteOc(id) {
  if (!confirm('¿Eliminar este OC?')) return;
  await api(`/api/ocs/${id}`, 'DELETE');
  await loadOcs();
  renderOcList();
  renderOcSelect();
  showToast('OC eliminado');
}

function onOcAvatarChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    ocAvatarB64 = ev.target.result;
    const prev = document.getElementById('ocAvatarPreview');
    prev.style.backgroundImage = `url(${ocAvatarB64})`;
    prev.innerHTML = '';
  };
  reader.readAsDataURL(file);
}

/* ─────────────────────────────────
   SETTINGS / PROFILE
───────────────────────────────── */
function openSettings() {
  document.getElementById('profileName').value = perfil.nombre || '';
  const prev = document.getElementById('profileAvatarPreview');
  if (perfil.avatar) { prev.style.backgroundImage = `url(${perfil.avatar})`; prev.innerHTML = ''; }
  else { prev.style.backgroundImage = ''; prev.innerHTML = '<i class="fas fa-user" style="font-size:1.5rem;color:var(--text3)"></i>'; }
  profileAvatarB64 = perfil.avatar || '';
  document.getElementById('settingsOverlay').classList.remove('hidden');
  document.getElementById('settingsPanel').classList.remove('hidden');
}
function closeSettings() {
  document.getElementById('settingsOverlay').classList.add('hidden');
  document.getElementById('settingsPanel').classList.add('hidden');
}
async function saveProfile() {
  const nombre = document.getElementById('profileName').value.trim();
  await api('/api/perfil', 'POST', { nombre, avatar: profileAvatarB64 });
  perfil = { ...perfil, nombre, avatar: profileAvatarB64 };
  updateUserAvatar();
  showToast('Perfil guardado ✓');
}
function updateUserAvatar() {
  const el = document.getElementById('userAvatar');
  if (perfil.avatar) {
    el.style.backgroundImage = `url(${perfil.avatar})`;
    el.innerHTML = '';
  } else {
    el.style.backgroundImage = '';
    el.innerHTML = `<i class="fas fa-user"></i>`;
  }
}
function onProfileAvatarChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    profileAvatarB64 = ev.target.result;
    const prev = document.getElementById('profileAvatarPreview');
    prev.style.backgroundImage = `url(${profileAvatarB64})`;
    prev.innerHTML = '';
  };
  reader.readAsDataURL(file);
}
async function doLogout() {
  await api('/api/logout', 'POST');
  location.href = '/login';
}

/* ─────────────────────────────────
   TABS (modal)
───────────────────────────────── */
function switchTab(name, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${name}`).classList.remove('hidden');
  if (btn) btn.classList.add('active');
}

/* ─────────────────────────────────
   MOBILE NAV
───────────────────────────────── */
function goBack() {
  slideTo('left');
}
function slideTo(side) {
  const pl = document.getElementById('panelLeft');
  const pr = document.getElementById('panelRight');
  if (window.innerWidth > 700) return;
  if (side === 'right') {
    pl.classList.add('slide-out');
    pr.classList.add('slide-in');
  } else {
    pl.classList.remove('slide-out');
    pr.classList.remove('slide-in');
  }
}

function onTouchStart(e) {
  touchStartX = e.changedTouches[0].screenX;
}
function onTouchEnd(e) {
  if (window.innerWidth > 700) return;
  const dx = e.changedTouches[0].screenX - touchStartX;
  if (dx > 60 && document.getElementById('panelLeft').classList.contains('slide-out')) {
    goBack(); // swipe right → go back to list
  }
  if (dx < -60 && !document.getElementById('panelLeft').classList.contains('slide-out') && currentChar) {
    slideTo('right'); // swipe left → go to chat
  }
}

/* ─────────────────────────────────
   MODAL HELPERS
───────────────────────────────── */
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// Close modals on backdrop click
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });
});

/* ─────────────────────────────────
   TOAST
───────────────────────────────── */
let toastTimer;
function showToast(msg, duration = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.opacity = '0'; }, duration);
}

/* ─────────────────────────────────
   MARKDOWN / ROLEPLAY RENDERING
───────────────────────────────── */
function renderMarkdown(text) {
  if (!text) return '';
  let t = esc(text);
  // **bold**
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // *italics* (actions)
  t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // newlines
  t = t.replace(/\n/g, '<br>');
  return t;
}

function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ─────────────────────────────────
   UTILS
───────────────────────────────── */
function getInitial(name) {
  return name ? name.charAt(0).toUpperCase() : '?';
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts);
  return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 130) + 'px';
}

function resetAvatarPreview(id, innerHtml) {
  const el = document.getElementById(id);
  el.style.backgroundImage = '';
  el.innerHTML = innerHtml;
}