import type { ShiJuanApi } from '@shared/types'

/** preload 暴露的能力表，渲染层统一从这里取，避免散落 window 访问 */
export const api: ShiJuanApi = window.shijuan

/** 把 IPC 错误还原成一句人话：保留 E_CODE 之后的中文文案 */
export function explain(error: unknown, fallback = '操作没有完成，请稍后再试'): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  if (raw === '') return fallback
  const coded = /E_[A-Z_]+:\s*([\s\S]+)$/.exec(raw)
  if (coded) return coded[1].trim()
  if (/Error invoking remote method/.test(raw)) return fallback
  return raw
}

/** 1500 → 1.5 千，123456 → 12.3 万 */
export function compactNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value >= 10000) return `${(value / 10000).toFixed(1)} 万`
  if (value >= 1000) return `${(value / 1000).toFixed(1)} 千`
  return String(Math.round(value))
}

/** 用书名生成稳定的色相，TXT 也有属于自己的封面 */
export function hueOf(seed: string): number {
  let hash = 0
  for (const ch of seed) hash = (hash * 31 + ch.codePointAt(0)!) % 360
  return hash
}

export function shortStamp(ms: number): string {
  if (!ms) return ''
  const date = new Date(ms)
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month} 月 ${day} 日`
}
