export const CARD_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const
export type CardValue = (typeof CARD_VALUES)[number]

export const MAX_CUSTOM_VOTE = 999

export function parseCustomVote(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0 || n > MAX_CUSTOM_VOTE) return null
  return n
}

export function isPresetVote(value: number): value is CardValue {
  return (CARD_VALUES as readonly number[]).includes(value)
}

export type RoomData = {
  revealed: boolean
  votes: Record<string, number | null>
  names: Record<string, string>
}

export const emptyRoomData = (): RoomData => ({
  revealed: false,
  votes: {},
  names: {},
})

export function normalizeRoomId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}
