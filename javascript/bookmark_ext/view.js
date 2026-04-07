const listDiv = document.getElementById('list');
const fileInput = document.getElementById('file');
const renderBtn = document.getElementById('render');
const exportBtn = document.getElementById('export');
const importBtn = document.getElementById('import');
const clearBtn = document.getElementById('clear');

const ICON = {
  export: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>',
  import: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="8 10 12 14 16 10"/><line x1="12" y1="2" x2="12" y2="14"/></svg>',
  sync: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
  clear: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2m-6 5v6m4-6v6"/></svg>',
  copy: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  tick: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
};

let selectedIds = new Set();
let lastClickedId = null;
let focusedIndex = 0;

// --- BUILD ITEM ---
function buildItem(entry) {
  const item = document.createElement('div');
  item.className = 'item';
  item.draggable = true;
  item.dataset.id = entry.id;
  if (selectedIds.has(entry.id)) item.classList.add('selected');

  const img = document.createElement('img');
  img.src = entry.icon ?? 'icon.png';
  const link = document.createElement('a');
  link.href = entry.url;
  link.target = '_blank';
  link.innerText = entry.title;
  const urlDiv = document.createElement('div');
  urlDiv.className = 'url';
  urlDiv.innerText = entry.url;
  const btnBox = document.createElement('div');
  btnBox.className = 'btn-box';
  const copyBtn = document.createElement('div');
  copyBtn.className = 'btn green';
  copyBtn.innerHTML = ICON.copy;
  copyBtn.onclick = (e) => { e.stopPropagation(); copyItem(entry.url, copyBtn); };
  const deleteBtn = document.createElement('div');
  deleteBtn.className = 'btn';
  deleteBtn.innerHTML = ICON.clear;
  deleteBtn.onclick = (e) => { e.stopPropagation(); deleteItem(entry.id); };

  item.ondragstart = (e) => {
    if (!selectedIds.has(entry.id)) {
      document.querySelectorAll('.item.selected').forEach(el => el.classList.remove('selected'));
      selectedIds.clear();
      selectedIds.add(entry.id);
      item.classList.add('selected');
    }
    const draggingEls = document.querySelectorAll('.item.selected');
    draggingEls.forEach(el => el.classList.add('dragging'));
    e.dataTransfer.setData('text/plain', entry.id);
  };

  item.ondragover = (e) => {
    e.preventDefault();
    const draggingEls = Array.from(document.querySelectorAll('.item.dragging'));
    const target = e.target.closest('.item');
    if (target && !draggingEls.includes(target)) {
      const children = Array.from(listDiv.children);
      const targetIdx = children.indexOf(target);
      const firstDraggingIdx = children.indexOf(draggingEls[0]);
      if (firstDraggingIdx < targetIdx) target.after(...draggingEls);
      else target.before(...draggingEls);
    }
  };

  item.ondragend = () => {
    document.querySelectorAll('.item.dragging').forEach(el => el.classList.remove('dragging'));
    saveNewOrder();
  };

  link.appendChild(urlDiv);
  btnBox.append(copyBtn, deleteBtn);
  item.append(img, link, btnBox);
  return item;
}

// --- RENDER VAULT ---
function renderVault() {
  chrome.storage.local.get({ vault: [] }, (result) => {
    const sTop = listDiv.scrollTop;
    listDiv.innerHTML = '';
    result.vault.forEach(entry => {
      listDiv.appendChild(buildItem(entry));
    });
    listDiv.scrollTop = sTop;
    const allItems = Array.from(listDiv.querySelectorAll('.item'));
    if (allItems[focusedIndex]) {
      allItems.forEach(el => el.classList.remove('focused'));
      allItems[focusedIndex].classList.add('focused');
    }
  });
}

// --- SELECTION & FOCUS ---
function focusItem(index) {
  const allItems = Array.from(listDiv.querySelectorAll('.item'));
  if (!allItems[index]) return;
  allItems.forEach(el => el.classList.remove('focused'));
  allItems[index].classList.add('focused');
  allItems[index].scrollIntoView({ block: 'nearest' });
  focusedIndex = index;
}

function updateSelection(item, shiftHeld = false, ctrlHeld = false) {
  const allItems = Array.from(listDiv.querySelectorAll('.item'));
  const currentIndex = allItems.indexOf(item);
  const entryId = item.dataset.id;

  if (shiftHeld && lastClickedId) {
    const lastIndex = allItems.findIndex(el => el.dataset.id === lastClickedId);
    const start = Math.min(currentIndex, lastIndex);
    const end = Math.max(currentIndex, lastIndex);
    if (!ctrlHeld) {
      selectedIds.clear();
      allItems.forEach(el => el.classList.remove('selected'));
    }
    allItems.forEach((el, idx) => {
      if (idx >= start && idx <= end) {
        selectedIds.add(el.dataset.id);
        el.classList.add('selected');
      }
    });
  } else if (ctrlHeld) {
    if (selectedIds.has(entryId)) {
      selectedIds.delete(entryId);
      item.classList.remove('selected');
    } else {
      selectedIds.add(entryId);
      item.classList.add('selected');
    }
    lastClickedId = entryId;
  } else {
    selectedIds.clear();
    allItems.forEach(el => el.classList.remove('selected'));
    selectedIds.add(entryId);
    item.classList.add('selected');
    lastClickedId = entryId;
  }
  focusItem(currentIndex);
}

// --- CLICK HANDLER ---
listDiv.addEventListener('click', (e) => {
  const item = e.target.closest('.item');
  if (!item) {
    selectedIds.clear();
    lastClickedId = null;
    document.querySelectorAll('.item.selected').forEach(el => el.classList.remove('selected'));
    return;
  }

  const entryId = item.dataset.id;
  const isMulti = e.ctrlKey || e.metaKey || e.shiftKey;

  if (selectedIds.has(entryId) && selectedIds.size > 1 && !isMulti) {
    chrome.storage.local.get({ vault: [] }, (result) => {
      const toOpen = result.vault.filter(v => selectedIds.has(v.id));
      toOpen.forEach((entry, index) => {
        setTimeout(() => { chrome.tabs.create({ url: entry.url, active: false }); }, index * 100);
      });
    });
  } else {
    updateSelection(item, e.shiftKey, e.ctrlKey || e.metaKey);
  }
});

// --- KEYBOARD HANDLER ---
listDiv.tabIndex = 0;
listDiv.addEventListener('keydown', (e) => {
  const allItems = Array.from(listDiv.querySelectorAll('.item'));
  if (!allItems.length) return;

  const isCtrl = e.ctrlKey || e.metaKey;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const nextIndex = Math.min(focusedIndex + 1, allItems.length - 1);
    updateSelection(allItems[nextIndex], e.shiftKey, isCtrl);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prevIndex = Math.max(focusedIndex - 1, 0);
    updateSelection(allItems[prevIndex], e.shiftKey, isCtrl);
  }
});

// --- OTHER FUNCTIONS ---
function saveNewOrder() {
  const currentOrder = Array.from(listDiv.querySelectorAll('.item')).map(el => el.dataset.id);
  chrome.storage.local.get({ vault: [] }, (result) => {
    const vaultMap = new Map(result.vault.map(v => [String(v.id), v]));
    const newVault = currentOrder.map(id => vaultMap.get(id)).filter(Boolean);
    chrome.storage.local.set({ vault: newVault });
  });
}

async function copyItem(url, btn) {
  clearTimeout(window.s);
  await navigator.clipboard.writeText(url);
  btn.innerHTML = ICON.tick;
  window.s = setTimeout(() => { btn.innerHTML = ICON.copy; }, 2000);
}

function deleteItem(id) {
  chrome.storage.local.get({ vault: [] }, (result) => {
    const newVault = result.vault.filter((v) => v.id !== id);
    selectedIds.delete(id);
    chrome.storage.local.set({ vault: newVault }, renderVault);
  });
}

function deleteAll() {
  if (confirm("Clear all items?")) {
    selectedIds.clear();
    chrome.storage.local.set({ vault: [] }, renderVault);
  }
}

function exportJSON() {
  chrome.storage.local.get({ vault: [] }, (result) => {
    const blob = new Blob([JSON.stringify(result.vault, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'vault.json';
    a.click();
  });
}

function importJSON(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const imported = JSON.parse(ev.target.result);
      chrome.storage.local.get({ vault: [] }, (result) => {
        chrome.storage.local.set({ vault: [...result.vault, ...imported] }, renderVault);
      });
    } catch (err) { console.error(err); }
  };
  reader.readAsText(file);
}

// --- BUTTONS ---
exportBtn.addEventListener('click', exportJSON);
clearBtn.addEventListener('click', deleteAll);
importBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', importJSON);
renderBtn.addEventListener('click', renderVault);
exportBtn.innerHTML = ICON.export;
importBtn.innerHTML = ICON.import;
renderBtn.innerHTML = ICON.sync;
clearBtn.innerHTML = ICON.clear;

// --- INITIALIZE ---
renderVault();
focusItem(0);
