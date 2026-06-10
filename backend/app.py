import os
import shutil
import asyncio, time
from concurrent.futures import ProcessPoolExecutor
from fastapi import FastAPI, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi import UploadFile, File
import numpy as np
import shutil

from chunk_audio import get_chunks
from extract_audio import seperate
from metrics.spnr import spnr_score
from metrics.lipsync import lipsync_score
from metrics.voice_clone import clone_score
from metrics.prosody import prosody_score
from metrics.gender_age import age_gender_score
from metrics.semantic import semantic_score as _semantic_score

app      = FastAPI(title="Dub Quality API")
executor = ProcessPoolExecutor(max_workers=4)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_ref_state: dict = {} 
_state: dict = {}

CLONE_THRESHOLD = 0.7

CLEANUP_DIRS = ["audio", "separated", "uploads", "output"]

def _require_chunks():
    if not _state:
        raise HTTPException(status_code=400, detail="Chunks not initialised. Call POST /chunks first.")

def _run_spnr(job: dict):
    score, df = spnr_score(
        job["orig_asr_intervals"], job["dub_asr_intervals"],
        job["v_orig"], job["n_orig"], job["sr_orig"],
        job["v_dub"],  job["n_dub"],  job["sr_dub"],
    )
    df = df.replace({np.nan: None})
    return {"score": score, "segments": df.to_dict(orient="records")}

def _run_lipsync(job: dict):
    score, df = lipsync_score(job["dub_intervals"], job["sr_dub"])
    df = df.replace({np.nan: None})
    return {"score": score, "segments": df.to_dict(orient="records")}

def _run_prosody(job: dict):
    score, df = prosody_score(
        job["dub_intervals"], job["v_dub"], job["sr_dub"]
    )
    df = df.replace({np.nan: None})
    return {"score": score, "segments": df.to_dict(orient="records")}

def _run_voice_authenticity(job: dict):
    clone_score_val, clone_df = clone_score(
        job["orig_intervals"], job["dub_intervals"],
        job["v_orig"], job["sr_orig"],
        job["v_dub"],  job["sr_dub"],
    )
    clone_df = clone_df.replace({np.nan: None})

    if clone_score_val >= CLONE_THRESHOLD:
        return {
            "score":    clone_score_val,
            "method":   "clone",
            "segments": clone_df.to_dict(orient="records"),
        }

    # clone failed — fall back to age/gender
    ag_score_val, ag_df = age_gender_score(
        job["dub_intervals"], job["v_dub"], job["sr_dub"]
    )
    ag_df = ag_df.replace({np.nan: None})

    return {
        "score":    ag_score_val,
        "method":   "age_gender",
        "segments": ag_df.to_dict(orient="records"),
    }

def _run_semantic(job: dict):
    score, detail = _semantic_score(
        job["dubbed_path"],
        job["reference_paths"],
    )
    return {
        "score":             score,
        "precision":         detail["precision"],
        "coverage":          detail["coverage"],
        "chunk_scores":      detail["chunk_scores"],
        "dubbed_transcript": detail["dubbed_transcript"],
        "ref_pool_size":     detail["ref_pool_size"],
    }

def _cleanup():
    for d in CLEANUP_DIRS:
        if os.path.exists(d):
            shutil.rmtree(d)
            print(f"[cleanup] Removed {d}")

# ── endpoints ─────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ready"}

@app.post("/chunks")
async def compute_chunks(
    orig_file: UploadFile = File(...),
    dub_file:  UploadFile = File(...),
    n_chunks:  int = Form(5),
):
    t0 = time.perf_counter()

    v_orig, n_orig, sr_orig, v_dub, n_dub, sr_dub, orig_path, dub_path = seperate(orig_file, dub_file)

    orig_intervals, dub_intervals, orig_asr_intervals, dub_asr_intervals = get_chunks(v_orig, sr_orig, v_dub, sr_dub, dub_path, int(n_chunks))

    _state.update({
        "orig_intervals":     orig_intervals,
        "dub_intervals":      dub_intervals,
        "orig_asr_intervals": orig_asr_intervals,
        "dub_asr_intervals":  dub_asr_intervals,
        "v_orig": v_orig, "n_orig": n_orig, "sr_orig": sr_orig,
        "v_dub":  v_dub,  "n_dub":  n_dub,  "sr_dub":  sr_dub,
        "orig_file": orig_path, "dub_file": dub_path,
    })

    elapsed = time.perf_counter() - t0

    return {
        "status":      "ok",
        "orig_chunks": len(orig_intervals),
        "dub_chunks":  len(dub_intervals),
        "runtime":     f"{int(elapsed // 60)}m {elapsed % 60:.1f}s",
    }

@app.get("/score/all")
async def get_all_scores():
    _require_chunks()
    t0   = time.perf_counter()
    loop = asyncio.get_event_loop()
    job  = dict(_state)   # snapshot so workers get a consistent copy

    spnr, lipsync, clone = await asyncio.gather(
        loop.run_in_executor(executor, _run_spnr,    job),
        loop.run_in_executor(executor, _run_lipsync, job),
        loop.run_in_executor(executor, _run_voice_authenticity,   job),
    )

    elapsed = time.perf_counter() - t0
    return {
        "spnr":        spnr,
        "lipsync":     lipsync,
        "voice_clone": clone,
        "runtime":     f"{int(elapsed // 60)}m {elapsed % 60:.1f}s",
    }


@app.get("/score/spnr")
async def get_spnr():
    _require_chunks()
    t0     = time.perf_counter()
    result = await asyncio.get_event_loop().run_in_executor(executor, _run_spnr, dict(_state))
    elapsed = time.perf_counter() - t0
    return {**result, "runtime": f"{int(elapsed // 60)}m {elapsed % 60:.1f}s"}

@app.get("/score/lipsync")
async def get_lipsync():
    _require_chunks()
    t0     = time.perf_counter()
    result = await asyncio.get_event_loop().run_in_executor(executor, _run_lipsync, dict(_state))
    elapsed = time.perf_counter() - t0
    return {**result, "runtime": f"{int(elapsed // 60)}m {elapsed % 60:.1f}s"}

@app.get("/score/prosody")
async def get_prosody():
    _require_chunks()
    t0     = time.perf_counter()
    result = await asyncio.get_event_loop().run_in_executor(
        executor, _run_prosody, dict(_state)
    )
    elapsed = time.perf_counter() - t0
    return {**result, "runtime": f"{int(elapsed // 60)}m {elapsed % 60:.1f}s"}

@app.get("/score/voice_authenticity")
async def get_voice_authenticity():
    _require_chunks()
    t0     = time.perf_counter()
    result = await asyncio.get_event_loop().run_in_executor(
        executor, _run_voice_authenticity, dict(_state)
    )
    elapsed = time.perf_counter() - t0
    return {**result, "runtime": f"{int(elapsed // 60)}m {elapsed % 60:.1f}s"}

@app.post("/reference/analyse")
async def reference_analyse(
    dubbed_file:    UploadFile = File(...),
    reference_files: list[UploadFile] = File(...),
):
    os.makedirs("uploads", exist_ok=True)
    dub_path = f"uploads/{dubbed_file.filename}"
    with open(dub_path, "wb") as f:
        shutil.copyfileobj(dubbed_file.file, f)

    ref_paths = []
    for rf in reference_files:
        p = f"uploads/{rf.filename}"
        with open(p, "wb") as f:
            shutil.copyfileobj(rf.file, f)
        ref_paths.append(p)

    _ref_state.update({"dubbed_path": dub_path, "reference_paths": ref_paths})

    t0     = time.perf_counter()
    result = await asyncio.get_event_loop().run_in_executor(
        executor, _run_semantic, dict(_ref_state)
    )
    elapsed = time.perf_counter() - t0

    return {**result, "runtime": f"{int(elapsed // 60)}m {elapsed % 60:.1f}s"}

@app.get("/status")
def status():
    if not _state:
        return {"ready": False}
    return {
        "ready":       True,
        "orig_chunks": len(_state["orig_intervals"]),
        "dub_chunks":  len(_state["dub_intervals"]),
        "orig_file":   _state["orig_file"],
        "dub_file":    _state["dub_file"],
    }

@app.post("/cleanup")
def cleanup():
    _cleanup()
    _state.clear()
    return {"status": "ok"}