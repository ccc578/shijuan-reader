import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** 串行写队列：同一进程内的 JSON 写入不并发，避免互相覆盖。 */
let tail: Promise<void> = Promise.resolve()

function enqueue(job: () => Promise<void>): Promise<void> {
  const next = tail.then(job)
  tail = next.catch(() => undefined)
  return next
}

/** 原子落盘：写临时文件后 rename 覆盖。 */
export function saveJson<T>(file: string, value: T): Promise<void> {
  return enqueue(async () => {
    await mkdir(dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
    await rename(tmp, file)
  })
}

/**
 * 读取 JSON。文件缺失直接给默认值；内容损坏则改名为 .broken 后给默认值，
 * 保证坏存档不会阻断启动。
 */
export async function loadJson<T>(file: string, fallback: T): Promise<T> {
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch {
    return fallback
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    try {
      await rm(`${file}.broken`, { force: true })
      await rename(file, `${file}.broken`)
    } catch {
      // 备份失败也无妨，继续使用默认值
    }
    return fallback
  }
}
