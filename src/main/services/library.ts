import { randomUUID } from 'node:crypto'
import { basename, dirname, extname } from 'node:path'
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import type {
  BookMeta,
  ChapterPayload,
  ImportSummary,
  PositionInput,
  ReadingPosition,
  SearchHit,
  ShelfBook,
  TocEntry
} from '@shared/types'
import { MAX_BOOK_BYTES, SEARCH_HIT_LIMIT } from '@shared/constants'
import { percent1, unit } from '@shared/progress'
import {
  assetFile,
  assetsDir,
  ensureVolume,
  htmlFile,
  metaFile,
  positionsFile,
  shelfIndexFile,
  sourceFile,
  textFile,
  volumeDir
} from './paths'
import { loadJson, saveJson } from './jsonStore'
import { countChars, readTxt, textToHtml } from './txtParser'
import { parseEpub } from './epub'
import { htmlToText } from './sanitize'

interface VolumeFile {
  meta: BookMeta
  /** 正文文件扩展名：txt（纯文本）或 html（EPUB 净化后片段） */
  body: 'txt' | 'html'
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'E_IO: 文件读写失败'
}

async function readVolume(bookId: string): Promise<VolumeFile> {
  const volume = await loadJson<VolumeFile | null>(metaFile(bookId), null)
  if (!volume || !volume.meta) throw new Error('E_NOT_FOUND: 这本书已不在书架上')
  return volume
}

async function readSource(path: string): Promise<{ bytes: number; buf: Buffer }> {
  let bytes = 0
  try {
    bytes = (await stat(path)).size
  } catch {
    throw new Error('E_IO: 无法读取文件')
  }
  if (bytes === 0) throw new Error('E_IO: 文件是空的')
  if (bytes > MAX_BOOK_BYTES) throw new Error('E_TOO_LARGE: 文件超过 50MB')
  try {
    return { bytes, buf: await readFile(path) }
  } catch {
    throw new Error('E_IO: 无法读取文件')
  }
}

async function importTxt(path: string, fileName: string): Promise<BookMeta> {
  const { bytes, buf } = await readSource(path)
  const parsed = readTxt(buf, fileName)
  const id = randomUUID()

  const toc: TocEntry[] = parsed.chapters.map((chapter, index) => ({
    index,
    title: chapter.title,
    depth: chapter.depth,
    chars: countChars(chapter)
  }))

  const meta: BookMeta = {
    id,
    title: parsed.title,
    format: 'txt',
    sourceName: fileName,
    bytes,
    importedAt: Date.now(),
    toc,
    chars: parsed.chars
  }

  await ensureVolume(id)
  await copyFile(path, sourceFile(id, 'txt'))
  for (let i = 0; i < parsed.chapters.length; i += 1) {
    await writeFile(textFile(id, i), parsed.chapters[i].body, 'utf8')
  }
  await saveJson<VolumeFile>(metaFile(id), { meta, body: 'txt' })
  return meta
}

async function importEpub(path: string, fileName: string): Promise<BookMeta> {
  const { bytes, buf } = await readSource(path)
  const id = randomUUID()
  const parsed = await parseEpub(buf, fileName, { assetBase: `shijuan-asset://${id}/` })

  const toc: TocEntry[] = parsed.chapters.map((chapter, index) => ({
    index,
    title: chapter.title,
    depth: chapter.depth,
    chars: chapter.chars
  }))

  const meta: BookMeta = {
    id,
    title: parsed.title,
    ...(parsed.author ? { author: parsed.author } : {}),
    format: 'epub',
    sourceName: fileName,
    bytes,
    importedAt: Date.now(),
    ...(parsed.cover ? { cover: parsed.cover } : {}),
    toc,
    chars: toc.reduce((sum, entry) => sum + entry.chars, 0)
  }

  try {
    await ensureVolume(id)
    await copyFile(path, sourceFile(id, 'epub'))
    for (let i = 0; i < parsed.chapters.length; i += 1) {
      await writeFile(htmlFile(id, i), parsed.chapters[i].html, 'utf8')
    }
    for (const asset of parsed.assets) {
      const target = assetFile(id, asset.path)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, asset.bytes)
    }
    if (parsed.assets.length === 0) await mkdir(assetsDir(id), { recursive: true })
    await saveJson<VolumeFile>(metaFile(id), { meta, body: 'html' })
  } catch (error) {
    // 半途失败时清掉残留目录，避免书架上出现打不开的卷
    await rm(volumeDir(id), { recursive: true, force: true })
    throw error
  }

  return meta
}

async function importOne(path: string): Promise<BookMeta> {
  const fileName = basename(path)
  const ext = extname(fileName).toLowerCase()
  if (ext === '.txt') return importTxt(path, fileName)
  if (ext === '.epub') return importEpub(path, fileName)
  throw new Error('E_FORMAT: 只支持 TXT 与 EPUB 两种格式')
}

/** 批量导入：单本失败不影响其余；书架索引最后一次性写入 */
export async function importPaths(paths: string[]): Promise<ImportSummary> {
  const imported: BookMeta[] = []
  const rejected: ImportSummary['rejected'] = []

  for (const path of paths) {
    try {
      imported.push(await importOne(path))
    } catch (error) {
      rejected.push({ name: basename(path), reason: messageOf(error) })
    }
  }

  if (imported.length > 0) {
    const shelf = await loadJson<BookMeta[]>(shelfIndexFile(), [])
    shelf.push(...imported)
    await saveJson(shelfIndexFile(), shelf)
  }
  return { imported, rejected }
}

export async function listShelf(): Promise<ShelfBook[]> {
  const [shelf, positions] = await Promise.all([
    loadJson<BookMeta[]>(shelfIndexFile(), []),
    loadJson<Record<string, ReadingPosition>>(positionsFile(), {})
  ])

  const rows: ShelfBook[] = shelf.map((meta) => ({
    ...meta,
    position: positions[meta.id] ?? null
  }))

  rows.sort((a, b) => {
    if (a.position && b.position) return b.position.savedAt - a.position.savedAt
    if (a.position) return -1
    if (b.position) return 1
    return b.importedAt - a.importedAt
  })
  return rows
}

/** 删除书籍：索引、进度、正文目录一并清理；重复删除静默通过 */
export async function dropBook(bookId: string): Promise<void> {
  const shelf = await loadJson<BookMeta[]>(shelfIndexFile(), [])
  const next = shelf.filter((book) => book.id !== bookId)
  if (next.length !== shelf.length) await saveJson(shelfIndexFile(), next)

  const positions = await loadJson<Record<string, ReadingPosition>>(positionsFile(), {})
  if (positions[bookId]) {
    delete positions[bookId]
    await saveJson(positionsFile(), positions)
  }
  await rm(volumeDir(bookId), { recursive: true, force: true })
}

export async function readToc(bookId: string): Promise<TocEntry[]> {
  return (await readVolume(bookId)).meta.toc
}

export async function readChapter(bookId: string, index: number): Promise<ChapterPayload> {
  const volume = await readVolume(bookId)
  const entry = volume.meta.toc[index]
  if (!entry) throw new Error('E_NOT_FOUND: 章节不存在')

  const file = volume.body === 'html' ? htmlFile(bookId, index) : textFile(bookId, index)
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch {
    throw new Error('E_IO: 章节读取失败')
  }

  return {
    index,
    title: entry.title,
    html: volume.body === 'html' ? raw : textToHtml(raw),
    chars: entry.chars
  }
}

export async function readPosition(bookId: string): Promise<ReadingPosition | null> {
  const positions = await loadJson<Record<string, ReadingPosition>>(positionsFile(), {})
  return positions[bookId] ?? null
}

export async function writePosition(input: PositionInput): Promise<void> {
  const positions = await loadJson<Record<string, ReadingPosition>>(positionsFile(), {})
  positions[input.bookId] = {
    bookId: input.bookId,
    chapter: Math.max(0, Math.trunc(input.chapter)),
    ratio: unit(input.ratio),
    percent: percent1(input.percent),
    savedAt: Date.now()
  }
  await saveJson(positionsFile(), positions)
}

function excerptAround(plain: string, at: number, length: number): string {
  const chars = Array.from(plain)
  const start = Array.from(plain.slice(0, at)).length
  const from = Math.max(0, start - 36)
  const to = Math.min(chars.length, start + length + 36)
  const slice = chars.slice(from, to).join('')
  return `${from > 0 ? '…' : ''}${slice}${to < chars.length ? '…' : ''}`
}

/** 全书检索：逐章读取、去标签、大小写不敏感匹配；命中上限见 SEARCH_HIT_LIMIT */
export async function searchBook(bookId: string, term: string): Promise<SearchHit[]> {
  const needle = term.trim()
  if (needle === '') return []

  const volume = await readVolume(bookId)
  const lower = needle.toLowerCase()
  const length = Array.from(needle).length
  const hits: SearchHit[] = []

  for (let i = 0; i < volume.meta.toc.length && hits.length < SEARCH_HIT_LIMIT; i += 1) {
    const entry = volume.meta.toc[i]
    const file = volume.body === 'html' ? htmlFile(bookId, i) : textFile(bookId, i)
    let raw: string
    try {
      raw = await readFile(file, 'utf8')
    } catch {
      continue
    }
    const plain = htmlToText(raw)
    const haystack = plain.toLowerCase()
    let cursor = 0
    while (hits.length < SEARCH_HIT_LIMIT) {
      const at = haystack.indexOf(lower, cursor)
      if (at === -1) break
      hits.push({
        chapter: i,
        title: entry.title,
        excerpt: excerptAround(plain, at, length),
        offset: Array.from(plain.slice(0, at)).length
      })
      cursor = at + lower.length
    }
  }
  return hits
}

