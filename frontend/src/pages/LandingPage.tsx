export default function LandingPage({
  onSelect,
  onSelectReference,
}: {
  onSelect:          () => void
  onSelectReference: () => void
}) {
  return (
    <div style={{ padding: '64px 0 56px', textAlign: 'center' }}>
      <div style={{
        display: 'inline-block', fontSize: 11, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 20,
      }}>
        ● Dub Quality Metrics
      </div>

      <h1 style={{
        fontFamily: 'var(--font-head)', fontSize: 'clamp(36px, 6vw, 64px)',
        fontWeight: 800, lineHeight: 1.05, letterSpacing: -1.5,
        marginBottom: 16,
      }}>
        How good is<br />your dub?
      </h1>

      <p style={{
        fontSize: 15, color: 'var(--muted)', maxWidth: 460,
        margin: '0 auto 48px', lineHeight: 1.7,
      }}>
        Automated quality scoring for dubbed video — analyse with and without references
      </p>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 16, maxWidth: 600, margin: '0 auto',
      }}>
        <ModeCard
          title="Referenceless"
          description="Score a dub using only the original and dubbed video files."
          onClick={onSelect}
        />
        <ModeCard
          title="Reference"
          description="Score against reference videos using semantic similarity."
          onClick={onSelectReference}
        />
      </div>
    </div>
  )
}

function ModeCard({
  title, description, onClick,
}: {
  title: string
  description: string
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg2)',
        border: '0.5px solid var(--border)',
        borderRadius: 16, padding: '28px 24px',
        textAlign: 'left', cursor: 'pointer',
        opacity: 1,
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = 'var(--border2)'
        el.style.background  = 'var(--bg3)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = 'var(--border)'
        el.style.background  = 'var(--bg2)'
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: 'var(--bg3)', border: '0.5px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, marginBottom: 14, color: 'var(--accent)',
      }}>◆</div>

      <h3 style={{
        fontFamily: 'var(--font-head)', fontSize: 17,
        fontWeight: 700, marginBottom: 6, color: 'var(--text)',
      }}>{title}</h3>

      <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
        {description}
      </p>
    </div>
  )
}