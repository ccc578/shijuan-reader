# ITERATION.md — 拾卷迭代记录

记录每一轮迭代的范围、缺陷、修复与验证结果。原则：**先跑通最小闭环，再增量扩展；每轮都留下可复现的证据。**

---

## 迭代 0：项目奠基

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-18 |
| 产物 | electron-vite 骨架、`src/shared/{types,ipc,constants,progress}.ts`、主进程目录约定、preload 白名单 |
| 关键决策 | Electron（非 Tauri）；原生 CSS + CSS 变量；JSON 原子写入；章节内滚动；目录左侧滑出 |
| 验证 | `npm run typecheck`、`npm run build` 通过；窗口可启动 |

---

## 迭代 1：v0.1 — TXT 单格式闭环

### 范围（刻意收窄）

只做「导入 TXT → 阅读 → 调版式 → 记住进度 → 重开恢复」，验证整条链路后再接 EPUB。

| 功能 | 状态 | 说明 |
| --- | --- | --- |
| TXT 导入（对话框 / 拖拽 / 批量） | ✅ | UTF-8、BOM、UTF-16、GBK/GB18030 自动识别 |
| 章节切分 | ✅ | 卷 / 章两级；开篇与「全文」兜底 |
| 书架 | ✅ | 续读卡、书脊式列表、概览、删除确认 |
| 阅读器 | ✅ | 顶部栏、正文、底部章节点按、章末「读下一章」 |
| 目录 | ✅ | 左侧滑出、筛选、层级、当前章高亮、点击切章 |
| 进度 | ✅ | 章内比例 + 字符加权百分比，320ms 防抖、切章立即落盘 |
| 版式 | ✅ | 三底色、字号、行距、版心、字族 |
| 检索 | ✅ | 全书逐章扫描 + 跳转高亮 |
| EPUB | ⛔（界面预留导入入口） | 按计划留给下一轮 |

### 验证结果

```
npm run typecheck      PASS（main + renderer）
npm run build          PASS
npm test               PASS（20 条：TXT 12 + 进度 8）
npm run smoke          PASS（12 项，TXT 全链路）
```

截图：`docs/screenshots/v01-01-empty-shelf.png` ～ `v01-06-back-to-shelf.png`。

### 本轮遗留（迭代 2 输入）

| 编号 | 问题 | 影响 |
| --- | --- | --- |
| GAP-01 | 只支持 TXT，EPUB 无法导入 | 覆盖不了主流电子书 |
| GAP-02 | 书架没有真实封面，EPUB 浪费 | 书多时辨识度低 |
| GAP-03 | 目录只认 TXT 正则标题 | EPUB 的 nav / NCX 无处落地 |
| UX-01 | 书架行文案过长会换行 | 进度区观感不稳 |

---

## 迭代 2：v0.2 — EPUB 接入与阅读闭环完善

### 范围

在 v0.1 的契约上增量扩展，不改 IPC 通道、不改数据根：

| 功能 | 结果 | 实现要点 |
| --- | --- | --- |
| EPUB 导入 | ✅ | jszip 解包 + fast-xml-parser；container → OPF → spine → nav / NCX |
| EPUB 目录 | ✅ | EPUB3 nav 嵌套、EPUB2 NCX 递归；同文档多项时取最贴近正文的一条 |
| EPUB 图片 | ✅ | 包内图片落到 `volumes/<id>/assets/`，正文改写为 `shijuan-asset://` |
| EPUB 封面 | ✅ | `meta[name=cover]` → `cover-image` → 名称 guess；≤1MB 转 data URL |
| DRM / 损坏 | ✅ | 明确 `E_DRM`、`E_EPUB`，不崩溃 |
| 双保险净化 | ✅ | 主进程字符串白名单 + 渲染层 DOMPurify |
| 正文标题去重 | ✅ | 章首标题与目录名一致时移除，避免阅读页出现两遍 |
| 导入回滚 | ✅ | 写盘中途失败清理半成品卷目录 |
| 书架信息 | ✅ | EPUB 真实封面、格式徽标、作者、章数 |

### 本轮发现并修复的问题

| 编号 | 现象 | 根因 | 修复 |
| --- | --- | --- | --- |
| FIX-01 | EPUB 第一章标题变成「卷一 山窗」 | 目录里卷标题与首章指向同一 XHTML，按「先到先得」把卷名当章名 | 同一文档多个目录项时，优先与正文首标题一致者，否则取最深一层；单测覆盖 |
| FIX-02 | EPUB 阅读页章名出现两遍 | 正文 `<h1>` 与渲染层章名重复 | 解析阶段移除与目录名一致的首个标题，保留其它子标题 |
| FIX-03 | 正文出现空段落，图片位置留白 | 源 XHTML 的空 `<p>` 被保留 | 净化收尾反复清理空 `p/div/span/section` |
| FIX-04 | 图片偶尔裂图 | 外链 / 缺失资源仍保留 `<img>` | 资源不可达时不改写，净化按 src 白名单整枚丢弃 |
| FIX-05 | 章节读取用字符串替换推断文件后缀 | `textFile().replace('.txt','.html')` 依赖命名巧合 | 统一使用 `htmlFile()`，由 `meta.json` 的 `body` 决定 |
| FIX-06 | 书架行进度文案换行 | 文案含「章内百分比」，宽度不足 | 精简为「第 x / y 章」，总百分比单独加粗显示 |
| UX-02 | 目录截图拍到滑入动画中途 | E2E 在 300ms 过渡结束前截图 | 截图前固定等待 450ms |

### 验证结果

```
npm run typecheck      PASS
npm test               PASS（4 个文件 / 43 条）
npm run build          PASS
npm run smoke          PASS（30 项）
```

```
PASS  EPUB 批量导入成功 — imported=2
PASS  EPUB3 读取书名与作者 — 周砚
PASS  EPUB3 目录取 nav 标题 — 第一章 雾里的石阶 / 第二章 灯下抄书 / 第三章 雨后 / 第四章 河口的灯 / 第五章 归途
PASS  EPUB2 读取 NCX 目录
PASS  EPUB 封面渲染为图片
PASS  EPUB 目录条目数正确
PASS  EPUB 正文图片从资源协议加载
PASS  EPUB 阅读进度已落盘 — chapter=2, percent=58.6
```

截图（迭代 2）：

| 文件 | 内容 |
| --- | --- |
| `docs/screenshots/v02-01-shelf.png` | 5 本书，EPUB 真实封面、格式徽标、续读卡 |
| `docs/screenshots/v02-02-toc.png` | 左侧目录、筛选、层级、当前章高亮 |
| `docs/screenshots/v02-03-reader-image.png` | EPUB 正文图片与图注 |
| `docs/screenshots/v02-04-night.png` | 玄墨主题下的同一章 |
| `docs/screenshots/v02-05-back-to-shelf.png` | 返回书架后的进度回流 |

### 打包产物

`npm run dist` 在本机 Windows 上产出了可分发文件（`release/` 已被 `.gitignore` 忽略，不入库）：

| 产物 | 大小 | 用途 |
| --- | --- | --- |
| `release/拾卷 Setup 0.2.0.exe` | 107.8 MB | NSIS 安装包，双击安装并创建快捷方式 |
| `release/拾卷 0.2.0.exe` | 107.6 MB | 免安装单文件，双击直接运行 |
| `release/win-unpacked/拾卷.exe` | 235.2 MB | 解包目录版，便于排查启动问题 |

验证方式：直接启动 `win-unpacked/拾卷.exe`，进程存活、窗口标题为「拾卷」。**未**用安装包做完整 E2E，故 GAP-07 只算部分验证。

打包时需注意两点：国内网络要给 electron-builder 设镜像（`ELECTRON_BUILDER_BINARIES_MIRROR`），否则会卡在下载 NSIS；当前未配置应用图标，任务栏显示 Electron 默认图标。

### 人工验收清单

- [x] 拖入 GBK TXT，中文正常
- [x] 导入 EPUB3 / EPUB2，书名、作者、章数正确
- [x] 目录点击切章，落点为章首
- [x] EPUB 图片显示，无裂图
- [x] 夜间主题与字号即时生效
- [x] 关闭重开，回到上次章节与位置
- [x] 移除书籍有二次确认，原文件不受影响

### 下一轮输入（未做）

| 编号 | 方向 | 说明 |
| --- | --- | --- |
| GAP-04 | 目录层级补全 | 同一文档承载卷 + 首章时，卷标题仍会被合并；需要把「目录项」与「章节」解耦 |
| GAP-05 | 检索索引 | 大书首次检索逐章扫描，可加倒排或缓存 |
| GAP-06 | 书签 / 批注 | 当前只记录单一阅读位置 |
| GAP-07 | 打包产物冒烟 | 已能打出安装包并启动验证；完整 E2E 仍跑 `out/`，未对安装后版本重跑 |
| GAP-08 | 应用图标 | `electron-builder.yml` 未配置 `icon`，任务栏与开始菜单是 Electron 默认图标 |
