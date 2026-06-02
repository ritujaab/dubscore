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

export interface CloneSegment {
  Segment:    number
  Orig_Start: number
  Orig_End:   number
  Dub_Start:  number
  Dub_End:    number
  Similarity: number
  Status:     string
}

export interface AgeGenderSegment {
  Segment:          number
  Audio_Age:        number
  Audio_Gender:     string
  Best_Face_Age:    number
  Best_Face_Gender: string
  Num_Faces:        number
  Best_Score:       number
  Status:           string
}

export interface MetricResult<T> {
  score:    number
  segments: T[]
  runtime:  string
}

export interface AgeGenderResponse {
  triggered: boolean
  reason:    string
  score:     number | null
  segments:  AgeGenderSegment[]
  runtime?:  string
}

export interface AllScoresResponse {
  spnr:        MetricResult<SpnrSegment>
  lipsync:     MetricResult<LipsyncSegment>
  voice_clone: MetricResult<CloneSegment>
  age_gender:  AgeGenderResponse
}

export interface OverallSegment {
  index:       number
  norm:        number
  spnrNorm:    number | null
  lipsyncNorm: number | null
  cloneNorm:   number | null
}