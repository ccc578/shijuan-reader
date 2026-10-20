import { describe, expect, it } from 'vitest'
import iconv from 'iconv-lite'
import {
  countChars,
  decodeTxt,
  readTxt,
  sliceChapters,
  textToHtml
} from '../src/main/services/txtParser'

const novel = `雾山札记
某人

开篇的一段话。

卷一 起雾

第一章 山脚

他沿着石阶往上走。

第二章 山顶

风从背后吹来。

卷二 归途

第三章 下山

天色暗了。
`

describe('decodeTxt', () => {
  it('读取 UTF-8 BOM 并去掉 BOM', () => {
    const body = iconv.encode('\uFEFF第一章 山脚\n正文', 'utf8')
    const { text, encoding } = decodeTxt(body)
    expect(encoding).toBe('utf8')
    expect(text.startsWith('第一章')).toBe(true)
  })

  it('识别 GB18030 编码的中文', () => {
    const body = iconv.encode('第一章 山脚\n中文内容不应乱码', 'gb18030')
    const { text } = decodeTxt(body)
    expect(text).toContain('中文内容不应乱码')
  })

  it('统一 CRLF 与连续空行', () => {
    const body = Buffer.from('第一行\r\n第二行\r\n\r\n\r\n\r\n第三行', 'utf8')
    expect(decodeTxt(body).text).toBe('第一行\n第二行\n\n\n第三行')
  })
})

describe('sliceChapters', () => {
  it('卷为一级、章为二级，首章前正文归入开篇', () => {
    const chapters = sliceChapters(novel)
    expect(chapters[0]).toMatchObject({ title: '开篇', depth: 0 })
    expect(chapters[1]).toMatchObject({ title: '卷一 起雾', depth: 0 })
    expect(chapters[2]).toMatchObject({ title: '第一章 山脚', depth: 1 })
    expect(chapters[3]).toMatchObject({ title: '第二章 山顶', depth: 1 })
    expect(chapters[4]).toMatchObject({ title: '卷二 归途', depth: 0 })
    expect(chapters[5]).toMatchObject({ title: '第三章 下山', depth: 1 })
  })

  it('章正文不包含标题行', () => {
    const chapters = sliceChapters(novel)
    expect(chapters[2].body).toBe('他沿着石阶往上走。')
  })

  it('完全没有标题时退化为单章「全文」', () => {
    const chapters = sliceChapters('只有正文。\n\n第二段。')
    expect(chapters).toHaveLength(1)
    expect(chapters[0]).toMatchObject({ title: '全文', depth: 0 })
  })

  it('不把「前言正文」误判成标题', () => {
    const chapters = sliceChapters('前言正文\n\n这里是普通内容。')
    expect(chapters[0].title).toBe('全文')
  })

  it('识别 Chapter N 与特殊章节名', () => {
    const chapters = sliceChapters('Chapter 1\n正文\n\n番外 一\n附记')
    expect(chapters.map((chapter) => chapter.title)).toEqual(['Chapter 1', '番外 一'])
    expect(chapters[0].depth).toBe(1)
  })
})

describe('textToHtml', () => {
  it('每个非空行一个段落并转义标签', () => {
    const html = textToHtml('第一段\n\n第二段 <b>\n')
    expect(html).toBe('<p>第一段</p><p>第二段 &lt;b&gt;</p>')
  })

  it('空章返回占位段落', () => {
    expect(textToHtml('   \n\n')).toContain('sj-blank')
  })
})

describe('countChars / readTxt', () => {
  it('空章按标题长度计权', () => {
    expect(countChars({ title: '第三章', depth: 1, body: '   ' })).toBe(3)
  })

  it('书名去掉扩展名与括号注释', () => {
    const book = readTxt(Buffer.from('第一章 开始\n正文', 'utf8'), '群山记（校对版）.txt')
    expect(book.title).toBe('群山记')
    expect(book.chars).toBeGreaterThan(0)
    expect(book.chapters).toHaveLength(1)
  })
})
