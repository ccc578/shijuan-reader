/**
 * 搜索命中定位：
 * 主进程给的是「去标签后的码点偏移」，DOM 的文本节点里还有段落边界，
 * 纯偏移容易落在节点末尾导致 Range 跨节点。因此采用「关键词 + 最近偏移」。
 */

const MARK_CLASS = 'sj-hit'

function toUtf16(text: string, codePoints: number): number {
  let units = 0
  let seen = 0
  for (const ch of text) {
    if (seen >= codePoints) break
    units += ch.length
    seen += 1
  }
  return units
}

interface Segment {
  node: Text
  start: number
  size: number
}

function collect(root: HTMLElement): { segments: Segment[]; text: string } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const segments: Segment[] = []
  let text = ''
  let offset = 0

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const textNode = node as Text
    const size = Array.from(textNode.data).length
    segments.push({ node: textNode, start: offset, size })
    text += textNode.data
    offset += size
  }
  return { segments, text }
}

function pointAt(segments: Segment[], index: number): { node: Text; offset: number } | null {
  for (const segment of segments) {
    if (index >= segment.start && index < segment.start + segment.size) {
      return { node: segment.node, offset: toUtf16(segment.node.data, index - segment.start) }
    }
  }
  const last = segments.at(-1)
  if (last && index === last.start + last.size) {
    return { node: last.node, offset: last.node.data.length }
  }
  return null
}

/** 清除所有命中标记，把文本还原 */
export function clearMarks(root: HTMLElement): void {
  for (const mark of Array.from(root.querySelectorAll(`mark.${MARK_CLASS}`))) {
    const parent = mark.parentNode
    if (!parent) continue
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
    parent.normalize()
  }
}

/** 在容器内标记离 approx 最近的一处关键词，并滚动到视野中央 */
export function markNearest(root: HTMLElement, term: string, approx: number): boolean {
  clearMarks(root)
  const needle = term.trim()
  if (needle === '') return false

  const { segments, text } = collect(root)
  if (segments.length === 0) return false

  // text 为 UTF-16，indexOf 返回的下标需换算成码点，才能与主进程偏移对齐
  const haystack = text.toLowerCase()
  const lower = needle.toLowerCase()
  const candidates: number[] = []
  let from = 0
  while (candidates.length < 400) {
    const at = haystack.indexOf(lower, from)
    if (at === -1) break
    candidates.push(Array.from(text.slice(0, at)).length)
    from = at + lower.length
  }
  if (candidates.length === 0) return false

  let best = candidates[0]
  for (const candidate of candidates) {
    if (Math.abs(candidate - approx) < Math.abs(best - approx)) best = candidate
  }

  const head = pointAt(segments, best)
  const tail = pointAt(segments, best + Array.from(needle).length)
  if (!head || !tail) return false

  try {
    const range = document.createRange()
    range.setStart(head.node, head.offset)
    range.setEnd(tail.node, tail.offset)
    const mark = document.createElement('mark')
    mark.className = MARK_CLASS
    range.surroundContents(mark)
    mark.scrollIntoView({ block: 'center', behavior: 'smooth' })
    return true
  } catch {
    head.node.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    return false
  }
}
