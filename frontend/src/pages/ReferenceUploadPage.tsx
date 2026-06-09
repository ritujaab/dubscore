import { useState } from 'react'
import { api } from '../api/client'
import type { SemanticResult } from '../types'
import DropZone from '../components/Dropzone'

type StepState = 'idle' | 'running' | 'done' | 'error'

export default function ReferenceUploadPage({
  onBack,
  onDone,
}: {
  onBack: () => void
  onDone: (r: SemanticResult) => void
}) {
  const [dubFile,   setDubFile]   = useState<File | null>(null)
  const [refFiles,  setRefFiles]  = useState<File[]>([])
  const [running,   setRunning]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [step,      setStep]      = useState<StepState>('idle')

  const canRun = !!dubFile && refFiles.length > 0 && !running

  async function run() {
    if (!dubFile || !refFiles.length) return
    setRunning(true)
    setError(null)
    setStep('running')

    try {
      const fd = new FormData()
      fd.append('dubbed_file', dubFile)
      refFiles.forEach(f => fd.append('reference_files', f))
      const result = await api.postReferenceAnalyse(fd)
      setStep('done')
      onDone(result)
    } catch (err: unknown) {
      setStep('error')
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ paddingTop: 48 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
        <button onClick={onBack} style={backBtnStyle}>← Back</button>
        <div style={{ fontFamily: 'var(--font-head)', fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>
          Reference analysis
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 40 }}>
        {/* dubbed video */}
        <div style={{ marginBottom: 16 }}>
          <DropZone
            label="Dubbed"
            hint="Upload the dubbed video to evaluate"
            files={dubFile ? [dubFile] : []}
            multiple={false}
            onFiles={fs => setDubFile(fs[0])}
          />
        </div>

        {/* reference videos */}
        <div style={{ marginBottom: 24 }}>
          <DropZone
            label='Reference Videos'
            hint="Upload one or more reference videos"
            files={refFiles}
            multiple={true}
            onFiles={fs => setRefFiles(prev => [...prev, ...fs])}
          />
          {refFiles.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {refFiles.map((f, i) => (
                <div key={i} style={{
                  fontSize: 11, padding: '3px 10px',
                  background: 'var(--bg3)', border: '0.5px solid var(--border)',
                  borderRadius: 100, color: 'var(--muted)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {f.name}
                  <span
                    style={{ cursor: 'pointer', color: 'var(--danger)' }}
                    onClick={() => setRefFiles(prev => prev.filter((_, j) => j !== i))}
                  >×</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <button
        onClick={run} disabled={!canRun}
        style={{
          width: '100%', padding: 14,
          background: canRun ? 'var(--accent2)' : 'var(--bg3)',
          border: 'none', borderRadius: 10,
          color: canRun ? '#04342C' : 'var(--muted)',
          fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 15,
          cursor: canRun ? 'pointer' : 'not-allowed',
        }}
      >
        {running ? 'Analysing…' : 'Run Analysis'}
      </button>

      {error && (
        <div style={{
          marginTop: 16, padding: '12px 16px',
          background: 'rgba(226,75,74,0.1)', border: '0.5px solid rgba(226,75,74,0.3)',
          borderRadius: 10, fontSize: 13, color: 'var(--danger)',
        }}>
          {error}
        </div>
      )}

      {step !== 'idle' && (
        <div style={{
          marginTop: 24, background: 'var(--bg2)',
          border: '0.5px solid var(--border)', borderRadius: 16, padding: '28px 24px',
        }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 20 }}>
            Pipeline
          </div>
          <StepRow state={step} label="Transcribing & computing semantic similarity" />
        </div>
      )}
    </div>
  )
}


function StepRow({ state, label }: { state: StepState; label: string }) {
  const color = state === 'done' ? 'var(--accent)' : state === 'error' ? 'var(--danger)' : 'var(--warn)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
      <div className={state === 'running' ? 'animate-pulse-dot' : ''}
        style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <div style={{ color: 'var(--text)' }}>{label}</div>
    </div>
  )
}

const backBtnStyle: React.CSSProperties = {
  background: 'none', border: '0.5px solid var(--border)',
  color: 'var(--muted)', padding: '6px 12px', borderRadius: 10,
  cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 12,
}