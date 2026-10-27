/**
 * Puente entre la ventana y el proceso principal. La página no tiene acceso a
 * Node: solo a estas funciones, expuestas como window.riftlab.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type {
  BuildPayload,
  DesktopAccount,
  DesktopBridge,
  DesktopSettings,
  LiveState,
  RunePagePayload,
  TftPlanPayload,
  UpdateStatus,
} from "../src/lib/live";

const bridge: DesktopBridge = {
  getState: () => ipcRenderer.invoke("live:get"),
  onState: (callback) => {
    const listener = (_e: IpcRendererEvent, state: LiveState) => callback(state);
    ipcRenderer.on("live:state", listener);
    return () => ipcRenderer.removeListener("live:state", listener);
  },
  getAccount: () => ipcRenderer.invoke("account:get"),
  onAccount: (callback) => {
    const listener = (_e: IpcRendererEvent, account: DesktopAccount | null) => callback(account);
    ipcRenderer.on("account:changed", listener);
    return () => ipcRenderer.removeListener("account:changed", listener);
  },
  setAccount: (account: DesktopAccount | null) => ipcRenderer.invoke("account:set", account),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),
  onSettings: (callback) => {
    const listener = (_e: IpcRendererEvent, settings: DesktopSettings) => callback(settings);
    ipcRenderer.on("settings:changed", listener);
    return () => ipcRenderer.removeListener("settings:changed", listener);
  },
  setApiKey: (key: string) => ipcRenderer.invoke("settings:api-key", key),
  importRunes: (page: RunePagePayload) => ipcRenderer.invoke("live:import-runes", page),
  setSpells: (spell1Id: number, spell2Id: number) => ipcRenderer.invoke("live:set-spells", spell1Id, spell2Id),
  importBuild: (build: BuildPayload) => ipcRenderer.invoke("live:import-build", build),
  exportTftPlan: (plan: TftPlanPayload) => ipcRenderer.invoke("tft:export-plan", plan),
  toggleTftOverlay: () => ipcRenderer.invoke("tft:overlay"),
  focusWindow: () => ipcRenderer.invoke("window:focus"),
  getUpdate: () => ipcRenderer.invoke("update:get"),
  onUpdate: (callback) => {
    const listener = (_e: IpcRendererEvent, status: UpdateStatus) => callback(status);
    ipcRenderer.on("update:status", listener);
    return () => ipcRenderer.removeListener("update:status", listener);
  },
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  setUpdateUrl: (url: string) => ipcRenderer.invoke("update:set-url", url),
  installUpdate: () => ipcRenderer.invoke("update:install"),
};

contextBridge.exposeInMainWorld("riftlab", bridge);
