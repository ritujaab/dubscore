import os
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import cv2
from transformers import (
    Wav2Vec2Processor, AutoConfig, AutoImageProcessor,
    ViTModel, ViTPreTrainedModel,
)
from transformers.models.wav2vec2.modeling_wav2vec2 import (
    Wav2Vec2Model, Wav2Vec2PreTrainedModel,
)
from transformers.modeling_outputs import ImageClassifierOutput
from PIL import Image

# ──────────────────────────────────────────────
# Audio model
# ──────────────────────────────────────────────

class _ModelHead(nn.Module):
    def __init__(self, config, num_labels):
        super().__init__()
        self.dense    = nn.Linear(config.hidden_size, config.hidden_size)
        self.dropout  = nn.Dropout(config.final_dropout)
        self.out_proj = nn.Linear(config.hidden_size, num_labels)

    def forward(self, features, **kwargs):
        x = self.dropout(features)
        x = torch.tanh(self.dense(x))
        x = self.dropout(x)
        return self.out_proj(x)


class _AgeGenderAudioModel(Wav2Vec2PreTrainedModel):
    def __init__(self, config):
        super().__init__(config)
        self.config   = config
        self.wav2vec2 = Wav2Vec2Model(config)
        self.age      = _ModelHead(config, 1)
        self.gender   = _ModelHead(config, 3)
        self.init_weights()

    def forward(self, input_values):
        hidden_states = torch.mean(self.wav2vec2(input_values)[0], dim=1)
        return hidden_states, self.age(hidden_states), torch.softmax(self.gender(hidden_states), dim=1)


# ──────────────────────────────────────────────
# Video model (ViT — replaces DeepFace)
# ──────────────────────────────────────────────

class _AgeGenderViTModel(ViTPreTrainedModel):
    def __init__(self, config):
        super().__init__(config)
        self.vit = ViTModel(config, add_pooling_layer=False)
        self.age_head = nn.Sequential(
            nn.Linear(config.hidden_size, 256), nn.ReLU(), nn.Dropout(0.1),
            nn.Linear(256, 64),  nn.ReLU(), nn.Dropout(0.1),
            nn.Linear(64, 1)
        )
        self.gender_head = nn.Sequential(
            nn.Linear(config.hidden_size, 256), nn.ReLU(), nn.Dropout(0.1),
            nn.Linear(256, 64),  nn.ReLU(), nn.Dropout(0.1),
            nn.Linear(64, 1), nn.Sigmoid()
        )
        self.num_labels = 2
        self.config.num_labels = 2
        self.classifier = nn.Linear(config.hidden_size, 2)
        self.post_init()

    def forward(self, pixel_values=None, **kwargs):
        pooled = self.vit(pixel_values=pixel_values)[0][:, 0]
        return ImageClassifierOutput(
            logits=torch.cat([self.age_head(pooled), self.gender_head(pooled)], dim=1)
        )


# ──────────────────────────────────────────────
# Lazy-loaded globals
# ──────────────────────────────────────────────

_DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

_audio_processor = None
_audio_model     = None
_AUDIO_MODEL_ID  = "audeering/wav2vec2-large-robust-24-ft-age-gender"

_vit_processor   = None
_vit_model       = None
_VIT_MODEL_ID    = "abhilash88/age-gender-prediction"


def _load_audio_model():
    global _audio_processor, _audio_model
    if _audio_processor is None:
        print("[age_gender] Loading audio model...")
        _audio_processor = Wav2Vec2Processor.from_pretrained(_AUDIO_MODEL_ID)
        _audio_model     = _AgeGenderAudioModel.from_pretrained(_AUDIO_MODEL_ID).to(_DEVICE)
        print("[age_gender] Audio model ready.")


def _load_vit_model():
    global _vit_processor, _vit_model
    if _vit_processor is None:
        print("[age_gender] Loading video (ViT) model...")
        _vit_processor = AutoImageProcessor.from_pretrained(_VIT_MODEL_ID)
        _vit_processor.do_center_crop = False
        _vit_processor.size           = {"height": 224, "width": 224}

        _config    = AutoConfig.from_pretrained(_VIT_MODEL_ID, trust_remote_code=True)
        _vit_model = _AgeGenderViTModel.from_pretrained(
            _VIT_MODEL_ID, config=_config,
            ignore_mismatched_sizes=True, trust_remote_code=True
        ).to(_DEVICE)
        _vit_model.eval()
        print("[age_gender] Video model ready.")


# ──────────────────────────────────────────────
# Core prediction helpers
# ──────────────────────────────────────────────

def _predict_audio_age_gender(signal: np.ndarray, sampling_rate: int) -> dict:
    _load_audio_model()
    y = _audio_processor(signal, sampling_rate=sampling_rate)
    y = torch.from_numpy(y["input_values"][0].reshape(1, -1)).to(_DEVICE)

    with torch.no_grad():
        _, logits_age, logits_gender = _audio_model(y)

    age          = float(logits_age.squeeze().cpu().numpy()) * 100
    gender_probs = logits_gender.squeeze().cpu().numpy()
    gender_map   = {0: "female", 1: "male", 2: "child"}

    return {
        "age":          age,
        "gender":       gender_map[int(np.argmax(gender_probs))],
        "gender_probs": gender_probs,
    }


def _predict_frame_age_gender(frame_bgr: np.ndarray) -> dict | None:
    """Predict age/gender from a single BGR frame using the ViT model."""
    _load_vit_model()

    image  = Image.fromarray(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))
    inputs = _vit_processor(images=image, return_tensors="pt")
    inputs = {k: v.to(_DEVICE) for k, v in inputs.items()}

    with torch.no_grad():
        logits = _vit_model(**inputs).logits[0]

    age                = int(round(max(0, min(100, logits[0].item()))))
    gender_prob_female = logits[1].item()
    gender             = "woman" if gender_prob_female >= 0.5 else "man"

    return {"age": age, "gender": gender}


def _predict_video_age_gender(video_path: str) -> dict | None:
    """Extract first readable frame and run ViT age/gender prediction."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"[age_gender] Could not open {video_path}")
        return None

    ret, frame = cap.read()
    cap.release()

    if not ret:
        print(f"[age_gender] Could not read frame from {video_path}")
        return None

    try:
        return _predict_frame_age_gender(frame)
    except Exception as e:
        print(f"[age_gender] ViT error on {video_path}: {e}")
        return None


# ──────────────────────────────────────────────
# Scoring (unchanged)
# ──────────────────────────────────────────────

def _gender_match_score(video_gender: str, audio_gender: str) -> float:
    normalise = {"man": "male", "woman": "female"}
    vg = normalise.get(video_gender, video_gender)
    ag = normalise.get(audio_gender, audio_gender)
    return 1.0 if vg == ag else 0.0


def _age_match_score(video_age: float, audio_age: float, tolerance: float = 15.0) -> float:
    diff = abs(video_age - audio_age)
    return float(np.exp(-0.5 * (diff / tolerance) ** 2))


def _compute_match_score(video_result: dict, audio_result: dict) -> float:
    g_score = _gender_match_score(video_result["gender"], audio_result["gender"])
    a_score = _age_match_score(video_result["age"],       audio_result["age"])
    return round(0.6 * g_score + 0.4 * a_score, 4)


# ──────────────────────────────────────────────
# Public entry-point (unchanged)
# ──────────────────────────────────────────────

def age_gender_score(
    dub_intervals: list,
    v_dub: np.ndarray,
    sr_dub: int,
    video_root: str = "./output",
) -> tuple[float, pd.DataFrame]:

    audio_results = _collect_audio_predictions(dub_intervals, v_dub, sr_dub)
    video_results = _collect_video_predictions(video_root)

    if not audio_results or not video_results:
        print("[age_gender] Not enough data to compute score.")
        return 0.0, pd.DataFrame()

    report = []
    for seg_idx, (audio, faces) in enumerate(zip(audio_results, video_results.values())):
        face_scores = [_compute_match_score(face, audio) for face in faces]
        best_score  = max(face_scores) if face_scores else 0.0
        best_face   = faces[int(np.argmax(face_scores))] if face_scores else {}

        report.append({
            "Segment":          seg_idx,
            "Audio_Age":        round(audio["age"], 2),
            "Audio_Gender":     audio["gender"],
            "Best_Face_Age":    round(best_face.get("age", 0), 2),
            "Best_Face_Gender": best_face.get("gender", "unknown"),
            "Num_Faces":        len(faces),
            "Best_Score":       round(best_score, 4),
            "Status":           "OK" if best_score >= 0.5 else "FLAG",
        })

        print(f"[age_gender] Segment {seg_idx} — audio=({audio['gender']}, {audio['age']:.1f}), "
              f"face scores={[round(s,3) for s in face_scores]}, best={best_score:.4f}")

    df      = pd.DataFrame(report)
    overall = float(df["Best_Score"].mean()) if not df.empty else 0.0
    print(f"\n[age_gender] Overall score: {overall:.4f}")
    return overall, df


# ──────────────────────────────────────────────
# Internal helpers (unchanged)
# ──────────────────────────────────────────────

def _collect_audio_predictions(dub_intervals, v_dub: np.ndarray, sr_dub: int) -> list:
    import librosa
    results = []
    for interval in dub_intervals:
        start, end = interval[0], interval[1]
        if isinstance(start, float) or start < len(v_dub) * 0.01:
            start_s, end_s = int(start * sr_dub), int(end * sr_dub)
        else:
            start_s, end_s = int(start), int(end)

        chunk = v_dub[start_s:end_s].astype(np.float32)
        if chunk.size == 0:
            continue
        if sr_dub != 16000:
            chunk = librosa.resample(chunk, orig_sr=sr_dub, target_sr=16000)

        results.append(_predict_audio_age_gender(chunk, 16000))
    return results


def _collect_video_predictions(video_root: str) -> dict:
    results = {}
    if not os.path.isdir(video_root):
        print(f"[age_gender] video_root not found: {video_root}")
        return results

    for folder_name in sorted(os.listdir(video_root)):
        folder_path = os.path.join(video_root, folder_name)
        pycrop_path = os.path.join(folder_path, "pycrop")
        if not os.path.isdir(pycrop_path):
            continue

        faces = []
        for inner_folder in os.listdir(pycrop_path):
            inner_path = os.path.join(pycrop_path, inner_folder)
            if not os.path.isdir(inner_path):
                continue
            for file_name in os.listdir(inner_path):
                if not file_name.lower().endswith(".avi"):
                    continue
                pred = _predict_video_age_gender(os.path.join(inner_path, file_name))
                if pred:
                    faces.append(pred)

        results[folder_name] = faces

    print(results)
    return results