// غلاف Electron: يفتح البرنامج نفسه في نافذة سطح مكتب، والبيانات تبقى على الحاسوب.
const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const fs = require("fs");

// بعد التحزيم تكون ملفات البرنامج في app/ داخل الحزمة، وأثناء التطوير في المجلد الأب.
const packagedRoot = path.join(__dirname, "app");
const root = fs.existsSync(path.join(packagedRoot, "index.html")) ? packagedRoot : path.join(__dirname, "..");
const iconFile = path.join(root, "icons", process.platform === "win32" ? "icon.ico" : "icon-512.png");

// على ويندوز: معرّف ثابت حتى يظهر الشعار نفسه في شريط المهام والاختصارات
if (process.platform === "win32") app.setAppUserModelId("dz.univ.pg-assistant");

function createWindow() {
  const win = new BrowserWindow({
    width: 1360, height: 860, title: "مساعد رئيس القسم",
    icon: iconFile,
    webPreferences: { contextIsolation: true }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(root, "index.html"));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
}
app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
