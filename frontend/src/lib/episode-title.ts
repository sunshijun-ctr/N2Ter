/** 从章节范围或已有标题推导默认集名（勿截断小说名） */

const PSEUDO_CHAPTER_RE = /^第\s*\d+\s*段（自动分章）/

export function suggestEpisodeTitle(
  episodeNum: number,
  sourceChapters: number[],
  chapterTitles?: string[],
): string {
  const meaningful = (chapterTitles ?? [])
    .map((t) => t.trim())
    .filter((t) => t && !PSEUDO_CHAPTER_RE.test(t))

  if (meaningful.length === 1) return meaningful[0]!.slice(0, 60)
  if (meaningful.length > 1) {
    const first = meaningful[0]!
    const last = meaningful[meaningful.length - 1]!
    if (first === last) return first.slice(0, 60)
    const combined = `${first} · ${last}`
    return combined.length > 80 ? combined.slice(0, 80) : combined
  }

  if (sourceChapters.length === 1) return `第 ${sourceChapters[0]} 章`
  if (sourceChapters.length > 1) {
    return `第 ${sourceChapters[0]}-${sourceChapters[sourceChapters.length - 1]} 章`
  }
  return `第 ${episodeNum} 集`
}

const LEGACY_SUFFIX_RE = / · 第 \d+ 集$/

/** 是否为占位集名（尚未自定义，可被方案/生成结果覆盖） */
export function isPlaceholderEpisodeTitle(title: string, episodeNum: number): boolean {
  const trimmed = title.trim()
  if (!trimmed || trimmed === `第 ${episodeNum} 集`) return true
  if (LEGACY_SUFFIX_RE.test(trimmed)) return true
  return /^第 \d+(-\d+)? 章$/.test(trimmed)
}

/** 导航/列表展示用集名（保留「第 1-3 章」等默认名，仅真正空名显示未命名） */
export function episodeDisplayTitle(title: string, episodeNum: number): string {
  const trimmed = title.trim()
  if (!trimmed || trimmed === `第 ${episodeNum} 集`) return '未命名'
  const suffix = ` · 第 ${episodeNum} 集`
  if (trimmed.endsWith(suffix)) {
    const prefix = trimmed.slice(0, -suffix.length).trim()
    return prefix || '未命名'
  }
  return trimmed
}

/** 分集导航副标题：无有效展示名时返回 null */
export function episodeNavSubtitle(title: string, episodeNum: number): string | null {
  const display = episodeDisplayTitle(title, episodeNum)
  return display === '未命名' ? null : display
}
