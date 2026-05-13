import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePlanningRoom } from './hooks/usePlanningRoom'
import { isSupabaseConfigured } from './lib/supabase'
import { CARD_VALUES, normalizeRoomId } from './types/room'
import './App.css'

const PLAYER_STORAGE = 'pp-player-id'

function readInitialRoom(): string {
  try {
    const q = new URLSearchParams(window.location.search).get('room')
    return q ? normalizeRoomId(q) : ''
  } catch {
    return ''
  }
}

function setRoomInUrl(roomId: string) {
  const url = new URL(window.location.href)
  if (roomId) url.searchParams.set('room', roomId)
  else url.searchParams.delete('room')
  window.history.replaceState({}, '', url.toString())
}

function getOrCreatePlayerId(): string {
  try {
    let id = sessionStorage.getItem(PLAYER_STORAGE)
    if (!id) {
      id = crypto.randomUUID()
      sessionStorage.setItem(PLAYER_STORAGE, id)
    }
    return id
  } catch {
    return crypto.randomUUID()
  }
}

export default function App() {
  const configured = useMemo(() => isSupabaseConfigured(), [])
  const [playerId] = useState(getOrCreatePlayerId)

  const [lobbyRoom, setLobbyRoom] = useState(readInitialRoom)
  const [lobbyName, setLobbyName] = useState('')
  const [activeRoom, setActiveRoom] = useState<string | null>(null)

  const roomId = activeRoom
  const { data, loading, error, refresh, joinAs, setVote, setRevealed, resetRound } =
    usePlanningRoom(configured ? roomId : null)

  const joinedRef = useRef(false)

  useEffect(() => {
    joinedRef.current = false
  }, [roomId])

  useEffect(() => {
    if (!roomId || !data || !lobbyName.trim()) return
    if (joinedRef.current) return
    joinedRef.current = true
    joinAs(playerId, lobbyName.trim())
  }, [roomId, data, lobbyName, playerId, joinAs])

  const onEnterLobby = (e: FormEvent) => {
    e.preventDefault()
    const id = normalizeRoomId(lobbyRoom)
    if (!id || !lobbyName.trim()) return
    setActiveRoom(id)
    setRoomInUrl(id)
  }

  const leaveRoom = () => {
    setActiveRoom(null)
    joinedRef.current = false
    setRoomInUrl('')
  }

  const copyInvite = useCallback(async () => {
    if (!roomId) return
    const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomId)}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.prompt('Copy room link:', url)
    }
  }, [roomId])

  const players = useMemo(() => {
    if (!data) return []
    return Object.keys(data.names)
      .map((id) => ({
        id,
        name: data.names[id] ?? 'Player',
        vote: data.votes[id] ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [data])

  const allVoted =
    players.length > 0 && players.every((p) => p.vote !== null && p.vote !== undefined)

  const voteAverage = useMemo(() => {
    if (!data?.revealed) return null
    const nums = players
      .map((p) => p.vote)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    if (nums.length === 0) return null
    const sum = nums.reduce((a, b) => a + b, 0)
    return { average: sum / nums.length, count: nums.length }
  }, [data?.revealed, players])

  if (!configured) {
    return (
      <div className="shell">
        <header className="top">
          <h1>Planning poker</h1>
          <p className="lede">
            Add Supabase environment variables so the app can sync votes in real time. Create a
            free project, run the SQL in <code>supabase/schema.sql</code>, then set the keys below in
            Vercel (or <code>.env.local</code> locally). For <code>VITE_SUPABASE_URL</code>, use the
            value from Supabase → API labeled <strong>Project URL</strong> only (it ends in{' '}
            <code>.supabase.co</code> — do not add <code>/rest/v1</code>; the client adds that).
          </p>
        </header>
        <section className="panel">
          <h2>Required variables</h2>
          <ul className="env-list">
            <li>
              <code>VITE_SUPABASE_URL</code>
            </li>
            <li>
              <code>VITE_SUPABASE_ANON_KEY</code>
            </li>
          </ul>
        </section>
      </div>
    )
  }

  if (!activeRoom) {
    return (
      <div className="shell">
        <header className="top">
          <h1>Planning poker</h1>
          <p className="lede">
            Pick a room name and your display name. Share the link after you join so the team can
            estimate together. Cards are 1–8; numbers stay hidden in the team list until Show votes.
            The table then shows each vote and the average.
          </p>
        </header>
        <form className="panel form" onSubmit={onEnterLobby}>
          <label className="field">
            <span>Room</span>
            <input
              autoComplete="off"
              placeholder="e.g. sprint-42"
              value={lobbyRoom}
              onChange={(e) => setLobbyRoom(e.target.value)}
              maxLength={56}
            />
          </label>
          <label className="field">
            <span>Your name</span>
            <input
              autoComplete="name"
              placeholder="Alex"
              value={lobbyName}
              onChange={(e) => setLobbyName(e.target.value)}
              maxLength={40}
            />
          </label>
          <button type="submit" className="btn primary" disabled={!normalizeRoomId(lobbyRoom) || !lobbyName.trim()}>
            Join room
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="shell">
      <header className="top bar">
        <div>
          <h1>Room: {roomId}</h1>
          <p className="meta">
            You are <strong>{lobbyName.trim() || '…'}</strong>
            {loading ? ' · Syncing…' : ''}
          </p>
        </div>
        <div className="bar-actions">
          <button type="button" className="btn" onClick={copyInvite}>
            Copy invite link
          </button>
          <button type="button" className="btn ghost" onClick={leaveRoom}>
            Leave
          </button>
        </div>
      </header>

      {error && (
        <div className="banner error" role="alert">
          {error}{' '}
          <button type="button" className="linkish" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      )}

      <section className="panel controls">
        <div className="status-row">
          <span className={`pill ${data?.revealed ? 'on' : ''}`}>
            {data?.revealed ? 'Votes visible' : 'Votes hidden'}
          </span>
          {allVoted && !data?.revealed && <span className="pill hint">Everyone voted</span>}
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn primary"
            onClick={() => setRevealed(true)}
            disabled={!data || data.revealed}
          >
            Show votes
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setRevealed(false)}
            disabled={!data || !data.revealed}
          >
            Hide votes
          </button>
          <button type="button" className="btn danger" onClick={() => resetRound()} disabled={!data}>
            New round
          </button>
        </div>
      </section>

      <section className="panel">
        <h2 className="section-title">Your vote</h2>
        <p className="hint-text">
          Your selection is highlighted on the cards below. Nobody sees any numbers in the team
          list until someone presses Show votes.
        </p>
        <div className="cards">
          {CARD_VALUES.map((n) => (
            <button
              key={n}
              type="button"
              className={`card ${data?.votes[playerId] === n ? 'picked' : ''}`}
              onClick={() => setVote(playerId, n)}
              disabled={data?.revealed}
              aria-pressed={data?.votes[playerId] === n}
            >
              {n}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn ghost small-margin"
          disabled={data?.revealed || data?.votes[playerId] == null}
          onClick={() => setVote(playerId, null)}
        >
          Clear my vote
        </button>
      </section>

      <section className="panel">
        <h2 className="section-title">Team</h2>
        {players.length === 0 ? (
          <p className="hint-text">Waiting for players…</p>
        ) : (
          <ul className="roster">
            {players.map((p) => {
              const show = data?.revealed
              const v = p.vote
              let label: string
              if (show) {
                label = v == null ? '—' : String(v)
              } else {
                label = v == null ? '—' : 'Ready'
              }
              return (
                <li key={p.id} className="roster-row">
                  <span className="roster-name">
                    {p.name}
                    {p.id === playerId ? ' (you)' : ''}
                  </span>
                  <span className={`roster-vote ${show ? 'revealed' : ''}`}>{label}</span>
                </li>
              )
            })}
          </ul>
        )}
        {data?.revealed && voteAverage != null && (
          <p className="average-line" aria-live="polite">
            <strong>Average</strong> across {voteAverage.count} vote
            {voteAverage.count === 1 ? '' : 's'}:{' '}
            <span className="average-value">{voteAverage.average.toFixed(1)}</span>
          </p>
        )}
      </section>
    </div>
  )
}
