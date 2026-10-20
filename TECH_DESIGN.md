# 拾卷（ShiJuan）技术设计文档

## 1. 目标与约束

本文描述 v0.2 的实现方式，覆盖 TXT / EPUB 导入、目录、阅读进度、版式与全书检索。

硬约束：

1. **离线**：运行期零网络请求，不加载任何远程字体、图片、脚本。
2. **本地数据**：书籍、封面、进度、设置全部落在 `app.getPath('userData')` 下。
3. **进程隔离**：渲染层 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`，只能通过 preload 暴露的白名单 API 访问系统能力。
4. **可单测**：解析、净化、进度算法为纯 Node / 纯函数模块，不 import electron。
5. **不重写**：v0.2 在 v0.1 的契约上增量扩展，共享类型与 IPC 通道保持稳定。

## 2. 技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 壳 | Electron 44 | 单窗口，Windows 优先 |
| 构建 | electron-vite 6 + Vite 8 | main / preload / renderer 三段构建 |
| UI | React 19 + TypeScript 7 | 严格模式，无 UI 组件库 |
| 状态 | zustand 5 | 四个小 store，避免全局大对象 |
| 样式 | 原生 CSS + CSS 变量 | 主题只切 `data-theme` |
| TXT 编码 | chardet + iconv-lite | 探测失败时按候选编码打分 |
| EPUB | jszip + fast-xml-parser | 解包与 OPF / nav / NCX 解析 |
| 渲染兜底 | DOMPurify 3 | 第二层 HTML 净化 |
| 测试 | vitest 5 + Playwright | 单测 + 真实 Electron 冒烟 |

## 3. 进程与目录结构

```
src/
├─ shared/                    # 跨进程共享：纯类型、纯函数、常量
│  ├─ types.ts                # BookMeta / TocEntry / ShiJuanApi ...
│  ├─ ipc.ts                  # 通道名、资源协议名、错误码
│  ├─ constants.ts            # 上限、默认设置、主题与字族标签
│  └─ progress.ts             # 百分比、滚动比例、存档夹紧
├─ main/
│  ├─ index.ts                # 窗口、CSP、shijuan-asset 协议
│  ├─ ipc.ts                  # 参数校验 + 服务转发
│  └─ services/
│     ├─ paths.ts             # userData 下的目录约定
│     ├─ jsonStore.ts         # 串行 + 原子 JSON 读写
│     ├─ settings.ts          # 版式清洗与落盘
│     ├─ txtParser.ts         # 解码 + 切章 + 文本转 HTML
│     ├─ sanitize.ts          # XHTML 白名单净化 + 正文提纯
│     ├─ epub.ts              # EPUB 解析（无 electron 依赖）
│     └─ library.ts           # 导入事务、章节读取、检索、进度
├─ preload/
│  ├─ index.ts                # contextBridge 暴露 window.shijuan
│  └─ index.d.ts
└─ renderer/src/
   ├─ App.tsx                 # 书架 / 阅读器切换
   ├─ views/                  # ShelfView、ReaderView
   ├─ components/             # 书脊行、续读卡、目录栏、检索、版式…
   ├─ store/                  # ui / shelf / reader / prefs
   ├─ lib/                    # IPC 封装、滚动、高亮
   └─ styles/                 # tokens / shelf / reader
```

## 4. 数据与存储

### 4.1 磁盘布局

```
<userData>/
├─ store/
│  ├─ shelf.json              # BookMeta[]（书架索引）
│  ├─ positions.json          # { [bookId]: ReadingPosition }
│  └─ prefs.json              # ReaderSettings
└─ volumes/<bookId>/
   ├─ meta.json               # { meta, body: 'txt' | 'html' }
   ├─ source.txt|source.epub  # 原始文件副本
   ├─ text/0000.txt|0000.html # 逐章正文
   └─ assets/…                # EPUB 图片，保留包内相对路径
```

设计理由：

- 书籍按目录隔离，删除只需 `rm -rf volumes/<id>`，不会影响其它书。
- 逐章落文件，切章只读一个文件，避免每次解析整本 EPUB。
- EPUB 图片不内联 base64，避免 `meta.json` / IPC 载荷膨胀。

### 4.2 核心类型

```ts
BookMeta {
  id, title, author?, format: 'txt' | 'epub',
  sourceName, bytes, importedAt,
  cover?,            // EPUB 封面 data URL
  toc: TocEntry[], chars
}

TocEntry { index, title, depth: 0 | 1, chars }
ChapterPayload { index, title, html, chars }
ReadingPosition { bookId, chapter, ratio, percent, savedAt }
ReaderSettings { theme, fontSize, lineHeight, measure, font, lastBookId? }
```

`shared/types.ts` 只允许类型与接口，禁止 import electron / node 内置模块，保证渲染层与测试都能引用。

### 4.3 JSON 读写

`jsonStore.ts` 提供：

- 进程内**串行队列**：所有写任务排在同一条 Promise 链上，避免并发覆盖。
- **原子写**：写 `<file>.<pid>.tmp` 后 `rename` 覆盖。
- **坏档回退**：JSON 解析失败时把原文件改名为 `.broken`，返回默认值，保证应用仍能启动。

## 5. 导入链路

### 5.1 TXT

```
readFile → decodeTxt → sliceChapters → textToHtml(读取时)
```

1. **解码**：BOM 优先；否则 `chardet` 猜测 + `[guess, utf8, gb18030]` 候选，逐一对坏字符、乱码特征、控制字符打分，取最低分。
2. **切章**：按行扫描，用三组正则判定卷 / 章 / 英文标题；记录标题行下标与层级；标题行之间即章节正文；首个标题前的正文并入「开篇」。
3. **落盘**：每章写 `text/0000.txt`（纯文本），读取时再转段落 HTML，导入快、体积小。

### 5.2 EPUB

```
Buffer → JSZip → container.xml → OPF → spine → nav / NCX → 逐文档
      → 取 body → 图片本地化 → 白名单净化 → 写 text/0000.html + assets/
```

关键实现（`src/main/services/epub.ts`）：

| 步骤 | 实现要点 |
| --- | --- |
| 解包 | `JSZip.loadAsync` 失败抛 `E_EPUB` |
| DRM | 存在 `META-INF/encryption.xml` 且含 `EncryptedData` / `CipherReference` 抛 `E_DRM` |
| 根 OPF | `container.xml` 中 BFS 找 `rootfile@full-path` |
| XML | `XMLParser` 开启 `removeNSPrefix`，OPF / nav / NCX 共用一套取值函数 |
| manifest | `id → { href, mediaType, properties[] }` |
| spine | 过滤 `linear="no"`，按 `itemref` 顺序映射为 zip 路径 |
| 路径 | `joinPath(baseDir, href)`：去 fragment/query、URL 解码、处理 `../`、统一 `/` |
| 目录 | EPUB3 nav 递归 `ol > li > a`；EPUB2 NCX 递归 `navPoint`；层级 = 递归深度 |
| 目录去重 | 同一文档多个目录项：优先正文首标题一致者，否则取最深一层 |
| 正文 | 取 `<body>` 内容；章首 `h1–h4` 与目录名一致时移除，避免重复标题 |
| 图片 | 只处理包内相对路径；改写为 `shijuan-asset://<bookId>/<编码路径>`；外链与缺失直接留给净化器丢弃 |
| 封面 | `meta[name=cover]` → `properties=cover-image` → id/href 含 cover；≤1MB 转 data URL |
| 统计 | 净化后 `htmlToText` 的码点数作为章节字符数 |

### 5.3 导入事务

`library.importEpub` 的顺序：解析 → 建卷目录 → 写源文件 → 写章节 HTML → 写图片 → 写 `meta.json`。

任一步抛错都会 `rm -rf volumes/<id>` 回滚，避免书架出现半成品。批量导入时单本失败只记入 `rejected`，不影响其它书。

## 6. HTML 净化（双层）

### 6.1 主进程白名单（第一层）

`sanitize.ts` 为纯字符串状态机，逐字符扫描：

- **保留**：段落、标题、列表、表格、引用、代码、图片、图文说明、分节容器等排版标签。
- **整段丢弃**：`script`、`style`、`iframe`、`object`、`embed`、`svg`、`math`、`form`、`input`、`audio`、`video`、`noscript`、`template`、`head` 等，连同内部内容。
- **只去壳**：未知标签保留子文本（如 `ruby`）。
- **属性白名单**：`img[src,alt,width,height]`、`td/th[colspan,rowspan]`、`ol[start]`，其余（含 `style`、`on*`、`class`）全部丢弃。
- **URL 规则**：`img[src]` 仅允许 `shijuan-asset://` 或 `data:image/`，因此 `javascript:`、`file:`、`http(s):`、相对路径一律丢弃整枚图片。
- **文本处理**：长空白压缩、裸 `&` 与 `<` 转义，保留合法实体。
- **收尾**：清掉空 `p/div/span/section` 壳。

### 6.2 渲染层 DOMPurify（第二层）

`ReaderView` 在 `dangerouslySetInnerHTML` 前再净化一次：

```ts
DOMPurify.sanitize(chapter.html, {
  ADD_ATTR: ['width', 'height', 'colspan', 'rowspan', 'start'],
  ALLOWED_URI_REGEXP: /^(?:shijuan-asset:|data:image\/)/i
})
```

双层意义：即使磁盘上的章节文件被人为篡改，或解析器出现漏网标签，渲染层仍不会执行脚本。

## 7. 自定义资源协议

`protocol.registerSchemesAsPrivileged` 注册 `shijuan-asset`（standard、secure、支持 fetch），主进程 `protocol.handle` 处理：

```
shijuan-asset://<bookId>/<zip 内路径>
        ↓
<userData>/volumes/<bookId>/assets/<zip 内路径>
```

安全校验：

1. `bookId` 必须匹配 `^[0-9a-f-]{16,64}$`。
2. 路径解码后不得含 `\`、盘符、`..` 段。
3. `resolve` 后必须仍位于该书 `assets` 目录内，否则 403。
4. 只允许白名单后缀（图片 / 字体）并返回对应 MIME，其余 404。

CSP：`default-src 'self'; img-src 'self' data: shijuan-asset:; style-src 'self' 'unsafe-inline'; script-src 'self'`。开发模式下跳过注入，生产与冒烟均生效。

## 8. IPC 契约

所有通道名集中在 `shared/ipc.ts`，主进程对入参做最小校验后转发，业务错误保留 `E_*` 前缀抛回渲染层。

| 通道 | 入参 | 返回 |
| --- | --- | --- |
| `sj:shelf-list` | — | `ShelfBook[]` |
| `sj:shelf-pick` | — | `ImportSummary` |
| `sj:shelf-add` | `string[]` | `ImportSummary` |
| `sj:shelf-drop` | `bookId` | `void` |
| `sj:book-toc` | `bookId` | `TocEntry[]` |
| `sj:book-chapter` | `bookId, index` | `ChapterPayload` |
| `sj:book-find` | `bookId, term` | `SearchHit[]` |
| `sj:position-read` | `bookId` | `ReadingPosition \| null` |
| `sj:position-write` | `PositionInput` | `void` |
| `sj:prefs-read` | — | `ReaderSettings` |
| `sj:prefs-write` | `Partial<ReaderSettings>` | `ReaderSettings` |

preload 额外通过 `webUtils.getPathForFile` 暴露 `pathOf(file)`，解决 sandbox 下拖拽文件拿不到磁盘路径的问题。

错误码：

| 码 | 含义 |
| --- | --- |
| `E_FORMAT` | 扩展名不支持 |
| `E_ENCODING` | 编码无法识别 |
| `E_EPUB` | EPUB 结构损坏 / 缺少必要文件 |
| `E_DRM` | 加密 EPUB |
| `E_TOO_LARGE` | 超过 50MB |
| `E_IO` | 读写失败 |
| `E_NOT_FOUND` | 书或章节不存在 |
| `E_INVALID_ARG` | IPC 参数非法 |

渲染层 `readableError()` 会剥掉 `E_*:` 前缀，只显示中文文案。

## 9. 进度模型

```
percent = (Σ 前序章节字符 + 当前章字符 × ratio) / Σ 全部章节字符 × 100
```

- `ratio = scrollTop / (scrollHeight - clientHeight)`，不足一屏视为 `1`。
- 章节字符数在导入时确定，空章节按标题长度计权，避免除以零。
- 滚动 → 320ms 防抖写；切章 → 立即写；退出阅读器 / `beforeunload` → flush。
- 恢复：存档章节越界夹紧到最后一章，比例夹紧到 `0..1`；无存档时从第 0 章开始。
- 离开阅读器时先把最新 position 合并进书架快照，再重新拉取列表，避免百分比滞后。

## 10. 渲染层结构

| store | 职责 |
| --- | --- |
| `useUiStore` | 当前视图、活动书 id、toast、删除确认 |
| `useShelfStore` | 书架列表、导入、删除、进入 / 离开阅读器 |
| `useReaderStore` | 目录、当前章、章节内容、进度、检索、待定位 |
| `usePrefsStore` | 版式设置与持久化 |

阅读器渲染流程：

1. `open(book)` 并发取目录与存档，定位章节。
2. `chapter` 变化 → 滚动复位（或按待定位/存档比例恢复）。
3. 滚动用 `requestAnimationFrame` 节流后记录比例。
4. 检索跳转先置 `pending`，正文进入 DOM 后再定位高亮。

目录 `ChapterRail` 常驻 DOM，用 `transform` 与 `visibility` 过渡；打开时自动聚焦筛选框。

## 11. 测试策略

| 层级 | 文件 | 覆盖 |
| --- | --- | --- |
| 单元 | `tests/txt.test.ts` | BOM / GB18030 / 换行、卷章切分、开篇与全文兜底、标题误判、书名清理 |
| 单元 | `tests/progress.test.ts` | 加权百分比、滚动互逆、越界夹紧 |
| 单元 | `tests/sanitize.test.ts` | 白名单、危险标签整段丢弃、属性、图片协议、实体与纯文本 |
| 单元 | `tests/epub.test.ts` | EPUB3 nav、EPUB2 NCX、章节名兜底、图片与封面、DRM、损坏包、空 spine |
| E2E | `tests/smoke.mjs` | 真窗口：TXT/EPUB 导入、目录跳章、图片、夜间主题、进度落盘、截图 |

E2E 使用独立 `SHIJUAN_USER_DATA` 临时目录，结束后删除，不污染真实书架。

## 12. 已识别限制

1. EPUB 同一文档承载多个目录项时只保留一条，卷标题与首章同页的书籍目录会少一层。
2. EPUB 内嵌字体不加载；使用系统宋体 / 黑体，避免字体授权与体积问题。
3. 检索按章读取并匹配，超大书首次检索为 O(全书字符数)，未建索引。
4. 目录筛选为前端过滤，只匹配标题文本，不搜正文。
5. 不支持 PDF / MOBI / AZW3；不支持批注、书签、导出。

## 13. 构建与验收命令

```bash
npm install
npm run samples      # 生成 TXT / EPUB 样例
npm run typecheck    # 主进程 + 渲染层
npm test             # vitest
npm run build        # electron-vite build
npm run smoke        # Playwright 驱动真实窗口 + 截图
npm run dist         # electron-builder 打包
```

`npm run dist` 的输出目录为 `release/`（见 `electron-builder.yml`）：`拾卷 Setup <version>.exe`（NSIS 安装包）、`拾卷 <version>.exe`（portable 单文件）、`win-unpacked/`（解包目录）。当前产物未签名证书、未配置应用图标，安装时可能出现未知发布者提示。

国内网络打包前需设镜像，否则 electron-builder 会在下载 NSIS / winCodeSign 时超时：

```powershell
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://registry.npmmirror.com/-/binary/electron-builder-binaries/"
$env:ELECTRON_MIRROR="https://registry.npmmirror.com/-/binary/electron/"
```
