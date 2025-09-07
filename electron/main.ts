const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');

const __dirname = path.dirname(__filename);

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.js
// │
process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public');

let win: BrowserWindow | null;
// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'] || process.env['VITE_DEV_SERVER_HOST'] || 'http://localhost:5173';

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
    icon: path.join(process.env.VITE_PUBLIC, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: 'default',
    show: false,
  });

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString());
  });

  // In development, load from Vite dev server
  if (process.env.IS_DEV === 'true' || !app.isPackaged) {
    console.log('Development mode detected');
    console.log('VITE_DEV_SERVER_URL:', VITE_DEV_SERVER_URL);
    console.log('IS_DEV:', process.env.IS_DEV);
    console.log('app.isPackaged:', app.isPackaged);
    
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    console.log('Production mode - loading from file');
    win.loadFile(path.join(process.env.DIST!, 'index.html'));
  }

  win.once('ready-to-show', () => {
    win?.show();
  });
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
  createWindow();
  
  // Set application menu
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Sale',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            win?.webContents.send('menu-new-sale');
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
});

// Handle IPC messages
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('show-message-box', async (event, options) => {
  const { dialog } = require('electron');
  const result = await dialog.showMessageBox(win!, options);
  return result;
});

// Printer IPC handlers
ipcMain.handle('get-printers', async () => {
  try {
    const printers = win!.webContents.getPrintersAsync ? 
      await win!.webContents.getPrintersAsync() : 
      win!.webContents.getPrinters();
    console.log('Available printers:', printers.map(p => ({ name: p.name, displayName: p.displayName, isDefault: p.isDefault })));
    return printers;
  } catch (error) {
    console.error('Error getting printers:', error);
    return [];
  }
});

// Debug print preview
ipcMain.handle('show-print-preview', async (event, printerName) => {
  try {
    const testContent = `
      <html>
        <head>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              padding: 20px; 
              text-align: center;
            }
            .test-content {
              border: 2px solid #333;
              padding: 20px;
              margin: 20px auto;
              max-width: 300px;
            }
          </style>
        </head>
        <body>
          <div class="test-content">
            <h2>Print Preview</h2>
            <p><strong>Hello World!</strong></p>
            <p>Printer: ${printerName || 'Default'}</p>
            <p>Date: ${new Date().toLocaleString()}</p>
            <p>POS Desktop Application</p>
            <p>This is what will be printed</p>
          </div>
        </body>
      </html>
    `;

    const previewWindow = new BrowserWindow({
      width: 400,
      height: 500,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    await previewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(testContent)}`);
    return { success: true };
  } catch (error) {
    console.error('Error showing preview:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('print-test', async (event, printerName) => {
  try {
    console.log('Print test requested for printer:', printerName);
    
    // Create a simple HTML content for testing
    const testContent = `
      <html>
        <head>
          <style>
            @media print {
              body { 
                font-family: Arial, sans-serif; 
                padding: 10px; 
                margin: 0;
                font-size: 12pt;
              }
              .test-content {
                border: 2px solid #000;
                padding: 15px;
                margin: 0;
                text-align: center;
              }
              h2 { margin-top: 0; }
            }
            body { 
              font-family: Arial, sans-serif; 
              padding: 20px; 
              text-align: center;
            }
            .test-content {
              border: 2px solid #333;
              padding: 20px;
              margin: 20px auto;
              max-width: 300px;
            }
          </style>
        </head>
        <body>
          <div class="test-content">
            <h2>Test Print</h2>
            <p><strong>Hello World!</strong></p>
            <p>Printer: ${printerName || 'Default'}</p>
            <p>Date: ${new Date().toLocaleString()}</p>
            <p>POS Desktop Application</p>
            <p>Test successful!</p>
          </div>
        </body>
      </html>
    `;

    // Create a hidden window for printing
    const printWindow = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    console.log('Loading content into print window...');
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(testContent)}`);
    
    // Wait a moment for content to load
    await new Promise(resolve => setTimeout(resolve, 500));

    const printOptions = {
      silent: true,  // Changed to true to avoid print dialog
      printBackground: true,
      color: false,
      margin: {
        marginType: 'minimum'
      },
      landscape: false,
      pagesPerSheet: 1,
      collate: false,
      copies: 1
    };

    if (printerName && printerName !== 'default') {
      printOptions.deviceName = printerName;
      console.log('Using specific printer:', printerName);
    } else {
      console.log('Using default printer');
    }

    console.log('Sending to printer with options:', printOptions);
    
    // Try to print
    return new Promise((resolve) => {
      printWindow.webContents.print(printOptions, (success, failureReason) => {
        console.log('Print result - Success:', success, 'Reason:', failureReason);
        printWindow.close();
        
        if (success) {
          resolve({ success: true, printed: true });
        } else {
          resolve({ success: false, error: failureReason || 'Print failed' });
        }
      });
    });
    
  } catch (error) {
    console.error('Error printing:', error);
    return { success: false, error: error.message };
  }
});
