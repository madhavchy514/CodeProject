const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const socket = require('socket.io');

class ResourceStat {
  static async cpuLoad(ms = 100) {
    const a = os.cpus();
    await new Promise(res => setTimeout(res, ms));;
    const b = os.cpus();

    const cores = a.length;
    const percentages = [];

    for (let j = 0; j < cores; j++) {
      const aIdle = a[j].times.idle;
      const bIdle = b[j].times.idle;

      const aTotal = Object.values(a[j].times).reduce((a, c) => a + c, 0);
      const bTotal = Object.values(b[j].times).reduce((a, c) => a + c, 0);

      if (bTotal - aTotal === 0) {
        percentages.push(0);
        continue;
      }

      const percentage = (((bTotal - bIdle) - (aTotal - aIdle)) / (bTotal - aTotal)) * 100;
      percentages.push(percentage);
    }

    const avg = percentages.reduce((a, c) => a + c, 0) / a.length;
    return { cores, percentages, avg };
  }

  static async memLoad() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    const percentage = (used / total) * 100;
    return { used, percentage };
  }
}

const public = path.resolve('./public');
const port = 3000;
const interval = 1000;

const app = express();
const server = http.createServer(app);
const io = new socket.Server(server);

app.use(express.static(public));

server.listen(port, () => {
  console.log(`server running on http://localhost:${port}`);
});

setInterval(async () => {
  try {
    io.emit('success', {
      success: true,
      cpu: await ResourceStat.cpuLoad(500),
      mem: await ResourceStat.memLoad(),
      timestamp: Date.now()
    });
  } catch (e) {
    io.emit('error', {
      success: false,
      reason: e.message,
      timestamp: Date.now()
    });
  }
}, interval);