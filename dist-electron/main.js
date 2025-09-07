"use strict";const{app:s,BrowserWindow:c,Menu:u,ipcMain:l}=require("electron"),r=require("path"),h=r.dirname(__filename);process.env.DIST=r.join(h,"../dist");process.env.VITE_PUBLIC=s.isPackaged?process.env.DIST:r.join(process.env.DIST,"../public");let e;const m=process.env.VITE_DEV_SERVER_URL||process.env.VITE_DEV_SERVER_HOST||"http://localhost:5173";function w(){e=new c({width:1200,height:800,minWidth:1e3,minHeight:600,icon:r.join(process.env.VITE_PUBLIC,"icon.png"),webPreferences:{preload:r.join(h,"preload.js"),nodeIntegration:!1,contextIsolation:!0},titleBarStyle:"default",show:!1}),e.webContents.on("did-finish-load",()=>{e==null||e.webContents.send("main-process-message",new Date().toLocaleString())}),process.env.IS_DEV==="true"||!s.isPackaged?(console.log("Development mode detected"),console.log("VITE_DEV_SERVER_URL:",m),console.log("IS_DEV:",process.env.IS_DEV),console.log("app.isPackaged:",s.isPackaged),e.loadURL(m),e.webContents.openDevTools()):(console.log("Production mode - loading from file"),e.loadFile(r.join(process.env.DIST,"index.html"))),e.once("ready-to-show",()=>{e==null||e.show()})}s.on("window-all-closed",()=>{process.platform!=="darwin"&&(s.quit(),e=null)});s.on("activate",()=>{c.getAllWindows().length===0&&w()});s.whenReady().then(()=>{w();const n=[{label:"File",submenu:[{label:"New Sale",accelerator:"CmdOrCtrl+N",click:()=>{e==null||e.webContents.send("menu-new-sale")}},{type:"separator"},{label:"Quit",accelerator:process.platform==="darwin"?"Cmd+Q":"Ctrl+Q",click:()=>{s.quit()}}]},{label:"View",submenu:[{role:"reload"},{role:"forceReload"},{role:"toggleDevTools"},{type:"separator"},{role:"resetZoom"},{role:"zoomIn"},{role:"zoomOut"},{type:"separator"},{role:"togglefullscreen"}]},{label:"Window",submenu:[{role:"minimize"},{role:"close"}]}],t=u.buildFromTemplate(n);u.setApplicationMenu(t)});l.handle("get-app-version",()=>s.getVersion());l.handle("show-message-box",async(n,t)=>{const{dialog:o}=require("electron");return await o.showMessageBox(e,t)});l.handle("get-printers",async()=>{try{const n=e.webContents.getPrintersAsync?await e.webContents.getPrintersAsync():e.webContents.getPrinters();return console.log("Available printers:",n.map(t=>({name:t.name,displayName:t.displayName,isDefault:t.isDefault}))),n}catch(n){return console.error("Error getting printers:",n),[]}});l.handle("show-print-preview",async(n,t)=>{try{const o=`
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
            <p>Printer: ${t||"Default"}</p>
            <p>Date: ${new Date().toLocaleString()}</p>
            <p>POS Desktop Application</p>
            <p>This is what will be printed</p>
          </div>
        </body>
      </html>
    `;return await new c({width:400,height:500,webPreferences:{nodeIntegration:!1,contextIsolation:!0}}).loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(o)}`),{success:!0}}catch(o){return console.error("Error showing preview:",o),{success:!1,error:o.message}}});l.handle("print-test",async(n,t)=>{try{console.log("Print test requested for printer:",t);const o=`
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
            <p>Printer: ${t||"Default"}</p>
            <p>Date: ${new Date().toLocaleString()}</p>
            <p>POS Desktop Application</p>
            <p>Test successful!</p>
          </div>
        </body>
      </html>
    `,i=new c({show:!1,width:800,height:600,webPreferences:{nodeIntegration:!1,contextIsolation:!0}});console.log("Loading content into print window..."),await i.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(o)}`),await new Promise(a=>setTimeout(a,500));const p={silent:!0,printBackground:!0,color:!1,margin:{marginType:"minimum"},landscape:!1,pagesPerSheet:1,collate:!1,copies:1};return t&&t!=="default"?(p.deviceName=t,console.log("Using specific printer:",t)):console.log("Using default printer"),console.log("Sending to printer with options:",p),new Promise(a=>{i.webContents.print(p,(d,g)=>{console.log("Print result - Success:",d,"Reason:",g),i.close(),a(d?{success:!0,printed:!0}:{success:!1,error:g||"Print failed"})})})}catch(o){return console.error("Error printing:",o),{success:!1,error:o.message}}});
