import { describe, expect, it } from 'vitest'
import { decodeEntities, htmlToText, sanitizeXhtml } from '../src/main/services/sanitize'

const asset = 'shijuan-asset://book-1/'

function clean(html: string): string {
  return sanitizeXhtml(html, { assetPrefix: asset })
}

describe('sanitizeXhtml 标签白名单', () => {
  it('保留段落、标题、列表与表格结构', () => {
    const html = clean(
      '<section><h2>小标题</h2><p>正文<strong>加粗</strong></p><ul><li>一</li></ul><table><tr><td colspan="2">格</td></tr></table></section>'
    )
    expect(html).toContain('<h2>小标题</h2>')
    expect(html).toContain('<strong>加粗</strong>')
    expect(html).toContain('<li>一</li>')
    expect(html).toContain('<td colspan="2">格</td>')
  })

  it('脚本、样式、内嵌对象连内容一起丢弃', () => {
    const html = clean(
      '<p>前</p><script>alert(1)</script><style>p{color:red}</style><iframe src="x"></iframe><svg><circle /></svg><p>后</p>'
    )
    expect(html).not.toContain('script')
    expect(html).not.toContain('alert')
    expect(html).not.toContain('color:red')
    expect(html).not.toContain('iframe')
    expect(html).not.toContain('circle')
    expect(html).toContain('<p>前</p>')
    expect(html).toContain('<p>后</p>')
  })

  it('未知标签只去壳、保留内部文字', () => {
    expect(clean('<p>请<ruby>注</ruby>意</p>')).toBe('<p>请注意</p>')
  })

  it('去掉事件属性与样式属性', () => {
    const html = clean('<p class="x" style="color:red" onclick="steal()">字</p>')
    expect(html).toBe('<p>字</p>')
  })

  it('空壳段落被清理', () => {
    expect(clean('<p> </p><div></div><p>有字</p>')).toBe('<p>有字</p>')
  })
})

describe('sanitizeXhtml 图片规则', () => {
  it('保留书籍资源协议与内联图片', () => {
    const html = clean(
      `<p><img src="${asset}OEBPS/a.png" alt="a &amp; b" width="80" /><img src="data:image/png;base64,AA" /></p>`
    )
    expect(html).toContain(`src="${asset}OEBPS/a.png"`)
    expect(html).toContain('alt="a &amp; b"')
    expect(html).toContain('width="80"')
    expect(html).toContain('data:image/png;base64,AA')
  })

  it('外链、相对路径与 javascript 图片整枚丢弃', () => {
    const html = clean(
      '<p><img src="https://x.test/a.png" /><img src="../a.png" /><img src="javascript:alert(1)" /></p>'
    )
    expect(html).toBe('')
  })

  it('按协议前缀区分大小写无关的书籍资源', () => {
    const html = clean(`<img src="${asset.toUpperCase()}OEBPS/a.png" />`)
    expect(html).toContain('<img')
  })
})

describe('decodeEntities / htmlToText', () => {
  it('解码命名实体与十进制、十六进制实体', () => {
    expect(decodeEntities('a&amp;b&#20013;&#x6587;&nbsp;c')).toBe('a&b中文 c')
  })

  it('非法码点退化为替换字符', () => {
    expect(decodeEntities('&#xD800;')).toBe('\uFFFD')
  })

  it('块级标签转换为空格，行内标签直接拼接', () => {
    expect(htmlToText('<p>第一段</p><p>第二<em>段</em></p>')).toBe('第一段 第二段')
  })

  it('压缩连续空白', () => {
    expect(htmlToText('<p> 多   个\n 空白 </p>')).toBe('多 个 空白')
  })
})
