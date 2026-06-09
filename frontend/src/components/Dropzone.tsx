import { useState, useRef } from 'react'

interface DropZoneProps {
  hint:      string
  files:     File[]
  multiple:  boolean
  onFiles:   (fs: File[]) => void
  label?:    string
}

export default function DropZone({ hint, files, multiple, onFiles, label }: DropZoneProps) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); onFiles(Array.from(e.dataTransfer.files)) }}
      onClick={() => inputRef.current?.click()}
      style={{
        background: drag ? 'rgba(93,202,165,0.04)' : 'var(--bg2)',
        border: `1.5px dashed ${drag || files.length ? 'var(--accent)' : 'var(--border2)'}`,
        borderRadius: 16, padding: '36px 24px', textAlign: 'center',
        cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        multiple={multiple}
        style={{ display: 'none' }}
        onChange={e => { if (e.target.files) onFiles(Array.from(e.target.files)) }}
      />
      <div style={{ fontSize: 28, color: files.length ? 'var(--accent)' : 'var(--muted)', marginBottom: 12 }}>
        {files.length ? '✓' : '↑'}
      </div>
      {label && (
        <div style={{
          fontFamily: 'var(--font-head)', fontSize: 13, fontWeight: 600,
          color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4,
        }}>
          {label}
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{hint}</div>
      {!multiple && files[0] && (
        <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 8, wordBreak: 'break-all' }}>
          {files[0].name}
        </div>
      )}
    </div>
  )
}