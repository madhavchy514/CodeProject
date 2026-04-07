import { io } from './lib/socket.js';
import { 
  workerDelay, showAlert, createCanvas, createMedia, switchButton, isMobile, 
  startCamera, startMicrophone, stopCamera, stopMicrophone, float32ToWav
} from './util.js';

const socket = io('/videocall');

const videoId = (sid) => `video-${sid}`;
const canvasId = (sid) => `canvas-${sid}`;

const fps = 30;
const frameCaptureInterval = 1000 / fps;
const scale = 0.5;

let loaded = false;
let started = false;

let cameraOn = false;
let microphoneOn = false;
let facingMode = 'user';

let myVideo = false;
let myCanvas = false;
let audioCtxs = {};

const startButton = document.getElementById('start');
const cameraButton = document.getElementById('camera');
const reverseCameraButton = document.getElementById('reverse-camera');
const microphoneButton = document.getElementById('microphone');

if (!isMobile()) reverseCameraButton.classList.add('hidden');

startButton.addEventListener('click', async () => {
  if (!loaded) return;
  document.getElementById('start').classList.add('hidden');
  started = true;
});

cameraButton.addEventListener('click', async () => {
  switchButton(cameraButton, streamMyCamera, unstreamMyCamera);
});

reverseCameraButton.addEventListener('click', async () => {
  switchButton(reverseCameraButton, reverseMyCamera, reverseMyCamera);
});

microphoneButton.addEventListener('click', async () => {
  switchButton(microphoneButton, streamMyMicrophone, unstreamMyMicrophone);
});

socket.on('user-list', (sids) => {
  myVideo = createMedia(videoId(socket.id), 'video', { hidden: true, muted: true });
  myCanvas = createCanvas(canvasId(socket.id), { text: `You - ${socket.id}` });

  loaded = true;

  for (const sid of sids) {
    if (sid !== socket.id) {
      createCanvas(canvasId(sid), { text: sid });
    }
  }
});

socket.on('stream-video', ({ sid, frameData, frameWidth, frameHeight }) => {
  streamVideo({ sid, frameData, frameWidth, frameHeight });
});

socket.on('stream-audio', ({ sid, audioData }) => {
  streamAudio({ sid, audioData });
});

socket.on('user-join', ({ sid }) => {
  addUser({ sid });
});

socket.on('user-left', ({ sid }) => {
  deleteUser({ sid });
});

function sendFrame(frameData) {
  if (!loaded || !started || !cameraOn) return;
  socket.emit('stream-video', { 
    frameData: frameData,
    frameWidth: myCanvas.width,
    frameHeight: myCanvas.height,
  });
}

function sendAudioChunk(audioData) {
  if (!loaded || !started || !microphoneOn) return;
  socket.emit('stream-audio', { audioData });
}

async function streamMyCamera(reverse = false) {
  if (!loaded || !started) return;
  if (reverse) facingMode = facingMode === 'user' ? 'environment' : 'user';
  const stream = await startCamera({ fps, facingMode });
  if (!stream) return;

  cameraOn = true;
  myVideo.srcObject = stream;
  myVideo.addEventListener('loadedmetadata', () => {
    myVideo.play();
    startFrameCapture();
  }, { once: true });
}

async function unstreamMyCamera() {
  if (!started || !cameraOn) return;
  stopCamera();
  cameraOn = false;
  facingMode = 'user';
}

async function reverseMyCamera() {
  if (!started || !cameraOn) return;
  await unstreamMyCamera();
  await streamMyCamera(true);
}

async function startFrameCapture() {
  if (!started || !cameraOn) return;

  const width = myVideo.videoWidth * scale;
  const height = myVideo.videoHeight * scale;

  if (myCanvas.width !== width || myCanvas.height !== height) {
    myCanvas.width = width;
    myCanvas.height = height;
  }

  const ctx = myCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(myVideo, 0, 0, myCanvas.width, myCanvas.height);
  
  const dataURL = myCanvas.toDataURL('image/jpeg');
  sendFrame(dataURL);
  
  await workerDelay(frameCaptureInterval);
  return await startFrameCapture();
}

async function streamVideo({ sid, frameData, frameWidth, frameHeight }) {
  if (!started) return;

  const canvas = createCanvas(canvasId(sid), { text: sid });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (canvas.width !== frameWidth || canvas.height !== frameHeight) {
    canvas.width = frameWidth;
    canvas.height = frameHeight;
  }

  const img = new Image();
  img.src = frameData;
  img.onload = () => {
    ctx.drawImage(img, 0, 0, frameWidth, frameHeight);
  };
}

async function streamMyMicrophone() {
  if (!started) return;
  
  const stream = await startMicrophone();
  if (!stream) return;

  microphoneOn = true;
  if (!audioCtxs[socket.id]) audioCtxs[socket.id] = new (window.AudioContext || window.webkitAudioContext)();
  await captureMyAudio(stream);
}

async function unstreamMyMicrophone() {
  if (!started || !microphoneOn) return;
  stopMicrophone();
  if (audioCtxs[socket.id]) {
    audioCtxs[socket.id].close();
    audioCtxs[socket.id] = undefined;
  };
  microphoneOn = false;
}

async function captureMyAudio(stream) {
  if (!started || !microphoneOn) return;

  const source = audioCtxs[socket.id].createMediaStreamSource(stream);
  const processor = audioCtxs[socket.id].createScriptProcessor(4096, 1, 1);

  source.connect(processor);
  processor.connect(audioCtxs[socket.id].destination);

  processor.onaudioprocess = (e) => {
    if (!started || !microphoneOn) return;

    const inputData = e.inputBuffer.getChannelData(0);
    
    let binary = '';
    for (let i = 0; i < inputData.length; i++) {
      const v = Math.max(-1, Math.min(1, inputData[i]));
      const int16 = v * 0x7fff;
      binary += String.fromCharCode(int16 & 0xff, (int16 >> 8) & 0xff);
    }

    const base64 = btoa(binary);
    sendAudioChunk(base64);
  };
}

async function streamAudio({ sid, audioData }) {
  if (!started) return;

  if (!audioData || audioData.length === 0) return;

  const binary = atob(audioData);
  const float32Data = new Float32Array(binary.length / 2);

  for (let i = 0; i < float32Data.length; i++) {
    const lo = binary.charCodeAt(i * 2);
    const hi = binary.charCodeAt(i * 2 + 1);
    let int16 = (hi << 8) | lo;
    if (int16 & 0x8000) int16 -= 0x10000;
    float32Data[i] = int16 / 0x7fff;
  }

  if (!audioCtxs[sid]) audioCtxs[sid] = new (window.AudioContext || window.webkitAudioContext)();

  const wav = float32ToWav(float32Data, audioCtxs[sid].sampleRate);
  audioCtxs[sid].decodeAudioData(wav, (buffer) => {
    const source = audioCtxs[sid].createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtxs[sid].destination);
    source.start();
  });
}

function addUser({ sid }) {
  createCanvas(canvasId(sid), { text: sid });
  showAlert(`User connected ${sid}`);
}

function deleteUser({ sid }) {
  document.getElementById(videoId(sid))?.remove();
  document.getElementById(canvasId(sid))?.remove();
  showAlert(`User disconnected ${sid}`);
}