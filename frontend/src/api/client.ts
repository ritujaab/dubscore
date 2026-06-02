import type {
  ChunksResponse,
  MetricResult,
  SpnrSegment,
  LipsyncSegment,
  CloneSegment,
  AgeGenderResponse
} from '../types'

const BASE = 'http://127.0.0.1:8000'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, options)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Request failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  postChunks: (formData: FormData) =>
    request<ChunksResponse>('/chunks', { method: 'POST', body: formData }),

  getSpnr: () =>
    request<MetricResult<SpnrSegment>>('/score/spnr'),

  getLipsync: () =>
    request<MetricResult<LipsyncSegment>>('/score/lipsync'),

  getVoiceClone: () =>
    request<MetricResult<CloneSegment>>('/score/voice_clone'),

  getAgeGender: () =>
  request<AgeGenderResponse>('/score/age_gender'),
}