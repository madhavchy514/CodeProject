const gallery = document.getElementById('gallery');
const viewer = document.getElementById('viewer');
const mediaBox = document.getElementById('media');
const pathLabel = document.getElementById('path');
const baseLabel = document.getElementById('base');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const closeBtn = document.getElementById('close');
const backBtn = document.getElementById('back');
const thumbSwitch = document.getElementById('thumb');

let FILES = [];
let INDEX = -1;
let CURRENT_DIR = '';
let CHUNK_SIZE = 1000;
let EMOJI_BACKGROUND = '#1a1a1a';

function emoji(emoji = '', color = null, size = 50) {
  const type = 'data:image/svg+xml;utf8,';
  const link = 'xmlns=%27http://www.w3.org/2000/svg%27';
  const viewBox = 'viewBox=%270%200%20100%20100%20%27';
  const style1 = `x=%2750%25%27 y=%2750%25%27 font-size=%27${size}%27`;
  const style2 = 'text-anchor=%27middle%27 dominant-baseline=%27central%27';
  const shadow = 'filter=%27drop-shadow(0 2px 2px rgba(0,0,0,0.5))%27';
  const style3 = color ? `style='background: ${color};'` : '';
  const text = `<text ${style1} ${style2}>${emoji}</text>`;
  const svg = `<svg ${link} ${viewBox} ${shadow}>${text}</svg>`;
  return `<img class='emoji' src='${type}${svg}' ${style3}>`;
}

function formatTime(time) {
  const d = new Date(time);
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hour = d.getHours();
  const minute = pad(d.getMinutes());
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = pad(hour % 12 || 12);
  return now.getFullYear() === d.getFullYear()
      ? now.getDate() === d.getDate() && now.getMonth() === d.getMonth()
        ? `${hour12}:${minute} ${ampm}`
      : `${month}-${day} ${hour12}:${minute} ${ampm}` 
    : `${year}-${month}-${day} ${hour12}:${minute} ${ampm}`;
}

function formatByte(byte) {
  if (byte === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log10(byte) / 3);
  const size = byte / Math.pow(1000, i);
  return `${size.toFixed(1)} ${units[i]}`;
}

function changeUrl(upath = null) {
  let str = `?path=${encodeURIComponent(CURRENT_DIR)}`;
  if (upath) str += `&upath=${encodeURIComponent(upath)}`;
  history.replaceState(null, '', str);

  if (upath) {
    document.title = `gallery - ${upath}`;
  } else {
    if (CURRENT_DIR.trim() === '') return document.title = 'gallery - root';
    const parts = CURRENT_DIR.split('/');
    document.title = `gallery - ${parts[parts.length - 1]}`;
  }
}

function isText(ext, mime) {
  if (mime.startsWith('text')) return true;
  const exts = ['.json', '.py'];
  return exts.includes(ext);
}

function isFrame(ext, mime) {
  const mimes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/epub+zip',
    'image/svg+xml'
  ];
  const exts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.epub', '.svg'];
  return mimes.includes(mime) || exts.includes(ext.toLowerCase());
}

function getThumbnail(videoPath) {
  return new Promise((res) => {
    const video = document.createElement('video');
    video.src = videoPath;
    video.muted = true;
    video.crossOrigin = 'anonymous';
    video.onloadedmetadata = () => video.currentTime = 0.5;
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      const width = 200;
      const height = (video.videoHeight / video.videoWidth) * width;
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(video, 0, 0, width, height);
      res(canvas.toDataURL('image/jpeg'));
      video.remove();
    };
  });
}

async function getWave(audioUrl, size) {
  const start = 50000; 
  const end = Math.min(size - 1, start + 450000); 
  const response = await fetch(audioUrl, { 
    headers: { 'Range': `bytes=${start}-${end}` }
  });
  const arrayBuffer = await response.arrayBuffer();
  
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  
  const maxSamples = audioBuffer.sampleRate * 5;
  const totalSamples = Math.min(audioBuffer.length, maxSamples);
  const data = audioBuffer.getChannelData(0).subarray(0, totalSamples);

  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 50;
  const canvasCtx = canvas.getContext('2d');
  
  const step = Math.floor(data.length / canvas.width);
  const amp = canvas.height / 2;

  canvasCtx.fillStyle = '#666';
  for (let i = 0; i < canvas.width; i++) {
    let min = 1.0, max = -1.0;
    for (let j = 0; j < step; j++) {
      const datum = data[i * step + j];
      if (datum < min) min = datum;
      if (datum > max) max = datum;
    }
    canvasCtx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
  }
  
  return canvas.toDataURL('image/png');
}

async function load(path = '') {
  INDEX = -1;
  CURRENT_DIR = path;
  changeUrl();
  pathLabel.textContent = `root/${path + (path ? '/' : '')}`;

  gallery.innerHTML = `<div class='error'>loading...</div>`;
  mediaBox.innerHTML = '';
  viewer.classList.add('hidden');
  backBtn.disabled = pathLabel.textContent === 'root/';

  const fetchPath = `/explore?path=${encodeURIComponent(path)}`;
  const data = await fetch(fetchPath).then((r) => r.json()).catch(() => null);
  if (!data || !data.success) {
    const html = `<div class='error'>${data?.reason || 'error occured'}</div>`;
    return gallery.innerHTML = html;
  }

  FILES = (data.result || []).sort((a, b) => (b.type === 'inode/directory') - (a.type === 'inode/directory') || b.mtime - a.mtime);
  gallery.innerHTML = '';
  FILES.forEach((f, i) => build(f, i));
  if (FILES.length === 0) {
    const html = `<div class='error'>empty directory</div>`;
    gallery.innerHTML = html;
  }
}

function build(f, i) {
  const el = document.createElement('div');
  el.className='card';

  const time = formatTime(f.mtime);
  const size = formatByte(f.size);
  const mime = `<div class='info mime'>${f.type}</div>`;
  const info = `<div class='info'>${size} | ${time}</div>${mime}`;

  if (f.type === 'inode/directory') {
    el.innerHTML = `${info + emoji('📁', EMOJI_BACKGROUND)}<div class=name>${f.base}</div>`;
    el.addEventListener('click', () => load(f.path));
  }

  else if (isFrame(f.ext, f.type)) {
    el.innerHTML = `${info + emoji('🪟', EMOJI_BACKGROUND)}<div class=name>${f.base}</div>`;
    el.addEventListener('click', () => open(i));
  }
  
  else if (f.type.startsWith('image')) {
    el.innerHTML=`${info + emoji('🖼️', EMOJI_BACKGROUND)}<div class=name>${f.base}</div>`;
    el.addEventListener('click', () => open(i));
    el.addEventListener('mouseover', async () => {
      const imgEl = el.querySelector('img');
      if (!thumbSwitch.checked || !imgEl.classList.contains('emoji')) return;
      imgEl.src = `/media?path=${encodeURIComponent(f.path)}`;
      imgEl.onload = () => imgEl.classList.remove('emoji');
    });
  }

  else if (f.type.startsWith('video') || f.type.startsWith('audio')) {
    el.innerHTML = `${info + emoji('📺', EMOJI_BACKGROUND)}<div class=name>${f.base}</div>`;
    el.addEventListener('click', () => open(i));
    el.addEventListener('mouseover', async () => {
      const imgEl = el.querySelector('img');
      if (!thumbSwitch.checked || !imgEl.classList.contains('emoji')) return;
      if (f.thumb) {
        imgEl.src = f.thumb;
        imgEl.onload = () => imgEl.classList.remove('emoji');
        return;
      }

      const url = `/media?path=${encodeURIComponent(f.path)}`;
      const base64Thumb = f.type.startsWith('audio') ? await getWave(url, f.size) : await getThumbnail(url);
      imgEl.src = base64Thumb;
      imgEl.onload = () => imgEl.classList.remove('emoji');
      fetch('/thumb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: f.path, base64: base64Thumb.split(',')[1] })
      });
    });
  }
  
  else if (isText(f.ext, f.type)) {
    el.innerHTML = `${info + emoji('📄', EMOJI_BACKGROUND)}<div class='name'>${f.base}</div>`;
    el.addEventListener('click', () => open(i));
  }

  else {
    el.innerHTML = `${info} ${emoji('❔', EMOJI_BACKGROUND)}<div class=name>${f.base}</div>`;
    el.addEventListener('click', () => open(i));
  }

  gallery.appendChild(el);
}

async function openEditor(f) {
  if (f.size <= 0) return mediaBox.innerHTML = `<div class='error'>empty file</div>`;

  const text = isText(f.ext, f.type);
  let offset = 0;

  mediaBox.innerHTML = `<div class='error'>loading...</div>`;
  const editorEl = document.createElement('div');
  editorEl.className = text ? 'text' : 'hex';

  async function loadChunk(scroll = false) {
    let endByte = Math.min(offset + CHUNK_SIZE - 1, f.size - 1);
    const t = text ? 'text' : 'hex';
    const p = `/data?path=${encodeURIComponent(f.path)}&range=${offset}-${endByte}&type=${t}`;
    const response = await fetch(p).then(v => v.json());

    if (!editorEl.parentNode) {
      mediaBox.innerHTML = '';
      mediaBox.appendChild(editorEl);
    }

    const existingLink = editorEl.querySelector('.more');
    if (existingLink) existingLink.remove();

    const existingLine = editorEl.querySelector('.line');
    if (existingLine) existingLine.remove();

    if (text) {
      editorEl.textContent += response.result;
    } else {
      const html = response.result.match(/.{1,2}/g).map((pair) => {
        const charSum = pair.charCodeAt(0) + (pair.charCodeAt(1) || 0);
        const hue = (charSum * 137.5) % 360;
        const color = `hsl(${hue}, 60%, 70%)`;
        return `<span style='color:${color};'>${pair}</span>`;
      }).join('');
      editorEl.insertAdjacentHTML('beforeend', html);
    }

    offset = endByte + 1;
    if (offset < f.size) {
      const moreLink = document.createElement('a');
      moreLink.textContent = 'load-more...';
      moreLink.className = 'more';
      moreLink.href = '#';
      moreLink.onclick = (e) => {
        moreLink.textContent = 'loading...';
        e.preventDefault();
        loadChunk(true);
      };
      editorEl.innerHTML += `<span class='line'></line`;
      editorEl.appendChild(moreLink);
    }

    if (scroll) requestAnimationFrame(() => {
      editorEl.scrollTo({
        top: editorEl.scrollHeight,
        behavior: 'smooth'
      });
    });
  }

  await loadChunk();
}

async function open(i) {
  INDEX = i;
  prevBtn.disabled = INDEX === 0;
  nextBtn.disabled = INDEX === FILES.length - 1;
  const f = FILES[i];
  changeUrl(f.base);
  viewer.classList.remove('hidden');
  baseLabel.textContent = f.base;

  if (f.type === 'inode/directory') {
    mediaBox.innerHTML = emoji('📁', null, 50);
  }

  else if (f.type.startsWith('image')) {
    mediaBox.innerHTML = `<div class='error'>loading...</div>`;
    const src = `/media?path=${encodeURIComponent(f.path)}`;
    const img = document.createElement('img');
    img.src = src;
    img.onload = () => {
      mediaBox.innerHTML = '';
      mediaBox.appendChild(img);
    }
  }

  else if (f.type.startsWith('video') || f.type.startsWith('audio')) {
    const src = `/media?path=${encodeURIComponent(f.path)}`;
    const vid = mediaBox.querySelector('video-player');
    if (vid !== null) {
      vid.src = src;
      vid.video.addEventListener('loadedmetadata', () => {
        vid.video.play().catch(() => {});
      });
    } else {
      mediaBox.innerHTML = '';
      const el = document.createElement('div');
      el.className = 'error';
      el.innerHTML = 'loading...';
      mediaBox.appendChild(el);
      const vid = document.createElement('video-player');
      vid.classList.add('hidden');
      mediaBox.appendChild(vid);
      vid.src = src;
      vid.video.addEventListener('ended', next);
      vid.video.addEventListener('loadedmetadata', () => {
        el.remove();
        vid.classList.remove('hidden');
        vid.video.play().catch(() => {});
      });
    }
  }

  else if (isFrame(f.ext, f.type)) {
    mediaBox.innerHTML = `<div class='error'>loading...</div>`;
    const src = `/media?path=${encodeURIComponent(f.path)}`;
    const frame = document.createElement('iframe');
    frame.src = src;
    frame.classList.add('hidden');
    mediaBox.appendChild(frame);
    frame.tabIndex = -1;
    frame.onload = () => {
      mediaBox.querySelector('.error').remove();
      frame.classList.remove('hidden');
    }
  }

  else await openEditor(f);
  viewer.classList.remove('hidden');
}

function next(){
  if(INDEX < FILES.length-1) open(INDEX+1);
}

function prev(){
  if(INDEX > 0) open(INDEX-1);
}

function close() {
  mediaBox.innerHTML = '';
  viewer.classList.add('hidden');
  changeUrl();
}

function back() {
  const parts = CURRENT_DIR.split('/');
  parts.pop();
  load(parts.join('/'));
}

async function init(){
  const params = new URLSearchParams(location.search);
  await load(params.get('path') || '');
  if (params.get('upath')) {
    const upath = params.get('upath');
    let i = FILES.findIndex(v => v.base === upath);
    if (i !== -1) open(i);
  };
}

function keyboard(e) {
  if(e.key==='p') next();
  if(e.key==='o') prev();
  if(e.key==='i') close();
}

nextBtn.addEventListener('click', next);
prevBtn.addEventListener('click', prev);
closeBtn.addEventListener('click', close);
backBtn.addEventListener('click', back);
document.addEventListener('keydown', keyboard);
init();
