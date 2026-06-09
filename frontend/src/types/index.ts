export interface ChunksResponse {
  status:      string
  orig_chunks: number
  dub_chunks:  number
  runtime:     string
}

export interface SpnrSegment {
  Chunk:      number
  Segment:    number
  Orig_Start: number
  Orig_End:   number
  Dub_Start:  number
  Dub_End:    number
  Orig_SpNR:  number
  Dub_SpNR:   number
  Delta:      number
  Chunk_Score: number
  Status:     'OK' | 'FLAG'
}

export interface LipsyncSegment {
  Segment:    number
  Start:      number
  End:        number
  'Least Lag': number | null
  Confidence: number | null
  Status:     'GOOD' | 'OK' | 'BAD' | 'NO RESULT'
}

export interface ProsodySegment {
  Segment: number
  Start:   number
  End:     number
  Pitch:   number
  Energy:  number
  Rhythm:  number
  Score:   number
  Status:  string
}

export type VoiceAuthMethod = 'clone' | 'age_gender'

export interface VoiceAuthSegment {
  // clone fields
  Segment?:    number
  Orig_Start?: number
  Orig_End?:   number
  Dub_Start?:  number
  Dub_End?:    number
  Similarity?: number
  // age_gender fields
  Audio_Age?:        number
  Audio_Gender?:     string
  Best_Face_Age?:    number
  Best_Face_Gender?: string
  Num_Faces?:        number
  Best_Score?:       number
  Status?:           string
}

export interface MetricResult<T> {
  score:    number
  segments: T[]
  runtime:  string
}

export interface VoiceAuthResult {
  score:    number
  method:   VoiceAuthMethod
  segments: VoiceAuthSegment[]
  runtime:  string
}

export interface SemanticResult {
  score:             number
  precision:         number
  coverage:          number
  chunk_scores:      number[]
  dubbed_transcript: string
  ref_pool_size:     number
  runtime:           string
}

export interface AllScoresResponse {
  spnr:               MetricResult<SpnrSegment>
  lipsync:            MetricResult<LipsyncSegment>
  voice_authenticity: VoiceAuthResult
  prosody:            MetricResult<ProsodySegment>
}

export interface OverallSegment {
  index:        number
  norm:         number
  spnrNorm:     number | null
  lipsyncNorm:  number | null
  cloneNorm:    number | null
  prosodyNorm:  number | null
}