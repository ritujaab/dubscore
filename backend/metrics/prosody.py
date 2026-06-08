import numpy as np
import pandas as pd
import librosa
from scipy.ndimage import uniform_filter1d
from scipy.signal import find_peaks
import warnings

warnings.filterwarnings("ignore")

WEIGHTS = {"pitch": 0.45, "energy": 0.35, "rhythm": 0.20}


def _smoothness_score(curve: np.ndarray, sensitivity: float) -> float:
    valid = curve[~np.isnan(curve)]
    if len(valid) < 4:
        return 0.0
    rng = valid.max() - valid.min()
    if rng < 1e-9:
        return 1.0
    norm  = (valid - valid.min()) / rng
    d2    = np.diff(norm, n=2)
    roughness = np.sqrt(np.mean(d2 ** 2))
    return float(np.clip(1.0 / (1.0 + sensitivity * roughness), 0.0, 1.0))


def _pitch_score(y: np.ndarray, sr: int, hop: int) -> float:
    f0, voiced_flag, _ = librosa.pyin(
        y,
        fmin=librosa.note_to_hz("C2"),
        fmax=librosa.note_to_hz("C7"),
        sr=sr, hop_length=hop, frame_length=1024,
    )
    voiced_mask = voiced_flag[:len(f0)]
    if voiced_mask.sum() < 4:
        return 0.0
    smooth_frames = max(3, int(0.04 * sr / hop))
    f0_smooth = uniform_filter1d(np.nan_to_num(f0, nan=0.0), size=smooth_frames)
    f0_smooth[~voiced_mask] = np.nan
    return _smoothness_score(f0_smooth[voiced_mask], sensitivity=3.5)


def _energy_score(rms: np.ndarray, sr: int, hop: int) -> float:
    smooth_frames = max(3, int(0.03 * sr / hop))
    rms_smooth    = uniform_filter1d(rms, size=smooth_frames)
    score         = _smoothness_score(rms_smooth, sensitivity=3.0)
    dynamic_range = rms.max() / (rms.mean() + 1e-9)
    if dynamic_range < 2.5:
        score *= 0.6
    return float(np.clip(score, 0.0, 1.0))


def _rhythm_score(rms: np.ndarray, sr: int, hop: int) -> float:
    rms_norm = (rms - rms.min()) / (rms.max() - rms.min() + 1e-9)
    min_dist = max(1, int(0.15 * sr / hop))
    peaks, _ = find_peaks(rms_norm, height=0.25, distance=min_dist)
    if len(peaks) < 3:
        return 0.65
    intervals    = np.diff(peaks) * hop / sr
    cv           = intervals.std() / (intervals.mean() + 1e-9)
    score        = 1.0 / (1.0 + 0.8 * cv)
    if cv < 0.30:
        score *= 0.75
    duration     = len(rms) * hop / sr
    if len(peaks) / duration > 4.0:
        score *= 0.80
    return float(np.clip(score, 0.0, 1.0))


def _score_chunk(y: np.ndarray, sr: int) -> dict:
    hop = 256
    rms = librosa.feature.rms(y=y, frame_length=1024, hop_length=hop)[0]
    p   = _pitch_score(y, sr, hop)
    e   = _energy_score(rms, sr, hop)
    r   = _rhythm_score(rms, sr, hop)
    total = WEIGHTS["pitch"] * p + WEIGHTS["energy"] * e + WEIGHTS["rhythm"] * r
    return {"pitch": round(p, 4), "energy": round(e, 4), "rhythm": round(r, 4), "total": round(total, 4)}


def prosody_score(
    dub_intervals: list[tuple[int, int]],
    v_dub: np.ndarray,
    sr_dub: int,
) -> tuple[float, pd.DataFrame]:
    report = []

    for i, (s, e) in enumerate(dub_intervals):
        chunk = v_dub[s:e].astype(np.float32)
        if len(chunk) < sr_dub * 1.0:   # skip < 1s
            continue

        scores = _score_chunk(chunk, sr_dub)
        report.append({
            "Segment":  i + 1,
            "Start":    round(s / sr_dub, 2),
            "End":      round(e / sr_dub, 2),
            "Pitch":    scores["pitch"],
            "Energy":   scores["energy"],
            "Rhythm":   scores["rhythm"],
            "Score":    scores["total"],
            "Status":   "GOOD" if scores["total"] >= 0.75
                        else "OK" if scores["total"] >= 0.60
                        else "NEEDS WORK",
        })

    df = pd.DataFrame(report)
    print(df)

    if df.empty:
        return 0.0, df

    dur     = df["End"] - df["Start"]
    total_w = dur.sum()
    score   = float((df["Score"] * dur).sum() / total_w) if total_w > 0 else 0.0

    print(f"[prosody] Overall score: {score:.4f}")
    return score, df