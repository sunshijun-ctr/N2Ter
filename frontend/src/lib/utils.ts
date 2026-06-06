import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** 合并 Tailwind class，处理冲突 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 生成画布内 scene / dialogue 临时 ID */
export function newCanvasId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

/** 格式化源章节范围；无有效章节时返回 null（调用方应隐藏） */
export function formatSourceChapters(chapters: number[] | undefined | null): string | null {
  const nums = (chapters ?? []).filter((n) => Number.isFinite(n))
  if (nums.length === 0) return null
  if (nums.length === 1) return `第 ${nums[0]} 章`
  return `第 ${nums[0]}–${nums[nums.length - 1]} 章`
}
