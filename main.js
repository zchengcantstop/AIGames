/* Electron 入口：开一个窗口加载游戏页面。 */
const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    useContentSize: true,
    autoHideMenuBar: true,
    title: '向日葵保卫战！',
    webPreferences: { contextIsolation: true }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
});

app.on('window-all-closed', () => app.quit());
