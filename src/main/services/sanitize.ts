/**
 * XHTML 白名单净化（主进程第一道防线，渲染层另有 DOMPurify 兜底）。
 * 纯字符串实现，不依赖 DOM / electron，vitest 可直接引用。
 *
 * 策略：保留排版类标签；危险标签连内容一起丢弃；未知标签只丢壳、留内容；
 * 属性按标签白名单放行；正文空白压缩后重新转义。
 */

/** 保留标签（其余标签：DROP 里的整段丢弃，其它只去壳） */
const KEEP = new Set([
  'p', 'div', 'span', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'em', 'strong', 'b', 'i', 'u', 's', 'sub', 'sup', 'small', 'mark',
  'blockquote', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'pre', 'code', 'kbd',
  'img', 'figure', 'figcaption',
  'section', 'article', 'aside', 'header', 'footer'
])

/** 自闭合标签 */
const VOID = new Set(['br', 'hr', 'img'])

/** 连内容一起丢弃：脚本、样式、嵌入式对象、表单、音视频 */
const DROP = new Set([
  'script', 'style', 'iframe', 'frame', 'object', 'embed', 'applet',
  'svg', 'math', 'noscript', 'template', 'head', 'title',
  'audio', 'video', 'canvas', 'form', 'input', 'button', 'select', 'textarea',
  'link', 'meta', 'base'
])

/** 每个标签允许出现的属性 */
const ATTRS: Readonly<Record<string, ReadonlySet<string>>> = {
  img: new Set(['src', 'alt', 'width', 'height']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan']),
  ol: new Set(['start'])
}

export interface SanitizeOptions {
  /** 书籍资源协议前缀，例如 shijuan-asset://<bookId>/ */
  assetPrefix: string
}

interface Attr {
  name: string
  value: string
}

/** 宽松解析属性串：双引号 / 单引号 / 裸值 / 无值属性 */
function readAttrs(raw: string): Attr[] {
  const attrs: Attr[] = []
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g
  let hit: RegExpExecArray | null = re.exec(raw)
  while (hit) {
    attrs.push({
      name: hit[1].toLowerCase(),
      value: hit[2] ?? hit[3] ?? hit[4] ?? ''
    })
    hit = re.exec(raw)
  }
  return attrs
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** 文本转义：压缩长空白、转义裸 & 与 <，保留合法实体引用 */
function escapeText(value: string): string {
  return value
    .replace(/\s{3,}/g, ' ')
    .replace(/&(?!(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;')
    .replace(/</g, '&lt;')
}

/** 属性放行规则；返回 null 表示该属性不保留 */
function attrValue(tag: string, name: string, value: string, assetPrefix: string): string | null {
  const v = value.trim()

  if (tag === 'img') {
    if (name === 'src') {
      const lower = v.toLowerCase()
      return lower.startsWith(assetPrefix.toLowerCase()) || lower.startsWith('data:image/') ? v : null
    }
    if (name === 'alt') return v
    if (name === 'width' || name === 'height') return v
    return null
  }

  if ((tag === 'td' || tag === 'th') && (name === 'colspan' || name === 'rowspan')) {
    return /^\d{1,3}$/.test(v) ? v : null
  }

  if (tag === 'ol' && name === 'start') {
    return /^-?\d{1,4}$/.test(v) ? v : null
  }

  return null
}

/** 生成开标签；img 缺少可用 src 时整枚丢弃（返回 null） */
function buildOpenTag(tag: string, rawAttrs: string, assetPrefix: string): string | null {
  const allowed = ATTRS[tag]
  if (!allowed) return `<${tag}>`

  const kept: string[] = []
  let hasSrc = false
  for (const attr of readAttrs(rawAttrs)) {
    if (!allowed.has(attr.name)) continue
    const value = attrValue(tag, attr.name, attr.value, assetPrefix)
    if (value === null) continue
    if (attr.name === 'src') hasSrc = true
    kept.push(` ${attr.name}="${escapeAttr(decodeEntities(value))}"`)
  }

  if (tag === 'img' && !hasSrc) return null
  return `<${tag}${kept.join('')}>`
}

/** 找到 `</tag ...>` 结束位置之后的下标；找不到则到文末 */
function afterClosingTag(source: string, tag: string, from: number): number {
  const lower = source.toLowerCase()
  const start = lower.indexOf(`</${tag}`, from)
  if (start === -1) return source.length
  const end = source.indexOf('>', start)
  return end === -1 ? source.length : end + 1
}

function tidy(html: string): string {
  let value = html
  // 反复清掉空段落，直到不再变化（处理嵌套空壳）
  for (let round = 0; round < 3; round += 1) {
    const next = value.replace(/<(p|div|span|section|article|blockquote)>\s*<\/\1>/gi, '')
    if (next === value) break
    value = next
  }
  return value
}

/** 白名单净化 XHTML 片段 */
export function sanitizeXhtml(source: string, options: SanitizeOptions): string {
  const out: string[] = []
  let i = 0

  while (i < source.length) {
    if (source[i] !== '<') {
      let next = source.indexOf('<', i)
      if (next === -1) next = source.length
      out.push(escapeText(source.slice(i, next)))
      i = next
      continue
    }

    // 注释
    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i + 4)
      i = end === -1 ? source.length : end + 3
      continue
    }

    // CDATA / 声明 / 处理指令
    if (source.startsWith('<![CDATA[', i)) {
      const end = source.indexOf(']]>', i + 9)
      const body = source.slice(i + 9, end === -1 ? source.length : end)
      out.push(escapeText(body))
      i = end === -1 ? source.length : end + 3
      continue
    }
    if (source.startsWith('<!', i) || source.startsWith('<?', i)) {
      const end = source.indexOf('>', i)
      i = end === -1 ? source.length : end + 1
      continue
    }

    // 闭标签
    const closing = /^<\/([a-zA-Z][\w:-]*)\s*>/.exec(source.slice(i))
    if (closing) {
      const tag = closing[1].toLowerCase()
      i += closing[0].length
      if (KEEP.has(tag) && !VOID.has(tag)) out.push(`</${tag}>`)
      continue
    }

    // 开标签（属性值里允许出现 >）
    const opening = /^<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/.exec(source.slice(i))
    if (opening) {
      const tag = opening[1].toLowerCase()
      const selfClosing = /\/\s*$/.test(opening[2])
      const rawAttrs = opening[2].replace(/\/\s*$/, '')
      i += opening[0].length

      if (DROP.has(tag)) {
        // 自闭合的丢弃标签没有配对闭标签，跳过标签本身即可
        if (!selfClosing) i = afterClosingTag(source, tag, i)
        continue
      }

      if (KEEP.has(tag)) {
        const html = buildOpenTag(tag, rawAttrs, options.assetPrefix)
        if (html !== null) out.push(html)
      }
      continue
    }

    // 不是合法标签，按文本转义
    out.push('&lt;')
    i += 1
  }

  return tidy(out.join(''))
}

function codepoint(value: number): string {
  if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) return '\uFFFD'
  if (value >= 0xd800 && value <= 0xdfff) return '\uFFFD'
  return String.fromCodePoint(value)
}

/** 解码命名实体与数字实体 */
export function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => codepoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => codepoint(parseInt(dec, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
}

/** 去标签、解实体、压空白，得到可用于检索与计数的纯文本 */
export function htmlToText(html: string): string {
  const spaced = html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(?:p|div|h[1-6]|li|blockquote|tr|pre|figure|figcaption|section|article|header|footer|table|ul|ol|dl|dt|dd|th|td|caption)\s*>/gi, ' ')
    .replace(/<[^>]*>/g, '')

  return decodeEntities(spaced).replace(/\s+/g, ' ').trim()
}
