let showingAlert = false;
let alertQueue = [];

let cameraStream = false;
let microphoneStream = false;

export async function workerDelay(ms) {
  return new Promise((resolve) => {
    const delayScript = `
      self.onmessage = (e) => {
        setTimeout(() => {
          self.postMessage('success');
        }, e.data.ms);
      };
    `;
    const blob = new Blob([delayScript], { type: 'text/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);
    worker.onmessage = (e) => {
      if (e.data === 'success') {
        resolve();
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
      }
    }
    worker.postMessage({ ms });
  });
}

export async function showAlert(msg, { durationMs = 2000 } = {}) {
  alertQueue.push({ msg, durationMs });
  if (showingAlert) return;

  showingAlert = true;
  while (alertQueue.length > 0) {
    const alertEl = document.getElementById('alert');
    const current = alertQueue.shift();
    
    alertEl.classList.remove('hidden');
    alertEl.innerHTML = current.msg;

    await workerDelay(current.durationMs);
    alertEl.classList.add('hidden');
  }
  showingAlert = false;
}

export function createMedia(id, type = 'video', { hidden = true, muted = true } = {}) {
  if (document.getElementById(id)) {
    return document.getElementById(id);
  }

  const media = document.createElement(type);
  media.id = id;
  media.playsInline = true;
  media.autoplay = true;
  
  if (hidden) media.classList.add('hidden');
  if (muted) media.muted = true;

  document.body.append(media);
  return media;
}

export function createCanvas(id, { text = null } = {}) {
  if (document.getElementById(id)) {
    return document.getElementById(id).querySelector('canvas');
  }

  const container = document.createElement('div');

  container.id = id;
  container.classList.add('canvas-container');

  const textEl = document.createElement('span');
  textEl.classList.add('title');
  textEl.textContent = text ?? id;

  const canvas = document.createElement('canvas');
  container.append(textEl, canvas);

  document.body.append(container);
  return canvas;
}

export async function switchButton(button, onActivate, onDeactivate) {
  if (button.classList.contains('inactive')) {
    button.classList.remove('inactive');
    return await onActivate();
  } else {
    button.classList.add('inactive');
    return await onDeactivate();
  }
}

export function isMobile() {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  return /android|iphone|ipad|ipod/i.test(userAgent);
}

export async function startCamera({ fps, facingMode = 'user' } = {}) {
  try {
    const constraints = { 
      video: { 
        frameRate: { ideal: fps, max: fps }, 
        facingMode
      }
    };
    cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    return cameraStream;
  } catch (err) {
    showAlert(`Failed to access camera: ${err.message}`);
    return false;
  }
}

export async function startMicrophone() {
  try {
    const constraints = { audio: true };
    microphoneStream = await navigator.mediaDevices.getUserMedia(constraints);
    return microphoneStream;
  } catch (err) {
    showAlert(`Failed to access microphone: ${err.message}`);
    return false;
  }
}

export function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = false;
    return true;
  }
  return false;
}

export function stopMicrophone() {
  if (microphoneStream) {
    microphoneStream.getTracks().forEach(track => track.stop());
    microphoneStream = false;
    return true;
  }
  return false;
}

export function float32ToWav(float32Array, sampleRate) {
  const buffer = new ArrayBuffer(44 + float32Array.length * 2);
  const view = new DataView(buffer);

  const writeString = (view, offset, str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + float32Array.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, float32Array.length * 2, true);

  let offset = 44;
  for (let i = 0; i < float32Array.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return buffer;
}