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

let files = [];
let index = -1;
let CHUNK = 1000;
let currentDir = '';
let emojiBack = '#1a1a1a';

function emoji(emoji = '', color = null, size = 50) {
  const type = 'data:image/svg+xml;utf8,';
  const link = 'xmlns=%27http://www.w3.org/2000/svg%27';
  const box = 'viewBox=%270%200%20100%20100%20%27';
  const style1 = `x=%2750%25%27 y=%2750%25%27 font-size=%27${size}%27`;
  const style2 = 'text-anchor=%27middle%27 dominant-baseline=%27central%27';
  const style3 = color ? `style='background: ${color};'` : '';
  const shadow = 'filter=%27drop-shadow(0 2px 2px rgba(0,0,0,0.5))%27';
  const text = `<text ${style1} ${style2}>${emoji}</text>`;
  const svg = `<svg ${link} ${box} ${shadow}>${text}</svg>`;
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
  let str = `?path=${encodeURIComponent(currentDir)}`;
  if (upath) str += `&upath=${encodeURIComponent(upath)}`;
  history.replaceState(null, '', str);

  if (upath) {
    document.title = `gallery - ${upath}`;
  } else {
    if (currentDir.trim() === '') return document.title = 'gallery - root';
    const parts = currentDir.split('/');
    document.title = `gallery - ${parts[parts.length - 1]}`;
  }
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
      canvas.toBlob(async (blob) => {
        if (!blob) res(null);
        const arrayBuffer = await blob.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);
        res(uint8);
        video.remove();
      }, 'image/jpeg', 0.8);
    };
  });
}

async function load(path = '') {
  index = -1;
  currentDir = path;
  changeUrl();
  pathLabel.textContent = `root/${path + (path ? '/' : '')}`;

  gallery.innerHTML = `<div class='error'>loading...</div>`;
  mediaBox.innerHTML = '';
  viewer.classList.add('hidden');
  backBtn.disabled = pathLabel.textContent === 'root/';

  const data = window.api.explore(path);
  if (!data || data.error) {
    const html = `<div class='error'>${data?.error || 'error occured'}</div>`;
    return gallery.innerHTML = html;
  }

  files = (data.result || []).sort((a, b) => (b.type === 'inode/directory') - (a.type === 'inode/directory') || b.mtime - a.mtime);
  gallery.innerHTML = '';
  if (files.length === 0) {
    const html = `<div class='error'>empty directory</div>`;
    gallery.innerHTML = html;
  }

  files.forEach((f, i) => build(f, i));
}

function build(f, i) {
  const el = document.createElement('div');
  el.className='card';

  const time = formatTime(f.mtime);
  const size = formatByte(f.size);
  const mime = `<div class='info mime'>${f.type}</div>`;
  const info = `<div class='info'>${size} | ${time}</div>${mime}`;

  if (f.type === 'inode/directory') {
    el.innerHTML = `${info + emoji('📁', emojiBack)}<div class=name>${f.base}</div>`;
    el.addEventListener('click', () => load(f.path));
  }

  else if (isFrame(f.ext, f.type)) {
    el.innerHTML = `${info + emoji('🪟', emojiBack)}<div class=name>${f.base}</div>`;
    el.addEventListener('click', () => open(i));
  }

  else if (f.type.startsWith('audio')) {
    el.innerHTML = `${info} ${emoji('🎵', emojiBack)}<div class=name>${f.base}</div>`;
    el.addEventListener('click', () => open(i));
  }

  else if (f.type.startsWith('image')) {
    el.innerHTML=`${info + emoji('🖼️', emojiBack)}<div class=name>${f.base}</div>`;
    el.addEventListener('click', () => open(i));
    el.addEventListener('mouseover', async () => {
      const imgEl = el.querySelector('img');
      if (!thumbSwitch.checked || !imgEl.classList.contains('emoji')) return;
      imgEl.src = window.api.getMediaUrl(f.path).result;
      imgEl.onload = () => imgEl.classList.remove('emoji');
    });
  }

  else if (f.type.startsWith('video')) {
    el.innerHTML = `${info + emoji('📺', emojiBack)}<div class=name>${f.base}</div>`;
    el.addEventListener('click', () => open(i));
    el.addEventListener('mouseover', async () => {
      const imgEl = el.querySelector('img');
      if (!thumbSwitch.checked || !imgEl.classList.contains('emoji')) return;
      if (f.thumb) {
        imgEl.src = f.thumb;
        imgEl.onload = () => imgEl.classList.remove('emoji');
        return;
      }
      const url = window.api.getMediaUrl(f.path).result;
      const thumb = await getThumbnail(url);
      if (thumb === null) return;
      const blob = new Blob([thumb], { type: 'image/jpeg' });
      imgEl.src = URL.createObjectURL(blob);
      imgEl.onload = () => imgEl.classList.remove('emoji');
      window.api.saveThumb(f.path, thumb);
    });
  }

  else {
    el.innerHTML = `${info} ${emoji('📄', emojiBack)}<div class=name>${f.base}</div>`;
    el.addEventListener('click', () => open(i));
  }

  gallery.appendChild(el);
}

async function openEditor(f) {
  if (f.size <= 0) return mediaBox.innerHTML = `<div class='error'>empty file</div>`;

  let offset = 0;

  mediaBox.innerHTML = `<div class='error'>loading...</div>`;
  const editorEl = document.createElement('div');
  editorEl.className = 'text';

  async function loadChunk(scroll = false) {
    let endByte = Math.min(offset + CHUNK - 1, f.size - 1);
    const actualLength = (endByte - offset) + 1;
    const response = window.api.getData(f.path, offset, actualLength);

    if (!editorEl.parentNode) {
      mediaBox.innerHTML = '';
      mediaBox.appendChild(editorEl);
    }

    const existingLink = editorEl.querySelector('.more');
    if (existingLink) existingLink.remove();

    const existingLine = editorEl.querySelector('.line');
    if (existingLine) existingLine.remove();

    const decoder = new TextDecoder("utf-8", { fatal: false });
    const decotedText = decoder.decode(response.result).replace(/\0/g, '\u2400');
    editorEl.textContent += decotedText;

    console.log(response.result);

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
      editorEl.innerHTML += `<span class='line'></span>`;
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
  index = i;
  prevBtn.disabled = index === 0;
  nextBtn.disabled = index === files.length - 1;
  const f = files[i];
  changeUrl(f.base);
  viewer.classList.remove('hidden');
  baseLabel.textContent = f.base;

  if (f.type === 'inode/directory') {
    mediaBox.innerHTML = emoji('📁', null, 50);
  }

  else if (f.type.startsWith('image')) {
    mediaBox.innerHTML = `<div class='error'>loading...</div>`;
    const src = window.api.getMediaUrl(f.path).result;
    const img = document.createElement('img');
    img.src = src;
    img.onload = () => {
      mediaBox.innerHTML = '';
      mediaBox.appendChild(img);
    }
  }

  else if (f.type.startsWith('video') || f.type.startsWith('audio')) {
    const src = window.api.getMediaUrl(f.path).result;
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
    const src = window.api.getMediaUrl(f.path).result;
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
  if(index < files.length-1) open(index+1);
}

function prev(){
  if(index > 0) open(index-1);
}

function close() {
  mediaBox.innerHTML = '';
  viewer.classList.add('hidden');
  changeUrl();
}

function back() {
  const parts = currentDir.split('/');
  parts.pop();
  load(parts.join('/'));
}

async function init(){
  const params = new URLSearchParams(location.search);
  await load(params.get('path') || '');
  if (params.get('upath')) {
    const upath = params.get('upath');
    let i = files.findIndex(v => v.base === upath);
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
