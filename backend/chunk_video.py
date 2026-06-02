import os
import shutil
import subprocess

AUD_DIR = "audio"

def chunk_video(video_path, intervals, sr):

    chunks_dir = os.path.join(AUD_DIR, "chunks")

    if os.path.exists(chunks_dir):
        shutil.rmtree(chunks_dir)

    os.makedirs(chunks_dir, exist_ok=True)

    for idx, (s_samp, e_samp) in enumerate(intervals):

        start_sec = s_samp / sr
        end_sec   = e_samp / sr
        duration  = end_sec - start_sec

        out_path = os.path.join(
            chunks_dir,
            f"dub_chunk_{idx:04d}.mp4"
        )

        print(f"Creating chunk {idx}: {start_sec:.2f}s -> {end_sec:.2f}s")

        cmd = [
            "ffmpeg",
            "-y",
            "-i", video_path,
            "-ss", str(start_sec),
            "-t", str(duration),
            "-c:v", "libx264",
            "-c:a", "aac",
            out_path
        ]

        subprocess.run(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )