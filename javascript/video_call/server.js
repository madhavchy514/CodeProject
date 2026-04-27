const express = require('express');
const socket = require('socket.io');
const http = require('http');
const env = require('dotenv');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new socket.Server(server);

env.config({ path: './.env', quiet: true });
const PUBLIC = path.resolve(process.env.PUBLIC);
const PORT = process.env.PORT;

app.use(express.static(PUBLIC));
server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
io.on('connection', (socket) => {
  socket.broadcast.emit('user join', { id: socket.id });
  console.log(`user connected: ${socket.id}`);
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