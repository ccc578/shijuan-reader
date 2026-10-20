import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { parseEpub } from '../src/main/services/epub'

const base = 'shijuan-asset://b1/'

function xhtml(title: string, body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>${title}</title></head>
  <body>
${body}
  </body>
</html>`
}

async function pack(files: Record<string, string | Buffer>, store = false): Promise<Buffer> {
  const zip = new JSZip()
  for (const [path, value] of Object.entries(files)) {
    zip.file(path, value, store ? { compression: 'STORE' } : undefined)
  }
  return zip.generateAsync({ type: 'nodebuffer' })
}

const container = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/book.opf" media-type="application/oebps-package+xml" /></rootfiles>
</container>`

const opf3 = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">urn:uuid:demo</dc:identifier>
    <dc:title>夜航手册</dc:title>
    <dc:creator>沈岸</dc:creator>
    <meta name="cover" content="cover-img" />
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
    <item id="cover-img" href="images/cover.png" media-type="image/png" />
    <item id="pic" href="images/fig.png" media-type="image/png" />
    <item id="c1" href="text/one.xhtml" media-type="application/xhtml+xml" />
    <item id="c2" href="text/two.xhtml" media-type="application/xhtml+xml" />
    <item id="skip" href="text/note.xhtml" media-type="application/xhtml+xml" />
  </manifest>
  <spine>
    <itemref idref="c1" />
    <itemref idref="c2" />
    <itemref idref="skip" linear="no" />
  </spine>
</package>`

const nav3 = xhtml(
  '目录',
  `<nav epub:type="toc"><ol>
    <li><a href="text/one.xhtml">卷一 起锚</a>
      <ol><li><a href="text/one.xhtml">第一章 雾港</a></li></ol>
    </li>
    <li><a href="text/two.xhtml">第二章 夜潮</a></li>
  </ol></nav>`
)

describe('parseEpub / EPUB3', () => {
  async function demo(): Promise<Awaited<ReturnType<typeof parseEpub>>> {
    const buffer = await pack({
      mimetype: 'application/epub+zip',
      'META-INF/container.xml': container,
      'OEBPS/book.opf': opf3,
      'OEBPS/nav.xhtml': nav3,
      'OEBPS/images/cover.png': Buffer.from('89504e470d0a1a0a', 'hex'),
      'OEBPS/images/fig.png': Buffer.from('89504e470d0a1a0a', 'hex'),
      'OEBPS/text/one.xhtml': xhtml(
        '第一章 雾港',
        `<h1>第一章 雾港</h1><p>潮水在暗处涨落。</p>
         <figure><img src="../images/fig.png" alt="雾" /><figcaption>港口</figcaption></figure>
         <p><img src="https://example.com/x.png" /></p>
         <script>alert('x')</script>`
      ),
      'OEBPS/text/two.xhtml': xhtml('第二章 夜潮', '<h1>第二章 夜潮</h1><p>灯在远处。</p>'),
      'OEBPS/text/note.xhtml': xhtml('附注', '<p>不应出现。</p>')
    })
    return parseEpub(buffer, 'fallback.epub', { assetBase: base })
  }

  it('读取书名、作者与封面', async () => {
    const book = await demo()
    expect(book.title).toBe('夜航手册')
    expect(book.author).toBe('沈岸')
    expect(book.cover?.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('按 spine 切章，跳过 linear=no，目录取最贴近正文的一级', async () => {
    const book = await demo()
    expect(book.chapters).toHaveLength(2)
    expect(book.chapters[0].title).toBe('第一章 雾港')
    expect(book.chapters[0].depth).toBe(1)
    expect(book.chapters[1].title).toBe('第二章 夜潮')
  })

  it('正文去重章首标题，脚本不进入结果', async () => {
    const book = await demo()
    expect(book.chapters[0].html).not.toContain('<h1>')
    expect(book.chapters[1].html).not.toContain('<h1>')
    expect(book.chapters[0].html).toContain('<p>潮水在暗处涨落。</p>')
    expect(book.chapters[0].html).not.toContain('script')
  })

  it('图片改写为资源协议并收集字节，外链图片被丢弃', async () => {
    const book = await demo()
    expect(book.chapters[0].html).toContain(`src="${base}OEBPS/images/fig.png"`)
    expect(book.chapters[0].html).not.toContain('example.com')
    expect(book.assets.map((asset) => asset.path)).toContain('OEBPS/images/fig.png')
    expect(book.assets).toHaveLength(1)
  })

  it('字符数按净化后的纯文本统计', async () => {
    const book = await demo()
    expect(book.chapters[1].chars).toBe([...'灯在远处。'].length)
  })
})

describe('parseEpub / EPUB2 与兜底', () => {
  it('没有 nav 时读取 NCX，层级按 navPoint 嵌套', async () => {
    const opf2 = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>旧港手记</dc:title>
    <dc:creator>林洄</dc:creator>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />
    <item id="a" href="a.xhtml" media-type="application/xhtml+xml" />
    <item id="b" href="b.xhtml" media-type="application/xhtml+xml" />
  </manifest>
  <spine toc="ncx"><itemref idref="a" /><itemref idref="b" /></spine>
</package>`

    const ncx = `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="n1"><navLabel><text>钟楼</text></navLabel><content src="a.xhtml" />
      <navPoint id="n2"><navLabel><text>慢三分钟</text></navLabel><content src="a.xhtml" /></navPoint>
    </navPoint>
    <navPoint id="n3"><navLabel><text>鱼丸摊</text></navLabel><content src="b.xhtml" /></navPoint>
  </navMap>
</ncx>`

    const buffer = await pack({
      mimetype: 'application/epub+zip',
      'META-INF/container.xml': container,
      'OEBPS/book.opf': opf2,
      'OEBPS/toc.ncx': ncx,
      'OEBPS/a.xhtml': xhtml('钟楼', '<h2>钟楼</h2><p>钟慢三分钟。</p>'),
      'OEBPS/b.xhtml': xhtml('鱼丸摊', '<h2>鱼丸摊</h2><p>五块钱一碗。</p>')
    })

    const book = await parseEpub(buffer, '旧港.epub', { assetBase: base })
    expect(book.title).toBe('旧港手记')
    expect(book.chapters.map((chapter) => chapter.title)).toEqual(['钟楼', '鱼丸摊'])
    expect(book.chapters[0].depth).toBe(0)
  })

  it('完全没有目录时用首个标题，仍没有则第 N 节', async () => {
    const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>无目之书</dc:title></metadata>
  <manifest>
    <item id="a" href="a.xhtml" media-type="application/xhtml+xml" />
    <item id="b" href="b.xhtml" media-type="application/xhtml+xml" />
  </manifest>
  <spine><itemref idref="a" /><itemref idref="b" /></spine>
</package>`

    const buffer = await pack({
      mimetype: 'application/epub+zip',
      'META-INF/container.xml': container,
      'OEBPS/book.opf': opf,
      'OEBPS/a.xhtml': xhtml('甲', '<h2>潮声</h2><p>正文。</p>'),
      'OEBPS/b.xhtml': xhtml('乙', '<p>没有标题的正文。</p>')
    })

    const book = await parseEpub(buffer, '无目之书.epub', { assetBase: base })
    expect(book.chapters.map((chapter) => chapter.title)).toEqual(['潮声', '第 2 节'])
    expect(book.chapters[1].html).toContain('没有标题的正文')
    expect(book.cover).toBeUndefined()
  })
})

describe('parseEpub / 失败路径', () => {
  it('加密清单存在时报 DRM 错误', async () => {
    const buffer = await pack({
      mimetype: 'application/epub+zip',
      'META-INF/container.xml': container,
      'META-INF/encryption.xml': `<encryption><EncryptedData><CipherReference URI="a.xhtml" /></EncryptedData></encryption>`
    })
    await expect(parseEpub(buffer, 'x.epub', { assetBase: base })).rejects.toThrow(/DRM/)
  })

  it('不是 zip 时报损坏', async () => {
    await expect(
      parseEpub(Buffer.from('not a zip'), 'bad.epub', { assetBase: base })
    ).rejects.toThrow(/E_EPUB/)
  })

  it('缺少 container 时报 E_EPUB', async () => {
    const buffer = await pack({ mimetype: 'application/epub+zip' })
    await expect(parseEpub(buffer, 'empty.epub', { assetBase: base })).rejects.toThrow(/container/)
  })

  it('spine 为空时报无可读正文', async () => {
    const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>空</dc:title></metadata>
  <manifest /><spine />
</package>`
    const buffer = await pack({
      mimetype: 'application/epub+zip',
      'META-INF/container.xml': container,
      'OEBPS/book.opf': opf
    })
    await expect(parseEpub(buffer, 'empty.epub', { assetBase: base })).rejects.toThrow(/spine|正文/)
  })
})
