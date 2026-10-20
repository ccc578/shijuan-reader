import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'
import { decodeEntities, htmlToText, sanitizeXhtml } from './sanitize'

/**
 * EPUB 2 / EPUB 3 解析：container → OPF → spine → nav|NCX，逐文档切章。
 * 仅依赖 node 侧的 jszip 与 fast-xml-parser，不 import electron，便于单测。
 *
 * 与渲染层的约定：
 *  - 章节 HTML 已白名单净化，图片 src 已改写为 `<assetPrefix><zip 路径>`；
 *  - 资源字节回传给调用方落盘，主进程通过自定义协议提供访问。
 */

export interface EpubChapter {
  title: string
  /** 0 = 卷/部/篇，1 = 章/节 */
  depth: number
  html: string
  chars: number
}

export interface EpubAsset {
  /** 压缩包内路径，例如 OEBPS/images/fig1.png */
  path: string
  bytes: Buffer
}

export interface EpubBook {
  title: string
  author?: string
  /** 封面 data URL（超过 1MB 时省略） */
  cover?: string
  chapters: EpubChapter[]
  assets: EpubAsset[]
}

export interface ParseEpubOptions {
  /** 用于重写图片地址，通常为 shijuan-asset://<bookId>/ */
  assetBase: string
}

interface ManifestItem {
  id: string
  href: string
  mediaType: string
  properties: string[]
}

interface TocRef {
  href: string
  title: string
  depth: number
}

type Element = Record<string, unknown>

const COVER_LIMIT = 1024 * 1024
const IMG_TAG = /<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
  processEntities: false,
  ignoreDeclaration: true,
  allowBooleanAttributes: true
})

// ---------- XML 取值小工具 ----------

function element(value: unknown): Element | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Element
}

function elements(value: unknown): Element[] {
  if (value === undefined || value === null) return []
  const list = Array.isArray(value) ? value : [value]
  const out: Element[] = []
  for (const item of list) {
    const node = element(item)
    if (node) out.push(node)
  }
  return out
}

function attr(node: Element | null, name: string): string {
  if (!node) return ''
  const raw = node[`@_${name}`]
  if (typeof raw === 'string') return raw
  if (typeof raw === 'number') return String(raw)
  return ''
}

/** 元素文本（含 #text 子节点与相邻文本片段；标签包裹时递归拼接） */
function nodeText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(nodeText).join('')
  const node = element(value)
  if (!node) return ''
  if ('#text' in node) return nodeText(node['#text'])
  let out = ''
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('@_') || key === '#comment') continue
    out += nodeText(child)
  }
  return out
}

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function readXml(xml: string): Element | null {
  try {
    const cleaned = xml
      .replace(/<\?xml[^>]*\?>/g, '')
      .replace(/<!DOCTYPE[^>]*>/gi, '')
    return element(parser.parse(cleaned))
  } catch {
    return null
  }
}

/** 广度优先找第一个同名节点，容忍不同层级的命名空间包装 */
function findDeep(root: unknown, name: string): Element | null {
  const queue: unknown[] = [root]
  while (queue.length > 0) {
    const current = queue.shift()
    const node = element(current)
    if (!node) continue
    if (node[name] !== undefined) {
      const hit = elements(node[name])[0]
      if (hit) return hit
    }
    for (const value of Object.values(node)) queue.push(value)
  }
  return null
}

/** 收集所有同名节点（用于挑出 epub:type="toc" 的 nav） */
function findAll(root: unknown, name: string, limit = 24): Element[] {
  const found: Element[] = []
  const queue: unknown[] = [root]
  while (queue.length > 0 && found.length < limit) {
    const node = element(queue.shift())
    if (!node) continue
    for (const hit of elements(node[name])) found.push(hit)
    for (const value of Object.values(node)) queue.push(value)
  }
  return found
}

// ---------- 路径处理 ----------

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function stripHash(value: string): string {
  const hash = value.indexOf('#')
  const noHash = hash === -1 ? value : value.slice(0, hash)
  const query = noHash.indexOf('?')
  return query === -1 ? noHash : noHash.slice(0, query)
}

/** 相对 baseDir 解析 href，处理 ./ ../ 与 URL 解码，返回 zip 内的规范路径 */
function joinPath(baseDir: string, href: string): string {
  const stack = baseDir === '' ? [] : baseDir.split('/').filter(Boolean)
  const clean = safeDecode(decodeEntities(stripHash(href))).replace(/^\/+/, '')
  for (const segment of clean.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      stack.pop()
      continue
    }
    stack.push(segment)
  }
  return stack.join('/')
}

function dirOf(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut === -1 ? '' : path.slice(0, cut)
}

function encodePath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function locate(zip: JSZip, wanted: string): { key: string; file: JSZip.JSZipObject } | null {
  const direct = zip.file(wanted)
  if (direct) return { key: wanted, file: direct }
  const lower = wanted.toLowerCase()
  for (const [key, value] of Object.entries(zip.files)) {
    if (value.dir) continue
    if (key.toLowerCase() === lower) return { key, file: value }
  }
  return null
}

async function readEntry(zip: JSZip, path: string): Promise<string | null> {
  const found = locate(zip, path)
  if (!found) return null
  try {
    return await found.file.async('string')
  } catch {
    return null
  }
}

// ---------- OPF 元数据 ----------

function manifestOf(pkg: Element | null): Map<string, ManifestItem> {
  const map = new Map<string, ManifestItem>()
  const manifest = element(pkg?.['manifest'])
  for (const node of elements(manifest?.['item'])) {
    const id = attr(node, 'id')
    const href = attr(node, 'href')
    if (id === '' || href === '') continue
    map.set(id, {
      id,
      href,
      mediaType: attr(node, 'media-type'),
      properties: attr(node, 'properties').split(/\s+/).filter(Boolean)
    })
  }
  return map
}

function metaText(metadata: Element | null, name: string): string {
  return collapse(decodeEntities(nodeText(metadata?.[name])))
}

function coverIdOf(metadata: Element | null): string {
  for (const meta of elements(metadata?.['meta'])) {
    if (attr(meta, 'name').toLowerCase() === 'cover') return attr(meta, 'content')
  }
  return ''
}

// ---------- 目录 ----------

function walkNavList(list: Element, depth: number, out: TocRef[]): void {
  for (const item of elements(list['li'])) {
    const label = element(item['a']) ?? element(item['span'])
    const href = attr(label, 'href')
    const title = collapse(decodeEntities(nodeText(label)))
    if (href !== '' && title !== '') out.push({ href, title, depth })

    const nested = element(item['ol'])
    if (nested) walkNavList(nested, depth + 1, out)
  }
}

function navRefs(doc: Element, baseDir: string): TocRef[] {
  const navs = findAll(doc, 'nav')
  const target = navs.find((nav) => attr(nav, 'type').toLowerCase() === 'toc') ?? navs[0]
  if (!target) return []

  const root = element(target['ol'])
  if (!root) return []

  const raw: TocRef[] = []
  walkNavList(root, 0, raw)
  return raw.map((ref) => ({ ...ref, href: joinPath(baseDir, ref.href) }))
}

function walkNavPoints(parent: Element | null, depth: number, out: TocRef[]): void {
  for (const point of elements(parent?.['navPoint'])) {
    const label = element(point['navLabel'])
    const title = collapse(decodeEntities(nodeText(label?.['text'])))
    const src = attr(element(point['content']), 'src')
    if (src !== '' && title !== '') out.push({ href: src, title, depth })
    walkNavPoints(point, depth + 1, out)
  }
}

function ncxRefs(doc: Element, baseDir: string): TocRef[] {
  const map = findDeep(doc, 'navMap')
  if (!map) return []
  const raw: TocRef[] = []
  walkNavPoints(map, 0, raw)
  return raw.map((ref) => ({ ...ref, href: joinPath(baseDir, ref.href) }))
}

// ---------- 正文 ----------

function bodyOf(xhtml: string): string {
  const matched = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(xhtml)
  return matched ? matched[1] : xhtml
}

function attrInTag(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
  const hit = re.exec(tag)
  if (!hit) return null
  return hit[1] ?? hit[2] ?? hit[3] ?? null
}

function headingTitle(body: string): string {
  const hit = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/i.exec(body)
  if (!hit) return ''
  return collapse(decodeEntities(hit[2].replace(/<[^>]*>/g, '')))
}

/** 章首标题与目录标题重复时去掉正文里的那枚，避免阅读页出现两遍 */
function withoutLeadingHeading(body: string, title: string): string {
  const hit = /^\s*<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>/i.exec(body)
  if (!hit) return body
  const label = collapse(decodeEntities(hit[2].replace(/<[^>]*>/g, '')))
  return label === title ? body.slice(hit[0].length) : body
}

function rewriteSrc(tag: string, url: string): string {
  return tag.replace(/\bsrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, `src="${url}"`)
}

/**
 * 扫描图片：能定位到包内条目就记入资源并改写为自定义协议 URL；
 * 外链 / 缺失图片保持原样，交给净化器整枚丢弃。
 */
async function rewriteImages(
  body: string,
  docDir: string,
  zip: JSZip,
  assetBase: string,
  assets: Map<string, Buffer>
): Promise<string> {
  const sources = new Set<string>()
  IMG_TAG.lastIndex = 0
  let hit: RegExpExecArray | null = IMG_TAG.exec(body)
  while (hit) {
    const src = attrInTag(hit[0], 'src')
    if (src !== null) sources.add(src.trim())
    hit = IMG_TAG.exec(body)
  }

  const resolved = new Map<string, string>()
  for (const src of sources) {
    const lower = src.toLowerCase()
    if (src === '' || lower.startsWith('data:') || lower.startsWith('//')) continue
    if (/^(?:https?|javascript|vbscript|file):/i.test(src)) continue
    const path = joinPath(docDir, src)
    if (path === '') continue
    const found = locate(zip, path)
    if (!found) continue
    if (!assets.has(path)) {
      try {
        assets.set(path, await found.file.async('nodebuffer'))
      } catch {
        continue
      }
    }
    resolved.set(src, `${assetBase}${encodePath(path)}`)
  }

  IMG_TAG.lastIndex = 0
  return body.replace(IMG_TAG, (tag) => {
    const src = attrInTag(tag, 'src')
    const url = src === null ? undefined : resolved.get(src.trim())
    return url ? rewriteSrc(tag, url) : tag
  })
}

// ---------- 封面 ----------

function mimeOf(href: string, declared: string): string {
  if (declared !== '') return declared
  const ext = href.split('.').pop()?.toLowerCase() ?? ''
  const table: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml'
  }
  return table[ext] ?? 'application/octet-stream'
}

async function readCover(
  zip: JSZip,
  opfDir: string,
  manifest: Map<string, ManifestItem>,
  metadata: Element | null
): Promise<string | undefined> {
  const wanted = coverIdOf(metadata)
  let cover = wanted !== '' ? manifest.get(wanted) : undefined

  if (!cover) {
    for (const item of manifest.values()) {
      if (item.properties.includes('cover-image')) {
        cover = item
        break
      }
    }
  }
  if (!cover) {
    for (const item of manifest.values()) {
      const isImage = item.mediaType.startsWith('image/')
      const looksLikeCover = /cover/i.test(item.id) || /cover/i.test(item.href)
      if (isImage && looksLikeCover) {
        cover = item
        break
      }
    }
  }
  if (!cover) return undefined

  const found = locate(zip, joinPath(opfDir, cover.href))
  if (!found) return undefined

  try {
    const bytes = await found.file.async('nodebuffer')
    if (bytes.length === 0 || bytes.length > COVER_LIMIT) return undefined
    return `data:${mimeOf(cover.href, cover.mediaType)};base64,${bytes.toString('base64')}`
  } catch {
    return undefined
  }
}

// ---------- 主入口 ----------

function titleFromFile(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').trim()
  return base === '' ? fileName : base
}

function guessMediaTypeByHref(href: string): string {
  const ext = href.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'ncx') return 'application/x-dtbncx+xml'
  if (ext === 'xhtml' || ext === 'html' || ext === 'htm') return 'application/xhtml+xml'
  if (ext === 'opf') return 'application/oebps-package+xml'
  return ''
}

async function locateToc(
  zip: JSZip,
  opfDir: string,
  manifest: Map<string, ManifestItem>,
  tocId: string
): Promise<TocRef[]> {
  // EPUB3：manifest 中带 nav 属性
  for (const item of manifest.values()) {
    if (!item.properties.includes('nav')) continue
    const path = joinPath(opfDir, item.href)
    const xml = await readEntry(zip, path)
    if (!xml) continue
    const doc = readXml(xml)
    if (!doc) continue
    const refs = navRefs(doc, dirOf(path))
    if (refs.length > 0) return refs
  }

  // EPUB2：spine@toc 指向 NCX，或按 media-type 回退
  let ncx = tocId !== '' ? manifest.get(tocId) : undefined
  if (!ncx) {
    for (const item of manifest.values()) {
      if (item.mediaType === 'application/x-dtbncx+xml' || /\.ncx$/i.test(item.href)) {
        ncx = item
        break
      }
    }
  }
  if (!ncx) return []

  const path = joinPath(opfDir, ncx.href)
  const xml = await readEntry(zip, path)
  if (!xml) return []
  const doc = readXml(xml)
  return doc ? ncxRefs(doc, dirOf(path)) : []
}

/** 解析 EPUB：返回书名人名封面、逐章净化后的 HTML 与图片字节 */
export async function parseEpub(
  buffer: Buffer,
  fileName: string,
  options: ParseEpubOptions,
  zipLoader: (data: Buffer) => Promise<JSZip> = (data) => JSZip.loadAsync(data)
): Promise<EpubBook> {
  let zip: JSZip
  try {
    zip = await zipLoader(buffer)
  } catch {
    throw new Error('E_EPUB: EPUB 压缩包无法打开，文件可能已损坏')
  }

  const encryption = locate(zip, 'META-INF/encryption.xml')
  if (encryption) {
    const xml = await readEntry(zip, encryption.key)
    if (xml && /EncryptedData|CipherReference/i.test(xml)) {
      throw new Error('E_DRM: 这本 EPUB 带 DRM 保护，暂不支持打开')
    }
  }

  const containerPath = locate(zip, 'META-INF/container.xml')
  if (!containerPath) throw new Error('E_EPUB: 缺少 META-INF/container.xml')
  const containerXml = await readEntry(zip, containerPath.key)
  if (!containerXml) throw new Error('E_EPUB: container.xml 无法读取')

  const rootfile = findDeep(readXml(containerXml), 'rootfile')
  const opfPath = joinPath('', attr(rootfile, 'full-path'))
  if (opfPath === '') throw new Error('E_EPUB: container.xml 没有指定 OPF 文件')

  const opfXml = await readEntry(zip, opfPath)
  if (!opfXml) throw new Error('E_EPUB: 找不到 OPF 文件')
  const pkg = findDeep(readXml(opfXml), 'package')
  if (!pkg) throw new Error('E_EPUB: OPF 无法解析')

  const opfDir = dirOf(opfPath)
  const metadata = element(pkg['metadata'])
  const manifest = manifestOf(pkg)
  const spine = element(pkg['spine'])
  if (!spine) throw new Error('E_EPUB: OPF 缺少 spine')

  const spinePaths: string[] = []
  for (const ref of elements(spine['itemref'])) {
    if (attr(ref, 'linear').toLowerCase() === 'no') continue
    const item = manifest.get(attr(ref, 'idref'))
    if (!item) continue
    // spine 里偶尔混入图片等非文档条目，跳过
    if (item.mediaType !== '' && !/xhtml|html|xml/i.test(item.mediaType)) continue
    spinePaths.push(joinPath(opfDir, item.href))
  }
  if (spinePaths.length === 0) throw new Error('E_EPUB: 这本书没有可读的正文')

  const tocRefs = await locateToc(zip, opfDir, manifest, attr(spine, 'toc'))
  const refsByChapter = new Map<number, TocRef[]>()
  for (const ref of tocRefs) {
    const at = spinePaths.indexOf(ref.href)
    if (at < 0) continue
    const bucket = refsByChapter.get(at) ?? []
    bucket.push(ref)
    refsByChapter.set(at, bucket)
  }

  const assets = new Map<string, Buffer>()
  const chapters: EpubChapter[] = []

  for (let i = 0; i < spinePaths.length; i += 1) {
    const path = spinePaths[i]
    const raw = await readEntry(zip, path)
    const body = raw ? bodyOf(raw) : ''
    const candidates = refsByChapter.get(i) ?? []
    const heading = headingTitle(body)
    // 多个目录项指向同一文档（常见：卷标题 + 首章）：优先与正文标题一致的那条，
    // 否则取最深的一级，避免整章被卷名顶替。
    const mapped =
      candidates.find((ref) => heading !== '' && ref.title === heading) ??
      candidates[candidates.length - 1]
    const title = mapped?.title ?? (heading !== '' ? heading : `第 ${i + 1} 节`)
    const depth = mapped?.depth ?? 0

    let html = ''
    if (body.trim() !== '') {
      const withImages = await rewriteImages(body, dirOf(path), zip, options.assetBase, assets)
      const trimmed = withoutLeadingHeading(withImages, title)
      html = sanitizeXhtml(trimmed, { assetPrefix: options.assetBase })
    }

    const words = [...htmlToText(html)].length
    chapters.push({
      title,
      depth,
      html: words === 0 ? '<p class="sj-blank">（本节暂无正文）</p>' : html,
      chars: words === 0 ? [...title].length : words
    })
  }

  const metaTitle = metaText(metadata, 'title')
  const author = metaText(metadata, 'creator')

  return {
    title: metaTitle !== '' ? metaTitle : titleFromFile(fileName),
    author: author !== '' ? author : undefined,
    cover: await readCover(zip, opfDir, manifest, metadata),
    chapters,
    assets: [...assets.entries()].map(([path, bytes]) => ({ path, bytes }))
  }
}
