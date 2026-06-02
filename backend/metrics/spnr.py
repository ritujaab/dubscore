import numpy as np
import pandas as pd

def get_spnr(speech, noise):
    rms_s = np.sqrt(np.mean(speech ** 2)) + 1e-10
    rms_n = np.sqrt(np.mean(noise  ** 2)) + 1e-10
    return 20.0 * np.log10(rms_s / rms_n)

'''def compute_spnr(orig_intervals, dub_intervals, v_orig, n_orig, sr_orig, v_dub,  n_dub,  sr_dub):

    report = []
    for i, ((os_, oe_), (ds_, de_)) in enumerate(
            zip(orig_intervals, dub_intervals)):

        s_o = v_orig[os_:oe_];  n_o = n_orig[os_:oe_]
        s_d = v_dub[ds_:de_];   n_d = n_dub[ds_:de_]

        spnr_o = get_spnr(s_o, n_o)
        spnr_d = get_spnr(s_d, n_d)
        delta  = abs(spnr_o - spnr_d)

        report.append({
            "Segment":    i + 1,
            "Orig_Start": round(os_ / sr_orig, 2),
            "Orig_End":   round(oe_ / sr_orig, 2),
            "Dub_Start":  round(ds_ / sr_dub,  2),
            "Dub_End":    round(de_ / sr_dub,  2),
            "Orig_SpNR":  round(spnr_o, 2),
            "Dub_SpNR":   round(spnr_d, 2),
            "Delta":      round(delta,  2),
            "Status":     "FLAG" if delta >= 3 else "OK",
        })

    return pd.DataFrame(report)

def spnr_score(*args, **kwargs):
    spnr_data = compute_spnr(*args, **kwargs)
    print(spnr_data)

    if spnr_data.empty:
        return 0.0

    orig_dur = spnr_data["Orig_End"] - spnr_data["Orig_Start"]
    dub_dur  = spnr_data["Dub_End"]  - spnr_data["Dub_Start"]
    weights  = (orig_dur + dub_dur) / 2.0

    total_w  = weights.sum()
    if total_w == 0:
        return 0.0

    ok_weight = weights[spnr_data["Status"] == "OK"].sum()
    return float(ok_weight / total_w), spnr_data'''

def compute_spnr(orig_intervals, dub_intervals, v_orig, n_orig, sr_orig, v_dub, n_dub, sr_dub):
    report = []

    for k in orig_intervals:
        if k not in dub_intervals:
            continue

        for i, ((os_, oe_), (ds_, de_)) in enumerate(zip(orig_intervals[k], dub_intervals[k])):
            s_o = v_orig[os_:oe_];  n_o = n_orig[os_:oe_]
            s_d = v_dub[ds_:de_];   n_d = n_dub[ds_:de_]

            spnr_o = get_spnr(s_o, n_o)
            spnr_d = get_spnr(s_d, n_d)
            delta  = abs(spnr_o - spnr_d)

            report.append({
                "Chunk":      round(k, 2),
                "Segment":    i + 1,
                "Orig_Start": round(os_ / sr_orig, 2),
                "Orig_End":   round(oe_ / sr_orig, 2),
                "Dub_Start":  round(ds_ / sr_dub,  2),
                "Dub_End":    round(de_ / sr_dub,  2),
                "Orig_SpNR":  round(spnr_o, 2),
                "Dub_SpNR":   round(spnr_d, 2),
                "Delta":      round(delta,  2),
            })

    return pd.DataFrame(report)


def spnr_score(*args, **kwargs):
    df = compute_spnr(*args, **kwargs)

    if df.empty:
        return 0.0, df

    orig_dur = df["Orig_End"] - df["Orig_Start"]
    dub_dur  = df["Dub_End"]  - df["Dub_Start"]
    weights  = (orig_dur + dub_dur) / 2.0

    def weighted_ok_ratio(mask, w):
        total = w.sum()
        return float(w[mask].sum() / total) if total > 0 else 0.0

    # Per-chunk scores → add as column
    def chunk_score(grp):
        w    = (grp["Orig_End"] - grp["Orig_Start"] + grp["Dub_End"] - grp["Dub_Start"]) / 2.0
        mask = grp["Delta"] < 3
        score = weighted_ok_ratio(mask, w)
        return pd.Series([score] * len(grp), index=grp.index)

    df["Chunk_Score"] = df.groupby("Chunk", group_keys=False).apply(chunk_score)
    df["Status"]      = df["Delta"].apply(lambda d: "FLAG" if d >= 3 else "OK")

    overall = weighted_ok_ratio(df["Delta"] < 3, weights)

    print(df)
    print(f"\n[SpNR] Overall score: {overall:.4f}")

    return overall, df