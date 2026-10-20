// 生成 samples/ 下的示例书：UTF-8 / GBK / 无章节 TXT，以及 EPUB3 / EPUB2。
// 运行：npm run samples
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import iconv from 'iconv-lite'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'samples')
await mkdir(outDir, { recursive: true })

const mountain = `山窗笔记
周砚

卷一 山窗

第一章 雾里的石阶

清晨的雾从谷底漫上来，先淹没了石阶的下半截，再一点点爬上窗台。我把窗推开一条缝，凉气便顺着缝钻进来，带着湿土和松针的气味。

祖父留下的这间屋子只有两扇窗。东窗对着山，西窗对着河。他生前常说，读书要有一扇能看见远方的窗，人才不会被字句困住。

石阶共有七十二级。我数过很多次，每次数到一半就会忘记，只好从头再来。后来我明白了，祖父修这段石阶时，大概也没想过要让人数清楚。

第二章 灯下抄书

夜里停电，我点起一盏旧煤油灯。灯芯剪得不齐，火苗一跳一跳，把书页上的字照得忽明忽暗。

抄书是件慢事。一个字一个字地写，写到手腕发酸，才发现自己原来读得那样快，快得几乎没有看清句子的形状。

灯下抄到"夜气"两个字时，窗外正好起风。风穿过竹林，声音像有人在很远的地方翻书。

第三章 雨后

雨下了一整夜。天亮时云散开，山脊像刚洗过一样清楚。

我在檐下晾书，纸页受了潮，边缘微微卷起。阳光落上去，能看见纸里细密的纤维，像雨丝停在半空。

有些书适合一口气读完，有些书只适合在雨后翻两页。祖父的书大多属于后者。

卷二 夜航

第四章 河口的灯

下山的船每天只有一班，黄昏时从河口出发。船夫老陈认得每一块暗礁，也认得每一盏岸上的灯。

他说，灯不是给船看的，是给岸上的人看的。让他们知道，还有人正在回来。

我把抄好的册子放进帆布包，坐在船尾。河水把天光揉碎，一片一片地推到远处。

第五章 归途

回到城里已经是第二天中午。楼下的书店换了招牌，橱窗里摆着塑封的新书，反光很亮。

我把那本手抄的册子放在书架最上层，没有塑封。夜里醒来，偶尔会想起山窗前的雾，想起灯芯跳动的样子。

书读完了，窗还开着。这大概是祖父想告诉我的事。
`

const harborSections = [
  {
    title: '一 港口慢三分钟',
    body: `港口的钟每天慢三分钟。修钟的人说，慢一点好，慢一点，等人的人就不会太着急。

我在旧港住了七年，只见过那口钟准时响过一次。那天有台风，所有船都进了港。`
  },
  {
    title: '二 鱼丸摊',
    body: `卖鱼丸的摊子摆在骑楼下，老板姓许，右手少了半截小指。他说那是年轻时被缆绳绞的。

他的鱼丸汤里放紫菜和芹菜末，五块钱一碗，二十年没有涨过价。有人劝他涨，他说，来吃的人都是老街坊。`
  },
  {
    title: '三 旧港的雨',
    body: `旧港的雨来得快。刚才还有太阳，转眼云就压到屋顶上，雨点砸在铁皮棚上，像一整条街都在敲鼓。

我常在雨里走回家。反正衣服总要湿的，不如走得慢一些。`
  },
  {
    title: '四 钟楼还在',
    body: `后来旧港拆了。钟楼留下，鱼丸摊搬进了新市场，许老板的儿子接手，汤里还是放紫菜和芹菜末。

我偶尔回去，站在钟楼下等那三分钟的误差。等到了，就觉得有些东西还没有走远。`
  }
]

const flat = `这是一份没有章节标题的纯文本，用来验证「整本作为一章」的兜底处理。

有些人读书喜欢从头读到尾，不在意章节。这样的文本也该被好好对待：字号能调，进度能记，下次打开还在原处。

如果你正在读这段话，说明导入与渲染都通过了。
`

const navChapters = [
  { file: 'chap-1.xhtml', title: '第一章 雾里的石阶', level: 1, body: mountain.split('第一章 雾里的石阶')[1].split('第二章')[0].trim() },
  { file: 'chap-2.xhtml', title: '第二章 灯下抄书', level: 1, body: mountain.split('第二章 灯下抄书')[1].split('第三章')[0].trim() },
  { file: 'chap-3.xhtml', title: '第三章 雨后', level: 1, body: mountain.split('第三章 雨后')[1].split('卷二')[0].trim() },
  { file: 'chap-4.xhtml', title: '第四章 河口的灯', level: 1, body: mountain.split('第四章 河口的灯')[1].split('第五章')[0].trim() },
  { file: 'chap-5.xhtml', title: '第五章 归途', level: 1, body: mountain.split('第五章 归途')[1].trim() }
]

function paragraphs(text) {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `    <p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`)
    .join('\n')
}

function xhtml(title, inner) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-CN" lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <link rel="stylesheet" type="text/css" href="style.css" />
  </head>
  <body>
${inner}
  </body>
</html>`
}

const coverSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="860" viewBox="0 0 600 860">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2c6159"/>
      <stop offset="1" stop-color="#132c2d"/>
    </linearGradient>
  </defs>
  <rect width="600" height="860" fill="url(#g)"/>
  <circle cx="470" cy="150" r="180" fill="none" stroke="#9fc9bf" stroke-opacity="0.25" stroke-width="2"/>
  <circle cx="470" cy="150" r="120" fill="none" stroke="#9fc9bf" stroke-opacity="0.18" stroke-width="2"/>
  <text x="70" y="300" fill="#f1f7f4" font-family="serif" font-size="78" letter-spacing="14">山窗</text>
  <text x="74" y="386" fill="#f1f7f4" font-family="serif" font-size="78" letter-spacing="14">笔记</text>
  <line x1="74" y1="440" x2="220" y2="440" stroke="#9fc9bf" stroke-width="2"/>
  <text x="74" y="500" fill="#cfe4de" font-family="serif" font-size="26" letter-spacing="6">周砚 著</text>
  <text x="74" y="800" fill="#8fb6ad" font-family="serif" font-size="20" letter-spacing="8">SHIJUAN EDITION</text>
</svg>`

const artSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="300" viewBox="0 0 520 300">
  <rect width="520" height="300" fill="#e7efec"/>
  <path d="M0 220 L90 150 L170 200 L250 120 L340 190 L430 140 L520 205 L520 300 L0 300 Z" fill="#8fb3aa"/>
  <path d="M0 250 L110 195 L200 240 L300 175 L400 230 L520 185 L520 300 L0 300 Z" fill="#4f7d74"/>
  <circle cx="410" cy="80" r="34" fill="#f3e8d4"/>
</svg>`

const mimetype = 'application/epub+zip'

async function makeEpub3() {
  const zip = new JSZip()
  zip.file('mimetype', mimetype, { compression: 'STORE' })
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`)

  zip.file('OEBPS/style.css', `body { font-family: serif; line-height: 1.8; }
h1 { font-size: 1.4em; }
p { text-indent: 2em; margin: 0 0 0.7em; }
img { max-width: 100%; }`)

  zip.file('OEBPS/nav.xhtml', xhtml('目录', `    <nav epub:type="toc" id="toc">
      <h1>目录</h1>
      <ol>
        <li>
          <a href="chap-1.xhtml">卷一 山窗</a>
          <ol>
            <li><a href="chap-1.xhtml">第一章 雾里的石阶</a></li>
            <li><a href="chap-2.xhtml">第二章 灯下抄书</a></li>
            <li><a href="chap-3.xhtml">第三章 雨后</a></li>
          </ol>
        </li>
        <li>
          <a href="chap-4.xhtml">卷二 夜航</a>
          <ol>
            <li><a href="chap-4.xhtml">第四章 河口的灯</a></li>
            <li><a href="chap-5.xhtml">第五章 归途</a></li>
          </ol>
        </li>
      </ol>
    </nav>`))

  for (const chapter of navChapters) {
    const art = chapter.file === 'chap-3.xhtml'
      ? '\n      <figure><img src="images/art.svg" alt="雨后山景" /><figcaption>雨后，山脊像刚洗过一样清楚。</figcaption></figure>'
      : ''
    zip.file(`OEBPS/${chapter.file}`, xhtml(chapter.title, `    <h1>${chapter.title}</h1>\n${paragraphs(chapter.body)}${art}`))
  }

  zip.file('OEBPS/cover.svg', coverSvg)
  zip.file('OEBPS/images/art.svg', artSvg)

  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:shijuan-sample-epub3</dc:identifier>
    <dc:title>山窗笔记</dc:title>
    <dc:creator>周砚</dc:creator>
    <dc:language>zh-CN</dc:language>
    <meta property="dcterms:modified">2026-10-18T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
    <item id="cover" href="cover.svg" media-type="image/svg+xml" properties="cover-image" />
    <item id="css" href="style.css" media-type="text/css" />
    <item id="art" href="images/art.svg" media-type="image/svg+xml" />
    ${navChapters.map((c, i) => `<item id="c${i + 1}" href="${c.file}" media-type="application/xhtml+xml" />`).join('\n    ')}
  </manifest>
  <spine>
    ${navChapters.map((_, i) => `<itemref idref="c${i + 1}" />`).join('\n    ')}
  </spine>
</package>`)

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  await writeFile(join(outDir, 'sample-epub3.epub'), buffer)
}

async function makeEpub2() {
  const zip = new JSZip()
  zip.file('mimetype', mimetype, { compression: 'STORE' })
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="book/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`)

  const parts = harborSections
  const titles = parts.map((part) => part.title)
  const bodies = parts.map((part) => part.body)

  bodies.forEach((body, index) => {
    zip.file(`book/ch${index + 1}.xhtml`, xhtml(titles[index], `    <h2>${titles[index]}</h2>\n${paragraphs(body)}`))
  })

  zip.file('book/toc.ncx', `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="shijuan-sample-epub2" />
    <meta name="dtb:depth" content="1" />
    <meta name="dtb:totalPageCount" content="0" />
    <meta name="dtb:maxPageNumber" content="0" />
  </head>
  <docTitle><text>旧港手记</text></docTitle>
  <navMap>
    ${titles.map((title, index) => `<navPoint id="n${index + 1}" playOrder="${index + 1}">
      <navLabel><text>${title}</text></navLabel>
      <content src="ch${index + 1}.xhtml" />
    </navPoint>`).join('\n    ')}
  </navMap>
</ncx>`)

  zip.file('book/content.opf', `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:shijuan-sample-epub2</dc:identifier>
    <dc:title>旧港手记</dc:title>
    <dc:creator>林洄</dc:creator>
    <dc:language>zh-CN</dc:language>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />
    ${titles.map((_, index) => `<item id="c${index + 1}" href="ch${index + 1}.xhtml" media-type="application/xhtml+xml" />`).join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${titles.map((_, index) => `<itemref idref="c${index + 1}" />`).join('\n    ')}
  </spine>
</package>`)

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  await writeFile(join(outDir, 'sample-epub2.epub'), buffer)
}

await writeFile(join(outDir, '山窗笔记·TXT.txt'), mountain, 'utf8')
await writeFile(join(outDir, '雾山旧稿（GBK）.txt'), iconv.encode(mountain, 'gb18030'))
await writeFile(join(outDir, '无题札记.txt'), flat, 'utf8')
await makeEpub3()
await makeEpub2()

console.log('samples written to', outDir)
