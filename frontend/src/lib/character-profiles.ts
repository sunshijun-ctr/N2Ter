/** AI 视频 schema：character_id（char_01 / char_wu_modern 等）→ 中文角色名 */

const CHAR_NUMERIC_ID_RE = /^char_\d+$/i
const CHAR_TOKEN_RE = /^char_/i

const PINYIN_SURNAME_HINTS: Record<string, string> = {
  wu: '吴',
  qin: '秦',
  li: '李',
  wang: '王',
  zhang: '张',
  lin: '林',
  chen: '陈',
  liu: '刘',
  zhao: '赵',
  sun: '孙',
  zhou: '周',
  huang: '黄',
  yang: '杨',
  xu: '徐',
  ma: '马',
  zhu: '朱',
  hu: '胡',
  guo: '郭',
  he: '何',
  gao: '高',
  luo: '罗',
  zheng: '郑',
  liang: '梁',
  xie: '谢',
  tang: '唐',
  han: '韩',
  cao: '曹',
  xiao: '肖',
  yuan: '袁',
  jiang: '蒋',
  shen: '沈',
  han2: '韩',
}

export type CharacterProfileLike = {
  id?: string
  character_id?: string
  name?: string
}

export function isCharacterToken(value: string | undefined | null): boolean {
  if (!value) return false
  return CHAR_TOKEN_RE.test(value.trim())
}

export function isCharacterIdToken(value: string | undefined | null): boolean {
  if (!value) return false
  return CHAR_NUMERIC_ID_RE.test(value.trim())
}

function slugSurnameHint(charId: string): string | null {
  let slug = charId.trim()
  if (slug.toLowerCase().startsWith('char_')) slug = slug.slice(5)
  const head = slug.split('_')[0]?.toLowerCase()
  if (!head || /^\d+$/.test(head)) return null
  return PINYIN_SURNAME_HINTS[head] ?? null
}

function extractProfilesDeep(content: Record<string, unknown>): CharacterProfileLike[] {
  const found: CharacterProfileLike[] = []
  const seen = new Set<string>()

  function add(item: Record<string, unknown>) {
    const id = String(item.id ?? item.character_id ?? '').trim()
    const name = String(item.name ?? '').trim()
    if (!id || !name || seen.has(id) || isCharacterToken(name)) return
    seen.add(id)
    found.push({ id, name })
  }

  function walk(node: unknown) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    const obj = node as Record<string, unknown>
    const profiles = obj.character_profiles
    if (Array.isArray(profiles)) {
      profiles.forEach((p) => {
        if (p && typeof p === 'object') add(p as Record<string, unknown>)
      })
    }
    Object.values(obj).forEach(walk)
  }

  walk(content)
  return found
}

function extractInlinePairs(content: Record<string, unknown>): Map<string, string> {
  const pairs = new Map<string, string>()

  function walk(node: unknown) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    const obj = node as Record<string, unknown>
    const cid = obj.character_id
    if (cid) {
      const cidStr = String(cid).trim()
      for (const key of ['name', 'character', 'speaker', 'character_name']) {
        const raw = obj[key]
        if (raw == null) continue
        const name = String(raw).trim()
        if (name && !isCharacterToken(name)) pairs.set(cidStr, name)
      }
    }
    Object.values(obj).forEach(walk)
  }

  walk(content)
  return pairs
}

function collectSceneNames(content: Record<string, unknown>): string[] {
  const scenes = content.scenes
  if (!Array.isArray(scenes)) return []
  const names: string[] = []
  for (const scene of scenes) {
    if (!scene || typeof scene !== 'object') continue
    const chars = (scene as Record<string, unknown>).characters
    if (!Array.isArray(chars)) continue
    for (const raw of chars) {
      const name = String(raw).trim()
      if (name && !isCharacterToken(name)) names.push(name)
    }
  }
  return names
}

function matchByHint(hint: string, candidates: string[]): string | null {
  const matches = candidates.filter((n) => n.includes(hint))
  if (matches.length === 1) return matches[0]
  if (matches.length > 0) return matches.sort((a, b) => a.length - b.length)[0]
  return null
}

function inferNameForToken(
  charId: string,
  sceneNames: string[],
  characterArcs?: CharacterProfileLike[],
): string | null {
  const hint = slugSurnameHint(charId)
  if (!hint) return null
  const fromScene = matchByHint(hint, sceneNames)
  if (fromScene) return fromScene
  const arcNames = (characterArcs ?? [])
    .map((a) => a.name?.trim())
    .filter((n): n is string => Boolean(n))
  return matchByHint(hint, arcNames)
}

function collectTokens(content: Record<string, unknown>): Set<string> {
  const tokens = new Set<string>()

  function walk(node: unknown) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    const obj = node as Record<string, unknown>
    for (const key of ['character_id', 'subject']) {
      const raw = obj[key]
      if (raw != null && isCharacterToken(String(raw))) tokens.add(String(raw).trim())
    }
    const emos = obj.character_emotion
    if (Array.isArray(emos)) {
      for (const item of emos) {
        if (!item || typeof item !== 'object') continue
        const raw =
          (item as Record<string, unknown>).character_id ??
          (item as Record<string, unknown>).character
        if (raw != null && isCharacterToken(String(raw))) tokens.add(String(raw).trim())
      }
    }
    Object.values(obj).forEach(walk)
  }

  walk(content)
  return tokens
}

/** 从 character_profiles / character_arcs / 内容推断构建 id → 显示名 */
export function buildCharacterIdMap(
  content: Record<string, unknown> | null | undefined,
  characterArcs?: CharacterProfileLike[],
): Map<string, string> {
  const map = new Map<string, string>()
  const root = content ?? {}

  for (const item of extractProfilesDeep(root)) {
    const id = String(item.id ?? item.character_id ?? '').trim()
    const name = item.name?.trim()
    if (id && name) map.set(id, name)
  }

  if (characterArcs?.length) {
    characterArcs.forEach((arc, i) => {
      const name = arc.name?.trim()
      if (!name) return
      const id = String(arc.id ?? arc.character_id ?? `char_${String(i + 1).padStart(2, '0')}`)
      if (!map.has(id)) map.set(id, name)
    })
  }

  extractInlinePairs(root).forEach((name, id) => map.set(id, name))

  const sceneNames = collectSceneNames(root)
  const profileNames = [...map.values()].filter((n) => n && !isCharacterToken(n))
  const nameCandidates = [...new Set([...sceneNames, ...profileNames])]
  collectTokens(root).forEach((token) => {
    if (map.has(token)) return
    const inferred = inferNameForToken(token, nameCandidates, characterArcs)
    if (inferred) map.set(token, inferred)
  })

  return map
}

export function resolveCharacterRef(
  ref: string | undefined | null,
  idMap: Map<string, string>,
): string {
  const trimmed = (ref ?? '').trim()
  if (!trimmed) return ''

  const resolved = idMap.get(trimmed)
  if (resolved) return resolved

  if (isCharacterIdToken(trimmed)) {
    const num = trimmed.match(/\d+/)?.[0]
    return num ? `角色 ${num}` : trimmed
  }

  if (isCharacterToken(trimmed)) {
    const hint = slugSurnameHint(trimmed)
    if (hint) return hint
  }

  return trimmed
}

/** 替换字符串内所有 char_* 片段（如 subject 混写多个 id） */
export function resolveCharacterText(
  text: string | undefined | null,
  idMap: Map<string, string>,
): string {
  const value = (text ?? '').trim()
  if (!value) return ''
  return value.replace(/\bchar_[\w]+\b/gi, (token) => {
    const resolved = resolveCharacterRef(token, idMap)
    return resolved && resolved !== token ? resolved : token
  })
}

/** 保存回写：优先保留已有 character_id，否则按显示名反查 id */
export function toCharacterIdForSave(
  displayName: string | undefined,
  idMap: Map<string, string>,
  existingId?: string,
): string | undefined {
  const name = (displayName ?? '').trim()
  if (!name) return undefined

  if (existingId && idMap.get(existingId) === name) return existingId

  for (const [id, mappedName] of idMap) {
    if (mappedName === name) return id
  }

  if (isCharacterToken(name)) return name
  return name
}
