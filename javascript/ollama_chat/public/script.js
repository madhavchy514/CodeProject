const socket = io({
  query: {
    uid: new URL(window.location).searchParams.get('uid') || 'guest'
  }
});

const chatDiv = document.querySelector('#chat-div');
const sendBtn = document.querySelector('.send-btn');
const stopBtn = document.querySelector('.stop-btn');
const messageInput = document.querySelector('#message-input');

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;
  socket.emit('user message request', { content: text });
}

function stopMessage() {
  socket.emit('user stop request');
}

function show(type) {
  if (type === 'send') {
    sendBtn.style.display = 'flex';
    stopBtn.style.display = 'none';
  } else {
    sendBtn.style.display = 'none';
    stopBtn.style.display = 'flex';
  }
}

function setDeleteMessage(id) {
  const aiOrUsrDiv = document.getElementById(id);
  if (aiOrUsrDiv.querySelector('.delete-btn')) return;
  const deleteSpan = document.createElement('span');
  deleteSpan.className = 'delete-btn'
  deleteSpan.innerHTML = '⛔';
  deleteSpan.onclick = () => socket.emit('user delete request', { id });
  aiOrUsrDiv.appendChild(deleteSpan);
}

socket.on('load history', ({ history }) => {
  chatDiv.innerHTML = '';
  
  history.forEach(msg => {
    const div = document.createElement('div');
    div.id = msg.id;
    div.className = `msg ${msg.role === 'user' ? 'user-msg' : 'ai-msg'}`;
    div.innerHTML = `<span class='content'></span>`;
    div.querySelector('.content').innerText = msg.content;
    chatDiv.appendChild(div);
    setDeleteMessage(msg.id);
  });

  chatDiv.scrollTop = chatDiv.scrollHeight;
});

socket.on('user message acknowledged', ({ content, id }) => {
  chatDiv.innerHTML += `<div class='msg user-msg' id='${id}'>${content}</div>`;
  messageInput.value = '';
  setDeleteMessage(id);
  chatDiv.scrollTop = chatDiv.scrollHeight;
  show('stop');
});

socket.on('ai message start', ({ id }) => {
  const aiDiv = document.createElement('div');
  aiDiv.id = id;
  aiDiv.className = 'msg ai-msg';
  aiDiv.innerHTML = `<span class='content'>Thinking...</span>`;
  chatDiv.appendChild(aiDiv);
  show('stop');
});

socket.on('ai message going', ({ content, id }) => {
  const aiDiv = document.getElementById(id);
  const contentSpan = aiDiv.querySelector('.content');
  if (contentSpan.innerText === 'Thinking...') contentSpan.innerText = '';
  contentSpan.innerText += content;
  show('stop');
});

socket.on('ai message done', ({ id }) => {
  setDeleteMessage(id);
  show('send');
});

socket.on('ai message error', ({ content, id }) => {
  const aiDiv = document.getElementById(id);
  const contentSpan = aiDiv.querySelector('.content');
  contentSpan.innerHTML += `<span color='red'>${content}</span>`;
  show('send');
});

socket.on('message deleted', ({ id }) => {
  const el = document.getElementById(id);
  if (el) el.remove();
});

show('send');
sendBtn.addEventListener('click', () => sendMessage());
stopBtn.addEventListener('click', () => stopMessage());
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    stopMessage();
    sendMessage();
  }
});