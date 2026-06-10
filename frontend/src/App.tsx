import { useState, useEffect } from 'react'
import LandingPage          from './pages/LandingPage'
import UploadPage           from './pages/UploadPage'
import ResultsPage          from './pages/ResultsPage'
import ReferenceUploadPage  from './pages/ReferenceUploadPage'
import ReferenceResultsPage from './pages/ReferenceResultsPage'
import type { AllScoresResponse, SemanticResult } from './types'

type Page = 'landing' | 'upload' | 'results' | 'reference' | 'reference_results'

export default function App() {
  const [page,       setPage]       = useState<Page>('landing')
  const [results,    setResults]    = useState<AllScoresResponse | null>(null)
  const [refResults, setRefResults] = useState<SemanticResult | null>(null)
  const [ready,      setReady]      = useState(false)
  const [attempt,    setAttempt]    = useState(0)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      while (!cancelled) {
        try {
          const res = await fetch('http://127.0.0.1:8000/health')
          if (res.ok) {
            if (!cancelled) setReady(true)
            return
          }
        } catch {
          // server not up yet — keep polling
        }
        await new Promise(r => setTimeout(r, 1000))
        if (!cancelled) setAttempt(a => a + 1)
      }
    }

    poll()
    return () => { cancelled = true }
  }, [])

  if (!ready) return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 16,
    }}>
      <div style={{
        width: 10, height: 10, borderRadius: '50%',
        background: 'var(--warn)',
        animation: 'pulse-dot 1.2s ease-in-out infinite',
      }} />
      <div style={{ fontSize: 13, color: 'var(--muted)' }}>
        Loading{'.'.repeat((attempt % 3) + 1)}
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px' }}>
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 0', borderBottom: '0.5px solid var(--border)',
      }}>
        <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 20, letterSpacing: -0.5 }}>
          Dub<span style={{ color: 'var(--accent)' }}>Score</span>
        </div>
      </nav>

      {page === 'landing' && (
        <LandingPage
          onSelect={() => setPage('upload')}
          onSelectReference={() => setPage('reference')}
        />
      )}
      {page === 'upload' && (
        <UploadPage
          onBack={() => setPage('landing')}
          onDone={r => { setResults(r); setPage('results') }}
        />
      )}
      {page === 'results' && results && (
        <ResultsPage
          data={results}
          onBack={() => setPage('upload')}
        />
      )}
      {page === 'reference' && (
        <ReferenceUploadPage
          onBack={() => setPage('landing')}
          onDone={r => { setRefResults(r); setPage('reference_results') }}
        />
      )}
      {page === 'reference_results' && refResults && (
        <ReferenceResultsPage
          data={refResults}
          onBack={() => setPage('reference')}
        />
      )}
    </div>
  )
}