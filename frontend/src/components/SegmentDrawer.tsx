import { useEffect } from 'react'
import type {
  AllScoresResponse,
  SpnrSegment,
  LipsyncSegment,
  VoiceAuthSegment,
  ProsodySegment,
  OverallSegment,
} from '../types'

interface Props {
  index:    number
  data:     AllScoresResponse
  overall:  OverallSegment
  onClose:  () => void
}

export default function SegmentDrawer({ index, data, overall, onClose }: Props) {
  const lipsync  = data.lipsync.segments[index]      as LipsyncSegment  | undefined
  const auth     = data.voice_authenticity.segments[index] as VoiceAuthSegment | undefined
  const prosody  = data.prosody.segments[index]      as ProsodySegment  | undefined
  const spnrSegs = data.spnr.segments.filter(s => {
    if (!lipsync) return false
    const mid = ((s as SpnrSegment).Orig_Start + (s as SpnrSegment).Orig_End) / 2
    return mid >= lipsync.Start && mid < lipsync.End
  }) as SpnrSegment[]

  const start = lipsync?.Start ?? 0
  const end   = lipsync?.End   ?? 0

  // close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg2)',
          border: '0.5px solid var(--border2)',
          borderRadius: 20,
          width: '100%', maxWidth: 820,
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: 32,
        }}
      >
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-head)', fontSize: 20, fontWeight: 700, letterSpacing: -0.3 }}>
              Segment {index + 1}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              {start.toFixed(2)}s – {end.toFixed(2)}s &nbsp;·&nbsp; {(end - start).toFixed(2)}s duration
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <OverallBadge norm={overall.norm} />
            <button onClick={onClose} style={{
              background: 'none', border: '0.5px solid var(--border)',
              color: 'var(--muted)', width: 32, height: 32, borderRadius: 8,
              cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>×</button>
          </div>
        </div>

        {/* overall mini bar */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 10, marginBottom: 28,
        }}>
          <MiniCard label="SpNR"    norm={overall.spnrNorm}    />
          <MiniCard label="Sync"    norm={overall.lipsyncNorm} />
          <MiniCard label="Prosody" norm={overall.prosodyNorm} />
          <MiniCard
            label={data.voice_authenticity.method === 'clone' ? 'Clone' : 'Age/Gender'}
            norm={overall.cloneNorm}
          />
        </div>

        {/* timing */}
        <div style={{marginBottom:20}}>
            <Panel title="Timing">
              <StatRow label="Orig start" value={`${spnrSegs[0]?.Orig_Start.toFixed(2) ?? start.toFixed(2)}s`} />
              <StatRow label="Orig end"   value={`${spnrSegs[spnrSegs.length-1]?.Orig_End.toFixed(2) ?? end.toFixed(2)}s`} />
              <StatRow label="Dub start"  value={`${start.toFixed(2)}s`} />
              <StatRow label="Dub end"    value={`${end.toFixed(2)}s`} />
              <StatRow label="Duration"   value={`${(end - start).toFixed(2)}s`} />
            </Panel>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

          {/* left col */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* SpNR */}
            <Panel title="Speech Noise Ratio">
              {spnrSegs.length === 0 ? (
                <Empty />
              ) : (
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'var(--muted)' }}>
                      <Th>Phrase</Th><Th>Orig dB</Th><Th>Dub dB</Th><Th>Δ</Th><Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {spnrSegs.map((s, i) => (
                      <tr key={i} style={{ borderTop: '0.5px solid var(--border)' }}>
                        <Td>{s.Segment}</Td>
                        <Td>{s.Orig_SpNR.toFixed(1)}</Td>
                        <Td>{s.Dub_SpNR.toFixed(1)}</Td>
                        <Td>
                          <span style={{ color: s.Delta >= 3 ? 'var(--danger)' : 'var(--accent)' }}>
                            {s.Delta.toFixed(1)}
                          </span>
                        </Td>
                        <Td>
                          <StatusPill status={s.Status} />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>

            {/* Prosody */}
            <Panel title="Prosodic smoothness">
              {!prosody ? <Empty /> : (
                <>
                  <ProsoBar label="Pitch"  value={prosody.Pitch}  />
                  <ProsoBar label="Energy" value={prosody.Energy} />
                  <ProsoBar label="Rhythm" value={prosody.Rhythm} />
                  <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)' }}>
                    <span>Composite</span>
                    <span style={{ color: scoreColor(prosody.Score), fontWeight: 500 }}>
                      {(prosody.Score * 100).toFixed(0)}% &nbsp;·&nbsp; {prosody.Status}
                    </span>
                  </div>
                </>
              )}
            </Panel>
          </div>

          {/* right col */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Lip sync */}
            <Panel title="Lip sync">
              {!lipsync ? <Empty /> : lipsync['Least Lag'] == null ? (
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>No face tracked in this segment.</div>
              ) : (
                <>
                  <StatRow label="Lag"        value={`${lipsync['Least Lag']} frames`} />
                  <StatRow label="Confidence" value={lipsync.Confidence?.toFixed(3) ?? '—'} />
                  <StatRow label="Status"     value={<StatusPill status={lipsync.Status} />} />
                  <LagBar lag={lipsync['Least Lag']} />
                </>
              )}
            </Panel>

            {/* Voice auth */}
            <Panel title={data.voice_authenticity.method === 'clone' ? 'Voice clone' : 'Age / gender'}>
              {!auth ? <Empty /> : data.voice_authenticity.method === 'clone' ? (
                <>
                  <StatRow label="Similarity" value={auth.Similarity != null ? `${(auth.Similarity * 100).toFixed(1)}%` : 'N/A'} />
                  <StatRow label="Status"     value={<StatusPill status={auth.Status ?? '—'} />} />
                  {auth.Similarity != null && (
                    <div style={{ marginTop: 10 }}>
                      <ScoreBar value={auth.Similarity} />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <StatRow label="Audio gender" value={auth.Audio_Gender ?? '—'} />
                  <StatRow label="Audio age"    value={auth.Audio_Age != null ? `${auth.Audio_Age.toFixed(0)} yr` : '—'} />
                  <StatRow label="Face gender"  value={auth.Best_Face_Gender ?? '—'} />
                  <StatRow label="Face age"     value={auth.Best_Face_Age != null ? `${auth.Best_Face_Age} yr` : '—'} />
                  <StatRow label="Match score"  value={auth.Best_Score != null ? `${(auth.Best_Score * 100).toFixed(1)}%` : 'N/A'} />
                  <StatRow label="Status"       value={<StatusPill status={auth.Status ?? '—'} />} />
                  {auth.Best_Score != null && (
                    <div style={{ marginTop: 10 }}>
                      <ScoreBar value={auth.Best_Score} />
                    </div>
                  )}
                </>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── helpers ───────────────────────────────────────────────────────────────────

function scoreColor(v: number) {
  return v >= 0.75 ? '#5DCAA5' : v >= 0.45 ? '#EF9F27' : '#E24B4A'
}

function OverallBadge({ norm }: { norm: number }) {
  const color = scoreColor(norm)
  return (
    <div style={{
      padding: '6px 14px', borderRadius: 100,
      background: `${color}18`, border: `0.5px solid ${color}44`,
      fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 15, color,
    }}>
      {(norm * 100).toFixed(0)}%
    </div>
  )
}

function MiniCard({ label, norm }: { label: string; norm: number | null }) {
  const color = norm != null ? scoreColor(norm) : 'var(--muted)'
  return (
    <div style={{
      background: 'var(--bg3)', border: '0.5px solid var(--border)',
      borderRadius: 10, padding: '10px 12px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-head)', fontSize: 20, fontWeight: 700, color }}>
        {norm != null ? `${(norm * 100).toFixed(0)}%` : '—'}
      </div>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg3)', border: '0.5px solid var(--border)',
      borderRadius: 12, padding: '16px',
    }}>
      <div style={{
        fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em',
        color: 'var(--muted)', marginBottom: 12, fontWeight: 500,
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '5px 0', borderBottom: '0.5px solid var(--border)', fontSize: 12,
    }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 400 }}>{children}</th>
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: '5px 6px', color: 'var(--text)' }}>{children}</td>
}

function Empty() {
  return <div style={{ fontSize: 12, color: 'var(--muted)' }}>No data for this segment.</div>
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === 'GOOD' || status === 'OK' ? 'var(--accent)' :
    status === 'BAD'  || status === 'FLAG' || status === 'NEEDS WORK' ? 'var(--danger)' :
    'var(--muted)'
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 100,
      background: `${color}18`, border: `0.5px solid ${color}44`,
      color, letterSpacing: '0.06em',
    }}>
      {status}
    </span>
  )
}

function ProsoBar({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color: scoreColor(value) }}>{(value * 100).toFixed(0)}%</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--bg2)' }}>
        <div style={{
          height: '100%', borderRadius: 2, width: `${value * 100}%`,
          background: scoreColor(value), transition: 'width 0.3s',
        }} />
      </div>
    </div>
  )
}

function ScoreBar({ value }: { value: number }) {
  return (
    <div style={{ height: 4, borderRadius: 2, background: 'var(--bg2)' }}>
      <div style={{
        height: '100%', borderRadius: 2, width: `${value * 100}%`,
        background: scoreColor(value), transition: 'width 0.3s',
      }} />
    </div>
  )
}

function LagBar({ lag }: { lag: number }) {
  const max   = 12
  const abs   = Math.min(Math.abs(lag), max)
  const pct   = (abs / max) * 50
  const color = abs < 5 ? 'var(--accent)' : abs < 8 ? 'var(--warn)' : 'var(--danger)'
  const side  = lag >= 0 ? 'left' : 'right'

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6 }}>
        Lag position (0 = perfect sync)
      </div>
      <div style={{ position: 'relative', height: 6, background: 'var(--bg2)', borderRadius: 3 }}>
        {/* centre line */}
        <div style={{
          position: 'absolute', left: '50%', top: 0, bottom: 0,
          width: 1, background: 'var(--border2)',
        }} />
        {/* lag bar */}
        <div style={{
          position: 'absolute',
          [side]: `${50 - pct}%`,
          width: `${pct}%`,
          top: 0, bottom: 0,
          background: color, borderRadius: 3,
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
        <span>−{max}fr</span><span>0</span><span>+{max}fr</span>
      </div>
    </div>
  )
}