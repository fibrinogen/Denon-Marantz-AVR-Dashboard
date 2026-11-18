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
    status_line: '2/23',
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
  it('renders clean folder/station list and page controls without protocol jargon', () => {
    render(<NetOsdControl state={menuState} post={okPost()} />)
    expect(screen.getByText('Internet Radio')).toBeInTheDocument()
    expect(screen.queryByText('Legacy Mode')).not.toBeInTheDocument()
    expect(screen.queryByText('IRADIO')).not.toBeInTheDocument()
    expect(screen.getByText('My Favorites')).toBeInTheDocument()
    expect(screen.getByText('WDR 2 Köln')).toBeInTheDocument()
    expect(screen.getByTestId('net-osd-status')).toHaveTextContent('2 / 23')
    expect(screen.queryByTitle('Cursor Down (NS91)')).not.toBeInTheDocument()
  })

  it('calls select-row when clicking a station or folder row', async () => {
    const post = okPost()
    render(<NetOsdControl state={menuState} post={post} />)
    fireEvent.click(screen.getByRole('button', { name: /Deutschlandfunk/ }))
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/net/select-row', { target_index: 3 })
    })
  })

  it('supports back, refresh, page navigation, and Quick Select', async () => {
    const post = okPost()
    render(<NetOsdControl state={menuState} post={post} />)

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/net/nav', { action: 'left' }))

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/net/refresh'))

    fireEvent.click(screen.getByRole('button', { name: /Next Page/ }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/net/nav', { action: 'page_down' }))

    fireEvent.click(screen.getByRole('button', { name: /Prev Page/ }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/net/nav', { action: 'page_up' }))

    fireEvent.click(screen.getByRole('button', { name: 'Quick 3' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/net/preset', { preset: 'MSQUICK3' }))
  })

  it('renders clean Now Playing player card with transport controls', async () => {
    const post = okPost()
    const nowPlayingState: ReceiverState = {
      ...menuState,
      source: 'IRP',
      net_osd: {
        title: 'Now Playing',
        status_line: '0:00 100%',
        items: [
          { index: 1, text: '', is_selected: false, is_playing: true, is_folder: false },
          { index: 2, text: 'Mega Sunshine', is_selected: false, is_playing: true, is_folder: false },
          { index: 3, text: '48kHz', is_selected: false, is_playing: true, is_folder: false },
          ...menuState.net_osd!.items.slice(3),
        ],
      },
    }
    render(<NetOsdControl state={nowPlayingState} post={post} />)
    expect(screen.getByTestId('net-osd-now-playing')).toBeInTheDocument()
    expect(screen.getByText('Mega Sunshine')).toBeInTheDocument()
    expect(screen.getByText('48kHz')).toBeInTheDocument()
    expect(screen.queryByText('—')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/net/nav', { action: 'stop' }))
  })

  it('shows clean keyword search screen without alphabet rows and submits POST /net/search', async () => {
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
    expect(screen.getByText('Search Stations')).toBeInTheDocument()
    expect(screen.queryByText('abcdefghijklm')).not.toBeInTheDocument()

    const input = screen.getByLabelText('Search station by keyword')
    fireEvent.change(input, { target: { value: 'sunshine' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/net/search', { keyword: 'sunshine' })
    })
  })

  it('reveals advanced remote controls only when toggled', async () => {
    const post = okPost()
    render(<NetOsdControl state={menuState} post={post} />)

    fireEvent.click(screen.getByRole('button', { name: /Remote controls/ }))
    fireEvent.click(screen.getByTitle('Cursor Down (NS91)'))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/net/nav', { action: 'down' }))

    fireEvent.click(screen.getByRole('button', { name: 'Fav 2' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/net/preset', { preset: 'ZMFAVORITE2' }))
  })
})
