const doBtn = document.getElementById('do');
const openBtn = document.getElementById('open');
const ICON = {
  add: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2a2 2 0 0 0-2 2v5H4a2 2 0 0 0-2 2v2c0 1.1.9 2 2 2h5v5c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2v-5h5a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-5V4a2 2 0 0 0-2-2h-2z"/></svg>',
  remove: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2m-6 5v6m4-6v6"/></svg>',
  open: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
  loading: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block;"><g><path d="M21 12a9 9 0 1 1-6.219-8.56"/><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></g></svg>'
}

async function base64IconString(url, best = false) {
  if (typeof url !== 'string' || url.trim() === '' || url.startsWith('chrome')) return null;
  
  try {
    const response = await fetch(url);
    const blob = await response.blob();

    if (best) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    }

    return new Promise((resolve) => {
      const blobUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.src = blobUrl;

      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        resolve(null);
      };

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const maxSize = 32;
        let width = img.width;
        let height = img.height;

        if (width > height && width > maxSize) {
          height *= maxSize / width;
          width = maxSize;
        } else if (height > maxSize) {
          width *= maxSize / height;
          height = maxSize;
        }

        canvas.width = width;
        canvas.height = height;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, width, height);

        URL.revokeObjectURL(blobUrl);
        resolve(canvas.toDataURL('image/webp', 0.5));
      };
    });
  } catch (e) {
    return null;
  }
}

async function loadUI() {
  openBtn.innerHTML = ICON.open;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const result = await chrome.storage.local.get({ vault: [] });
  if (result.vault.some((item) => item.url === tab.url)) {
    doBtn.innerHTML = ICON.remove;
    doBtn.classList.add('remove');
  } else {
    doBtn.innerHTML = ICON.add;
    doBtn.classList.remove('remove');
  }
}

async function doLink() {
  try {
    doBtn.style.pointerEvents = 'none';
    doBtn.innerHTML = ICON.loading;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const vault = (await chrome.storage.local.get({ vault: [] })).vault;
    if (vault.some((item) => item.url === tab.url)) {
      await chrome.storage.local.set({
        vault: vault.filter((item) => item.url !== tab.url)
      });
    } else {
      vault.push({
        id: crypto.randomUUID(),
        created: Date.now(),
        title: tab.title,
        url: tab.url,
        icon: await base64IconString(tab.favIconUrl)
      });
      await chrome.storage.local.set({ vault });
    }
  } catch (e) {
    console.log(e);
  } finally {
    doBtn.style.pointerEvents = 'auto';
    await loadUI();
  }
}

function openVault() {
  const url = chrome.runtime.getURL('view.html');
  chrome.tabs.create({ url: url });
}

window.addEventListener('load', loadUI);
doBtn.addEventListener('click', doLink);
openBtn.addEventListener('click', openVault);