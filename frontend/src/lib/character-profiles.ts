/** AI 视频 schema：character_id（char_01）→ 中文角色名 */

const CHAR_ID_RE = /^char_\d+$/i

export type CharacterProfileLike = {
  id?: string
  character_id?: string
  name?: string
}

export function isCharacterIdToken(value: string | undefined | null): boolean {
  if (!value) return false
  return CHAR_ID_RE.test(value.trim())
}

/** 从 character_profiles / character_arcs 构建 id → 显示名 */
export function buildCharacterIdMap(
  profiles: unknown,
  characterArcs?: CharacterProfileLike[],
): Map<string, string> {
  const map = new Map<string, string>()

  if (Array.isArray(profiles)) {
    for (const item of profiles) {
      if (!item || typeof item !== 'object') continue
      const raw = item as Record<string, unknown>
      const id = String(raw.id ?? raw.character_id ?? '').trim()
      const name = String(raw.name ?? '').trim()
      if (id && name) map.set(id, name)
    }
  }

  if (characterArcs?.length) {
    characterArcs.forEach((arc, i) => {
      const name = arc.name?.trim()
      if (!name) return
      const id = String(arc.id ?? arc.character_id ?? `char_${String(i + 1).padStart(2, '0')}`)
      if (!map.has(id)) map.set(id, name)
    })
  }

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

  return trimmed
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

  if (isCharacterIdToken(name)) return name
  return name
}
