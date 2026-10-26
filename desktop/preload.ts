// Ponte tra la pagina del gioco e l'app desktop: espone SOLO questi comandi (niente accesso libero a Node/Electron).
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktop', {
  info: () => ipcRenderer.invoke('desktop:info'),
  setFullScreen: (on: boolean) => ipcRenderer.invoke('desktop:fullscreen', on),
  moveToDisplay: (id: number) => ipcRenderer.invoke('desktop:display', id),
  setWindowSize: (width: number, height: number) => ipcRenderer.invoke('desktop:size', width, height),
  quit: () => ipcRenderer.invoke('desktop:quit')
});
