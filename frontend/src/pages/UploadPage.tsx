import { useState, useRef } from 'react'
import { api } from '../api/client'
import type { AllScoresResponse } from '../types'
import DropZone from '../components/Dropzone'

type StepState = 'idle' | 'running' | 'done' | 'error'

interface Steps {
  chunks:   StepState
  spnr:     StepState
  lipsync:  StepState
  auth:     StepState
  prosody:  StepState
}

interface StepTimes {
  chunks?: string
  spnr?:   string
  lipsync?: string
  auth?: string
  prosody?: string
}

export default function UploadPage({
  onBack,
  onDone,
}: {
  onBack: () => void
  onDone: (r: AllScoresResponse) => void
}) {
  const [nChunks, setNChunks] = useState<number>(5)
  const [origFile, setOrigFile] = useState<File | null>(null)
  const [dubFile,  setDubFile]  = useState<File | null>(null)
  const [running,  setRunning]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [steps,    setSteps]    = useState<Steps>({ chunks: 'idle', spnr: 'idle', lipsync: 'idle', auth: 'idle', prosody: 'idle' })
  const [times,    setTimes]    = useState<StepTimes>({})

  const origRef = useRef<HTMLInputElement>(null)
  const dubRef  = useRef<HTMLInputElement>(null)

  function setStep(key: keyof Steps, state: StepState, time?: string) {
    setSteps(s  => ({ ...s, [key]: state }))
    if (time !== undefined) setTimes(t => ({ ...t, [key]: time }))
  }

  async function run() {
    if (!origFile || !dubFile) return
    setRunning(true)
    setError(null)
    setSteps({ chunks: 'idle', spnr: 'idle', lipsync: 'idle', auth: 'idle', prosody: 'idle' })

    setTimes({})

    try {
      setStep('chunks', 'running')
      const t0 = Date.now()
      const formData = new FormData()
      formData.append('orig_file', origFile)
      formData.append('dub_file',  dubFile)
      formData.append('n_chunks',  String(nChunks))
      await api.postChunks(formData)
      setStep('chunks', 'done', elapsed(t0))

      setStep('spnr', 'running')
      setStep('lipsync', 'running')
      setStep('prosody', 'running')

      // Start SpNR and LipSync together
      const spnrPromise = api.getSpnr()
        .then(r => {
          setStep('spnr', 'done', elapsed(t0))
          return r
        })
        .catch(e => {
          setStep('spnr', 'error')
          throw e
        })

      const lipsyncResult = await api.getLipsync()
        .then(r => {
          setStep('lipsync', 'done', elapsed(t0))
          return r
        })
        .catch(e => {
          setStep('lipsync', 'error')
          throw e
        })

      const prosodyResult = await api.getProsody()
        .then(r => {
          setStep('prosody', 'done', elapsed(t0))
          return r
        })
        .catch(e => {
          setStep('prosody', 'error')
          throw e
        })

      // Only start Voice Auth after LipSync finishes
      setStep('auth', 'running')

      const authResult = await api.getVoiceAuthenticity()
        .then(r => {
          setStep('auth', 'done', elapsed(t0))
          return r
        })
        .catch(e => {
          setStep('auth', 'error')
          throw e
        })

      // Wait for SpNR if it hasn't completed yet
      const spnrResult = await spnrPromise

      onDone({
        spnr: spnrResult,
        lipsync: lipsyncResult,
        voice_authenticity: authResult,
        prosody: prosodyResult
      })

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
      setSteps(s => ({
        chunks:     s.chunks     === 'running' ? 'error' : s.chunks,
        spnr:       s.spnr       === 'running' ? 'error' : s.spnr,
        lipsync:    s.lipsync    === 'running' ? 'error' : s.lipsync,
        auth:       s.auth       === 'running' ? 'error' : s.auth,
        prosody:    s.prosody    === 'running' ? 'error' : s.prosody
      }))
    }
  }

  const canRun = !!origFile && !!dubFile && !running

  return (
    <div style={{ paddingTop: 48 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
        <button onClick={onBack} style={backBtnStyle}>← Back</button>
        <div style={{ fontFamily: 'var(--font-head)', fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>
          Upload videos
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <DropZone
          label="Original"
          hint="Source language video"
          files={origFile ? [origFile] : []}
          multiple={false}
          onFiles={fs => setOrigFile(fs[0])}
        />
        <DropZone
          label="Dubbed"
          hint="Translated / dubbed video"
          files={dubFile ? [dubFile] : []}
          multiple={false}
          onFiles={fs => setDubFile(fs[0])}
        />
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 24, padding: '14px 16px',
        background: 'var(--bg2)', border: '0.5px solid var(--border)',
        borderRadius: 10,
      }}>
        <div style={{ fontSize: 13, color: 'var(--muted)', flex: 1 }}>
          Number of chunks
        </div>
        <input
          type="number"
          min={2} max={20} value={nChunks}
          onChange={e => setNChunks(Math.max(2, Math.min(20, Number(e.target.value))))}
          style={{
            width: 64, padding: '6px 10px', textAlign: 'center',
            background: 'var(--bg3)', border: '0.5px solid var(--border2)',
            borderRadius: 8, color: 'var(--text)',
            fontFamily: 'var(--font-mono)', fontSize: 13,
          }}
        />
      </div>

      <button
        onClick={run}
        disabled={!canRun}
        style={{
          width: '100%', padding: 14,
          background: canRun ? 'var(--accent2)' : 'var(--bg3)',
          border: 'none', borderRadius: 10,
          color: canRun ? '#04342C' : 'var(--muted)',
          fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 15,
          cursor: canRun ? 'pointer' : 'not-allowed',
          transition: 'background 0.15s',
        }}
      >
        {running ? 'Running…' : 'Run Analysis'}
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

      {Object.values(steps).some(s => s !== 'idle') && (
        <div style={{
          marginTop: 24, background: 'var(--bg2)',
          border: '0.5px solid var(--border)', borderRadius: 16, padding: '28px 24px',
        }}>
          <div style={{
            fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em',
            color: 'var(--muted)', marginBottom: 20,
          }}>
            Pipeline
          </div>
          <StepRow state={steps.chunks}  label="Extracting & chunking audio"  time={times.chunks}  />
          <StepRow state={steps.spnr}    label="SpNR — speech noise ratio"    time={times.spnr}    />
          <StepRow state={steps.lipsync} label="Lip sync analysis"            time={times.lipsync} />
          <StepRow state={steps.prosody} label="Prosodic smoothness" time={times.prosody} />
          <StepRow state={steps.auth} label="Voice authenticity" time={times.auth} />
        </div>
      )}
    </div>
  )
}

function StepRow({ state, label, time }: { state: StepState; label: string; time?: string }) {
  const dotColor = state === 'done' ? 'var(--accent)' : state === 'error' ? 'var(--danger)' : state === 'running' ? 'var(--warn)' : 'var(--bg3)'
  const dotBorder = state === 'idle' ? 'var(--border2)' : dotColor

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '8px 0', fontSize: 13,
      borderBottom: '0.5px solid var(--border)',
    }}>
      <div
        className={state === 'running' ? 'animate-pulse-dot' : ''}
        style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: dotColor, border: `1.5px solid ${dotBorder}`,
          transition: 'background 0.2s',
        }}
      />
      <div style={{ flex: 1, color: 'var(--text)' }}>{label}</div>
      {time && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{time}</div>}
    </div>
  )
}

const backBtnStyle: React.CSSProperties = {
  background: 'none', border: '0.5px solid var(--border)',
  color: 'var(--muted)', padding: '6px 12px', borderRadius: 10,
  cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 12,
}

function elapsed(t0: number) {
  return ((Date.now() - t0) / 1000).toFixed(1) + 's'
}