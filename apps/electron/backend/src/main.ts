import { app, BrowserWindow } from "electron";
import path from "path";
import Store from "electron-store";
import { StoreSchema } from "@/types";

const store = new Store<StoreSchema>({
  defaults: {
    mainWindow: {
      bounds: { width: 800, height: 600 },
    },
  },
});

let win: BrowserWindow | null = null;

function createWindow() {
  const savedBounds = store.get("mainWindow.bounds");

  win = new BrowserWindow({
    width: savedBounds.width,
    height: savedBounds.height,
    x: savedBounds.x,
    y: savedBounds.y,

    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadFile("frontend/index.html");

  // Save bounds when window is moved or resized
  const saveBounds = () => {
    if (win && !win.isDestroyed()) {
      const newBounds = win.getBounds();
      console.log("Saving window bounds:", newBounds);
      store.set("mainWindow.bounds", newBounds);
      console.log("Window bounds saved.");
    }
  };

  win.on("resize", saveBounds);
  win.on("moved", saveBounds);

  win.on("closed", () => {
    win = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

console.log("Electron main process started. Store path: %s", store.path);
