/** IPC 通道名集中定义，main 与 preload 共用。 */
export const CH = {
  shelfList: 'sj:shelf-list',
  shelfPick: 'sj:shelf-pick',
  shelfAdd: 'sj:shelf-add',
  shelfDrop: 'sj:shelf-drop',
  bookToc: 'sj:book-toc',
  bookChapter: 'sj:book-chapter',
  bookFind: 'sj:book-find',
  positionRead: 'sj:position-read',
  positionWrite: 'sj:position-write',
  prefsRead: 'sj:prefs-read',
  prefsWrite: 'sj:prefs-write'
} as const

/** EPUB 图片等资源使用的私有协议 */
export const ASSET_SCHEME = 'shijuan-asset'

export const ERR = {
  format: 'E_FORMAT',
  encoding: 'E_ENCODING',
  epub: 'E_EPUB',
  drm: 'E_DRM',
  size: 'E_TOO_LARGE',
  io: 'E_IO',
  missing: 'E_NOT_FOUND',
  arg: 'E_INVALID_ARG'
} as const

/** 把 `E_CODE: 用户文案` 还原为可展示文案 */
export function readableError(reason: string): string {
  const at = reason.indexOf(':')
  if (at === -1) return reason
  const code = reason.slice(0, at).trim()
  if (!/^E_[A-Z_]+$/.test(code)) return reason
  return reason.slice(at + 1).trim() || reason
}
