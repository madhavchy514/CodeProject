const electron = require('electron');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'public', 'index.html');
const iconPath = path.join(__dirname, '..', 'public', 'icon.png');
const preloadPath = path.join(__dirname, 'preload.js');

function createWindow() {
  const win = new electron.BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    icon: iconPath,
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      contextIsolation: true
    }
  });

  win.maximize();
  win.show();
  win.loadFile(indexPath);
}

electron.app.whenReady().then(() => {
  electron.Menu.setApplicationMenu(null);
  createWindow();
});

electron.app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    electron.app.quit();
  }
});