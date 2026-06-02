import Heatmap from '../components/Heatmap'
import type {
  AllScoresResponse,
  SpnrSegment,
  LipsyncSegment,
  CloneSegment,
  OverallSegment,
  AgeGenderSegment
} from '../types'

export default function ResultsPage({
  data,
  onBack,
}: {
  data: AllScoresResponse
  onBack: () => void
}) {
  const overallSegments = buildOverallSegments(data)
  const overall = computeWeightedOverall(overallSegments, data)

  return (
    <div style={{ paddingTop: 48, paddingBottom: 80 }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
        <button onClick={onBack} style={backBtnStyle}>← New analysis</button>
        <div style={{ fontFamily: 'var(--font-head)', fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>
          Results
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 40 }}>
        <ScoreCard label="Overall"  score={overall} highlight />
        <ScoreCard label="SpNR"     score={data.spnr.score}    runtime={data.spnr.runtime} />
        <ScoreCard label="Lip Sync" score={data.lipsync.score} runtime={data.lipsync.runtime} />
        {data.age_gender.triggered
          ? <ScoreCard
              label="Age / Gender"
              score={data.age_gender.score ?? 0}
              runtime={data.age_gender.runtime}
            />
          : <ScoreCard
              label="Voice Clone"
              score={data.voice_clone.score}
              runtime={data.voice_clone.runtime}
            />
        }
      </div>

      {/* overall heatmap — averaged across all three metrics per segment */}
      <Section title="Overall — all segments">
        <Heatmap
          segments={overallSegments}
          normFn={seg => (seg as OverallSegment).norm}
          tipFn={seg => {
            const s = seg as OverallSegment
            return (
              <>
                <div>Seg {s.index + 1}</div>
                {s.spnrNorm    != null && <div>SpNR:  {(s.spnrNorm    * 100).toFixed(0)}%</div>}
                {s.lipsyncNorm != null && <div>Sync:  {(s.lipsyncNorm * 100).toFixed(0)}%</div>}
                {s.cloneNorm   != null && (
                  <div>
                    {data.age_gender.triggered ? 'Age/Gender' : 'Clone'}:{' '}
                    {(s.cloneNorm * 100).toFixed(0)}%
                  </div>
                )}
                <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.15)', marginTop: 4, paddingTop: 4 }}>
                  Avg: {(s.norm * 100).toFixed(0)}%
                </div>
              </>
            )
          }}
        />
      </Section>

      {/* spnr — one cell per fixed chunk, averaged across ASR segments inside */}
      <Section title="SpNR — speech noise ratio" score={data.spnr.score}>
        <Heatmap
          segments={data.lipsync.segments}  
          normFn={seg => {
            const ls = seg as LipsyncSegment
            const segs = data.spnr.segments.filter(
              s => _spnrBelongsToChunk(s as SpnrSegment, ls)
            )
            if (!segs.length) return null
            return avg(segs.map(s => Math.max(0, 1 - (s as SpnrSegment).Delta / 3)))
          }}
          tipFn={seg => {
            const ls = seg as LipsyncSegment
            const segs = data.spnr.segments.filter(
              s => _spnrBelongsToChunk(s as SpnrSegment, ls)
            ) as SpnrSegment[]
            const meanDelta = segs.length ? avg(segs.map(s => s.Delta)) : null
            return (
              <>
                <div>{ls.Start}s – {ls.End}s</div>
                <div>{segs.length} ASR segment{segs.length !== 1 ? 's' : ''}</div>
                {meanDelta != null && <div>Avg Δ {meanDelta.toFixed(2)} dB</div>}
              </>
            )
          }}
        />
      </Section>

      {/* lipsync */}
      <Section title="Lip sync" score={data.lipsync.score}>
        <Heatmap
          segments={data.lipsync.segments}
          normFn={seg => {
            const s = seg as LipsyncSegment
            if (s['Least Lag'] == null) return null
            return Math.max(0, 1 - Math.abs(s['Least Lag']) / 8)
          }}
          tipFn={seg => {
            const s = seg as LipsyncSegment
            return (
              <>
                <div>Seg {s.Segment}</div>
                <div>Lag: {s['Least Lag'] ?? 'N/A'} fr &nbsp;·&nbsp; {s.Status}</div>
              </>
            )
          }}
        />
      </Section>

      {data.age_gender.triggered ? (
        <Section title="Age / gender consistency" score={data.age_gender.score ?? undefined}>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
            {data.age_gender.reason}
          </div>
          <Heatmap
            segments={data.age_gender.segments}
            normFn={seg => {
              const s = seg as AgeGenderSegment
              return s.Best_Score > 0 ? s.Best_Score : null
            }}
            tipFn={seg => {
              const s = seg as AgeGenderSegment
              if (!s.Best_Score) return (
                <>
                  <div>Seg {s.Segment+1}</div>
                  <div>No result</div>
                </>
              )
              return (
                <>
                  <div>Seg {s.Segment+1}</div>
                  <div>Audio: {s.Audio_Gender}, {s.Audio_Age?.toFixed(0)}yr</div>
                  <div>Face: {s.Best_Face_Gender}, {s.Best_Face_Age}yr</div>
                  <div>Score: {(s.Best_Score * 100).toFixed(0)}% &nbsp;·&nbsp; {s.Status}</div>
                </>
              )
            }}
          />
        </Section>
      ) : (
        <>
          <Section title="Voice clone similarity" score={data.voice_clone.score}>
            <Heatmap
              segments={data.voice_clone.segments}
              normFn={seg => {
                const s = seg as CloneSegment
                return s.Similarity > 0 ? s.Similarity : null
              }}
              tipFn={seg => {
                const s = seg as CloneSegment
                if (!s.Similarity) return (
                  <>
                    <div>Seg {s.Segment}</div>
                    <div>No result</div>
                  </>
                )
                return (
                  <>
                    <div>Seg {s.Segment + 1} &nbsp;·&nbsp; {s.Orig_Start}s – {s.Orig_End}s</div>
                    <div>Similarity: {(s.Similarity * 100).toFixed(0)}% &nbsp;·&nbsp; {s.Status}</div>
                  </>
                )
              }}
            />
          </Section>
          <div style={{
            fontSize: 12, color: 'var(--muted)',
            padding: '12px 16px',
            background: 'rgba(93,202,165,0.06)',
            border: '0.5px solid rgba(93,202,165,0.15)',
            borderRadius: 10, marginBottom: 48,
          }}>
            ✓ Voice clone score acceptable — age/gender check was not needed.
          </div>
        </>
      )}
    </div>
  )
}

// ── overall segment builder ───────────────────────────────────────────────────
function computeWeightedOverall(overallSegs: OverallSegment[], data: AllScoresResponse): number {
  if (!overallSegs.length) return 0

  let weightedSum = 0
  let totalWeight = 0

  overallSegs.forEach((seg, i) => {
    const lipsyncSeg = data.lipsync.segments[i] as LipsyncSegment | undefined
    const cloneSeg   = data.voice_clone.segments[i] as CloneSegment | undefined

    const dur =
      lipsyncSeg ? (lipsyncSeg.End   - lipsyncSeg.Start)     :
      cloneSeg   ? (cloneSeg.Dub_End - cloneSeg.Dub_Start)   :
      1

    weightedSum += seg.norm * dur
    totalWeight += dur
  })

  return totalWeight > 0 ? weightedSum / totalWeight : 0
}

function buildOverallSegments(data: AllScoresResponse): OverallSegment[] {
  const len = data.lipsync.segments.length

  return Array.from({ length: len }, (_, i) => {
    const lipsyncSeg = data.lipsync.segments[i]     as LipsyncSegment | undefined
    const cloneSeg   = data.voice_clone.segments[i] as CloneSegment   | undefined
    const ageSeg     = data.age_gender.segments?.[i] as AgeGenderSegment | undefined

    const spnrSegs = data.spnr.segments.filter(
      (s): s is SpnrSegment => _spnrBelongsToChunk(s as SpnrSegment, lipsyncSeg)
    )
    const spnrNorm = spnrSegs.length
      ? avg(spnrSegs.map(s => Math.max(0, 1 - s.Delta / 3)))
      : null

    // null = no result (lag unknown), number = actual score
    const lipsyncNorm = lipsyncSeg?.['Least Lag'] != null
      ? Math.max(0, 1 - Math.abs(lipsyncSeg['Least Lag']) / 8)
      : null

    // use age/gender if triggered, else clone — both treat 0/missing as null
    const cloneNorm = data.age_gender.triggered
      ? (ageSeg != null && ageSeg.Best_Score > 0 ? ageSeg.Best_Score : null)
      : (cloneSeg != null && cloneSeg.Similarity > 0 ? cloneSeg.Similarity : null)

    const norms = [spnrNorm, lipsyncNorm, cloneNorm].filter((n): n is number => n != null)
    const norm  = norms.length ? norms.reduce((a, b) => a + b, 0) / norms.length : 0

    return { index: i, norm, spnrNorm, lipsyncNorm, cloneNorm }
  })
}

function _spnrBelongsToChunk(spnrSeg: SpnrSegment, lipsyncSeg: LipsyncSegment | undefined): boolean {
  if (!lipsyncSeg) return false
  const mid = (spnrSeg.Orig_Start + spnrSeg.Orig_End) / 2
  return mid >= lipsyncSeg.Start && mid < lipsyncSeg.End
}

// ── sub-components ────────────────────────────────────────────────────────────

function ScoreCard({ label, score, runtime, highlight }: {
  label: string; score: number; runtime?: string; highlight?: boolean
}) {
  const pct   = (score * 100).toFixed(0)
  const color = score >= 0.75 ? '#5DCAA5' : score >= 0.45 ? '#EF9F27' : '#E24B4A'
  return (
    <div style={{
      background:   highlight ? 'rgba(93,202,165,0.06)' : 'var(--bg2)',
      border:       highlight ? '0.5px solid rgba(93,202,165,0.3)' : '0.5px solid var(--border)',
      borderRadius: 16, padding: '20px 16px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-head)', fontSize: 32, fontWeight: 800, letterSpacing: -1, lineHeight: 1, color }}>
        {pct}<span style={{ fontSize: 16 }}>%</span>
      </div>
      {runtime && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8 }}>{runtime}</div>}
    </div>
  )
}

function Section({ title, score, children }: {
  title: string; score?: number; children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 48 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-head)', fontSize: 16, fontWeight: 700, letterSpacing: -0.2 }}>
          {title}
        </div>
        {score !== undefined && (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Score: <strong style={{ color: 'var(--text)' }}>{(score * 100).toFixed(1)}%</strong>
          </div>
        )}
      </div>
      <div style={{ background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 16, padding: 20 }}>
        {children}
      </div>
    </div>
  )
}

const backBtnStyle: React.CSSProperties = {
  background: 'none', border: '0.5px solid var(--border)',
  color: 'var(--muted)', padding: '6px 12px', borderRadius: 10,
  cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 12,
}

function avg(nums: number[]) {
  const valid = nums.filter(n => n != null)
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0
}