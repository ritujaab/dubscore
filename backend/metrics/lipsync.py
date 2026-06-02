import os, subprocess, re, shutil
import pandas as pd


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CHUNKS_DIR = os.path.abspath(
    os.path.join(BASE_DIR, "../audio/chunks")
)

DATA_DIR = os.path.abspath(
    os.path.join(BASE_DIR, "../output")
)

SYNCNET_DIR = os.path.abspath(
    os.path.join(BASE_DIR, "../syncnet_python")
)


def get_video_fps(video_path):
    r = subprocess.run(
        f"ffprobe -v error -select_streams v:0 "
        f"-show_entries stream=r_frame_rate "
        f"-of default=noprint_wrappers=1:nokey=1 {video_path}",
        shell=True, capture_output=True, text=True, encoding="utf-8", errors="ignore")
    try:
        num, den = r.stdout.strip().split('/')
        return float(num) / float(den)
    except Exception:
        return 25.0


def run_pipeline_for_video(video_path, reference, data_dir=DATA_DIR):
    p1 = subprocess.Popen(
        f"python run_pipeline.py --videofile {video_path} "
        f"--reference {reference} --data_dir {data_dir} --overwrite",
        shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, cwd=SYNCNET_DIR, encoding="utf-8", errors="ignore")

    lines = []
    for line in p1.stdout:
        lines.append(line)
    p1.wait()

    if p1.returncode != 0:
        print(lines)
        return None

    p2 = subprocess.Popen(
        f"python run_syncnet.py --videofile {video_path} "
        f"--reference {reference} --data_dir {data_dir}",
        shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, cwd=SYNCNET_DIR)

    output_lines = []
    for line in p2.stdout:
        output_lines.append(line)
    p2.wait()

    output = "".join(output_lines)

    offset_m = re.findall(r'AV offset:\s+(-?\d+)', output)
    dist_m   = re.findall(r'Min dist:\s+([\d.]+)',  output)
    conf_m   = re.findall(r'Confidence:\s+([\d.]+)', output)

    if not offset_m:
        return None

    return {
        'actual_lag': [int(v)   for v in offset_m],
        'min_dist':   [float(v) for v in dist_m]  if dist_m else None,
        'confidence': [float(v) for v in conf_m]  if conf_m else None,
    }


def load_chunks(intervals: list[tuple[int, int]], sr: int) -> list[tuple[str, float, float]]:
    """Read pre-cut chunk files from audio/chunks/ for the given label."""
    chunks = []
    for idx, (s, e) in enumerate(intervals):
        path = os.path.join(CHUNKS_DIR, f"dub_chunk_{idx:04d}.mp4")
        if os.path.exists(path) and os.path.getsize(path) > 10_000:
            chunks.append((path, round(s / sr, 2), round(e / sr, 2)))
        else:
            print(f"  [load_chunks] WARNING: missing or empty chunk {path}")
    return chunks


def analyse_chunks(intervals: list[tuple[int, int]], sr: int, data_dir=DATA_DIR) -> list:
    chunks = load_chunks(intervals, sr)

    if not chunks:
        return []

    results = []
    for i, (chunk_path, start, end) in enumerate(chunks):
        ref            = f"dub_c{i:04d}"
        chunk_data_dir = os.path.join(data_dir, f"sd_dub_c{i:04d}")

        res = run_pipeline_for_video(chunk_path, ref, chunk_data_dir)

        if res and res['min_dist'] is not None:
            n_tracks = len(res['actual_lag'])
            for t in range(n_tracks):
                lag        = float(res['actual_lag'][t])
                conf       = float(res['confidence'][t])
                results.append((start, end, lag, conf))
                print(f"  [{i+1:>2}/{len(chunks)}] track {t+1}/{n_tracks}  "
                      f"{start:5.1f}s–{end:5.1f}s  "
                      f"lag={lag:+.0f} fr  "
                      f"min_dist={res['min_dist'][t]:.3f}  "
                      f"syncnet_conf={res['confidence'][t]:.2f}")
        else:
            print(f"  [{i+1:>2}/{len(chunks)}] "
                  f"{start:5.1f}s–{end:5.1f}s  "
                  f"NO RESULT — face not tracked or pipeline failed")

    return results


def compute_lipsync(dub_intervals, sr):

    if os.path.exists(DATA_DIR):
        shutil.rmtree(DATA_DIR)

    os.makedirs(DATA_DIR, exist_ok=True)
    results = analyse_chunks(dub_intervals, sr)

    best = {}
    for s, e, l, c in results:
        if s not in best or abs(l) < abs(best[s][2]):
            best[s] = (s, e, l, c)

    report = []
    for i, (ds, de) in enumerate(dub_intervals, start=1):
        start = round(ds / sr, 2)
        end   = round(de / sr, 2)

        if start in best:
            _, _, l, c = best[start]
            report.append({
                "Segment":    i,
                "Start":      start,
                "End":        end,
                "Least Lag":  l,
                "Confidence": c,
                "Status":     "GOOD" if abs(l) < 5 else "OK" if abs(l) < 8 else "BAD",
            })
        else:
            report.append({
                "Segment":    i,
                "Start":      start,
                "End":        end,
                "Least Lag":  None,
                "Confidence": None,
                "Status":     "NO RESULT",
            })

    return pd.DataFrame(report)

def lipsync_score(dub_intervals, sr):

    df = compute_lipsync(dub_intervals, sr)

    print(df)

    if df.empty:
        return 0.0, df

    valid = df.dropna(subset=["Least Lag", "Confidence"]).copy()

    if valid.empty:
        return 0.0, df

    dur = (valid["End"] - valid["Start"]).clip(lower=0)

    weights = valid["Confidence"].clip(lower=0) * dur

    total_w = weights.sum()

    if total_w == 0:
        return 0.0, df

    lag_scores = (1.0 - (valid["Least Lag"].abs() / 8.0)).clip(lower=0.0)

    score = float((lag_scores * weights).sum() / total_w    )

    return score, df