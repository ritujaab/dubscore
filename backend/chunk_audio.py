from extract_audio import seperate
import librosa, math, os, time
import soundfile as sf
from google.genai import Client, types
from pydantic import BaseModel, Field
import numpy as np
import warnings
import sys
from chunk_video import chunk_video

from dotenv import load_dotenv

load_dotenv()

MODEL            = "gemini-3.1-flash-lite"
MIN_SIL_SEC      = 0.5
HOP_LEN          = 512
N_MFCC           = 13
WARP_RADIUS      = 0.20
DTW_WARN_THR     = 0.45
MIN_CHUNK_DUR  = 5.0

try:
    client = Client(api_key=os.environ['GEMINI_API_KEY'])
except KeyError:
    print("GEMINI_API_KEY environment variable is not set!")
    sys.exit(1)


class TranscribedPhrase(BaseModel):
    start_sec: float = Field(description="The ABSOLUTE global start timestamp of the spoken phrase in decimal seconds. If the chunk starts at 40.0, this value MUST be greater than or equal to 40.0.")
    end_sec:   float = Field(description="The ABSOLUTE global end timestamp of the spoken phrase in decimal seconds. If the chunk starts at 40.0, this value MUST account for the global timeline sequence.")
    phrase:    str   = Field(description="The transcribed words spoken continuously within this time window.")

class AudioTranscriptionSchema(BaseModel):
    phrases: list[TranscribedPhrase]


def get_word_timestamps(vocals, orig_intervals, sr):
    responses = []
    i = 0

    for start, end in orig_intervals:
        chunk_start = start / sr
        chunk_end   = end   / sr
        chunk_dur   = chunk_end - chunk_start


        y_chunk    = vocals[int(chunk_start * sr) : int(chunk_end * sr)]
        chunk_path = f"temp_chunk_{i}.wav"
        sf.write(chunk_path, y_chunk, sr)

        print(f"  Chunk {i+1}/{len(orig_intervals)}: {chunk_start:.1f}s→{chunk_end:.1f}s ...", end=" ", flush=True)

        PROMPT = f"""
                You are an advanced acoustic forced-alignment engine tracking sports broadcast commentary.

                [CRITICAL TIMELINE MATRIX]
                - Your focus window for this specific audio file on the global master timeline is exactly from {chunk_start:.3f} seconds to {chunk_end:.3f} seconds.
                - The absolute physical beginning (0.0s) of this specific audio file mapping aligns to precisely {chunk_start:.3f} seconds globally.

                [OUTPUT REQUIREMENTS]
                1. NO CHUNK-RELATIVE METRICS: Do NOT start your timestamps at 0.0. Every single `start_sec` and `end_sec` value you emit MUST be strictly within the range [{chunk_start:.3f}, {chunk_end:.3f}].
                2. MATHEMATICAL ANCHORING: If speech is heard 2.5 seconds into this file, you must mathematically calculate: {chunk_start:.3f} + 2.5 = {chunk_start + 2.5:.3f} seconds. Output the absolute global result.
                3. SILENCE GUARD: Listen closely to the start. If there is ambient stadium noise, crowd roaring, or breathing before the speaker begins, adjust your onset globally. Do not default the first timestamp to {chunk_start:.3f} unless speech starts instantly at that microsecond.
                4. SEGMENTATION: Close a phrase object and open a new one if the commentator pauses for more than 0.3 seconds.
                5. TEXT CLEANING: Transcribe words exactly as delivered. Do NOT append commas, periods, or punctuation marks to the text strings.
                """

        uploaded = None
        try:
            with open(chunk_path, "rb") as f:
                uploaded = client.files.upload(
                    file=f,
                    config=types.UploadFileConfig(mime_type="audio/wav")
                )

            while uploaded.state.name == "PROCESSING":
                time.sleep(1)
                uploaded = client.files.get(name=uploaded.name)

            if uploaded.state.name != "ACTIVE":
                print(f"SKIP — file ended in state {uploaded.state.name}")
                continue

            response = client.models.generate_content(
                model=MODEL,
                contents=[types.Content(role="user", parts=[
                    types.Part(file_data=types.FileData(file_uri=uploaded.uri, mime_type="audio/wav")),
                    types.Part(text=PROMPT),
                ])],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=AudioTranscriptionSchema,
                    temperature=0.0,
                )
            )
            responses.append((chunk_start, response))
            print("Done.")

        except Exception as e:
            print(f"ERROR: {e}")
        finally:
            if uploaded:
                try: client.files.delete(name=uploaded.name)
                except: pass
            if os.path.exists(chunk_path):
                os.remove(chunk_path)
            i+=1

    return responses


def parse_phrases_from_json(responses, sr, full_audio_len, merge_gap_sec=MIN_SIL_SEC):
    raw_phrases = {}

    for chunk_start, response in responses:
        if not response.text:
            continue
        try:
            data = AudioTranscriptionSchema.model_validate_json(response.text)
            for item in data.phrases:
                w_text = item.phrase.strip()
                if not w_text:
                    continue

                global_start = max(0, min(int(item.start_sec * sr), full_audio_len - 1))
                global_end   = max(0, min(int(item.end_sec   * sr), full_audio_len))

                if global_end > global_start:
                    if chunk_start not in raw_phrases:
                        raw_phrases[chunk_start] = [(global_start, global_end, w_text)]
                    else:
                        raw_phrases[chunk_start].append((global_start, global_end, w_text))

        except Exception as e:
            print(f"\n[PARSER WARNING] Skipped unparsable chunk sequence: {e}")
            continue

    print(f"[PARSER] Raw phrases before merge: {sum(len(v) for v in raw_phrases.values())}")

    def merge_phrases(phrases):
        gap_samples = int(merge_gap_sec * sr)
        merged      = sorted(phrases, key=lambda x: x[0])
        changed     = True

        while changed:
            changed = False
            result  = []
            i       = 0
            while i < len(merged):
                cur_s, cur_e, cur_t = merged[i]
                while i + 1 < len(merged):
                    nxt_s, nxt_e, nxt_t = merged[i + 1]
                    if nxt_s - cur_e <= gap_samples:
                        cur_e  = nxt_e
                        cur_t += " " + nxt_t
                        i     += 1
                        changed = True
                    else:
                        break
                result.append((cur_s, cur_e, cur_t))
                i += 1
            merged = result

        return merged

    merged_phrases = {}
    for k, v in raw_phrases.items():
        print(f"\n[PARSER] Chunk {k/sr:.1f}s — raw phrases:")
        for s, e, t in v:
            print(f"  {s/sr:.1f}s→{e/sr:.1f}s: {t}")

        merged = merge_phrases(v)
        merged_phrases[k] = merged

        print(f"[PARSER] Chunk {k/sr:.1f}s — after merge (gap ≤ {merge_gap_sec}s): {len(merged)}")
        for s, e, t in merged:
            print(f"  {s/sr:.1f}s→{e/sr:.1f}s: {t}")

    total_raw    = sum(len(v) for v in raw_phrases.values())
    total_merged = sum(len(v) for v in merged_phrases.values())
    print(f"\n[PARSER] Total phrases merged away: {total_raw - total_merged}")

    return merged_phrases


def _extract_features(y: np.ndarray, sr: int) -> np.ndarray:
    mfcc  = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=N_MFCC, hop_length=HOP_LEN)
    onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP_LEN)[np.newaxis, :]
    rms   = librosa.feature.rms(y=y, hop_length=HOP_LEN)

    T = min(mfcc.shape[1], onset.shape[1], rms.shape[1])
    mfcc, onset, rms = mfcc[:, :T], onset[:, :T], rms[:, :T]

    def _norm(x):
        return x / (np.linalg.norm(x) + 1e-10)

    return np.vstack([_norm(mfcc), _norm(onset), _norm(rms)])   # (15 × T)


def build_alignment(
    v_orig: np.ndarray, sr_orig: int,
    v_dub:  np.ndarray, sr_dub:  int,
) -> tuple[np.ndarray, float]:
    if sr_dub != sr_orig:
        v_dub = librosa.resample(v_dub, orig_sr=sr_dub, target_sr=sr_orig)

    print("\n[DTW] Extracting multi-feature representations...")

    feat_orig = _extract_features(v_orig, sr_orig)
    feat_dub  = _extract_features(v_dub,  sr_orig)

    T_o, T_d = feat_orig.shape[1], feat_dub.shape[1]
    band     = max(1, int(WARP_RADIUS * max(T_o, T_d)))

    D, wp = librosa.sequence.dtw(
        feat_orig, feat_dub,
        metric="cosine",
        global_constraints=True,
        band_rad=band,
    )

    wp        = wp[::-1].T                              # flip end→start to start→end; shape (2, P)
    norm_cost = float(D[T_o - 1, T_d - 1]) / max(wp.shape[1], 1)

    if norm_cost >= DTW_WARN_THR:
        warnings.warn(
            f"DTW normalised cost {norm_cost:.3f} ≥ threshold {DTW_WARN_THR}. "
            "Alignment may be unreliable; linear time-scaling fallback will be used.",
            stacklevel=2,
        )

    status = "GOOD" if norm_cost < DTW_WARN_THR else "POOR – linear fallback active"
    print(f"[DTW] Normalised cost: {norm_cost:.4f}  →  {status}")
    print(f"[DTW] Warp path length: {wp.shape[1]} frames")

    return wp, norm_cost


def _warp_intervals(
    orig_intervals: list[tuple[int, int]],
    wp:             np.ndarray,
    sr_dub:         int,
    sr_orig:        int,
    norm_cost:      float,
    dub_len:        int,
) -> list[tuple[int, int]]:

    if norm_cost >= DTW_WARN_THR:
        orig_total = max(wp[0, -1] * HOP_LEN, 1)
        dub_total  = max(wp[1, -1] * HOP_LEN, 1)
        ratio      = dub_total / orig_total

        dub_intervals = []
        for s_samp, e_samp in orig_intervals:
            ds = max(0, min(int(round(s_samp * ratio)), dub_len - 1))
            de = max(0, min(int(round(e_samp * ratio)), dub_len))
            if de > ds:
                dub_intervals.append((ds, de))
        return dub_intervals

    orig_frames = wp[0].astype(float)
    dub_frames  = wp[1].astype(float)

    _, unique_idx = np.unique(orig_frames, return_index=True)
    orig_u = orig_frames[unique_idx]
    dub_u  = np.maximum.accumulate(dub_frames[unique_idx])

    dub_intervals = []
    for s_samp, e_samp in orig_intervals:
        dub_s_frame = np.interp(s_samp / HOP_LEN, orig_u, dub_u)
        dub_e_frame = np.interp(e_samp / HOP_LEN, orig_u, dub_u)

        ds = max(0, min(int(round(dub_s_frame * HOP_LEN)), dub_len - 1))
        de = max(0, min(int(round(dub_e_frame * HOP_LEN)), dub_len))

        if de > ds:
            dub_intervals.append((ds, de))

    return dub_intervals


def get_intervals(vocals, n_chunks, sr):
    full_audio_len = len(vocals)
    chunk_samples  = int(full_audio_len / n_chunks)

    if chunk_samples < MIN_CHUNK_DUR * sr:
        print(f"[WARNING] Chunk size {chunk_samples/sr:.1f}s is below minimum {MIN_CHUNK_DUR}s")

    intervals = []
    for i in range(n_chunks):
        start = i * chunk_samples
        end   = start + chunk_samples if i < n_chunks - 1 else full_audio_len
        intervals.append((start, end))

    return intervals

'''def get_chunks(orig_upload, dub_upload):
    v_orig, n_orig, sr_orig, v_dub, n_dub, sr_dub, orig_path, dub_path = seperate(orig_upload, dub_upload)

    wp, dtw_cost = build_alignment(v_orig, sr_orig, v_dub, sr_dub)

    orig_responses = get_word_timestamps(v_orig, len(v_orig), sr_orig, "Original")
    orig_phrases   = parse_phrases_from_json(orig_responses, sr_orig, full_audio_len=len(v_orig))

    orig_intervals = [(s, e) for s, e, _ in orig_phrases]
    dub_intervals  = _warp_intervals(
        orig_intervals,
        wp,
        sr_dub    = sr_dub,
        sr_orig   = sr_orig,
        norm_cost = dtw_cost,
        dub_len   = len(v_dub),
    )

    orig_intervals = _filter_intervals(orig_intervals, sr_orig)
    dub_intervals  = _filter_intervals(dub_intervals,  sr_dub)

    chunk_video(dub_path, dub_intervals, sr_dub)

    return orig_intervals, dub_intervals, v_orig, n_orig, sr_orig, v_dub, n_dub, sr_dub'''


def get_chunks(v_orig, sr_orig, v_dub, sr_dub, dub_path, n_chunks):
    wp, dtw_cost = build_alignment(v_orig, sr_orig, v_dub, sr_dub)

    # Fixed chunks
    orig_intervals = get_intervals(v_orig, n_chunks, sr_orig)
    dub_intervals  = _warp_intervals(
        orig_intervals,
        wp,
        sr_dub    = sr_dub,
        sr_orig   = sr_orig,
        norm_cost = dtw_cost,
        dub_len   = len(v_dub),
    )

    chunk_video(dub_path, dub_intervals, sr_dub)

    # ASR-aligned chunks
    orig_responses     = get_word_timestamps(v_orig, orig_intervals, sr_orig)
    orig_phrases       = parse_phrases_from_json(orig_responses, sr_orig, full_audio_len=len(v_orig))

    orig_asr_intervals = {k: [(s, e) for s, e, _ in phrases] for k, phrases in orig_phrases.items()}
    dub_asr_intervals  = {
        k: _warp_intervals(
            intervals,
            wp,
            sr_dub    = sr_dub,
            sr_orig   = sr_orig,
            norm_cost = dtw_cost,
            dub_len   = len(v_dub),
        )
        for k, intervals in orig_asr_intervals.items() 
    }

    return orig_intervals, dub_intervals, orig_asr_intervals, dub_asr_intervals