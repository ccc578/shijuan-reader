import { app } from 'electron'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'

/** userData 下的数据根。app ready 之后才可靠，因此统一用函数懒取。 */
export function rootDir(): string {
  return app.getPath('userData')
}

export function dataDir(): string {
  return join(rootDir(), 'store')
}

export function shelfDir(): string {
  return join(rootDir(), 'volumes')
}

export function volumeDir(bookId: string): string {
  return join(shelfDir(), bookId)
}

export function shelfIndexFile(): string {
  return join(dataDir(), 'shelf.json')
}

export function positionsFile(): string {
  return join(dataDir(), 'positions.json')
}

export function prefsFile(): string {
  return join(dataDir(), 'prefs.json')
}

export function metaFile(bookId: string): string {
  return join(volumeDir(bookId), 'meta.json')
}

export function sourceFile(bookId: string, ext: string): string {
  return join(volumeDir(bookId), `source.${ext}`)
}

export function textFile(bookId: string, chapter: number): string {
  return join(volumeDir(bookId), 'text', `${String(chapter).padStart(4, '0')}.txt`)
}

export function htmlFile(bookId: string, chapter: number): string {
  return join(volumeDir(bookId), 'text', `${String(chapter).padStart(4, '0')}.html`)
}

export function assetsDir(bookId: string): string {
  return join(volumeDir(bookId), 'assets')
}

export function assetFile(bookId: string, relPath: string): string {
  return join(assetsDir(bookId), ...relPath.split('/'))
}

export async function ensureStore(): Promise<void> {
  await Promise.all([mkdir(dataDir(), { recursive: true }), mkdir(shelfDir(), { recursive: true })])
}

export async function ensureVolume(bookId: string): Promise<void> {
  await ensureStore()
  await mkdir(join(volumeDir(bookId), 'text'), { recursive: true })
}
