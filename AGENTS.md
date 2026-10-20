# AGENTS.md — 拾卷协作约定

本文件面向参与本项目的人类开发者与 AI agent。**动手前先读，改完再对照检查。**

## 1. 项目一句话

拾卷（ShiJuan）是一个 Electron + React 的本地离线阅读器，支持 TXT 与 EPUB，目录驱动章节切换。

## 2. 文档优先级

冲突时以下列顺序为准：

1. `PRD.md` — 做什么、不做什么；
2. `TECH_DESIGN.md` — 怎么做、数据结构与安全边界；
3. `AGENTS.md`（本文件）— 怎么写、怎么验证；
4. `ITERATION.md` — 已经发生过什么、下一轮输入。

需求与实现冲突时，**先改文档再改代码**，不允许代码悄悄偏离契约。

## 3. 角色与职责

| 角色 | 负责 | 不负责 |
| --- | --- | --- |
| 需求（PM） | PRD、验收标准、范围裁剪 | 具体实现 |
| 架构（Arch） | 类型契约、IPC 设计、数据布局、安全边界 | 视觉细节 |
| 主进程（Core） | 解析、存储、检索、协议、IPC | 组件样式 |
| 渲染层（UI） | 视图、状态、交互、可访问性 | 文件系统与解包 |
| 验证（QA） | 单测、E2E、截图、缺陷复现 | 绕过失败项直接交付 |

多人 / 多 agent 并行时，**契约先行**：先改 `src/shared/`，再分头实现。共享层变更必须同步告知所有相关方。

## 4. 模块边界（不可越线）

- `src/shared/**`：只有类型、常量、纯函数。**禁止** `import electron`、`node:fs` 等运行时模块。
- `src/main/services/{txtParser,epub,sanitize}.ts`：**禁止** `import electron`，保证 vitest 在 node 环境直接跑。
- 需要 `app.getPath` 的路径逻辑统一放 `services/paths.ts`。
- 渲染层**禁止**直接访问 `window.require`、`fs`、`ipcRenderer`；只允许 `window.shijuan`（见 `preload/index.ts`）。
- 新增能力必须新增 IPC 通道，不得用已有通道夹带私货。

## 5. 代码规则

### 5.1 命名

- 文件名：主进程 `camelCase.ts`；组件 `PascalCase.tsx`；样式 `kebab-case.css`。
- 类型 / 组件：`PascalCase`；函数 / 变量：`camelCase`；常量：`SCREAMING_SNAKE_CASE`。
- 布尔值以 `is / has / can / should` 开头。
- 错误码统一 `E_XXX`，文案用中文，格式 `E_CODE: 用户可读文案`。

### 5.2 类型

- 禁止 `any`；外部数据先 `unknown`，再显式守卫收窄（参见 `element()` / `elements()`）。
- IPC 入参在主进程校验，渲染层的类型不能当作安全边界。
- 可选字段用 `?`，不要用 `| undefined` 混写。

### 5.3 错误处理

- 业务失败抛 `Error('E_XXX: 中文文案')`；不要把底层英文异常直接抛给用户。
- 单本导入失败只记入 `rejected`，不得中断批量导入。
- 清理类操作（删除残留目录、备份坏档）失败可吞掉，但必须留注释说明原因。

### 5.4 安全

- 任何来自 EPUB 的 HTML 必须经过 `sanitizeXhtml`；渲染前再经 DOMPurify。
- 新增标签 / 属性必须同时改白名单与 `tests/sanitize.test.ts`。
- 资源协议路径必须做 `..` 与盘符校验，不允许读取书籍目录之外的任何文件。
- 禁止新增远程资源引用（CSP 也不允许）。

### 5.5 样式

- 颜色、间距、阴影走 `styles/tokens.css` 的 CSS 变量，不在组件里写死色值。
- 主题差异只通过 `html[data-theme]` 下的变量覆盖实现，不在组件里写条件类。
- 正文排版变量：`--reading-size`、`--reading-leading`、`--reading-measure`、`--reading-family`。

## 6. 关键契约速查

- `BookMeta.format` 只有 `'txt' | 'epub'`；新增格式需同步 PRD、导入分支、书架徽标、净化规则。
- 章节正文存储：TXT 存纯文本，EPUB 存已净化 HTML；读取时由 `meta.json` 的 `body` 字段决定。
- 章节下标 0 基；`TocEntry.index` 与数组下标一致。
- 资源 URL：`shijuan-asset://<bookId>/<zip 内路径>`，路径按段 `encodeURIComponent`。
- 进度百分比保留一位小数；`ratio` 必须是 `0..1`。

## 7. 迭代流程

1. **列范围**：写清本轮做什么、不做什么，更新 `ITERATION.md` 的「范围」。
2. **改契约**：涉及类型 / IPC 的先改 `src/shared/`。
3. **实现**：主进程 → preload → store → 组件，小步提交。
4. **自测**：`npm run typecheck`、`npm test`；解析类改动必须补单测。
5. **E2E**：`npm run build && npm run smoke`；界面改动必须更新截图。
6. **记录**：把发现的缺陷、根因、修复写进 `ITERATION.md`；未解决项列为下一轮输入。
7. **收尾**：PRD 功能表、TECH_DESIGN 限制、README 功能列表与实现保持一致。

## 8. 质量门禁（Definition of Done）

一轮迭代只有全部满足才算完成：

- [ ] `npm run typecheck` 通过；
- [ ] `npm test` 全绿，新增逻辑有对应用例；
- [ ] `npm run build` 通过；
- [ ] `npm run smoke` 全绿；
- [ ] 界面截图更新到 `docs/screenshots/`；
- [ ] `ITERATION.md` 记录本轮范围、问题、验证结果；
- [ ] 没有新增 `any`、`console.log`、远程请求、硬编码绝对路径；
- [ ] 没有把示例书、临时数据写进用户真实书架。

## 9. 常用命令

```bash
npm run dev          # 开发模式
npm run samples      # 重新生成 samples/
npm run typecheck    # 主进程 + 渲染层类型检查
npm test             # vitest 单测
npm run build        # 构建 out/
npm run smoke        # Playwright E2E + 截图
npm run dist         # electron-builder 打包
```

## 10. 调试入口

- 书架数据：`<userData>/store/shelf.json`、`positions.json`、`prefs.json`。
- 书籍数据：`<userData>/volumes/<bookId>/`。
- 冒烟隔离：设置环境变量 `SHIJUAN_USER_DATA` 指向临时目录。
- 主进程协议失败：看窗口 DevTools 的 Network，`shijuan-asset` 返回 403 / 404 时先查 bookId 与路径编码。

## 11. 提交信息约定

```
<type>(<scope>): <一句话>

type：feat | fix | refactor | test | docs | chore
scope：txt | epub | shelf | reader | toc | progress | sanitize | build
```

示例：`feat(epub): 接入 NCX 目录并收集正文图片`

## 12. 术语表

| 术语 | 含义 |
| --- | --- |
| 卷 / 章 | TXT 标题层级；卷 depth 0，章 depth 1 |
| spine | EPUB 的阅读顺序清单 |
| OPF | EPUB 的包描述文件（manifest / spine / metadata） |
| nav / NCX | EPUB3 / EPUB2 的目录文件 |
| 版心 | 正文最大宽度 |
| 章内比例 | 当前滚动位置在章节内的占比 |
| 资源协议 | `shijuan-asset://`，只读本地书籍资源 |
