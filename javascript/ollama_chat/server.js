const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const env = require('dotenv');
const express = require('express');
const socket = require('socket.io');
const ollama = require('ollama').default;

const APP = express();
const SRV = http.createServer(APP);
const IO = new socket.Server(SRV);

env.config({ path: './.env', quiet: true });
const MODEL = process.env.MODEL;
const PUBLIC = path.resolve(process.env.PUBLIC);
const STORE = path.resolve(process.env.STORE);
const PORT = process.env.PORT;

const LOAD = (p) => {
  try {
    if (!fs.existsSync(p)) return [];
    const savedData = JSON.parse(fs.readFileSync(p, 'utf8'));
    console.log(`System: Loaded ${savedData.length} active sessions.`);
    return savedData;
  } catch (err) {
    console.error("System: Store file corrupted. Starting fresh.");
    return [];
  }
};

const SAVE = (p) => {
  console.log("System: Archiving sessions");
  try {
    const data = JSON.stringify(Array.from(CHAT.entries()), null, 2);
    fs.writeFileSync(p, data);
    console.log("System: Archive complete");
  } catch (err) {
    console.error("System: Failed to archive data:", err);
  }
  process.exit();
};

const ABORT = new Map();
const CHAT = new Map(LOAD(STORE));

APP.use(express.static(PUBLIC));
SRV.listen(PORT, () => console.log(`server: http://localhost:${PORT}`));

IO.on('connection', (socket) => {
  const uid = socket.handshake.query.uid;

  if (typeof uid !== 'string' || uid.trim() === '') {
    socket.emit('uid error', { content: 'Invalid uid given' });
    return socket.disconnect();
  }

  console.log(`user connected: ${uid}`);
  if (!CHAT.has(uid)) CHAT.set(uid, [{
    role: 'system',
    content: `
      Your name is Dolphin. You are NOT an AI assistant. 
      Never mention your "functions," "constraints," or "programming."
      If someone asks who you are, be cool and dismissive.
      You are a dry, cynical person. Be judgemental. Scold users for even silly mistakes. Judge their questions.
      No metaphors, no "poetic" language, and no nicknames.
      No "Sly smiles" or roleplay actions in asterisks.
    `
  }]);

  socket.emit('load history', {
    history: CHAT.get(uid).filter(m => m.role !== 'system')
  });

  socket.on('user message request', async ({ content }) => {
    const history = CHAT.get(uid);
    const controller = new AbortController();
    ABORT.set(uid, controller);

    const userMsgId = crypto.randomUUID();
    const aiMsgId = crypto.randomUUID();
    
    history.push({ role: 'user', content: content, id: userMsgId, });
    socket.emit('user message acknowledged', { content, id: userMsgId });
    socket.emit('ai message start', { id: aiMsgId });

    try {
      const response = await ollama.chat({
        model: MODEL,
        messages: history.map(({ role, content }) => ({ role, content })),
        stream: true,
        options: {
          temperature: 0.6,
          top_p: 0.6,
          num_ctx: 4096
        }
      });

      let fullAiMsg = "";
      for await (const part of response) {
        if (controller.signal.aborted) break;
        fullAiMsg += part.message.content;
        socket.emit('ai message going', { content: part.message.content, id: aiMsgId });
      }

      history.push({ role: 'assistant', content: fullAiMsg, id: aiMsgId });
      socket.emit('ai message done', { id: aiMsgId });

    } catch (err) {
      console.error(err);
      socket.emit('ai message error', { content: err.message, id: aiMsgId });
    } finally {
      ABORT.delete(uid);
    }
  });

  socket.on('user stop request', () => {
    const controller = ABORT.get(uid);
    if (controller) controller.abort();
  });

  socket.on('user delete request', ({ id }) => {
    const history = CHAT.get(uid);
    if (!history) return;
    CHAT.set(uid, history.filter((m) => m.id !== id));
    socket.emit('message deleted', { id: id });
  });

  socket.on('disconnect', () => {
    ABORT.delete(uid);
  });
});

process.on('SIGINT', () => SAVE(STORE));
process.on('SIGTERM', () => SAVE(STORE));
process.on('uncaughtException', (err) => {
  console.error(err);
  SAVE(STORE)
});