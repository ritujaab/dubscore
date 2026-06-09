import os, shutil
import numpy as np
from pydub import AudioSegment
from moviepy import VideoFileClip
from sentence_transformers import SentenceTransformer
from google.genai import Client, types
from dotenv import load_dotenv
import tempfile

load_dotenv()

_embedding_model = None
_gemini_client   = None

def _get_embedding_model():
    global _embedding_model
    if _embedding_model is None:
        _embedding_model = SentenceTransformer(
            "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"
        )
    return _embedding_model

def _get_gemini():
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = Client(api_key=os.environ["GEMINI_API_KEY"])
    return _gemini_client


def _extract_audio(video_path: str, wav_path: str):
    os.makedirs(os.path.dirname(wav_path), exist_ok=True)
    clip = VideoFileClip(video_path)
    clip.audio.write_audiofile(wav_path, codec="pcm_s16le", fps=16000, logger=None)
    clip.close()


def _split_audio(wav_path: str, out_dir: str, chunk_sec: int = 60) -> list[str]:
    if os.path.exists(out_dir):
        shutil.rmtree(out_dir)
    os.makedirs(out_dir)
    audio    = AudioSegment.from_wav(wav_path)
    chunk_ms = chunk_sec * 1000
    files    = []
    for i, start in enumerate(range(0, len(audio), chunk_ms)):
        chunk = audio[start : start + chunk_ms]
        if len(chunk) < 5000:
            continue
        path = os.path.join(out_dir, f"chunk_{i:04d}.wav")
        chunk.export(path, format="wav")
        files.append(path)
    return files


def _transcribe_chunk(chunk_path: str) -> str:
    client   = _get_gemini()
    uploaded = client.files.upload(file=chunk_path)
    response = client.models.generate_content(
        model="gemini-3.1-flash-lite",
        contents=[
            uploaded,
            "Generate an accurate transcript. Return transcript only. "
            "No timestamps. No explanations. Preserve the spoken language.",
        ],
    )
    try:
        client.files.delete(name=uploaded.name)
    except Exception:
        pass
    return response.text.strip()


def _video_to_transcript(video_path: str, chunk_sec: int = 60) -> str:
    tmp_dir   = tempfile.gettempdir()
    stem      = os.path.splitext(os.path.basename(video_path))[0]
    wav_path  = os.path.join(tmp_dir, f"sem_{stem}.wav")
    chunk_dir = os.path.join(tmp_dir, f"sem_chunks_{stem}")

    _extract_audio(video_path, wav_path)
    chunks = _split_audio(wav_path, chunk_dir, chunk_sec)
    parts  = []

    for i, chunk in enumerate(chunks):
        print(f"  [semantic] transcribing chunk {i+1}/{len(chunks)}")
        try:
            parts.append(_transcribe_chunk(chunk))
        except Exception as e:
            print(f"  [semantic] chunk {i+1} error: {e}")

    return "\n".join(parts)


def _text_chunks(text: str, size: int = 1000, overlap: int = 200) -> list[str]:
    chunks, start = [], 0
    while start < len(text):
        chunks.append(text[start : start + size])
        start += size - overlap
    return chunks


def semantic_score(
    dubbed_path:     str,
    reference_paths: list[str],
    chunk_sec:       int = 60,
    text_chunk_size: int = 1000,
    overlap:         int = 200,
) -> tuple[float, dict]:

    model = _get_embedding_model()

    print("[semantic] Transcribing reference videos...")
    ref_transcripts = []
    for i, path in enumerate(reference_paths):
        print(f"  Reference {i+1}/{len(reference_paths)}: {path}")
        ref_transcripts.append(_video_to_transcript(path, chunk_sec))

    ref_chunks = []
    for t in ref_transcripts:
        ref_chunks.extend(_text_chunks(t, text_chunk_size, overlap))

    print("[semantic] Transcribing dubbed video...")
    dubbed_transcript = _video_to_transcript(dubbed_path, chunk_sec)
    dub_chunks        = _text_chunks(dubbed_transcript, text_chunk_size, overlap)

    print("[semantic] Computing similarity...")
    dub_emb = model.encode(dub_chunks, normalize_embeddings=True, show_progress_bar=False)
    ref_emb = model.encode(ref_chunks, normalize_embeddings=True, show_progress_bar=False)

    sim     = dub_emb @ ref_emb.T
    best    = sim.max(axis=1)
    cov     = sim.max(axis=0)

    precision = float(np.mean(best))
    coverage  = float(np.mean(cov))
    score     = round(0.7 * precision + 0.3 * coverage, 4)

    print(f"[semantic] Score: {score:.4f}  (precision={precision:.4f}, coverage={coverage:.4f})")

    return score, {
        "score":              score,
        "precision":          round(precision, 4),
        "coverage":           round(coverage, 4),
        "chunk_scores":       [round(float(s), 4) for s in best],
        "dubbed_transcript":  dubbed_transcript,
        "ref_pool_size":      len(ref_chunks),
    }