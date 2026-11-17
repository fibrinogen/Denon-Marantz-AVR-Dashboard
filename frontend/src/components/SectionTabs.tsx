export type Section = 'controls' | 'net' | 'speakers' | 'audio'

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'controls', label: 'Controls' },
  { id: 'net', label: 'Net / Radio' },
  { id: 'speakers', label: 'Speakers' },
  { id: 'audio', label: 'Audio / EQ' },
]

interface Props {
  section: Section
  onChange: (section: Section) => void
  /** Highlight Net/Radio when HEOS is unavailable (legacy Telnet mode). */
  highlightNet?: boolean
  /** Mobile bottom-nav variant (no bottom margin). */
  compact?: boolean
}

/** Main-zone section switch, rendered on desktop and in the mobile bottom nav. */
export default function SectionTabs({ section, onChange, highlightNet = false, compact = false }: Props) {
  return (
    <div role="group" aria-label="Section" className={compact ? 'flex gap-1' : 'flex gap-1 mb-4'}>
      {SECTIONS.map(s => (
        <button
          key={s.id}
          onClick={() => onChange(s.id)}
          aria-pressed={section === s.id}
          className={`relative flex-1 py-2 px-1 rounded-lg text-xs font-medium transition-all truncate ${
            section === s.id
              ? 'bg-denon-surface text-denon-gold border border-denon-gold/30'
              : 'text-denon-muted hover:text-denon-text'
          }`}
        >
          {s.label}
          {s.id === 'net' && highlightNet && section !== 'net' && (
            <span
              className="inline-block w-1.5 h-1.5 rounded-full bg-denon-gold ml-1 align-middle"
              aria-hidden="true"
            />
          )}
        </button>
      ))}
    </div>
  )
}
