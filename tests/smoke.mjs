// 端到端冒烟：测两轮迭代后的完整闭环。
// 迭代 1（v0.1）只覆盖 TXT；迭代 2（v0.2）追加 EPUB、目录层级、图片与封面。
// 运行：npm run build && npm run smoke
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'

const root = resolve(import.meta.dirname, '..')
const shots = join(root, 'docs', 'screenshots')
await mkdir(shots, { recursive: true })

const dataDir = await mkdtemp(join(tmpdir(), 'shijuan-smoke-'))
const failures = []

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

const wait = (ms) => new Promise((done) => setTimeout(done, ms))

const app = await electron.launch({
  args: ['.'],
  cwd: root,
  env: { ...process.env, NODE_ENV: 'production', SHIJUAN_USER_DATA: dataDir }
})

try {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('.shelf-page')

  check('窗口标题为「拾卷」', (await page.title()) === '拾卷', await page.title())
  check('首次启动展示空书架', (await page.locator('.shelf-empty').count()) === 1)
  await page.screenshot({ path: join(shots, 'v01-01-empty-shelf.png') })

  // ---------------- 迭代 1：TXT ----------------
  const txtPaths = ['山窗笔记·TXT.txt', '雾山旧稿（GBK）.txt', '无题札记.txt'].map((name) =>
    join(root, 'samples', name)
  )
  const txt = await page.evaluate((paths) => window.shijuan.shelf.add(paths), txtPaths)
  check('TXT 批量导入成功', txt.imported.length === 3, `imported=${txt.imported.length}`)
  check(
    'GBK 书名正确',
    txt.imported.some((book) => book.title === '雾山旧稿'),
    txt.imported.map((book) => book.title).join(' / ')
  )
  check('GBK 章节切分正确', txt.imported.find((book) => book.title === '雾山旧稿')?.toc.length === 8)

  await page.reload()
  await page.waitForSelector('.book-row')
  check('重启后书架仍有 3 本', (await page.locator('.book-row').count()) === 3)
  await page.screenshot({ path: join(shots, 'v01-02-shelf.png') })

  await page.locator('.book-row', { hasText: '山窗笔记·TXT' }).locator('.row-main').click()
  await page.waitForSelector('.reading-body p')
  check('进入阅读器', (await page.locator('.reader-page').count()) === 1)

  const firstTitle = await page.locator('.bar-chapter').innerText()
  await page.locator('.bar-btn', { hasText: '目录' }).click()
  await page.waitForSelector('.chapter-rail-open')
  await wait(450)
  check('目录列出章节', (await page.locator('.rail-item').count()) > 1)
  await page.screenshot({ path: join(shots, 'v01-04-toc.png') })

  await page.locator('.rail-item').nth(2).click()
  await page.waitForFunction(
    (previous) => (document.querySelector('.bar-chapter')?.textContent ?? '') !== previous,
    firstTitle
  )
  await wait(250)
  const secondTitle = await page.locator('.bar-chapter').innerText()
  check('目录点击可切换章节', secondTitle !== firstTitle, `${firstTitle} → ${secondTitle}`)
  check('切章后回到章首', (await page.locator('.reader-scroll').evaluate((el) => el.scrollTop)) === 0)
  await wait(400)
  await page.screenshot({ path: join(shots, 'v01-03-reader.png') })

  await page.locator('.reader-scroll').evaluate((el) => {
    el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) * 0.5)
  })
  await wait(600)

  await page.locator('.bar-btn', { hasText: '版式' }).click()
  await page.waitForSelector('.look-panel')
  await page.screenshot({ path: join(shots, 'v01-05-look.png') })
  await page.locator('.size-stepper button').last().click()
  await wait(200)
  check(
    '字号调整即时生效',
    (await page.locator('.reading-body').evaluate((el) => getComputedStyle(el).fontSize)) !== '18px'
  )
  await page.keyboard.press('Escape')

  await page.locator('.bar-back').click()
  await page.waitForSelector('.book-row')
  const percentText = await page.locator('.row-progress-text strong').first().innerText()
  check('返回书架后百分比已更新', percentText !== '—', percentText)
  await page.screenshot({ path: join(shots, 'v01-06-back-to-shelf.png') })

  // ---------------- 迭代 2：EPUB ----------------
  const epubPaths = ['sample-epub3.epub', 'sample-epub2.epub'].map((name) =>
    join(root, 'samples', name)
  )
  const epub = await page.evaluate((paths) => window.shijuan.shelf.add(paths), epubPaths)
  check('EPUB 批量导入成功', epub.imported.length === 2, `imported=${epub.imported.length}`)
  if (epub.rejected.length > 0) check('EPUB 未被拒绝', false, epub.rejected[0].reason)

  const epub3 = epub.imported.find((book) => book.format === 'epub' && book.title === '山窗笔记')
  const epub2 = epub.imported.find((book) => book.title === '旧港手记')

  check('EPUB3 读取书名与作者', epub3?.author === '周砚', epub3?.author ?? '缺失')
  check('EPUB3 目录取 nav 标题', epub3?.toc[2]?.title === '第三章 雨后', epub3?.toc.map((t) => t.title).join(' / '))
  check('EPUB3 目录层级来自 nav 嵌套', epub3?.toc.every((entry) => entry.depth === 1) === true)
  check('EPUB3 封面已内联', (epub3?.cover ?? '').startsWith('data:image/'))
  check('EPUB2 读取 NCX 目录', epub2?.toc.length === 4 && epub2?.toc[0]?.title === '一 港口慢三分钟')

  await page.reload()
  await page.waitForSelector('.book-row')
  check('书架共有 5 本', (await page.locator('.book-row').count()) === 5)
  check('EPUB 行显示格式徽标', (await page.locator('.row-chip-epub').count()) === 2)
  check('EPUB 封面渲染为图片', (await page.locator('.book-cover-img').count()) >= 1)
  await page.screenshot({ path: join(shots, 'v02-01-shelf.png') })

  const epubRow = page
    .locator('.book-row', { hasText: '山窗笔记' })
    .filter({ has: page.locator('.row-chip-epub') })
  await epubRow.locator('.row-main').click()
  await page.waitForSelector('.reading-body p')
  check('打开 EPUB 进入阅读器', (await page.locator('.bar-chapter').innerText()) === '第一章 雾里的石阶')

  await page.locator('.bar-btn', { hasText: '目录' }).click()
  await page.waitForSelector('.chapter-rail-open')
  await wait(450)
  check('EPUB 目录条目数正确', (await page.locator('.rail-item').count()) === 5)
  check('目录保留章节缩进层级', (await page.locator('.rail-depth-1').count()) >= 1)
  await page.screenshot({ path: join(shots, 'v02-02-toc.png') })

  await page.locator('.rail-item').nth(2).click()
  await page.waitForFunction(
    () => document.querySelector('.bar-chapter')?.textContent === '第三章 雨后'
  )
  await page.waitForFunction(
    () => (document.querySelector('.reading-body')?.textContent ?? '').includes('雨下了一整夜')
  )
  check('目录切换 EPUB 章节', true)
  check('章首不再重复大标题', (await page.locator('.reading-body h1').count()) === 0)

  const imageOk = await page
    .locator('.reading-body img')
    .first()
    .evaluate((el) => el.complete && el.naturalWidth > 0)
  check('EPUB 正文图片从资源协议加载', imageOk)
  check('图片保留图注', (await page.locator('.reading-body figcaption').count()) === 1)
  await wait(400)
  await page.screenshot({ path: join(shots, 'v02-03-reader-image.png') })

  // 夜间主题 + 字体切换，验证样式系统对 EPUB 同样生效
  await page.locator('.bar-btn', { hasText: '版式' }).click()
  await page.waitForSelector('.look-panel')
  await page.locator('.look-panel .theme-card-night').click()
  await wait(250)
  check(
    '夜间主题即时生效',
    (await page.evaluate(() => document.documentElement.dataset.theme)) === 'night'
  )
  await page.keyboard.press('Escape')
  await wait(200)
  await page.screenshot({ path: join(shots, 'v02-04-night.png') })

  await page.locator('.reader-scroll').evaluate((el) => {
    el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) * 0.6)
  })
  await wait(600)

  const saved = await page.evaluate(async () => {
    const books = await window.shijuan.shelf.list()
    const target = books.find((book) => book.title === '山窗笔记' && book.format === 'epub')
    return target ? window.shijuan.position.read(target.id) : null
  })
  check('EPUB 阅读进度已落盘', saved !== null && saved.chapter === 2 && saved.percent > 0, JSON.stringify(saved))

  await page.locator('.bar-back').click()
  await page.waitForSelector('.book-row')
  await page.screenshot({ path: join(shots, 'v02-05-back-to-shelf.png') })
} finally {
  await app.close()
  await rm(dataDir, { recursive: true, force: true })
}

if (failures.length > 0) {
  console.error(`\n${failures.length} 项失败：${failures.join('、')}`)
  process.exit(1)
}
console.log('\n冒烟全部通过')
