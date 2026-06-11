import type { SpnrSegment, LipsyncSegment, OverallSegment, VoiceAuthSegment } from '../types'

type AnySegment = SpnrSegment | LipsyncSegment | VoiceAuthSegment | OverallSegment

interface HeatmapProps {
  segments:    AnySegment[]
  normFn:      (seg: AnySegment) => number | null
  tipFn:       (seg: AnySegment, index: number) => React.ReactNode
  onCellClick?: (index: number) => void
}

function cellColor(norm: number): string {
  const base   = norm < 0.5 ? [226, 75, 74]  : [239, 159, 39]
  const target = norm < 0.5 ? [239, 159, 39] : [93, 202, 165]
  const t      = norm < 0.5 ? norm * 2 : (norm - 0.5) * 2
  const c      = base.map((b, i) => Math.round(b + (target[i] - b) * t))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

export default function Heatmap({ segments, normFn, tipFn, onCellClick }: HeatmapProps) {
  if (!segments.length) {
    return (
      <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>
        No segment data
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {segments.map((seg, i) => {
          const norm = normFn(seg)
          return (
            <div
              key={i}
              onClick={() => onCellClick?.(i)}
              style={{
                height: 32,
                flexBasis: 24,
                flexGrow: 1,
                maxWidth: 48,
                borderRadius: 4,
                background: norm != null ? cellColor(norm) : 'var(--bg3)',
                position: 'relative',
                cursor: onCellClick ? 'pointer' : 'default',
                transition: 'transform 0.1s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scaleY(1.2)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scaleY(1)' }}
            >
              <Tooltip>{tipFn(seg, i)}</Tooltip>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 11, color: 'var(--muted)' }}>
        <span>Bad</span>
        <div style={{
          flex: 1, maxWidth: 120, height: 6, borderRadius: 3,
          background: 'linear-gradient(to right, #E24B4A, #EF9F27, #5DCAA5)',
        }} />
        <span>Good</span>
      </div>
    </div>
  )
}

function Tooltip({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false)

  return (
    <div
      style={{ position: 'absolute', inset: 0 }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {visible && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 8px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--bg3)',
          border: '0.5px solid var(--border2)',
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: 11,
          whiteSpace: 'nowrap',
          zIndex: 20,
          color: 'var(--text)',
          lineHeight: 1.7,
          pointerEvents: 'none',
        }}>
          {children}
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'