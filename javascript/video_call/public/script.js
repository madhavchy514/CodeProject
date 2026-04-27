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
  audio = true;

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
    if (!this.camera && !this.audio) return;
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
      audio: this.audio ? {
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
    if (!this.stream || !this.audio) return;
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

function main() {
  const socket = io();
  const fps = 30;
  const quality = 0.5;
  const remoteUsers = {};
  const media = new Media();
  const container = document.getElementById('container');
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  async function init() {
    await media.deploy();
    const myCanvas = createUserElement(socket.id, true);
    myCanvas.width = media.width; 
    myCanvas.height = media.height;
    const myCtx = myCanvas.getContext('2d');
    setInterval(async () => {
      if (media.video && media.stream) {
        myCtx.drawImage(media.video, 0, 0, myCanvas.width, myCanvas.height);
        const base64 = await MediaCode.encodeVideoToBase64(myCanvas, quality);
        socket.emit('video broadcast request', { 
          data: base64,
          width: media.width, 
          height: media.height 
        });
      }
    }, (1000 / fps));

    const sendAudio = async () => {
      if (media.stream && media.audio) {
        const base64 = await MediaCode.encodeAudioToBase64(media.stream, 200);
        socket.emit('audio broadcast request', { data: base64 });
      }
      sendAudio();
    };
    sendAudio();
  }

  socket.on('video broadcast', async ({ id, data, width, height }) => {
    if (!remoteUsers[id]) remoteUsers[id] = createUserElement(id);
    const canvas = remoteUsers[id].querySelector('canvas');
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    await MediaCode.decodeVideoFromBase64(canvas, data);
  });

  socket.on('audio broadcast', async ({ id, data }) => {
    await MediaCode.decodeAudioFromBase64(data, audioCtx);
  });

  socket.on('user left', ({ id }) => {
    if (remoteUsers[id]) {
      remoteUsers[id].remove();
      delete remoteUsers[id];
    }
  });

  function createUserElement(id, isLocal = false) {
    const div = document.createElement('div');
    div.className = 'user';
    div.id = `user-${id}`;

    const canvas = document.createElement('canvas');
    const title = document.createElement('div');
    title.className = 'title';
    title.innerText = isLocal ? 'You' : `User: ${id}`;

    div.append(canvas, title);
    container.appendChild(div);

    if (!isLocal) remoteUsers[id] = div;
    return isLocal ? canvas : div;
  }

  init().catch(console.error);
}

main();