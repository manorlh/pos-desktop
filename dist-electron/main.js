"use strict";const{app:S,BrowserWindow:q,Menu:oe,ipcMain:l,dialog:de}=require("electron"),m=require("path"),N=require("fs"),Ae=require("archiver"),ie=require("iconv-lite"),J=m.dirname(__filename);let _;if(S.isPackaged)_=m.join(process.resourcesPath,"app.asar.unpacked","node_modules","better-sqlite3");else{const r=m.resolve(J,"..");_=m.join(r,"node_modules","better-sqlite3")}let W;try{W=require(_)}catch(r){if(console.error("Failed to load better-sqlite3:",r),console.error("Looking for better-sqlite3 at:",_),console.error("app.isPackaged:",S.isPackaged),S.isPackaged){console.error("process.resourcesPath:",process.resourcesPath),console.error("app.getAppPath():",S.getAppPath());const e=m.join(process.resourcesPath,"node_modules","better-sqlite3"),t=m.join(m.dirname(process.resourcesPath),"app.asar.unpacked","node_modules","better-sqlite3");console.error("Trying alternative paths:",e,t);for(const n of[e,t])try{if(N.existsSync(n)){W=require(n),console.log("Successfully loaded better-sqlite3 from:",n);break}}catch{}if(!W)throw new Error(`Cannot find module 'better-sqlite3'. Tried: ${_}, ${e}, ${t}`)}else throw new Error(`Cannot find module 'better-sqlite3' at ${_}. Please run 'npm install'.`)}let v=null;function Se(r){r.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      sku TEXT NOT NULL UNIQUE,
      categoryId TEXT NOT NULL,
      imageUrl TEXT,
      inStock INTEGER NOT NULL DEFAULT 1,
      stockQuantity INTEGER NOT NULL DEFAULT 0,
      barcode TEXT,
      taxRate REAL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (categoryId) REFERENCES categories(id)
    )
  `),r.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT,
      imageUrl TEXT,
      parentId TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (parentId) REFERENCES categories(id)
    )
  `),r.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      loyaltyPoints INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `),r.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `),r.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      transactionNumber TEXT NOT NULL UNIQUE,
      customerId TEXT,
      status TEXT NOT NULL DEFAULT 'completed',
      receiptUrl TEXT,
      notes TEXT,
      cashierId TEXT NOT NULL,
      documentType INTEGER NOT NULL,
      documentProductionDate TEXT NOT NULL,
      branchId TEXT,
      documentDiscount REAL,
      whtDeduction REAL,
      amountTendered REAL,
      changeAmount REAL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (customerId) REFERENCES customers(id),
      FOREIGN KEY (cashierId) REFERENCES users(id)
    )
  `),r.exec(`
    CREATE TABLE IF NOT EXISTS transaction_items (
      id TEXT PRIMARY KEY,
      transactionId TEXT NOT NULL,
      productId TEXT NOT NULL,
      quantity REAL NOT NULL,
      unitPrice REAL NOT NULL,
      totalPrice REAL NOT NULL,
      discount REAL,
      discountType TEXT,
      transactionType INTEGER,
      lineDiscount REAL,
      notes TEXT,
      FOREIGN KEY (transactionId) REFERENCES transactions(id) ON DELETE CASCADE,
      FOREIGN KEY (productId) REFERENCES products(id)
    )
  `),r.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `),r.exec(`
    CREATE TABLE IF NOT EXISTS business_info (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      vatNumber TEXT NOT NULL,
      companyName TEXT NOT NULL,
      companyAddress TEXT NOT NULL,
      companyAddressNumber TEXT NOT NULL,
      companyCity TEXT NOT NULL,
      companyZip TEXT NOT NULL,
      companyRegNumber TEXT,
      hasBranches INTEGER NOT NULL DEFAULT 0,
      branchId TEXT,
      updatedAt TEXT NOT NULL
    )
  `),r.exec(`
    CREATE TABLE IF NOT EXISTS software_info (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      registrationNumber TEXT NOT NULL,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      manufacturerId TEXT NOT NULL,
      manufacturerName TEXT NOT NULL,
      softwareType TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `),r.exec(`
    CREATE INDEX IF NOT EXISTS idx_transactions_createdAt ON transactions(createdAt);
    CREATE INDEX IF NOT EXISTS idx_transactions_transactionNumber ON transactions(transactionNumber);
    CREATE INDEX IF NOT EXISTS idx_transactions_customerId ON transactions(customerId);
    CREATE INDEX IF NOT EXISTS idx_transaction_items_transactionId ON transaction_items(transactionId);
    CREATE INDEX IF NOT EXISTS idx_products_categoryId ON products(categoryId);
    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
  `)}function be(r){const e=m.dirname(r);if(N.existsSync(e)||N.mkdirSync(e,{recursive:!0}),v)try{v.close()}catch{}return v=new W(r),v.pragma("journal_mode = WAL"),v.pragma("foreign_keys = ON"),Se(v),v}function f(){if(!v)throw new Error("Database not initialized");return v}function ue(r){return r.prepare("SELECT * FROM products ORDER BY name").all().map(t=>({id:t.id,name:t.name,description:t.description||void 0,price:t.price,sku:t.sku,categoryId:t.categoryId,imageUrl:t.imageUrl||void 0,inStock:t.inStock===1,stockQuantity:t.stockQuantity,barcode:t.barcode||void 0,taxRate:t.taxRate||void 0,createdAt:t.createdAt,updatedAt:t.updatedAt}))}function Ie(r,e){r.prepare(`
    INSERT OR REPLACE INTO products 
    (id, name, description, price, sku, categoryId, imageUrl, inStock, stockQuantity, barcode, taxRate, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(e.id,e.name,e.description||null,e.price,e.sku,e.categoryId,e.imageUrl||null,e.inStock?1:0,e.stockQuantity,e.barcode||null,e.taxRate||null,e.createdAt,e.updatedAt)}function Le(r){return r.prepare("SELECT * FROM categories ORDER BY sortOrder, name").all().map(t=>({id:t.id,name:t.name,description:t.description||void 0,color:t.color||void 0,imageUrl:t.imageUrl||void 0,parentId:t.parentId||void 0,isActive:t.isActive===1,sortOrder:t.sortOrder,createdAt:t.createdAt,updatedAt:t.updatedAt}))}function Re(r,e){r.prepare(`
    INSERT OR REPLACE INTO categories 
    (id, name, description, color, imageUrl, parentId, isActive, sortOrder, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(e.id,e.name,e.description||null,e.color||null,e.imageUrl||null,e.parentId||null,e.isActive?1:0,e.sortOrder,e.createdAt,e.updatedAt)}function De(r){return r.prepare("SELECT * FROM users ORDER BY name").all().map(t=>({id:t.id,name:t.name,email:t.email,role:t.role,isActive:t.isActive===1,createdAt:t.createdAt,updatedAt:t.updatedAt}))}function ve(r,e){r.prepare(`
    INSERT OR REPLACE INTO users 
    (id, name, email, role, isActive, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(e.id,e.name,e.email,e.role,e.isActive?1:0,e.createdAt,e.updatedAt)}function ee(r,e){let t;if(e.customerId){const p=r.prepare("SELECT * FROM customers WHERE id = ?").get(e.customerId);p&&(t={id:p.id,name:p.name,email:p.email||void 0,phone:p.phone||void 0,address:p.address?JSON.parse(p.address):void 0,loyaltyPoints:p.loyaltyPoints,createdAt:p.createdAt,updatedAt:p.updatedAt})}const n=r.prepare("SELECT * FROM users WHERE id = ?").get(e.cashierId),o={id:n.id,name:n.name,email:n.email,role:n.role,isActive:n.isActive===1,createdAt:n.createdAt,updatedAt:n.updatedAt},g=r.prepare("SELECT * FROM transaction_items WHERE transactionId = ?").all(e.id),d=ue(r),y=g.map(p=>{const I=d.find(H=>H.id===p.productId);return I?{id:p.id,productId:p.productId,product:{...I,createdAt:I.createdAt,updatedAt:I.updatedAt},quantity:p.quantity,unitPrice:p.unitPrice,totalPrice:p.totalPrice,discount:p.discount||void 0,discountType:p.discountType||void 0,notes:p.notes||void 0,transactionType:p.transactionType||void 0,lineDiscount:p.lineDiscount||void 0}:(console.warn(`Product ${p.productId} not found for transaction ${e.id}`),null)}).filter(Boolean),b=te(r,"globalTaxRate"),$=b?parseFloat(b)/100:.08,j=y.reduce((p,I)=>p+I.totalPrice,0),X=y.reduce((p,I)=>p+(I.discount||0),0),x=j-X,B=x/(1+$),O=x-B,Y=x,V={id:e.id,items:y,subtotal:B,taxAmount:O,discountAmount:X,totalAmount:Y,customerId:e.customerId||void 0,createdAt:e.createdAt,updatedAt:e.updatedAt};return{id:e.id,transactionNumber:e.transactionNumber,cart:V,customer:t,status:e.status,receiptUrl:e.receiptUrl||void 0,notes:e.notes||void 0,cashier:o,createdAt:e.createdAt,updatedAt:e.updatedAt,documentType:e.documentType,documentProductionDate:e.documentProductionDate||e.createdAt,branchId:e.branchId||void 0,documentDiscount:e.documentDiscount||void 0,whtDeduction:e.whtDeduction||void 0,amountTendered:e.amountTendered||void 0,changeAmount:e.changeAmount||void 0}}function Oe(r){const e=new Date;e.setHours(0,0,0,0);const t=new Date(e);return t.setDate(t.getDate()+1),r.prepare(`
    SELECT * FROM transactions 
    WHERE datetime(createdAt) >= datetime(?) AND datetime(createdAt) < datetime(?)
    ORDER BY createdAt DESC
  `).all(e.toISOString(),t.toISOString()).map(o=>ee(r,o))}function Pe(r,e,t){return r.prepare(`
    SELECT * FROM transactions 
    WHERE datetime(createdAt) >= datetime(?) AND datetime(createdAt) <= datetime(?)
    ORDER BY createdAt DESC
  `).all(e,t).map(o=>ee(r,o))}function Ue(r,e){const{startDate:t,endDate:n,limit:o=50,offset:g=0,status:d}=e;let y="1=1";const b=[];t&&(y+=" AND datetime(createdAt) >= datetime(?)",b.push(t)),n&&(y+=" AND datetime(createdAt) <= datetime(?)",b.push(n)),d&&(y+=" AND status = ?",b.push(d));const X=r.prepare(`SELECT COUNT(*) as count FROM transactions WHERE ${y}`).get(...b).count;return b.push(o,g),{transactions:r.prepare(`
    SELECT * FROM transactions 
    WHERE ${y}
    ORDER BY createdAt DESC
    LIMIT ? OFFSET ?
  `).all(...b).map(O=>ee(r,O)),total:X}}function Ce(r,e){r.transaction(()=>{var g;r.prepare(`
      INSERT OR REPLACE INTO transactions 
      (id, transactionNumber, customerId, status, receiptUrl, notes, cashierId, documentType, 
       documentProductionDate, branchId, documentDiscount, whtDeduction, amountTendered, changeAmount, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(e.id,e.transactionNumber,((g=e.customer)==null?void 0:g.id)||null,e.status,e.receiptUrl||null,e.notes||null,e.cashier.id,e.documentType,e.documentProductionDate,e.branchId||null,e.documentDiscount||null,e.whtDeduction||null,e.amountTendered||null,e.changeAmount||null,e.createdAt,e.updatedAt),r.prepare("DELETE FROM transaction_items WHERE transactionId = ?").run(e.id);const o=r.prepare(`
      INSERT INTO transaction_items 
      (id, transactionId, productId, quantity, unitPrice, totalPrice, discount, discountType, transactionType, lineDiscount, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);for(const d of e.cart.items)o.run(d.id,e.id,d.productId,d.quantity,d.unitPrice,d.totalPrice,d.discount||null,d.discountType||null,d.transactionType||null,d.lineDiscount||null,d.notes||null);if(e.status==="completed")for(const d of e.cart.items){const y=r.prepare("SELECT stockQuantity FROM products WHERE id = ?").get(d.productId);if(y){const b=Math.max(0,y.stockQuantity-d.quantity);r.prepare(`
            UPDATE products 
            SET stockQuantity = ?,
                inStock = ?,
                updatedAt = ?
            WHERE id = ?
          `).run(b,b>0?1:0,new Date().toISOString(),d.productId)}}})()}function we(r){const e=r.prepare("SELECT * FROM business_info WHERE id = 1").get();return e?{vatNumber:e.vatNumber,companyName:e.companyName,companyAddress:e.companyAddress,companyAddressNumber:e.companyAddressNumber,companyCity:e.companyCity,companyZip:e.companyZip,companyRegNumber:e.companyRegNumber,hasBranches:e.hasBranches===1,branchId:e.branchId,updatedAt:e.updatedAt}:null}function Xe(r,e){r.prepare(`
    INSERT OR REPLACE INTO business_info 
    (id, vatNumber, companyName, companyAddress, companyAddressNumber, companyCity, companyZip, 
     companyRegNumber, hasBranches, branchId, updatedAt)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(e.vatNumber,e.companyName,e.companyAddress,e.companyAddressNumber,e.companyCity,e.companyZip,e.companyRegNumber||null,e.hasBranches?1:0,e.branchId||null,new Date().toISOString())}function xe(r){const e=r.prepare("SELECT * FROM software_info WHERE id = 1").get();return e?{registrationNumber:e.registrationNumber,name:e.name,version:e.version,manufacturerId:e.manufacturerId,manufacturerName:e.manufacturerName,softwareType:e.softwareType,updatedAt:e.updatedAt}:null}function Fe(r,e){r.prepare(`
    INSERT OR REPLACE INTO software_info 
    (id, registrationNumber, name, version, manufacturerId, manufacturerName, softwareType, updatedAt)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?)
  `).run(e.registrationNumber,e.name,e.version,e.manufacturerId,e.manufacturerName,e.softwareType,new Date().toISOString())}function te(r,e){const t=r.prepare("SELECT value FROM settings WHERE key = ?").get(e);return t?t.value:null}function ke(r,e,t){r.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(e,t)}process.env.DIST=m.join(J,"../dist");process.env.VITE_PUBLIC=S.isPackaged?process.env.DIST:m.join(process.env.DIST,"../public");let T;const ce=process.env.VITE_DEV_SERVER_URL||process.env.VITE_DEV_SERVER_HOST||"http://localhost:5173";function le(){T=new q({width:1200,height:800,minWidth:1e3,minHeight:600,icon:m.join(process.env.VITE_PUBLIC,"icon.png"),webPreferences:{preload:m.join(J,"preload.js"),nodeIntegration:!1,contextIsolation:!0},titleBarStyle:"default",show:!1,fullscreen:!0}),T.webContents.on("did-finish-load",()=>{T==null||T.webContents.send("main-process-message",new Date().toLocaleString()),T&&!T.isFullScreen()&&T.setFullScreen(!0)}),process.env.IS_DEV==="true"||!S.isPackaged?(console.log("Development mode detected"),console.log("VITE_DEV_SERVER_URL:",ce),console.log("IS_DEV:",process.env.IS_DEV),console.log("app.isPackaged:",S.isPackaged),T.loadURL(ce),T.webContents.openDevTools()):(console.log("Production mode - loading from file"),T.loadFile(m.join(process.env.DIST,"index.html"))),T.once("ready-to-show",()=>{T==null||T.show()})}S.on("window-all-closed",()=>{process.platform!=="darwin"&&(S.quit(),T=null)});S.on("activate",()=>{q.getAllWindows().length===0&&le()});S.whenReady().then(()=>{le();const r=[{label:"File",submenu:[{label:"New Sale",accelerator:"CmdOrCtrl+N",click:()=>{T==null||T.webContents.send("menu-new-sale")}},{type:"separator"},{label:"Quit",accelerator:process.platform==="darwin"?"Cmd+Q":"Ctrl+Q",click:()=>{S.quit()}}]},{label:"View",submenu:[{role:"reload"},{role:"forceReload"},{role:"toggleDevTools"},{type:"separator"},{role:"resetZoom"},{role:"zoomIn"},{role:"zoomOut"},{type:"separator"},{role:"togglefullscreen"}]},{label:"Window",submenu:[{role:"minimize"},{role:"close"}]}],e=oe.buildFromTemplate(r);oe.setApplicationMenu(e)});l.handle("get-app-version",()=>S.getVersion());l.handle("show-message-box",async(r,e)=>{const{dialog:t}=require("electron");return await t.showMessageBox(T,e)});l.handle("get-printers",async()=>{try{const r=T.webContents.getPrintersAsync?await T.webContents.getPrintersAsync():T.webContents.getPrinters();return console.log("Available printers:",r.map(e=>({name:e.name,displayName:e.displayName,isDefault:e.isDefault}))),r}catch(r){return console.error("Error getting printers:",r),[]}});l.handle("show-print-preview",async(r,e)=>{try{const t=`
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
            <p>Printer: ${e||"Default"}</p>
            <p>Date: ${new Date().toLocaleString()}</p>
            <p>POS Desktop Application</p>
            <p>This is what will be printed</p>
          </div>
        </body>
      </html>
    `;return await new q({width:400,height:500,webPreferences:{nodeIntegration:!1,contextIsolation:!0}}).loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(t)}`),{success:!0}}catch(t){return console.error("Error showing preview:",t),{success:!1,error:t.message}}});l.handle("print-test",async(r,e)=>{try{console.log("Print test requested for printer:",e);const t=`
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
            <p>Printer: ${e||"Default"}</p>
            <p>Date: ${new Date().toLocaleString()}</p>
            <p>POS Desktop Application</p>
            <p>Test successful!</p>
          </div>
        </body>
      </html>
    `,n=new q({show:!1,width:800,height:600,webPreferences:{nodeIntegration:!1,contextIsolation:!0}});console.log("Loading content into print window..."),await n.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(t)}`),await new Promise(g=>setTimeout(g,500));const o={silent:!0,printBackground:!0,color:!1,margin:{marginType:"minimum"},landscape:!1,pagesPerSheet:1,collate:!1,copies:1};return e&&e!=="default"?(o.deviceName=e,console.log("Using specific printer:",e)):console.log("Using default printer"),console.log("Sending to printer with options:",o),new Promise(g=>{n.webContents.print(o,(d,y)=>{console.log("Print result - Success:",d,"Reason:",y),n.close(),g(d?{success:!0,printed:!0}:{success:!1,error:y||"Print failed"})})})}catch(t){return console.error("Error printing:",t),{success:!1,error:t.message}}});l.handle("get-available-drives",async()=>{try{const r=[];if(process.platform==="win32"){const{execSync:e}=require("child_process");try{const n=e("wmic logicaldisk get name",{encoding:"utf-8"}).split(`
`).filter(o=>o.trim()&&o.trim()!=="Name");r.push(...n.map(o=>o.trim()).filter(Boolean))}catch(t){console.error("Error getting Windows drives:",t),r.push("C:","D:","E:","F:")}}else r.push("/");return r.length>0?r:["C:"]}catch(r){return console.error("Error getting drives:",r),["C:"]}});l.handle("select-export-directory",async()=>{try{const r=await de.showOpenDialog(T,{properties:["openDirectory"],title:"Select Export Directory"});return r.canceled||r.filePaths.length===0?null:r.filePaths[0]}catch(r){return console.error("Error selecting directory:",r),null}});l.handle("generate-tax-report",async(r,e)=>{try{const{transactions:t,businessInfo:n,softwareInfo:o,taxReportConfig:g,dateRange:d,drive:y,useCustomPath:b,globalTaxRate:$}=e,j=f(),X=$||(()=>{const a=te(j,"globalTaxRate");return a?parseFloat(a):8})(),x=n.vatNumber.substring(0,8).padStart(8,"0"),B="year"in d?String(d.year).slice(-2):String(d.start.getFullYear()).slice(-2),O=new Date,Y=String(O.getMonth()+1).padStart(2,"0"),V=String(O.getDate()).padStart(2,"0"),p=String(O.getHours()).padStart(2,"0"),I=String(O.getMinutes()).padStart(2,"0"),H=m.join(y,"OPENFRMT"),z=m.join(H,`${x}.${B}`);let P=m.join(z,`${Y}${V}${p}${I}`),K=0;for(;N.existsSync(P)&&K<60;){const a=(parseInt(I)+K+1)%60,c=String(a).padStart(2,"0");P=m.join(z,`${Y}${V}${p}${c}`),K++}N.mkdirSync(P,{recursive:!0});const G=(()=>{const a=Date.now().toString(),c=Math.floor(Math.random()*1e3).toString();return(a+c).slice(-15).padStart(15,"0")})(),s=(a,c,A=" ")=>(a||"").padEnd(c,A).substring(0,c),u=(a,c,A="0")=>(a||"").padStart(c,A).substring(0,c),F=(a,c=15)=>{const A=Math.abs(a),D=Math.floor(A),Z=Math.round((A-D)*100),h=u(D.toString(),12,"0"),L=u(Z.toString(),2,"0"),E=a<0?"-":"+";return h+L+E},U=a=>{const c=a.getFullYear(),A=String(a.getMonth()+1).padStart(2,"0"),D=String(a.getDate()).padStart(2,"0");return`${c}${A}${D}`},pe=a=>{const c=String(a.getHours()).padStart(2,"0"),A=String(a.getMinutes()).padStart(2,"0");return`${c}${A}`},k=[];let R=1;const C={A100:0,C100:0,D110:0,D120:0,Z900:0};let M="A100";M+=u(R.toString(),9,"0"),M+=u(n.vatNumber,9,"0"),M+=u(G,15,"0"),M+="&OF1.31&",M+=s("",50),k.push(M),C.A100=1,R++;for(const a of t){let c="C100";c+=u(R.toString(),9,"0"),c+=u(n.vatNumber,9,"0"),c+=s("",9),c+=u(a.documentType.toString(),3,"0"),c+=s(a.transactionNumber,20),c+=U(a.documentProductionDate),c+=s("",250),c+=a.documentDiscount?F(-Math.abs(a.documentDiscount),15):s("",15),c+=s("",45),c+=a.whtDeduction?F(Math.abs(a.whtDeduction),12):s("",12),c+=s("",26),c+=U(a.createdAt),c+=a.branchId?s(a.branchId,7):s("",7),c+=s("",444-c.length),k.push(c),C.C100++,R++;let A=1;for(const L of a.cart.items){let E="D110";E+=u(R.toString(),9,"0"),E+=u(n.vatNumber,9,"0"),E+=s("",9),E+=u(a.documentType.toString(),3,"0"),E+=s(a.transactionNumber,20),E+=u(A.toString(),4,"0"),E+=s("",3),E+=s("",20),E+=String(L.transactionType||2),E+=s(L.product.sku||"",20),E+=s(L.product.name,30),E+=s("",50),E+=s("",30),E+=s("",20);const se=Math.floor(L.quantity),Ne=Math.round((L.quantity-se)*1e4);E+=u(se.toString(),12,"0")+u(Ne.toString(),4,"0")+"+",E+=F(L.unitPrice,15),E+=L.lineDiscount?F(-Math.abs(L.lineDiscount),15):s("",15),E+=F(L.totalPrice,15);const fe=Math.round(X);E+=u(fe.toString(),2,"0"),E+=a.branchId?s(a.branchId,7):s("",7),E+=U(a.createdAt),E+=s("",339-E.length),k.push(E),C.D110++,R++,A++}const Z={cash:1,check:2,card:3,digital:4,gift_card:9}[a.paymentDetails.method.type]||9;let h="D120";h+=u(R.toString(),9,"0"),h+=u(n.vatNumber,9,"0"),h+=s("",9),h+=u(a.documentType.toString(),3,"0"),h+=s(a.transactionNumber,20),h+=u("1",4,"0"),h+=String(Z),h+=a.paymentDetails.method.type==="check"&&a.paymentDetails.bankNumber?u(a.paymentDetails.bankNumber,10,"0"):s("",10),h+=s("",10),h+=s("",15),h+=s("",10),h+=s("",8),h+=F(a.paymentDetails.amount,15),h+=s("",1),h+=s("",20),h+=a.paymentDetails.method.type==="card"&&a.paymentDetails.creditTransactionType?String(a.paymentDetails.creditTransactionType):s("",1),h+=a.branchId?s(a.branchId,7):s("",7),h+=U(a.createdAt),h+=s("",7),h+=s("",222-h.length),k.push(h),C.D120++,R++}const re=R;let w="Z900";w+=u(R.toString(),9,"0"),w+=u(n.vatNumber,9,"0"),w+=u(G,15,"0"),w+="&OF1.31&",w+=u(re.toString(),15,"0"),w+=s("",50),k.push(w),C.Z900=1;const ne=m.join(P,"BKMVDATA.TXT"),me=k.join(`\r
`)+`\r
`,Ee=ie.encode(me,"iso88598");N.writeFileSync(ne,Ee);const Te=m.join(P,"BKMVDATA.zip");await new Promise((a,c)=>{const A=N.createWriteStream(Te),D=Ae("zip",{zlib:{level:9}});A.on("close",()=>a(void 0)),D.on("error",c),D.pipe(A),D.file(ne,{name:"BKMVDATA.TXT"}),D.finalize()});const ae=new Date,Q=[];let i="A000";i+=s("",5),i+=u(re.toString(),15,"0"),i+=u(n.vatNumber,9,"0"),i+=u(G,15,"0"),i+=s(g.systemCode,8),i+=u(o.registrationNumber,8,"0"),i+=s(o.name,20),i+=s(o.version,20),i+=u(o.manufacturerId,9,"0"),i+=s(o.manufacturerName,20),i+=o.softwareType==="single-year"?"1":"2",i+=s(m.join(z,m.basename(P)),50),i+=g.accountingType,i+=g.balancingRequired?"1":"0",i+=u(n.vatNumber,9,"0"),i+=u(n.companyRegNumber||"000000001",9,"0"),i+=s(n.companyName,50),i+=s(n.companyAddress,50),i+=s(n.companyAddressNumber,10),i+=s(n.companyCity,30),i+=s(n.companyZip,8),"year"in d?(i+=String(d.year),i+=String(d.year)+"0101",i+=String(d.year)+"1231"):(i+=String(d.start.getFullYear()),i+=U(d.start),i+=U(d.end)),i+=U(ae),i+=pe(ae),i+=g.languageCode,i+=g.charset,i+=s(g.compressionSoftware,20),i+=g.defaultCurrency,i+=n.hasBranches?"1":"0",i+=s("",466-i.length),Q.push(i);for(const[a,c]of Object.entries(C))c>0&&Q.push(a+u(c.toString(),15,"0"));const ge=m.join(P,"INI.TXT"),he=Q.join(`\r
`)+`\r
`,ye=ie.encode(he,"iso88598");return N.writeFileSync(ge,ye),{success:!0,filePath:P,recordCounts:C}}catch(t){return console.error("Error generating tax report:",t),{success:!1,error:t.message||"Failed to generate tax report"}}});l.handle("print-report-summary",async(r,e)=>{try{const t=`
      <html>
        <head>
          <style>
            @media print {
              body { 
                font-family: Arial, sans-serif; 
                padding: 20px; 
                margin: 0;
                font-size: 12pt;
              }
            }
            body { 
              font-family: Arial, sans-serif; 
              padding: 20px; 
            }
            h1 { margin-top: 0; }
            .summary-item { margin: 10px 0; }
            .record-counts { margin-left: 20px; }
          </style>
        </head>
        <body>
          <h1>Tax Report Summary</h1>
          <div class="summary-item">
            <strong>Status:</strong> ${e.success?"Success":"Failed"}
          </div>
          ${e.filePath?`<div class="summary-item"><strong>File Path:</strong> ${e.filePath}</div>`:""}
          ${e.recordCounts?`
            <div class="summary-item">
              <strong>Record Counts:</strong>
              <ul class="record-counts">
                ${Object.entries(e.recordCounts).map(([o,g])=>`<li>${o}: ${g}</li>`).join("")}
              </ul>
            </div>
          `:""}
          <div class="summary-item">
            <strong>Generated:</strong> ${new Date().toLocaleString()}
          </div>
        </body>
      </html>
    `,n=new q({show:!1,webPreferences:{nodeIntegration:!1,contextIsolation:!0}});return await n.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(t)}`),await new Promise(o=>setTimeout(o,500)),new Promise(o=>{n.webContents.print({silent:!0},g=>{n.close(),o({success:g,printed:g})})})}catch(t){return{success:!1,error:t.message}}});l.handle("get-database-path",async()=>{try{const r=S.getPath("userData"),e=m.join(r,"database","pos.db"),t=m.join(r,"settings.json");if(N.existsSync(t)){const n=JSON.parse(N.readFileSync(t,"utf-8"));if(n.databasePath)return n.databasePath}return e}catch(r){console.error("Error getting database path:",r);const e=S.getPath("userData");return m.join(e,"database","pos.db")}});l.handle("set-database-path",async(r,e)=>{try{const t=S.getPath("userData"),n=m.join(t,"settings.json");let o={};return N.existsSync(n)&&(o=JSON.parse(N.readFileSync(n,"utf-8"))),o.databasePath=e,N.writeFileSync(n,JSON.stringify(o,null,2)),{success:!0}}catch(t){return console.error("Error setting database path:",t),{success:!1,error:t.message}}});l.handle("initialize-database",async(r,e)=>{try{return be(e),{success:!0,path:e}}catch(t){return console.error("Error initializing database:",t),{success:!1,error:t.message}}});l.handle("database-exists",async(r,e)=>{try{return N.existsSync(e)}catch{return!1}});l.handle("backup-database",async(r,e)=>{try{if(!N.existsSync(e))return{success:!1,error:"Database file does not exist"};const t=m.join(m.dirname(e),"backups");N.existsSync(t)||N.mkdirSync(t,{recursive:!0});const n=new Date().toISOString().replace(/[:.]/g,"-"),o=m.join(t,`pos-backup-${n}.db`);return N.copyFileSync(e,o),{success:!0,backupPath:o}}catch(t){return console.error("Error backing up database:",t),{success:!1,error:t.message}}});l.handle("select-database-path",async()=>{try{const r=await de.showSaveDialog(T,{title:"Select Database Location",defaultPath:"pos.db",filters:[{name:"SQLite Database",extensions:["db"]},{name:"All Files",extensions:["*"]}]});return r.canceled||!r.filePath?null:r.filePath}catch(r){return console.error("Error selecting database path:",r),null}});l.handle("db-get-products",async()=>{try{const r=f();return ue(r)}catch(r){return console.error("Error getting products:",r),[]}});l.handle("db-save-product",async(r,e)=>{try{const t=f();return Ie(t,e),{success:!0}}catch(t){return console.error("Error saving product:",t),{success:!1,error:t.message}}});l.handle("db-get-categories",async()=>{try{const r=f();return Le(r)}catch(r){return console.error("Error getting categories:",r),[]}});l.handle("db-save-category",async(r,e)=>{try{const t=f();return Re(t,e),{success:!0}}catch(t){return console.error("Error saving category:",t),{success:!1,error:t.message}}});l.handle("db-get-users",async()=>{try{const r=f();return De(r)}catch(r){return console.error("Error getting users:",r),[]}});l.handle("db-save-user",async(r,e)=>{try{const t=f();return ve(t,e),{success:!0}}catch(t){return console.error("Error saving user:",t),{success:!1,error:t.message}}});l.handle("db-get-todays-transactions",async()=>{try{const r=f();return Oe(r)}catch(r){return console.error("Error getting today's transactions:",r),[]}});l.handle("db-get-transactions-by-date-range",async(r,e,t)=>{try{const n=f();return Pe(n,e,t)}catch(n){return console.error("Error getting transactions by date range:",n),[]}});l.handle("db-get-transactions-page",async(r,e)=>{try{const t=f();return Ue(t,e)}catch(t){return console.error("Error getting transactions page:",t),{transactions:[],total:0}}});l.handle("db-save-transaction",async(r,e)=>{try{const t=f(),n={...e,createdAt:e.createdAt||new Date().toISOString(),updatedAt:e.updatedAt||new Date().toISOString(),documentProductionDate:e.documentProductionDate||new Date().toISOString()};return Ce(t,n),{success:!0}}catch(t){return console.error("Error saving transaction:",t),{success:!1,error:t.message}}});l.handle("db-get-business-info",async()=>{try{const r=f();return we(r)}catch(r){return console.error("Error getting business info:",r),null}});l.handle("db-save-business-info",async(r,e)=>{try{const t=f();return Xe(t,e),{success:!0}}catch(t){return console.error("Error saving business info:",t),{success:!1,error:t.message}}});l.handle("db-get-software-info",async()=>{try{const r=f();return xe(r)}catch(r){return console.error("Error getting software info:",r),null}});l.handle("db-save-software-info",async(r,e)=>{try{const t=f();return Fe(t,e),{success:!0}}catch(t){return console.error("Error saving software info:",t),{success:!1,error:t.message}}});l.handle("db-get-setting",async(r,e)=>{try{const t=f();return te(t,e)}catch(t){return t.message==="Database not initialized"?(console.warn("Database not initialized when getting setting:",e),null):(console.error("Error getting setting:",t),null)}});l.handle("db-save-setting",async(r,e,t)=>{try{const n=f();return ke(n,e,t),{success:!0}}catch(n){return n.message==="Database not initialized"?(console.warn("Database not initialized when saving setting:",e),{success:!1,error:"Database not initialized"}):(console.error("Error saving setting:",n),{success:!1,error:n.message})}});
