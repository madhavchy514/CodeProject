const socket = io();

const MAX_DATA_POINTS = 20;
let cpuData = [];
let memData = [];

const statusEl = document.getElementById('connectionStatus');
const cpuCanvas = document.getElementById('cpuChart');
const memCanvas = document.getElementById('memChart');

socket.on('connect', () => {
  statusEl.textContent = 'Connected';
  statusEl.style.color = 'green';
});

socket.on('disconnect', () => {
  statusEl.textContent = 'Disconnected';
  statusEl.style.color = 'red';
});

const graphConfig = {
  canvas: { background: '#222', padX: 50, padY: 30 },
  grid: { 
    lineColor: '#444', 
    textColor: '#888',
    stepX: 5, 
    stepY: 5,
    textFilter: (v) => `${v}%`
  },
  line: { width: 2, color: '#4bc0c0' }
};

socket.on('success', (data) => {
  const cpuLoad = data.cpu.avg;
  cpuData.push(cpuLoad);
  if (cpuData.length > MAX_DATA_POINTS) cpuData.shift();

  const memPercent = data.mem.percentage;
  memData.push(memPercent);
  if (memData.length > MAX_DATA_POINTS) memData.shift();

  const memUsed = data.mem.used / (1024 ** 3);
  document.getElementById('currentCpuLoad').textContent = `${cpuLoad.toFixed(2)}%`;
  document.getElementById('currentMemUsed').textContent = `${memUsed.toFixed(2)} GB`;
  document.getElementById('currentMemPercent').textContent = `${memPercent.toFixed(2)}%`;

  Graph.draw(cpuCanvas, [{ data: cpuData, line: { color: '#4bc0c0' } }], 100, graphConfig);
  Graph.draw(memCanvas, [{ data: memData, line: { color: '#ff6384' } }], 100, graphConfig);
});