const path = require('path');
const fs = require('fs');
const https = require('https');
const express = require('express');
const { Server} = require('socket.io');
const { socket } = require('./socket.js');

const publicDir = path.join(__dirname, 'public');
const httpsConfigDir = path.join(__dirname, 'https_config');

const httpsOptions = {
  key: fs.readFileSync(path.join(httpsConfigDir, 'key.pem')),
  cert: fs.readFileSync(path.join(httpsConfigDir, 'cert.pem'))
};

const app = express();
const server = https.createServer(httpsOptions, app);
const io = new Server(server);

socket(io);
app.use('/', express.static(publicDir));

server.listen(3000, () => {
  console.log('Server running on https://localhost:3000');
});