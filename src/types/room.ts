export const CARD_VALUES = [1, 2, 3, 4, 5, 6, 7, 8] as const
export type CardValue = (typeof CARD_VALUES)[number]

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
