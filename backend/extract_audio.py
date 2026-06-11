import subprocess
import sys, os, shutil, librosa
from moviepy import VideoFileClip
import torch
from fastapi import UploadFile


SEP_DIR       = "separated"
AUD_DIR       = "audio"
UPLOAD_DIR = "uploads"
DEVICE        = "cuda" if torch.cuda.is_available() else "cpu"

os.makedirs(AUD_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

def save_upload(upload: UploadFile, label: str):
    os.makedirs("uploads", exist_ok=True)
    ext = os.path.splitext(upload.filename)[1]

    save_path = os.path.join(
        UPLOAD_DIR,
        f"{label}{ext}"
    )

    with open(save_path, "wb") as f:
        shutil.copyfileobj(upload.file, f)

    return save_path

def extract_and_separate(video_path: str, label: str):
    stem_dir = os.path.join(SEP_DIR, "htdemucs", f"{label}_full")
    if os.path.exists(stem_dir):
        shutil.rmtree(stem_dir)
        print(f"  Cleared old stems for '{label}'")

    wav_path = f"{AUD_DIR}/{label}_full.wav"
    print(f"\n[{label}] Extracting audio...")
    clip = VideoFileClip(video_path)
    clip.audio.write_audiofile(wav_path, fps=44100, logger=None)
    clip.close()

    print(f"[{label}] Running Demucs...")

    cmd = [
        sys.executable, "-m", "demucs.separate",
        "-n", "htdemucs",
        "-d", DEVICE,
        "--two-stems=vocals",
        "--out", SEP_DIR,
        wav_path
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="ignore")

    if result.returncode != 0:
        print(f"=== DEMUCS STDOUT ===\n{result.stdout}")
        print(f"=== DEMUCS STDERR ===\n{result.stderr}")
        raise RuntimeError(f"Demucs failed for '{label}' with exit code {result.returncode}")

    print(f"[{label}] Done.")

def load_stems(label: str):
    base      = os.path.join(SEP_DIR, "htdemucs", f"{label}_full")
    vocals,   sr = librosa.load(os.path.join(base, "vocals.wav"),    sr=None)
    no_vocals, _ = librosa.load(os.path.join(base, "no_vocals.wav"), sr=None)
    return vocals, no_vocals, sr

def seperate(orig_upload, dub_upload):
    
    orig_path = save_upload(orig_upload, "orig")
    dub_path = save_upload(dub_upload, "dub")

    extract_and_separate(orig_path, "orig")
    extract_and_separate(dub_path,  "dub")

    print("\nLoading stems...")
    v_orig, n_orig, sr_orig = load_stems("orig")
    v_dub,  n_dub,  sr_dub  = load_stems("dub")

    return v_orig, n_orig, sr_orig, v_dub,  n_dub,  sr_dub, orig_path, dub_path