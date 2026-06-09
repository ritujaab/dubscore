export default function LandingPage({
  onSelect,
  onSelectReference,
}: {
  onSelect:          () => void
  onSelectReference: () => void
}) {
  return (
    <div style={{ padding: '34px 0 56px', textAlign: 'center' }}>

      <h1 style={{
        fontFamily: 'var(--font-head)', fontSize: 'clamp(36px, 6vw, 64px)',
        fontWeight: 800, lineHeight: 1.05, letterSpacing: -1.5,
        marginBottom: 16,
      }}>
        How good is<br />your dub?
      </h1>

      <p style={{
        fontSize: 15, color: 'var(--muted)', maxWidth: 460,
        margin: '0 auto 30px', lineHeight: 1.7,
      }}>
        Automated quality scoring for dubbed video — analyse with and without references
      </p>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 16, maxWidth: 600, margin: '0 auto',
      }}>
        <ModeCard
          title="Referenceless"
          description="Score against the original video."
          onClick={onSelect}
        />
        <ModeCard
          title="Reference"
          description="Score against reference videos."
          onClick={onSelectReference}
        />
      </div>
    </div>
  )
}

function ModeCard({
  title,
  description,
  onClick,
}: {
  title: string
  description: string
  onClick?: () => void
}) {
  const features =
    title === 'Referenceless'
      ? [
          'SPNR scoring',
          'Lip-sync analysis',
          'Prosody evaluation',
          'Voice authenticity',
        ]
      : [
          'Semantic similarity',
        ]

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg2)',
        border: '0.5px solid var(--border)',
        borderRadius: 16,
        padding: '28px 24px',
        textAlign: 'left',
        cursor: 'pointer',
        height: 350,

        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: 'var(--bg3)',
          border: '0.5px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          marginBottom: 14,
          color: 'var(--accent)',
        }}
      >
        ◆
      </div>

      <h3
        style={{
          fontFamily: 'var(--font-head)',
          fontSize: 17,
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        {title}
      </h3>

      <p
        style={{
          fontSize: 12,
          color: 'var(--muted)',
          lineHeight: 1.6,
          marginBottom: 20,
        }}
      >
        {description}
      </p>

      <div style={{ flex: 1 }}>
        {features.map((feature) => (
          <div
            key={feature}
            style={{
              fontSize: 12,
              color: 'var(--text)',
              marginBottom: 10,
            }}
          >
            ✓ {feature}
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 'auto',
          paddingTop: 16,
          borderTop: '0.5px solid var(--border)',
          fontSize: 12,
          color: 'var(--accent)',
          fontWeight: 400,
        }}
      >
        Start analysis →
      </div>
    </div>
  )
}