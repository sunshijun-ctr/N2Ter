/** 客户端章节拆分（与 backend chapter_splitter 规则对齐，用于上传前本地预览） */

export interface ParsedChapter {
  chapterNum: number
  title: string
  content: string
  wordCount: number
}

export type ChapterSplitMode = 'headings' | 'auto' | 'none'

export interface ChapterSplitResult {
  chapters: ParsedChapter[]
  mode: ChapterSplitMode
}

const MIN_HEADING_COUNT = 3
const DEFAULT_WORDS_PER_CHAPTER = 5000
const MAX_CHAPTER_WORDS = 20_000

const SKIP_HEADING_RE =
  /^\s*(?:目录|目\s*录|内容简介|内容提要|作品简介|版权(?:说明)?|声明|作者(?:的话|感言)?|上架感言)\s*$/i

const CHAPTER_PATTERNS: RegExp[] = [
  /^\s*(?:第[零〇一二三四五六七八九十百千万\d]+[章节回卷部集]|楔子|序章|引子|尾声|番外)[^。！？；，,.!?;\n\r]{0,50}\s*$/,
  /^\s*[Cc]hapter\s+\d+[^\n]{0,40}\s*$/,
  /^\s*第[零〇一二三四五六七八九十百千万\d]+[节][^。！？；，,.!?;\n\r]{0,50}\s*$/,
  /^\s*\d+[\.、．]\s*[^\d\n]{1,40}\s*$/,
]

function countWords(text: string) {
  return text.replace(/\s/g, '').length
}

function buildChapter(chapterNum: number, title: string, content: string): ParsedChapter {
  return { chapterNum, title, content, wordCount: countWords(content) }
}

type HeadingMatch = { start: number; end: number; title: string }

function findHeadingMatches(text: string): HeadingMatch[] {
  const lines = text.split('\n')
  const patternCounts = CHAPTER_PATTERNS.map(() => 0)
  const lineInfos: Array<HeadingMatch & { patternIndex: number }> = []
  let offset = 0

  for (const line of lines) {
    const stripped = line.trim()
    const lineEnd = offset + line.length
    if (stripped && !SKIP_HEADING_RE.test(stripped)) {
      CHAPTER_PATTERNS.forEach((pattern, index) => {
        if (pattern.test(stripped)) {
          patternCounts[index] += 1
          lineInfos.push({ start: offset, end: lineEnd, title: stripped, patternIndex: index })
        }
      })
    }
    offset = lineEnd + 1
  }

  const bestCount = Math.max(...patternCounts)
  if (bestCount < MIN_HEADING_COUNT) return []

  const bestIndex = patternCounts.indexOf(bestCount)
  return lineInfos
    .filter((item) => item.patternIndex === bestIndex)
    .map(({ start, end, title }) => ({ start, end, title }))
}

function splitByHeadings(text: string, matches: HeadingMatch[]): ParsedChapter[] {
  const chapters: ParsedChapter[] = []
  const preface = text.slice(0, matches[0].start).trim()
  let nextNum = 1

  if (preface) {
    chapters.push(buildChapter(nextNum, '正文前言', preface))
    nextNum += 1
  }

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]
    const bodyStart = match.end
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].start : text.length
    const title = match.title
    const body = text.slice(bodyStart, bodyEnd).trim()
    const fullContent = body ? `${title}\n${body}` : title
    chapters.push(buildChapter(nextNum, title, fullContent))
    nextNum += 1
  }

  return chapters
}

function hardSplitParagraph(text: string, target: number): string[] {
  const sentences = text.split(/(?<=[。！？!?…\n])/).filter((s) => s.trim())
  if (sentences.length <= 1) {
    const chars = text.replace(/\s/g, '')
    const chunks: string[] = []
    for (let i = 0; i < chars.length; i += target) {
      chunks.push(chars.slice(i, i + target))
    }
    return chunks.filter(Boolean)
  }

  const chunks: string[] = []
  let bucket: string[] = []
  let bucketWords = 0

  const flush = () => {
    if (bucket.length) chunks.push(bucket.join('').trim())
    bucket = []
    bucketWords = 0
  }

  for (const sentence of sentences) {
    const sw = countWords(sentence)
    if (bucketWords + sw > target && bucket.length) flush()
    bucket.push(sentence)
    bucketWords += sw
  }
  flush()
  return chunks.filter(Boolean)
}

function normalizeParagraphs(text: string): string[] {
  let paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (paragraphs.length <= 1) {
    const lineParagraphs = text
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean)
    if (lineParagraphs.length > 1) return lineParagraphs
  }
  if (!paragraphs.length) {
    return text
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean)
  }
  return paragraphs
}

function splitByWordCount(text: string, wordsPerChapter: number): ParsedChapter[] {
  const target = Math.max(500, wordsPerChapter)
  const paragraphs = normalizeParagraphs(text)
  if (!paragraphs.length) return [buildChapter(1, '正文', text)]

  const chunks: string[] = []
  let bucket: string[] = []
  let bucketWords = 0

  const flush = () => {
    if (bucket.length) chunks.push(bucket.join('\n\n'))
    bucket = []
    bucketWords = 0
  }

  for (const para of paragraphs) {
    const paraWords = countWords(para)
    if (paraWords > target * 1.5) {
      flush()
      chunks.push(...hardSplitParagraph(para, target))
      continue
    }
    if (bucketWords + paraWords > target && bucket.length) flush()
    bucket.push(para)
    bucketWords += paraWords
  }
  flush()

  const bodies = chunks.length ? chunks : [text]
  return bodies.map((chunk, index) =>
    buildChapter(index + 1, `第 ${index + 1} 段（自动分章）`, chunk),
  )
}

function splitOversized(chapters: ParsedChapter[], wordsPerChapter: number): ParsedChapter[] {
  const result: ParsedChapter[] = []
  let nextNum = 1

  for (const chapter of chapters) {
    if (chapter.wordCount <= MAX_CHAPTER_WORDS) {
      result.push({ ...chapter, chapterNum: nextNum })
      nextNum += 1
      continue
    }
    const parts = splitByWordCount(chapter.content, wordsPerChapter)
    parts.forEach((part, index) => {
      const suffix = index > 0 ? ` · ${index + 1}` : ''
      result.push({
        ...part,
        chapterNum: nextNum,
        title: `${chapter.title}${suffix}`,
      })
      nextNum += 1
    })
  }

  return result
}

export function splitChapters(
  content: string,
  options?: { wordsPerChapter?: number },
): ChapterSplitResult {
  const wordsPerChapter = options?.wordsPerChapter ?? DEFAULT_WORDS_PER_CHAPTER
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!normalized) return { chapters: [], mode: 'auto' }

  const headingMatches = findHeadingMatches(normalized)
  let mode: ChapterSplitMode
  let chapters: ParsedChapter[]

  if (headingMatches.length >= MIN_HEADING_COUNT) {
    chapters = splitByHeadings(normalized, headingMatches)
    mode = 'headings'
  } else if (wordsPerChapter === 0) {
    chapters = [buildChapter(1, '正文', normalized)]
    mode = 'none'
  } else {
    chapters = splitByWordCount(normalized, wordsPerChapter)
    mode = 'auto'
  }

  if (wordsPerChapter === 0) {
    return { chapters, mode }
  }

  return {
    chapters: splitOversized(chapters, wordsPerChapter),
    mode,
  }
}
