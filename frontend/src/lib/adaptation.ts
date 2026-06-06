import type { AdaptationPlan, AdaptationPlanItem } from './types'

/** 按集数均匀分配章节（mock；后端 planning_agent 替换） */
export function buildAdaptationPlan(
  totalChapters: number,
  episodeCount: number,
  novelTitle = '',
): AdaptationPlan {
  const clamped = Math.max(1, Math.min(episodeCount, totalChapters))
  const items: AdaptationPlanItem[] = []
  let chapter = 1

  for (let ep = 1; ep <= clamped; ep++) {
    if (chapter > totalChapters) break

    const remainingEpisodes = clamped - ep + 1
    const remainingChapters = totalChapters - chapter + 1
    const count = Math.max(1, Math.ceil(remainingChapters / remainingEpisodes))
    const sourceChapters = Array.from({ length: count }, (_, i) => chapter + i).filter(
      (n) => n <= totalChapters,
    )
    if (!sourceChapters.length) break
    chapter += sourceChapters.length

    const range =
      sourceChapters.length === 1
        ? `第 ${sourceChapters[0]} 章`
        : `第 ${sourceChapters[0]}-${sourceChapters.at(-1)} 章`

    items.push({
      episodeNum: ep,
      title: `${novelTitle ? novelTitle.slice(0, 4) : '改编'} · 第 ${ep} 集`,
      sourceChapters,
      oneLineSummary: `覆盖${range}`,
    })
  }

  const ratio = (totalChapters / clamped).toFixed(1)
  return {
    totalChapters,
    episodeCount: items.length,
    items,
    reasoning: `全书 ${totalChapters} 章，建议拆为 ${clamped} 集（约 ${ratio} 章/集），兼顾节奏与戏剧张力。`,
  }
}
