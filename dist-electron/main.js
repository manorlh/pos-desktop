"use strict";
const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const path = require("node:path");
const __dirname$1 = path.dirname(__filename);
process.env.DIST = path.join(__dirname$1, "../dist");
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, "../public");
let win;
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"] || "http://localhost:5173";
function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1e3,
    minHeight: 600,
    icon: path.join(process.env.VITE_PUBLIC, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname$1, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true
    },
    titleBarStyle: "default",
    show: false
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (process.env.IS_DEV === "true") {
    let devUrl = "http://localhost:5173";
    if (VITE_DEV_SERVER_URL.includes("localhost:")) {
      devUrl = VITE_DEV_SERVER_URL;
    } else if (VITE_DEV_SERVER_URL.includes("5174")) {
      devUrl = "http://localhost:5174";
    }
    console.log("Loading from dev server:", devUrl);
    win.loadURL(devUrl);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(process.env.DIST, "index.html"));
  }
  win.once("ready-to-show", () => {
    win == null ? void 0 : win.show();
  });
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(() => {
  createWindow();
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "New Sale",
          accelerator: "CmdOrCtrl+N",
          click: () => {
            win == null ? void 0 : win.webContents.send("menu-new-sale");
          }
        },
        { type: "separator" },
        {
          label: "Quit",
          accelerator: process.platform === "darwin" ? "Cmd+Q" : "Ctrl+Q",
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "close" }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
});
ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});
ipcMain.handle("show-message-box", async (event, options) => {
  const { dialog } = require("electron");
  const result = await dialog.showMessageBox(win, options);
  return result;
});
