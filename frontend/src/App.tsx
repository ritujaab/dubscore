import { useState } from 'react'
import LandingPage  from './pages/LandingPage'
import UploadPage   from './pages/UploadPage'
import ResultsPage  from './pages/ResultsPage'
import type { AllScoresResponse } from './types'

type Page = 'landing' | 'upload' | 'results'

export default function App() {
  const [page,    setPage]    = useState<Page>('landing')
  const [results, setResults] = useState<AllScoresResponse | null>(null)

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px' }}>
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 0',
        borderBottom: '0.5px solid var(--border)',
      }}>
        <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 20, letterSpacing: -0.5 }}>
          Dub<span style={{ color: 'var(--accent)' }}>Score</span>
        </div>
        <div style={{
          fontSize: 11, color: 'var(--muted)',
          background: 'var(--bg3)',
          border: '0.5px solid var(--border)',
          padding: '4px 10px', borderRadius: 100,
          letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          Quality Analysis
        </div>
      </nav>

      {page === 'landing' && (
        <LandingPage onSelect={() => setPage('upload')} />
      )}
      {page === 'upload' && (
        <UploadPage
          onBack={() => setPage('landing')}
          onDone={(r) => { setResults(r); setPage('results') }}
        />
      )}
      {page === 'results' && results && (
        <ResultsPage
          data={results}
          onBack={() => setPage('upload')}
        />
      )}
    </div>
  )
}