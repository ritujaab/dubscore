from resemblyzer import preprocess_wav, VoiceEncoder
import numpy as np
import pandas as pd


encoder = VoiceEncoder()


import soundfile as sf
import tempfile
import os

def get_similarity(orig_aud, dub_aud, sr_orig, sr_dub):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f_o, \
         tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f_d:
        sf.write(f_o.name, orig_aud, sr_orig)
        sf.write(f_d.name, dub_aud,  sr_dub)
        orig_wav = preprocess_wav(f_o.name)
        dub_wav  = preprocess_wav(f_d.name)

    os.unlink(f_o.name)
    os.unlink(f_d.name)

    orig_embed = encoder.embed_utterance(orig_wav)
    dub_embed  = encoder.embed_utterance(dub_wav)

    return float(np.dot(orig_embed, dub_embed))


def compute_clone(orig_intervals, dub_intervals, v_orig, sr_orig, v_dub, sr_dub):
    report = []

    for i, ((os_, oe_), (ds_, de_)) in enumerate(zip(orig_intervals, dub_intervals)):
        s_o = v_orig[os_:oe_]
        s_d = v_dub[ds_:de_]

        sim = get_similarity(s_o, s_d, sr_orig, sr_dub)

        report.append({
            "Segment":    i + 1,
            "Orig_Start": round(os_ / sr_orig, 2),
            "Orig_End":   round(oe_ / sr_orig, 2),
            "Dub_Start":  round(ds_ / sr_dub,  2),
            "Dub_End":    round(de_ / sr_dub,  2),
            "Similarity": round(sim, 4),
            "Status":     "FLAG" if sim <= 0.7 else "OK",
        })

    return pd.DataFrame(report)


def clone_score(*args, **kwargs):
    df = compute_clone(*args, **kwargs)
    print(df)

    if df.empty:
        return 0.0, df

    orig_dur = df["Orig_End"] - df["Orig_Start"]
    dub_dur  = df["Dub_End"]  - df["Dub_Start"]
    weights  = (orig_dur + dub_dur) / 2.0

    def weighted_ok_ratio(mask, w):
        total = w.sum()
        return float(w[mask].sum() / total) if total > 0 else 0.0

    overall = weighted_ok_ratio(df["Similarity"] > 0.7, weights)
    print(f"\n[clone] Overall score: {overall:.4f}")

    return overall, df