import { useState } from 'react'
import type { NetOsdItem, PostFn, ReceiverState } from '../types'

interface Props {
  state: ReceiverState
  post: PostFn
}

const EMPTY_ITEMS: NetOsdItem[] = Array.from({ length: 7 }, (_, i) => ({
  index: i + 1,
  text: '',
  is_selected: false,
  is_playing: false,
  is_folder: false,
}))

const NET_SOURCES = new Set(['IRADIO', 'IRP', 'NET', 'SERVER', 'FAVORITES', 'USB', 'USB/IPOD'])

const REMOTE_NAV_BUTTONS: { action: string; label: string; title: string }[] = [
  { action: 'left', label: '← Back', title: 'Back / Left (NS92)' },
  { action: 'up', label: '↑ Up', title: 'Cursor Up (NS90)' },
  { action: 'enter', label: '⏎ Enter', title: 'Enter / Select (NS94)' },
  { action: 'down', label: '↓ Down', title: 'Cursor Down (NS91)' },
  { action: 'right', label: '→ Right', title: 'Cursor Right (NS93)' },
]

function parsePageInfo(statusLine: string): { current: number; total: number } | null {
  const match = statusLine.match(/(\d+)\s*\/\s*(\d+)/)
  if (!match) return null
  const current = Number(match[1])
  const total = Number(match[2])
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 1) return null
  return { current, total }
}

export default function NetOsdControl({ state, post }: Props) {
  const [busy, setBusy] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [showRemote, setShowRemote] = useState(false)

  const osd = state.net_osd
  const rawTitle = osd?.title?.trim() || ''
  const items = osd?.items?.length ? osd.items : EMPTY_ITEMS
  const statusLine = osd?.status_line?.trim() || ''

  const visibleItems = items.filter(
    item => item.text.trim() !== '' || item.is_selected,
  )
  const hasCursor = items.some(item => item.is_selected)
  const isNowPlaying = !hasCursor && /^now playing/i.test(rawTitle)
  const isSearchPrompt =
    rawTitle.toLowerCase() === 'station' &&
    visibleItems.some(item => /abcdefghijklm|nopqrstuvwxyz/i.test(item.text))
  const isNetSource = Boolean(state.source && NET_SOURCES.has(state.source))
  const pageInfo = !isNowPlaying && !isSearchPrompt ? parsePageInfo(statusLine) : null

  const headerTitle = isSearchPrompt
    ? 'Search Stations'
    : isNowPlaying
      ? 'Now Playing'
      : rawTitle || 'Internet Radio'

  const runAction = async (fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const switchSource = (source: 'IRADIO' | 'NET') =>
    runAction(() => post('/net/switch-source', { source }))

  const refreshOsd = () => runAction(() => post('/net/refresh'))

  const sendNav = (action: string) => runAction(() => post('/net/nav', { action }))

  const selectRow = (targetIndex: number) => {
    if (!hasCursor) return
    void runAction(() => post('/net/select-row', { target_index: targetIndex }))
  }

  const recallPreset = (preset: string) =>
    runAction(() => post('/net/preset', { preset }))

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = keyword.trim()
    if (!trimmed) return
    void runAction(async () => {
      const res = await post('/net/search', { keyword: trimmed })
      if (res.ok) setKeyword('')
    })
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        {/* Clean Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {(visibleItems.length > 0 || isNowPlaying || isSearchPrompt) && (
              <button
                type="button"
                onClick={() => sendNav('left')}
                disabled={busy}
                aria-label="Back"
                title="Back"
                className="p-2 -ml-1 rounded-lg bg-denon-surface/70 text-denon-muted hover:text-denon-text hover:bg-denon-surface transition-all active:scale-95 disabled:opacity-50 shrink-0"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            )}
            <h2 className="text-base font-semibold text-denon-text truncate">
              {headerTitle}
            </h2>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!isNetSource && (
              <button
                type="button"
                onClick={() => switchSource('IRADIO')}
                disabled={busy}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-denon-gold/15 text-denon-gold hover:bg-denon-gold/25 border border-denon-gold/30 transition-all active:scale-95 disabled:opacity-50"
              >
                Switch to Radio
              </button>
            )}
            <button
              type="button"
              onClick={refreshOsd}
              disabled={busy}
              aria-label="Refresh"
              title="Refresh"
              className="p-2 rounded-lg bg-denon-surface/70 text-denon-muted hover:text-denon-text hover:bg-denon-surface transition-all active:scale-95 disabled:opacity-50"
            >
              <svg
                className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M1 4v6h6M23 20v-6h-6" />
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Main View: Search / Player / List / Empty */}
        {isSearchPrompt ? (
          <form onSubmit={submitSearch} className="space-y-3 py-2">
            <p className="text-xs text-denon-muted">
              Enter a station name or keyword to search.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                autoFocus
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                maxLength={30}
                placeholder="Search station by keyword..."
                aria-label="Search station by keyword"
                className="flex-1 min-w-0 bg-denon-surface/80 border border-denon-gold/40 rounded-xl px-3 py-2.5 text-sm text-denon-text placeholder:text-denon-muted/60 focus:outline-none focus:border-denon-gold"
              />
              <button
                type="submit"
                disabled={busy || !keyword.trim()}
                className="btn-primary text-xs px-4 py-2.5 shrink-0"
              >
                Search
              </button>
            </div>
          </form>
        ) : isNowPlaying ? (
          <div className="space-y-4" data-testid="net-osd-now-playing">
            <div className="rounded-xl bg-denon-surface/50 border border-denon-border/40 p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-denon-green uppercase tracking-wider">
                  ▶ Playing
                </span>
                {statusLine && (
                  <span className="text-[11px] text-denon-muted font-mono">{statusLine}</span>
                )}
              </div>
              {visibleItems.length > 0 ? (
                <div className="space-y-1">
                  {visibleItems.map((item, idx) => (
                    <p
                      key={item.index}
                      className={
                        idx === 0
                          ? 'text-base font-semibold text-denon-text truncate'
                          : 'text-xs text-denon-muted truncate'
                      }
                    >
                      {item.text}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-denon-muted">Connecting to stream…</p>
              )}
            </div>

            {/* Player Transport Controls */}
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => sendNav('prev')}
                disabled={busy}
                aria-label="Previous"
                title="Previous"
                className="w-11 h-11 rounded-xl bg-denon-surface/70 text-denon-muted hover:text-denon-text hover:bg-denon-surface transition-all active:scale-95 flex items-center justify-center disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => sendNav('play_pause')}
                disabled={busy}
                aria-label="Play / Pause"
                title="Play / Pause"
                className="w-14 h-14 rounded-2xl bg-gradient-to-br from-denon-gold to-amber-600 text-denon-dark shadow-lg shadow-denon-gold/25 hover:brightness-110 transition-all active:scale-95 flex items-center justify-center disabled:opacity-50"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => sendNav('stop')}
                disabled={busy}
                aria-label="Stop"
                title="Stop"
                className="w-11 h-11 rounded-xl bg-denon-surface/70 text-denon-muted hover:text-denon-text hover:bg-denon-surface transition-all active:scale-95 flex items-center justify-center disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 6h12v12H6z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => sendNav('next')}
                disabled={busy}
                aria-label="Next"
                title="Next"
                className="w-11 h-11 rounded-xl bg-denon-surface/70 text-denon-muted hover:text-denon-text hover:bg-denon-surface transition-all active:scale-95 flex items-center justify-center disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                </svg>
              </button>
            </div>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="rounded-xl bg-denon-surface/40 border border-denon-border/40 py-8 px-4 text-center space-y-3">
            <p className="text-sm text-denon-muted">
              {isNetSource
                ? 'Waiting for station menu from receiver…'
                : 'Switch the receiver to Internet Radio to browse and play stations.'}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => switchSource('IRADIO')}
                disabled={busy}
                className="btn-primary text-xs py-2 px-4"
              >
                📻 Open Internet Radio
              </button>
              {isNetSource && (
                <button
                  type="button"
                  onClick={refreshOsd}
                  disabled={busy}
                  className="btn-ghost text-xs py-2 px-3"
                >
                  Refresh
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5" role="list" aria-label="Radio stations and folders">
              {visibleItems.map(item => {
                const clickable = hasCursor && !busy
                return (
                  <button
                    key={item.index}
                    type="button"
                    onClick={() => selectRow(item.index)}
                    disabled={!clickable}
                    aria-current={item.is_selected ? 'true' : undefined}
                    className={`w-full min-h-[44px] px-3 py-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                      item.is_selected
                        ? 'bg-denon-gold/15 border-denon-gold/40 text-denon-gold'
                        : 'bg-denon-surface/60 border-denon-border/30 text-denon-text'
                    } ${
                      clickable
                        ? 'hover:bg-denon-surface active:scale-[0.99] cursor-pointer'
                        : 'cursor-default'
                    }`}
                  >
                    <span className="w-5 text-center text-xs text-denon-muted shrink-0">
                      {item.is_folder ? '📁' : item.is_playing ? '♪' : '📻'}
                    </span>
                    <span className="flex-1 text-sm font-medium truncate">
                      {item.text || '—'}
                    </span>
                    {item.is_folder && (
                      <span className="text-sm text-denon-muted shrink-0" aria-hidden="true">
                        ›
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {pageInfo && (
              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => sendNav('page_up')}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg bg-denon-surface/70 hover:bg-denon-surface text-xs font-medium text-denon-text transition-all active:scale-95 disabled:opacity-50"
                >
                  ‹ Prev Page
                </button>
                <span className="text-xs text-denon-muted font-mono" data-testid="net-osd-status">
                  {pageInfo.current} / {pageInfo.total}
                </span>
                <button
                  type="button"
                  onClick={() => sendNav('page_down')}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg bg-denon-surface/70 hover:bg-denon-surface text-xs font-medium text-denon-text transition-all active:scale-95 disabled:opacity-50"
                >
                  Next Page ›
                </button>
              </div>
            )}
          </div>
        )}

        {/* Quick Select 1–4 */}
        <div className="pt-3 border-t border-denon-border/40 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-denon-muted uppercase tracking-wider">
              Quick Select
            </span>
            <button
              type="button"
              onClick={() => setShowRemote(v => !v)}
              aria-expanded={showRemote}
              className="text-[11px] text-denon-muted hover:text-denon-text transition-colors"
            >
              {showRemote ? 'Hide remote ▴' : 'Remote controls ▾'}
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {[1, 2, 3, 4].map(slot => (
              <button
                key={slot}
                type="button"
                onClick={() => recallPreset(`MSQUICK${slot}`)}
                disabled={busy}
                className="min-h-[40px] px-2 py-1.5 rounded-xl bg-denon-surface/70 hover:bg-denon-surface text-xs font-medium text-denon-text transition-all active:scale-95 disabled:opacity-50"
              >
                Quick {slot}
              </button>
            ))}
          </div>

          {/* Collapsible Advanced Remote Controls */}
          {showRemote && (
            <div className="pt-2 space-y-2 border-t border-denon-border/30">
              <div className="grid grid-cols-5 gap-1.5">
                {REMOTE_NAV_BUTTONS.map(btn => (
                  <button
                    key={btn.action}
                    type="button"
                    onClick={() => sendNav(btn.action)}
                    disabled={busy}
                    title={btn.title}
                    className="min-h-[38px] px-1.5 py-1.5 rounded-lg bg-denon-surface/80 text-denon-text hover:bg-denon-surface text-[11px] font-medium transition-all active:scale-95 disabled:opacity-50"
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {[1, 2, 3, 4].map(slot => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => recallPreset(`ZMFAVORITE${slot}`)}
                    disabled={busy}
                    className="flex-1 min-w-[60px] py-1.5 rounded-lg bg-denon-surface/60 hover:bg-denon-surface text-[11px] text-denon-muted hover:text-denon-text transition-all disabled:opacity-50"
                  >
                    Fav {slot}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => switchSource('NET')}
                  disabled={busy}
                  className="px-2.5 py-1.5 rounded-lg bg-denon-surface/60 hover:bg-denon-surface text-[11px] text-denon-muted hover:text-denon-text transition-all disabled:opacity-50"
                >
                  Online Music
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
