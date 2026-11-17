import { useState } from 'react'
import type { NetOsdItem, PostFn, ReceiverState } from '../types'

interface Props {
  state: ReceiverState
  post: PostFn
}

type PresetBank = 'favorite' | 'quick'

const EMPTY_ITEMS: NetOsdItem[] = Array.from({ length: 7 }, (_, i) => ({
  index: i + 1,
  text: '',
  is_selected: false,
  is_playing: false,
  is_folder: false,
}))

const NAV_BUTTONS: { action: string; label: string; title: string }[] = [
  { action: 'left', label: '← Back', title: 'Back / Left (NS92)' },
  { action: 'up', label: '↑ Up', title: 'Cursor Up (NS90)' },
  { action: 'enter', label: '⏎ Enter', title: 'Enter / Select (NS94)' },
  { action: 'down', label: '↓ Down', title: 'Cursor Down (NS91)' },
  { action: 'right', label: '→ Right', title: 'Cursor Right (NS93)' },
]

const TRANSPORT_BUTTONS: { action: string; label: string; title: string }[] = [
  { action: 'prev', label: '⏮', title: 'Previous (NS9E)' },
  { action: 'play_pause', label: '⏯', title: 'Play / Pause (NS9A)' },
  { action: 'stop', label: '⏹', title: 'Stop (NS9C)' },
  { action: 'next', label: '⏭', title: 'Next (NS9D)' },
]

export default function NetOsdControl({ state, post }: Props) {
  const [busy, setBusy] = useState(false)
  const [presetBank, setPresetBank] = useState<PresetBank>('favorite')
  const [searchOpen, setSearchOpen] = useState(false)
  const [keyword, setKeyword] = useState('')

  const osd = state.net_osd
  const title = osd?.title?.trim() || 'Net / Radio (Telnet)'
  const items = osd?.items?.length ? osd.items : EMPTY_ITEMS
  const statusLine = osd?.status_line?.trim() || ''

  const visibleItems = items.filter(
    item => item.text.trim() !== '' || item.is_selected,
  )
  const hasCursor = items.some(item => item.is_selected)
  const isNowPlaying = !hasCursor && /^now playing/i.test(title)
  const isSearchPrompt =
    title.toLowerCase() === 'station' &&
    visibleItems.some(item => /abcdefghijklm|nopqrstuvwxyz/i.test(item.text))
  const showSearchBox = isSearchPrompt || searchOpen
  const heosUp = state.heos_connected === true

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

  const recallPreset = (slot: number) => {
    const preset = presetBank === 'favorite' ? `ZMFAVORITE${slot}` : `MSQUICK${slot}`
    void runAction(() => post('/net/preset', { preset }))
  }

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
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-denon-muted uppercase tracking-wider">
                Telnet OSD
              </span>
              {!heosUp && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-denon-gold/15 text-denon-gold font-medium">
                  Legacy Mode
                </span>
              )}
              {state.source && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-denon-surface text-denon-muted font-mono">
                  {state.source}
                </span>
              )}
            </div>
            <h2 className="text-base font-semibold text-denon-text truncate mt-0.5">
              {title}
            </h2>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => switchSource('IRADIO')}
              disabled={busy}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-denon-gold/15 text-denon-gold hover:bg-denon-gold/25 border border-denon-gold/30 transition-all active:scale-95 disabled:opacity-50"
              title="Switch to Internet Radio (SIIRADIO)"
            >
              📻 Internetradio
            </button>
            <button
              type="button"
              onClick={() => switchSource('NET')}
              disabled={busy}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-denon-surface text-denon-text hover:bg-denon-border transition-all active:scale-95 disabled:opacity-50"
              title="Switch to Online Music / NET (SINET)"
            >
              🌐 Net
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen(v => !v)}
              aria-pressed={showSearchBox}
              aria-label="Toggle keyword search"
              title="Search by Keyword"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 ${
                showSearchBox
                  ? 'bg-denon-gold/20 text-denon-gold border border-denon-gold/40'
                  : 'bg-denon-surface text-denon-text hover:bg-denon-border'
              }`}
            >
              🔍
            </button>
            <button
              type="button"
              onClick={refreshOsd}
              disabled={busy}
              aria-label="Refresh OSD"
              title="Refresh OSD (NSE)"
              className="p-2 rounded-lg bg-denon-surface text-denon-muted hover:text-denon-text hover:bg-denon-border transition-all active:scale-95 disabled:opacity-50"
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

        {/* Keyword Search Input (shown automatically on AVR Station search prompt or via toggle) */}
        {showSearchBox && (
          <form onSubmit={submitSearch} className="space-y-1.5">
            <div className="flex gap-2">
              <input
                type="text"
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                maxLength={30}
                placeholder="Search station by keyword..."
                aria-label="Search station by keyword"
                className="flex-1 min-w-0 bg-denon-surface/80 border border-denon-gold/40 rounded-xl px-3 py-2 text-sm text-denon-text placeholder:text-denon-muted/60 focus:outline-none focus:border-denon-gold"
              />
              <button
                type="submit"
                disabled={busy || !keyword.trim()}
                className="btn-primary text-xs px-4 py-2 shrink-0"
              >
                Search
              </button>
            </div>
            {isSearchPrompt && (
              <p className="text-[11px] text-denon-gold/90">
                Receiver is waiting for a keyword — enter your search term above and press Search.
              </p>
            )}
          </form>
        )}

        {/* OSD List / Now Playing (NSE1–NSE7) */}
        {visibleItems.length === 0 ? (
          <div className="rounded-xl bg-denon-surface/40 border border-denon-border/40 py-8 px-4 text-center space-y-3">
            <p className="text-sm text-denon-muted">
              No OSD lines received yet. Switch to Internet Radio or refresh the display.
            </p>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={() => switchSource('IRADIO')}
                disabled={busy}
                className="btn-primary text-xs py-2 px-3"
              >
                Switch to Internetradio
              </button>
              <button
                type="button"
                onClick={refreshOsd}
                disabled={busy}
                className="btn-ghost text-xs py-2 px-3"
              >
                Refresh OSD
              </button>
            </div>
          </div>
        ) : isNowPlaying ? (
          <div
            className="rounded-xl bg-denon-green/5 border border-denon-green/25 p-4 space-y-2"
            data-testid="net-osd-now-playing"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-denon-green uppercase tracking-wider">
                ▶ Playing
              </span>
              {statusLine && (
                <span className="text-[11px] text-denon-muted font-mono">{statusLine}</span>
              )}
            </div>
            <div className="space-y-1">
              {visibleItems.map((item, idx) => (
                <p
                  key={item.index}
                  className={
                    idx === 0
                      ? 'text-sm font-semibold text-denon-text truncate'
                      : 'text-xs text-denon-muted truncate'
                  }
                >
                  {item.text}
                </p>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-1.5" role="list" aria-label="Receiver OSD menu">
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
                      ? 'bg-denon-gold/15 border-denon-gold/40 text-denon-gold shadow-sm'
                      : 'bg-denon-surface/60 border-denon-border/30 text-denon-text'
                  } ${
                    clickable
                      ? 'hover:bg-denon-surface active:scale-[0.99] cursor-pointer'
                      : 'cursor-default'
                  }`}
                >
                  <span className="w-5 text-center text-xs font-mono text-denon-muted shrink-0">
                    {item.is_folder ? '📁' : item.is_playing ? '♪' : `${item.index}.`}
                  </span>
                  <span className="flex-1 text-sm font-medium truncate">
                    {item.text || '—'}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.is_folder && (
                      <span className="text-xs text-denon-muted" aria-hidden="true">
                        ›
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Navigation & Transport Bar */}
        <div className="space-y-2 pt-1 border-t border-denon-border/40">
          <div className="grid grid-cols-5 gap-1.5">
            {NAV_BUTTONS.map(btn => (
              <button
                key={btn.action}
                type="button"
                onClick={() => sendNav(btn.action)}
                disabled={busy}
                title={btn.title}
                className={`min-h-[42px] px-2 py-2 rounded-xl text-xs font-medium transition-all active:scale-95 disabled:opacity-50 ${
                  btn.action === 'enter'
                    ? 'bg-denon-gold/20 text-denon-gold border border-denon-gold/40 hover:bg-denon-gold/30'
                    : 'bg-denon-surface/80 text-denon-text hover:bg-denon-surface'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {TRANSPORT_BUTTONS.map(btn => (
              <button
                key={btn.action}
                type="button"
                onClick={() => sendNav(btn.action)}
                disabled={busy}
                title={btn.title}
                aria-label={btn.title}
                className="min-h-[42px] rounded-xl bg-denon-surface/70 text-denon-text hover:bg-denon-surface text-base transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center"
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Footer: Status line (NSE8) & Presets */}
        <div className="pt-2 border-t border-denon-border/40 space-y-2.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1 bg-denon-surface/60 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setPresetBank('favorite')}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  presetBank === 'favorite'
                    ? 'bg-denon-gold/20 text-denon-gold'
                    : 'text-denon-muted hover:text-denon-text'
                }`}
              >
                Favorites
              </button>
              <button
                type="button"
                onClick={() => setPresetBank('quick')}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  presetBank === 'quick'
                    ? 'bg-denon-gold/20 text-denon-gold'
                    : 'text-denon-muted hover:text-denon-text'
                }`}
              >
                Quick Select
              </button>
            </div>
            <span className="text-denon-muted font-mono truncate" data-testid="net-osd-status">
              {statusLine || '—'}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {[1, 2, 3, 4].map(slot => (
              <button
                key={slot}
                type="button"
                onClick={() => recallPreset(slot)}
                disabled={busy}
                title={
                  presetBank === 'favorite'
                    ? `Favorite ${slot} (ZMFAVORITE${slot})`
                    : `Quick Select ${slot} (MSQUICK${slot})`
                }
                className="min-h-[40px] px-2 py-1.5 rounded-xl bg-denon-surface/70 hover:bg-denon-surface text-xs font-medium text-denon-text transition-all active:scale-95 disabled:opacity-50"
              >
                {presetBank === 'favorite' ? `Fav ${slot}` : `Quick ${slot}`}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
