import { detect } from 'chardet'
import iconv from 'iconv-lite'

/** 切章结果，纯结构，便于 vitest 直接引用 */
export interface RawChapter {
  title: string
  depth: number
  body: string
}

export interface RawBook {
  title: string
  chapters: RawChapter[]
  chars: number
}

/** 卷 / 部 / 篇 一类的一级标题 */
const VOLUME_LINE =
  /^(?:第\s*[0-9零〇一二三四五六七八九十百千万两]+\s*[卷部篇]|卷\s*[0-9零〇一二三四五六七八九十百]+|[上中下]\s*[卷部篇])\s*[·:：、.\-—\s]?[^\n]{0,24}$/

/** 章 / 节 / 回 以及常见特殊章节名 */
const CHAPTER_LINE =
  /^(?:第\s*[0-9零〇一二三四五六七八九十百千万两]+\s*[章节回话]\s*[^\n]{0,24}|(?:序章|序言|楔子|引子|前言|后记|尾声|终章|番外|附录)(?:[\s:：、·\-—][^\n]{0,24})?)$/

const LATIN_LINE = /^(?:chapter|part|prologue|epilogue)\b[^\n]{0,40}$/i

/** 标题行最长字符数 */
const TITLE_MAX = 48

function squash(raw: string): string {
  const plain = raw.replace(/\s+/g, ' ').trim()
  const trimmed = plain.replace(/[\s,，。.!！?？;；:：、·]+$/u, '').trim()
  return Array.from(trimmed).length > 60 ? Array.from(trimmed).slice(0, 60).join('') : trimmed
}

function classify(line: string): { title: string; depth: number } | null {
  const text = line.trim()
  if (text === '' || Array.from(text).length > TITLE_MAX) return null

  if (VOLUME_LINE.test(text)) return { title: squash(text), depth: 0 }
  if (CHAPTER_LINE.test(text)) return { title: squash(text), depth: 1 }
  if (LATIN_LINE.test(text)) {
    return { title: squash(text), depth: /^part\b/i.test(text) ? 0 : 1 }
  }
  return null
}

function unifyBreaks(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/\n{4,}/g, '\n\n\n')
}

function scoreText(text: string): number {
  const bad = (text.match(/\uFFFD/g) ?? []).length
  const mojibake = (text.match(/锟斤拷|烫烫烫|屯屯屯|锘匡拷/g) ?? []).length
  const controls = (text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) ?? []).length
  return bad * 8 + mojibake * 20 + controls * 4
}

function canonical(name: string): string {
  const key = name.toLowerCase().replace(/[-_\s]/g, '')
  if (key === 'utf8' || key === 'utf' || key === 'ascii' || key === 'usascii') return 'utf8'
  if (['gb2312', 'gbk', 'gb18030', 'cp936', 'xgbk'].includes(key)) return 'gb18030'
  if (key === 'utf16le' || key === 'utf16') return 'utf16le'
  return name
}

/**
 * 解码 TXT：BOM 优先，其次 chardet，再对候选编码做「坏字符打分」择优，
 * 全部失败时退回 UTF-8。中文场景最终兜底 GB18030。
 */
export function decodeTxt(buf: Buffer): { text: string; encoding: string } {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: unifyBreaks(buf.subarray(3).toString('utf8')), encoding: 'utf8' }
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { text: unifyBreaks(buf.subarray(2).toString('utf16le')), encoding: 'utf16le' }
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2))
    swapped.swap16()
    return { text: unifyBreaks(swapped.toString('utf16le')), encoding: 'utf16be' }
  }

  const guessed = canonical(detect(buf) ?? 'utf8')
  const candidates = Array.from(new Set([guessed, 'utf8', 'gb18030']))

  let best: { text: string; encoding: string; score: number } | null = null
  for (const encoding of candidates) {
    if (!iconv.encodingExists(encoding)) continue
    let text: string
    try {
      text = unifyBreaks(iconv.decode(buf, encoding))
    } catch {
      continue
    }
    const score = scoreText(text)
    if (!best || score < best.score) best = { text, encoding, score }
    if (score === 0) break
  }

  if (best) return { text: best.text, encoding: best.encoding }
  return { text: unifyBreaks(buf.toString('utf8')), encoding: 'utf8' }
}

/**
 * 按行扫描切章：卷/部/篇为 depth 0，章/节/回为 depth 1。
 * 首个标题前的正文归入「开篇」；一个标题都找不到则整本作为「全文」。
 */
export function sliceChapters(text: string): RawChapter[] {
  const lines = unifyBreaks(text).split('\n')
  const marks: { at: number; title: string; depth: number }[] = []

  lines.forEach((line, at) => {
    const hit = classify(line)
    if (hit) marks.push({ at, ...hit })
  })

  if (marks.length === 0) {
    return [{ title: '全文', depth: 0, body: lines.join('\n') }]
  }

  const chapters: RawChapter[] = []
  const head = lines.slice(0, marks[0].at)
  if (head.some((line) => line.trim() !== '')) {
    chapters.push({ title: '开篇', depth: 0, body: head.join('\n').replace(/^\n+|\n+$/g, '') })
  }

  for (let i = 0; i < marks.length; i += 1) {
    const from = marks[i].at + 1
    const to = i + 1 < marks.length ? marks[i + 1].at : lines.length
    chapters.push({
      title: marks[i].title,
      depth: marks[i].depth,
      body: lines.slice(from, to).join('\n').replace(/^\n+|\n+$/g, '')
    })
  }

  return chapters
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 纯文本转阅读用 HTML：每个非空行一个段落 */
export function textToHtml(body: string): string {
  const paragraphs = body
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')

  if (paragraphs.length === 0) return '<p class="sj-blank">（本章暂无正文）</p>'
  return paragraphs.map((line) => `<p>${escapeHtml(line)}</p>`).join('')
}

/** 空章用标题长度占权重，避免全书百分比除零 */
export function countChars(chapter: RawChapter): number {
  const body = chapter.body.trim()
  return body === '' ? Array.from(chapter.title).length : Array.from(body).length
}

function titleFromFile(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').trim()
  let name = base
  let previous = ''
  while (name !== previous) {
    previous = name
    name = name
      .replace(/[（(][^（()）]*[)）]$/, '')
      .replace(/\[[^\]]*\]$/, '')
      .replace(/【[^】]*】$/, '')
      .trim()
  }
  return name === '' ? base : name
}

export function readTxt(buf: Buffer, fileName: string): RawBook {
  const { text } = decodeTxt(buf)
  const chapters = sliceChapters(text)
  return {
    title: titleFromFile(fileName),
    chapters,
    chars: chapters.reduce((sum, chapter) => sum + countChars(chapter), 0)
  }
}
