import type { SemanticResult } from '../types'

export default function ReferenceResultsPage({
  data,
  onBack,
}: {
  data: SemanticResult
  onBack: () => void
}) {
  const color = data.score >= 0.75 ? '#5DCAA5' : data.score >= 0.5 ? '#EF9F27' : '#E24B4A'

  return (
    <div style={{ paddingTop: 48, paddingBottom: 80 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
        <button onClick={onBack} style={backBtnStyle}>← New analysis</button>
        <div style={{ fontFamily: 'var(--font-head)', fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>
          Reference results
        </div>
      </div>

      {/* score cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', gap: 12, marginBottom: 40 }}>
        <ScoreCard label="Semantic similarity" score={data.score}     highlight color={color} runtime={data.runtime} />
      </div>

      {/* chunk heatmap */}
      <div style={{ marginBottom: 48 }}>
        <div style={{ fontFamily: 'var(--font-head)', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
          Semantic similarity
        </div>
        <div style={{ background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 16, padding: 20 }}>
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {data.chunk_scores.map((score, i) => (
              <ChunkCell key={i} index={i} score={score} />
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 11, color: 'var(--muted)' }}>
            <span>Low</span>
            <div style={{ flex: 1, maxWidth: 120, height: 6, borderRadius: 3, background: 'linear-gradient(to right, #E24B4A, #EF9F27, #5DCAA5)' }} />
            <span>High</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function cellColor(norm: number): string {
  const base   = norm < 0.5 ? [226, 75, 74]  : [239, 159, 39]
  const target = norm < 0.5 ? [239, 159, 39] : [93, 202, 165]
  const t      = norm < 0.5 ? norm * 2 : (norm - 0.5) * 2
  const c      = base.map((b, i) => Math.round(b + (target[i] - b) * t))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

function ChunkCell({ index, score }: { index: number; score: number }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        height: 32, flexBasis: 24, flexGrow: 1, maxWidth: 48,
        borderRadius: 4, background: cellColor(score),
        position: 'relative', cursor: 'pointer',
        transform: hover ? 'scaleY(1.2)' : 'scaleY(1)',
        transition: 'transform 0.1s',
      }}
    >
      {hover && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--bg3)', border: '0.5px solid var(--border2)',
          borderRadius: 8, padding: '8px 12px', fontSize: 11,
          whiteSpace: 'nowrap', zIndex: 20, color: 'var(--text)', lineHeight: 1.7,
          pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>Chunk {index + 1}</div>
          <div>Score &nbsp;·&nbsp; {(score * 100).toFixed(0)}%</div>
        </div>
      )}
    </div>
  )
}

function ScoreCard({ label, score, highlight, color, runtime }: {
  label: string; score: number; highlight?: boolean; color?: string, runtime?: string
}) {
  const c = color ?? (score >= 0.75 ? '#5DCAA5' : score >= 0.5 ? '#EF9F27' : '#E24B4A')
  return (
    <div style={{
      background: highlight ? 'rgba(93,202,165,0.06)' : 'var(--bg2)',
      border:     highlight ? '0.5px solid rgba(93,202,165,0.3)' : '0.5px solid var(--border)',
      borderRadius: 16, padding: '20px 16px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-head)', fontSize: 32, fontWeight: 800, letterSpacing: -1, lineHeight: 1, color: c }}>
        {(score * 100).toFixed(0)}<span style={{ fontSize: 16 }}>%</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 10}}>
        Runtime: {runtime}
      </div>
    </div>
  )
}

import { useState } from 'react'

const backBtnStyle: React.CSSProperties = {
  background: 'none', border: '0.5px solid var(--border)',
  color: 'var(--muted)', padding: '6px 12px', borderRadius: 10,
  cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 12,
}