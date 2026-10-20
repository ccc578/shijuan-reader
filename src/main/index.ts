import { app, BrowserWindow, protocol, session } from 'electron'
import { join, resolve, sep } from 'node:path'
import { readFile } from 'node:fs/promises'
import { ASSET_SCHEME } from '@shared/ipc'
import { registerIpc } from './ipc'
import { assetsDir, ensureStore } from './services/paths'

// 冒烟测试用独立数据目录，避免污染真实书架
if (process.env['SHIJUAN_USER_DATA']) {
  app.setPath('userData', process.env['SHIJUAN_USER_DATA'])
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: ASSET_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: false }
  }
])

const CSP =
  "default-src 'self'; img-src 'self' data: shijuan-asset:; style-src 'self' 'unsafe-inline'; script-src 'self'"

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
}

function mimeOf(path: string): string {
  const lower = path.toLowerCase()
  for (const [ext, type] of Object.entries(MIME)) {
    if (lower.endsWith(ext)) return type
  }
  return 'application/octet-stream'
}

/** shijuan-asset://<bookId>/<zip 内路径> → volumes/<bookId>/assets/<路径> */
async function serveAsset(request: Request): Promise<Response> {
  let url: URL
  try {
    url = new URL(request.url)
  } catch {
    return new Response('bad request', { status: 400 })
  }

  const bookId = url.hostname
  if (!/^[0-9a-f-]{16,64}$/i.test(bookId)) return new Response('forbidden', { status: 403 })

  let rel: string
  try {
    rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
  } catch {
    return new Response('bad request', { status: 400 })
  }

  if (rel === '' || rel.includes('\\') || /^[a-zA-Z]:/.test(rel) || rel.split('/').includes('..')) {
    return new Response('forbidden', { status: 403 })
  }

  const base = assetsDir(bookId)
  const target = resolve(base, ...rel.split('/'))
  if (target !== base && !target.startsWith(base + sep)) {
    return new Response('forbidden', { status: 403 })
  }

  try {
    return new Response(await readFile(target), { headers: { 'Content-Type': mimeOf(rel) } })
  } catch {
    return new Response('not found', { status: 404 })
  }
}

function applyCsp(): void {
  if (process.env['ELECTRON_RENDERER_URL'] && process.env.NODE_ENV !== 'production') return
  session.defaultSession.webRequest.onHeadersReceived((details, done) => {
    done({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [CSP] }
    })
  })
}

function openWindow(): void {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 660,
    show: false,
    backgroundColor: '#f1f4f4',
    title: '拾卷',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event, url) => {
    const dev = process.env['ELECTRON_RENDERER_URL']
    const allowed = dev ? url.startsWith(dev) : url.startsWith('file://')
    if (!allowed) event.preventDefault()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  await ensureStore()
  registerIpc()
  protocol.handle(ASSET_SCHEME, serveAsset)
  applyCsp()
  openWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
