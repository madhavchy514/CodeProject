const http = require('http');
const express = require('express');
const socketIO = require('socket.io');

const port = 3000;
const app = express();
const server = http.createServer(app);
const io = new socketIO.Server(server);

app.use(express.static('public'));

server.listen(port, '0.0.0.0', () => {
  console.log(`server running on: http://localhost:${port}`);
});

io.on('connection', (socket) => {

  socket.on('join-room', (roomId) => {
    const room = io.sockets.adapter.rooms.get(roomId);
    if (room && room.size >= 2) {
      socket.emit('full');
      return;
    }

    const existingPeerId = room ? [...room][0] : null;

    socket.join(roomId);
    socket.emit('joined', socket.id);

    if (existingPeerId) {
      socket.emit('user-join', existingPeerId);
      socket.to(roomId).emit('user-join', socket.id);
    }
  });

  socket.on('signal', ({ room, signal }) => {
    socket.to(room).emit('signal', { signal });
  });

  socket.on('disconnecting', () => {
    for (const room of socket.rooms) {
      if (room !== socket.id) {
        socket.to(room).emit('user-left');
      }
    }
  });
});