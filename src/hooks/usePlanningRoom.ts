import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSupabase } from '../lib/supabase'
import type { RoomData } from '../types/room'
import { emptyRoomData } from '../types/room'

const TABLE = 'planning_poker_rooms'

function parseRowData(raw: unknown): RoomData {
  if (!raw || typeof raw !== 'object') return emptyRoomData()
  const o = raw as Record<string, unknown>
  const revealed = Boolean(o.revealed)
  const votes: Record<string, number | null> = {}
  const names: Record<string, string> = {}
  if (o.votes && typeof o.votes === 'object') {
    for (const [k, v] of Object.entries(o.votes as Record<string, unknown>)) {
      if (v === null || v === undefined) votes[k] = null
      else if (typeof v === 'number' && Number.isFinite(v)) votes[k] = v
    }
  }
  if (o.names && typeof o.names === 'object') {
    for (const [k, v] of Object.entries(o.names as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) names[k] = v.trim().slice(0, 40)
    }
  }
  return { revealed, votes, names }
}

export function usePlanningRoom(roomId: string | null) {
  const [data, setData] = useState<RoomData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = useMemo(() => getSupabase(), [])

  const saveRoomData = useCallback(
    async (next: RoomData) => {
      if (!supabase || !roomId) return
      const { error: upErr } = await supabase.from(TABLE).upsert(
        {
          room_id: roomId,
          data: next,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'room_id' },
      )
      if (upErr) setError(upErr.message)
    },
    [supabase, roomId],
  )

  const refresh = useCallback(async () => {
    if (!supabase || !roomId) return
    const { data: row, error: selErr } = await supabase
      .from(TABLE)
      .select('data')
      .eq('room_id', roomId)
      .maybeSingle()
    if (selErr) {
      setError(selErr.message)
      return
    }
    if (row?.data) setData(parseRowData(row.data))
    else setData(emptyRoomData())
  }, [supabase, roomId])

  useEffect(() => {
    if (!supabase || !roomId) {
      void Promise.resolve().then(() => {
        setData(null)
        setError(null)
        setLoading(false)
      })
      return
    }

    let cancelled = false

    const run = async () => {
      await Promise.resolve()
      if (cancelled) return
      setLoading(true)
      setError(null)

      const { data: row, error: selErr } = await supabase
        .from(TABLE)
        .select('data')
        .eq('room_id', roomId)
        .maybeSingle()

      if (cancelled) return
      if (selErr) {
        setError(selErr.message)
        setLoading(false)
        return
      }

      if (!row) {
        const initial = emptyRoomData()
        const { error: insErr } = await supabase.from(TABLE).insert({
          room_id: roomId,
          data: initial,
        })
        if (cancelled) return
        if (insErr) {
          const { data: row2, error: e2 } = await supabase
            .from(TABLE)
            .select('data')
            .eq('room_id', roomId)
            .maybeSingle()
          if (cancelled) return
          if (!e2 && row2?.data) {
            setData(parseRowData(row2.data))
            setLoading(false)
            return
          }
          setError(insErr.message)
          setLoading(false)
          return
        }
        setData(initial)
      } else {
        setData(parseRowData(row.data))
      }
      setLoading(false)
    }

    void run()

    const ch = supabase
      .channel(`poker:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: TABLE,
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const row = payload.new as { data?: unknown } | null
          if (row?.data) setData(parseRowData(row.data))
        },
      )
      .subscribe()

    const pollMs = 4000
    const poll = window.setInterval(() => {
      if (cancelled) return
      void refresh()
    }, pollMs)

    return () => {
      cancelled = true
      window.clearInterval(poll)
      void supabase.removeChannel(ch)
    }
  }, [supabase, roomId, refresh])

  const mergeAndSave = useCallback(
    async (patch: (prev: RoomData) => RoomData) => {
      if (!supabase || !roomId) return
      const { data: row, error: selErr } = await supabase
        .from(TABLE)
        .select('data')
        .eq('room_id', roomId)
        .maybeSingle()
      if (selErr) {
        setError(selErr.message)
        return
      }
      const base = row?.data ? parseRowData(row.data) : emptyRoomData()
      const next = patch(structuredClone(base))
      setData(next)
      await saveRoomData(next)
    },
    [supabase, roomId, saveRoomData],
  )

  const joinAs = useCallback(
    (playerId: string, displayName: string) => {
      void mergeAndSave((prev) => {
        const next = { ...prev, names: { ...prev.names } }
        next.names[playerId] = displayName.trim().slice(0, 40)
        if (!(playerId in next.votes)) next.votes = { ...next.votes, [playerId]: null }
        return next
      })
    },
    [mergeAndSave],
  )

  const setVote = useCallback(
    (playerId: string, value: number | null) => {
      void mergeAndSave((prev) => ({
        ...prev,
        votes: { ...prev.votes, [playerId]: value },
      }))
    },
    [mergeAndSave],
  )

  const setRevealed = useCallback(
    (revealed: boolean) => {
      void mergeAndSave((prev) => ({ ...prev, revealed }))
    },
    [mergeAndSave],
  )

  const resetRound = useCallback(() => {
    void mergeAndSave((prev) => {
      const votes: Record<string, number | null> = {}
      for (const id of Object.keys(prev.names)) votes[id] = null
      return { ...prev, revealed: false, votes }
    })
  }, [mergeAndSave])

  return {
    data,
    loading,
    error,
    refresh,
    joinAs,
    setVote,
    setRevealed,
    resetRound,
  }
}
