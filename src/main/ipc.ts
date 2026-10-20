import { dialog, ipcMain } from 'electron'
import type {
  ChapterPayload,
  ImportSummary,
  PositionInput,
  ReadingPosition,
  ReaderSettings,
  SearchHit,
  ShelfBook,
  TocEntry
} from '@shared/types'
import { CH } from '@shared/ipc'
import { percent1, unit } from '@shared/progress'
import {
  dropBook,
  importPaths,
  listShelf,
  readChapter,
  readPosition,
  readToc,
  searchBook,
  writePosition
} from './services/library'
import { readSettings, writeSettings } from './services/settings'

function fail(): never {
  throw new Error('E_INVALID_ARG: 请求参数不合法')
}

function asId(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') fail()
  return value
}

function asPathList(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) fail()
  return value as string[]
}

function asIndex(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) fail()
  return value
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail()
  return value as Record<string, unknown>
}

function asPosition(value: unknown): PositionInput {
  const input = asRecord(value)
  if (typeof input.ratio !== 'number' || !Number.isFinite(input.ratio)) fail()
  if (typeof input.percent !== 'number' || !Number.isFinite(input.percent)) fail()
  return {
    bookId: asId(input.bookId),
    chapter: asIndex(input.chapter),
    ratio: unit(input.ratio),
    percent: percent1(input.percent)
  }
}

/** 只做参数校验与转发，业务异常原样抛给渲染层（保留 E_CODE 前缀） */
export function registerIpc(): void {
  ipcMain.handle(CH.shelfList, async (): Promise<ShelfBook[]> => listShelf())

  ipcMain.handle(CH.shelfPick, async (): Promise<ImportSummary> => {
    const picked = await dialog.showOpenDialog({
      title: '导入书籍',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '电子书', extensions: ['txt', 'epub'] }]
    })
    if (picked.canceled || picked.filePaths.length === 0) return { imported: [], rejected: [] }
    return importPaths(picked.filePaths)
  })

  ipcMain.handle(CH.shelfAdd, async (_event, paths: unknown): Promise<ImportSummary> => {
    return importPaths(asPathList(paths))
  })

  ipcMain.handle(CH.shelfDrop, async (_event, bookId: unknown): Promise<void> => {
    await dropBook(asId(bookId))
  })

  ipcMain.handle(CH.bookToc, async (_event, bookId: unknown): Promise<TocEntry[]> => {
    return readToc(asId(bookId))
  })

  ipcMain.handle(
    CH.bookChapter,
    async (_event, bookId: unknown, index: unknown): Promise<ChapterPayload> => {
      return readChapter(asId(bookId), asIndex(index))
    }
  )

  ipcMain.handle(CH.bookFind, async (_event, bookId: unknown, term: unknown): Promise<SearchHit[]> => {
    if (typeof term !== 'string' || Array.from(term).length > 100) fail()
    return searchBook(asId(bookId), term)
  })

  ipcMain.handle(
    CH.positionRead,
    async (_event, bookId: unknown): Promise<ReadingPosition | null> => {
      return readPosition(asId(bookId))
    }
  )

  ipcMain.handle(CH.positionWrite, async (_event, input: unknown): Promise<void> => {
    await writePosition(asPosition(input))
  })

  ipcMain.handle(CH.prefsRead, async (): Promise<ReaderSettings> => readSettings())

  ipcMain.handle(CH.prefsWrite, async (_event, patch: unknown): Promise<ReaderSettings> => {
    asRecord(patch)
    return writeSettings(patch as Partial<ReaderSettings>)
  })
}
