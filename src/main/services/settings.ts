import type { FontStack, ReaderSettings, ThemeName } from '@shared/types'
import { DEFAULT_SETTINGS, LIMITS, THEMES } from '@shared/constants'
import { loadJson, saveJson } from './jsonStore'
import { prefsFile } from './paths'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clamp(raw: unknown, min: number, max: number, fallback: number): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback
  return Math.min(max, Math.max(min, n))
}

function themeOf(raw: unknown): ThemeName {
  return typeof raw === 'string' && (THEMES as string[]).includes(raw) ? (raw as ThemeName) : 'moon'
}

function fontOf(raw: unknown): FontStack {
  return raw === 'hei' ? 'hei' : 'song'
}

/** 与默认值合并并夹紧边界，任何脏数据都退化为合法设置 */
export function cleanSettings(raw: unknown): ReaderSettings {
  const source = isObject(raw) ? raw : {}
  const settings: ReaderSettings = {
    theme: themeOf(source.theme),
    fontSize: Math.round(
      clamp(source.fontSize, LIMITS.fontSize.min, LIMITS.fontSize.max, DEFAULT_SETTINGS.fontSize)
    ),
    lineHeight:
      Math.round(
        clamp(source.lineHeight, LIMITS.lineHeight.min, LIMITS.lineHeight.max, DEFAULT_SETTINGS.lineHeight) *
          10
      ) / 10,
    measure: Math.round(
      clamp(source.measure, LIMITS.measure.min, LIMITS.measure.max, DEFAULT_SETTINGS.measure)
    ),
    font: fontOf(source.font)
  }
  if (typeof source.lastBookId === 'string' && source.lastBookId !== '') {
    settings.lastBookId = source.lastBookId
  }
  return settings
}

export async function readSettings(): Promise<ReaderSettings> {
  return cleanSettings(await loadJson<unknown>(prefsFile(), DEFAULT_SETTINGS))
}

export async function writeSettings(patch: Partial<ReaderSettings>): Promise<ReaderSettings> {
  const merged = cleanSettings({ ...(await readSettings()), ...patch })
  await saveJson(prefsFile(), merged)
  return merged
}
