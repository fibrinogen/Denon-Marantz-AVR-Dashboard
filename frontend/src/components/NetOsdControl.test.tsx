import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import NetOsdControl from './NetOsdControl'
import type { ReceiverState } from '../types'

const okPost = () => vi.fn(async () => ({ ok: true, status: 200 }))

const menuState: ReceiverState = {
  connected: true,
  heos_connected: false,
  source: 'IRADIO',
  net_osd: {
    title: 'Internet Radio',
    status_line: '1/15',
    items: [
      { index: 1, text: 'My Favorites', is_selected: true, is_playing: false, is_folder: true },
      { index: 2, text: 'WDR 2 Köln', is_selected: false, is_playing: true, is_folder: false },
      { index: 3, text: 'Deutschlandfunk', is_selected: false, is_playing: false, is_folder: false },
      { index: 4, text: '', is_selected: false, is_playing: false, is_folder: false },
      { index: 5, text: '', is_selected: false, is_playing: false, is_folder: false },
      { index: 6, text: '', is_selected: false, is_playing: false, is_folder: false },
      { index: 7, text: '', is_selected: false, is_playing: false, is_folder: false },
    ],
  },
}

describe('NetOsdControl', () => {
  it('renders OSD title, menu items, status line, and Legacy Mode badge', () => {
    render(<NetOsdControl state={menuState} post={okPost()} />)
    expect(screen.getByText('Internet Radio')).toBeInTheDocument()
    expect(screen.getByText('Legacy Mode')).toBeInTheDocument()
    expect(screen.getByText('My Favorites')).toBeInTheDocument()
    expect(screen.getByText('WDR 2 Köln')).toBeInTheDocument()
    expect(screen.getByText('♪')).toBeInTheDocument()
    expect(screen.getByTestId('net-osd-status')).toHaveTextContent('1/15')
  })

  it('calls select-row when clicking a menu row with an active cursor', async () => {
    const post = okPost()
    render(<NetOsdControl state={menuState} post={post} />)
    fireEvent.click(screen.getByRole('button', { name: /Deutschlandfunk/ }))
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/net/select-row', { target_index: 3 })
    })
  })

  it('renders clean Now Playing view and omits empty playing rows', () => {
    const post = okPost()
    const nowPlayingState: ReceiverState = {
      ...menuState,
      net_osd: {
        title: 'Now Playing',
        status_line: '0:00 100%',
        items: [
          { index: 1, text: '', is_selected: false, is_playing: true, is_folder: false },
          { index: 2, text: '', is_selected: false, is_playing: true, is_folder: false },
          { index: 3, text: '48kHz', is_selected: false, is_playing: true, is_folder: false },
          { index: 4, text: '', is_selected: false, is_playing: false, is_folder: false },
          { index: 5, text: '0:00 100%', is_selected: false, is_playing: false, is_folder: false },
          { index: 6, text: '', is_selected: false, is_playing: false, is_folder: false },
          { index: 7, text: '', is_selected: false, is_playing: false, is_folder: false },
        ],
      },
    }
    render(<NetOsdControl state={nowPlayingState} post={post} />)
    expect(screen.getByTestId('net-osd-now-playing')).toBeInTheDocument()
    expect(screen.getByText('48kHz')).toBeInTheDocument()
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  it('dispatches source switch, refresh, navigation, transport, and preset actions', async () => {
    const post = okPost()
    render(<NetOsdControl state={menuState} post={post} />)

    fireEvent.click(screen.getByRole('button', { name: /Internetradio/ }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/net/switch-source', { source: 'IRADIO' }))

    fireEvent.click(screen.getByRole('button', { name: 'Refresh OSD' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/net/refresh'))

    fireEvent.click(screen.getByTitle('Cursor Down (NS91)'))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/net/nav', { action: 'down' }))

    fireEvent.click(screen.getByTitle('Play / Pause (NS9A)'))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/net/nav', { action: 'play_pause' }))

    fireEvent.click(screen.getByRole('button', { name: 'Fav 2' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/net/preset', { preset: 'ZMFAVORITE2' }))

    fireEvent.click(screen.getByRole('button', { name: 'Quick Select' }))
    fireEvent.click(screen.getByRole('button', { name: 'Quick 3' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/net/preset', { preset: 'MSQUICK3' }))
  })

  it('auto-opens keyword search input on Station search screen and submits POST /net/search', async () => {
    const post = okPost()
    const searchPromptState: ReceiverState = {
      ...menuState,
      net_osd: {
        title: 'Station',
        status_line: '[ 2/2 ]',
        items: [
          { index: 1, text: 'a', is_selected: false, is_playing: false, is_folder: false },
          { index: 2, text: 'abcdefghijklm', is_selected: false, is_playing: false, is_folder: false },
          ...menuState.net_osd!.items.slice(2),
        ],
      },
    }
    render(<NetOsdControl state={searchPromptState} post={post} />)
    const input = screen.getByLabelText('Search station by keyword')
    fireEvent.change(input, { target: { value: 'wdr 2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/net/search', { keyword: 'wdr 2' })
    })
  })
})
