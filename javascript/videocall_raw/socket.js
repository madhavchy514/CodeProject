function socket(io) {
  const videocall = io.of('/videocall');

  videocall.on('connection', (socket) => {
    const sid = socket.id;

    socket.broadcast.emit('user-join', { sid });
    const allSID = Array.from(videocall.sockets.keys());
    socket.emit('user-list', allSID);

    socket.on('stream-video', ({ frameData, frameWidth, frameHeight }) => {
      socket.broadcast.emit('stream-video', { sid, frameData, frameWidth, frameHeight });
    });
    socket.on('stream-audio', ({ audioData }) => {
      socket.broadcast.emit('stream-audio', { sid, audioData });
    });
    socket.on('disconnect', () => {
      videocall.emit('user-left', { sid });
    });
  });
}
module.exports = { socket };