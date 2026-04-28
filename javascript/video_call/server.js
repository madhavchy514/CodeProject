const express = require('express');
const socket = require('socket.io');
const https = require('https');
const env = require('dotenv');
const path = require('path');
const fs = require('fs');

env.config({ path: './.env', quiet: true });
const PUBLIC = path.resolve(process.env.PUBLIC);
const PORT = process.env.PORT;

const app = express();
const server = https.createServer({
  key: fs.readFileSync(process.env.KEY_PATH),
  cert: fs.readFileSync(process.env.CERT_PATH)
}, app);
const io = new socket.Server(server);

app.use(express.static(PUBLIC));
server.listen(PORT, () => console.log(`https://localhost:${PORT}`));
io.on('connection', (socket) => {
  socket.broadcast.emit('user join', { id: socket.id });
  console.log(`user connected: ${socket.id}`);
  const ids = Array.from(io.sockets.sockets.keys()).filter(id => id !== socket.id);
  socket.emit('user list', { ids });
  socket.on('video broadcast request', ({ data, width, height }) => {
    socket.broadcast.emit('video broadcast', { id: socket.id, data, width, height });
  });
  socket.on('audio broadcast request', ({ data }) => {
    socket.broadcast.emit('audio broadcast', { id: socket.id, data });
  });
  socket.on('disconnect', () => {
    socket.broadcast.emit('user left', { id: socket.id });
    console.log(`user disconnected: ${socket.id}`);
  });
});