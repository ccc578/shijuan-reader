import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { CH } from '@shared/ipc'
import type { ShiJuanApi } from '@shared/types'

const api: ShiJuanApi = {
  version: '0.2.0',
  platform: process.platform,
  shelf: {
    list: () => ipcRenderer.invoke(CH.shelfList),
    pick: () => ipcRenderer.invoke(CH.shelfPick),
    add: (paths) => ipcRenderer.invoke(CH.shelfAdd, paths),
    drop: (bookId) => ipcRenderer.invoke(CH.shelfDrop, bookId)
  },
  book: {
    toc: (bookId) => ipcRenderer.invoke(CH.bookToc, bookId),
    chapter: (bookId, index) => ipcRenderer.invoke(CH.bookChapter, bookId, index),
    find: (bookId, term) => ipcRenderer.invoke(CH.bookFind, bookId, term)
  },
  position: {
    read: (bookId) => ipcRenderer.invoke(CH.positionRead, bookId),
    write: (input) => ipcRenderer.invoke(CH.positionWrite, input)
  },
  prefs: {
    read: () => ipcRenderer.invoke(CH.prefsRead),
    write: (patch) => ipcRenderer.invoke(CH.prefsWrite, patch)
  },
  pathOf: (file) => {
    try {
      return webUtils.getPathForFile(file as File)
    } catch {
      return ''
    }
  }
}

contextBridge.exposeInMainWorld('shijuan', api)
