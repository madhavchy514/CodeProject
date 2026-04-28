class AppError extends Error {
  constructor(msg, opts) {
    super(msg);
    this.name = this.constructor.name;
    Object.assign(this, opts);
  }
}

class Media {
  /** @type {null | MediaStream} */
  stream = null;
  /** @type {null | HTMLVideoElement} */
  video = null;

  camera = true;
  microphone = true;
  face = true;

  width = 640;
  height = 480;
  fps = 30;

  echo = false;
  noise = false;

  constructor() {
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.autoplay = true;
    this.video.playsInline = true;
  }

  async deploy() {
    this.stop();
    if (!this.camera && !this.microphone) return;
    await this.start();
  }

  constrains() {
    return {
      video: this.camera ? {
        facingMode: this.face ? 'user' : 'environment',
        frameRate: { ideal: this.fps },
        width: { ideal: this.width },
        height: { ideal: this.height }
      } : false,
      audio: this.microphone ? {
        noiseSuppression: !this.noise,
        echoCancellation: !this.echo,
      } : false
    };
  }

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia(this.constrains());
      this.video.srcObject = this.stream;
      this.video.play();
    } catch (err) {
      this.stream = null;
      this.video.srcObject = null;
      throw new AppError('Failed to get user media', {
        code: 'USER_MEDIA',
        cause: err
      });
    }
  }

  stop() {
    if (!this.stream) return;
    try {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
      this.video.srcObject = null;
    } catch (err) {
      this.stream = null;
      this.video.srcObject = null;
      throw new AppError('Failed to remove user media', {
        code: 'USER_MEDIA',
        cause: err
      });
    }
  }

  toggleAudio(enabled) {
    if (!this.stream || !this.microphone) return;
    const audioTrack = this.stream.getAudioTracks();
    audioTrack.forEach(t => t.enabled = enabled);
  }

  toggleVideo(enabled) {
    if (!this.stream || !this.camera) return;
    const videoTrack = this.stream.getVideoTracks();
    videoTrack.forEach(t => t.enabled = enabled);
  }
}

class MediaCode {
  static async encodeAudioToBase64(stream, durationMs = 100) {
    try {
      return await new Promise(res => {
        const mediaRecorder = new MediaRecorder(stream);
        const audioChunks = [];
        mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onload = (e) => {
            const base64 = reader.result;
            res(base64);
          }
        }
        mediaRecorder.start();
        setTimeout(() => mediaRecorder.stop(), durationMs);
      });
    } catch (err) {
      throw new AppError("Failed to encode audio to base64", {
        code: 'AUDIO_ENCODE',
        cause: err
      });
    }
  }

  static async decodeAudioFromBase64(base64, audioCtx) {
    try {
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      const response = await fetch(base64);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);
      source.start();
    } catch (err) {
      throw new AppError('Failed to decode base64 to audio', {
        code: 'AUDIO_DECODE',
        cause: err
      });
    }
  }

  static async encodeVideoToBase64(canvas, quality = 1) {
    try {
      return canvas.toDataURL('image/jpeg', quality);
    } catch (err) {
      throw new AppError('Failed to encode video to base64', {
        code: 'VIDEO_ENCODE',
        cause: err
      });
    }
  }

  static async decodeVideoFromBase64(canvas, base64) {
    try {
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.src = base64;
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
    } catch (err) {
      throw new AppError('Failed to decode base64 to video', {
        code: 'VIDEO_DECODE',
        cause: err
      });
    }
  }
}

const timerWorker = new Worker(URL.createObjectURL(new Blob([`
  self.onmessage = function(e) {
    const { type, interval } = e.data;
    setTimeout(() => {
      self.postMessage('tick-' + type);
    }, interval);
  };
`], { type: 'application/javascript' })));

const fps = 120;
const audioIntervalMs = 10;
const quality = 0.3;
const recordTimeMs = 500;

const container = document.getElementById('container');
const camera = document.getElementById('camera');
const microphone = document.getElementById('microphone');
const reverse = document.getElementById('reverse');

const socket = io();
const remoteUsers = {};
const media = new Media();
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const myVideo = media.video;
const myDiv = createUserElement(null);
const myCanvas = myDiv.querySelector('canvas');
const myCtx = myCanvas.getContext('2d');

function createUserElement(id = null) {
  const div = document.createElement('div');
  div.className = 'user';
  div.id = `user-${id}`;
  const canvas = document.createElement('canvas');
  const title = document.createElement('div');
  title.className = 'title';
  title.innerText = id === null ? `you` : `user: ${id}`;
  div.append(canvas, title);
  container.appendChild(div);
  if (id !== null) remoteUsers[id] = div;
  return div;
}

async function broadcastVideo () {
  if (myVideo && media.stream && media.camera) {
    myCtx.drawImage(myVideo, 0, 0, myCanvas.width, myCanvas.height);
    const base64 = await MediaCode.encodeVideoToBase64(myCanvas, quality);
    socket.emit('video broadcast request', { 
      data: base64,
      width: media.width, 
      height: media.height 
    });
  } else {
    socket.emit('video broadcast request', { data: null, width: null, height: null });
    myCtx.clearRect(0, 0, myCanvas.width, myCanvas.height);
  }

  setMuteTag(myDiv, !media.microphone);
  timerWorker.postMessage({ type: 'video', interval: 1000 / fps });
}

async function broadcastAudio() {
  if (media.stream && media.microphone) {
    const base64 = await MediaCode.encodeAudioToBase64(media.stream, recordTimeMs);
    socket.emit('audio broadcast request', { data: base64 });
  } else {
    socket.emit('audio broadcast request', { data: null });
  }
  timerWorker.postMessage({ type: 'audio', interval: audioIntervalMs });
}

function setMuteTag(userDiv, muted) {
  let muteTag = userDiv.querySelector('.muted');
  if (muted && !muteTag) {
    muteTag = document.createElement('span');
    muteTag.className = 'muted';
    muteTag.style.color = 'red';
    muteTag.innerHTML = 'M&nbsp;';
    userDiv.querySelector('.title').prepend(muteTag);
  } else if (!muted && muteTag) {
    muteTag.remove();
  }
}

function syncUi() {
  media.camera ? camera.classList.remove('inactive') : camera.classList.add('inactive');
  media.microphone ? microphone.classList.remove('inactive') : microphone.classList.add('inactive');
  media.face ? reverse.classList.add('inactive') : reverse.classList.remove('inactive');
}

async function init() {
  media.camera = false;
  media.microphone = false;
  media.face = true;
  media.fps = fps;
  myCanvas.width = media.width;
  myCanvas.height = media.height;
  syncUi();

  timerWorker.onmessage = (e) => {
    if (e.data === 'tick-video') broadcastVideo();
    if (e.data === 'tick-audio') broadcastAudio();
  };

  broadcastVideo();
  broadcastAudio();
}

socket.on('video broadcast', async ({ id, data, width, height }) => {
  if (!remoteUsers[id]) remoteUsers[id] = createUserElement(id);
  const canvas = remoteUsers[id].querySelector('canvas');
  if (width && canvas.width !== width) canvas.width = width;
  if (height && canvas.height !== height) canvas.height = height;
  if (data) return await MediaCode.decodeVideoFromBase64(canvas, data);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

socket.on('audio broadcast', async ({ id, data }) => {
  const user = remoteUsers[id];
  if (!user) return;
  setMuteTag(user, !data);
  if (data) await MediaCode.decodeAudioFromBase64(data, audioCtx);
});

socket.on('user left', ({ id }) => {
  if (remoteUsers[id]) {
    remoteUsers[id].remove();
    delete remoteUsers[id];
  }
});

socket.on('user list', ({ ids }) => {
  for (const id of ids) {
    if (remoteUsers[id]) continue;
    remoteUsers[id] = createUserElement(id);
  }
});

camera.onclick = () => {
  media.camera = !media.camera;
  media.deploy();
  syncUi();
}

microphone.onclick = () => {
  media.microphone = !media.microphone;
  media.deploy();
  syncUi();
}

reverse.onclick = () => {
  media.face = !media.face;
  media.deploy();
  syncUi();
}

init();