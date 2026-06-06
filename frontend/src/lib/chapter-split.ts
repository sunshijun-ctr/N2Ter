/** 客户端章节拆分（与 backend chapter_splitter 规则对齐，用于上传前本地预览） */

export interface ParsedChapter {
  chapterNum: number
  title: string
  content: string
  wordCount: number
}

const CHAPTER_HEADING_RE =
  /^\s*(?:第[零〇一二三四五六七八九十百千万\d]+[章节回卷部集]|楔子|序章|引子|尾声|番外)[^。！？；，,.!?;\n\r]{0,50}\s*$/gm

function countWords(text: string) {
  return text.replace(/\s/g, '').length
}

function buildChapter(chapterNum: number, title: string, content: string): ParsedChapter {
  return { chapterNum, title, content, wordCount: countWords(content) }
}

export function splitChapters(content: string): ParsedChapter[] {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!normalized) return []

  const matches = [...normalized.matchAll(CHAPTER_HEADING_RE)]
  if (matches.length === 0) {
    return [buildChapter(1, '正文', normalized)]
  }

  const chapters: ParsedChapter[] = []
  const preface = normalized.slice(0, matches[0].index!).trim()
  let nextNum = 1

  if (preface) {
    chapters.push(buildChapter(nextNum, '正文前言', preface))
    nextNum += 1
  }

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]
    const start = match.index! + match[0].length
    const end = i + 1 < matches.length ? matches[i + 1].index! : normalized.length
    const title = match[0].trim()
    const body = normalized.slice(start, end).trim()
    const fullContent = body ? `${title}\n${body}` : title
    chapters.push(buildChapter(nextNum, title, fullContent))
    nextNum += 1
  }

  return chapters
}
