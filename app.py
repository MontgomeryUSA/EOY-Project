"""
Build-IT ▸ FastAPI backend - 2024-05-02
────────────────────────────────────────
• fallback-by-index mesh lookup
• rich material synonym matching
• honours the “units” value sent by the browser (mm | cm | m | in | ft)
• copes with multi-packs and “Ø × length ft” pipe / rod SKUs
• falls back to bounding–box volume if a mesh is non-watertight
"""

from __future__ import annotations
import io, json, math, pathlib, re
from typing import Any, Dict, List

import numpy as np, pandas as pd, trimesh
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ───────────────────────── constants / regex
CSV_PATH    = pathlib.Path(__file__).with_name("results.csv")
IN_PER_FT   = 12.0
UNIT_MULT   = {           # convert model-units³ ➜ in³
    "mm": 0.0000610237441,
    "cm": 0.0610237441,
    "m" : 61023.7440941,
    "in": 1.0,
    "ft": 1.0 / IN_PER_FT**3,
}

PRICE_RE = re.compile(r"\$ *([\d,.]+)")
DIM_RE   = re.compile(r"([\d.]+)\s*(mm|cm|m|in|ft|')", re.I)
PACK_RE  = re.compile(r"\((\d+)\s*per", re.I)
PIPE_RE  = re.compile(r"([\d.]+)\s*(mm|cm|in)?\s*[x×\-]\s*([\d.]+)\s*ft", re.I)

MATERIAL_SYNONYM = {
    "cedar":        ["cedar", "red cedar", "aromatic cedar"],
    "oak":          ["oak"],
    "maple":        ["maple"],
    "walnut":       ["walnut"],
    "mahogany":     ["mahogany"],
    "cherry":       ["cherry"],
    "pine":         ["pine"],
    "plywood":      ["plywood", "osb", "sheathing"],
    "pvc":          ["pvc"],
    "acrylic":      ["acrylic", "plexi", "plexiglass", "plexiglas", "optix"],
    "polycarbonate":["polycarbonate", "lexan", "tuffak", "sunlite"],
    "aluminum":     ["aluminum"],
    "stainless":    ["stainless"],
    "steel":        ["steel"],
    "brass":        ["brass"],
    "copper":       ["copper"],
}

# ───────────────────────── helpers
def price_float(txt) -> float | None:          # ← REPLACED
    """Return the first $-amount in the cell, whatever the original type is."""
    if pd.isna(txt):               # NaN
        return None
    if isinstance(txt, (int, float)):
        return float(txt)
    m = PRICE_RE.search(str(txt).replace(",", ""))
    return float(m.group(1)) if m else None


def board_volume_in3(title: str) -> float | None:
    """Parse ‘3/4 in. × 4 in × 8 ft’ etc. → in³."""
    parts = DIM_RE.findall(title.lower())
    if len(parts) < 3:
        return None
    dims = []
    for val, unit in parts[:3]:
        v = float(val)
        u = unit.lower()
        if u in ("ft", "'"):
            v *= IN_PER_FT
        elif u == "cm":
            v /= 2.54
        elif u == "m":
            v *= 39.3701
        elif u == "mm":
            v /= 25.4
        dims.append(v)
    return math.prod(dims)


def inches(value: float, unit: str | None) -> float:
    """Convert value (in given unit) → inches."""
    u = (unit or "").lower()
    if u == "mm":
        return value / 25.4
    if u == "cm":
        return value / 2.54
    if u == "m":
        return value * 39.3701
    return value  # already inches / feet handled elsewhere


def load_price_table() -> pd.DataFrame:
    df = pd.read_csv(CSV_PATH)
    if not {"Title", "Price"}.issubset(df.columns):
        raise ValueError("results.csv must contain Title and Price columns")

    df["CleanPrice"] = df["Price"].apply(price_float)
    df["Volume_in3"] = df["Title"].apply(board_volume_in3)
    df = df.dropna(subset=["CleanPrice", "Volume_in3"]).copy()

    df["PackQty"]   = df["Title"].str.extract(PACK_RE)[0].astype(float).fillna(1.0)
    df["UnitPrice"] = df["CleanPrice"] / df["PackQty"]
    df["UnitCost"]  = df["UnitPrice"]  / df["Volume_in3"]
    return df


# ───────────────────────── FastAPI
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

PRICE_DF: pd.DataFrame | None = None


@app.post("/estimate")
async def estimate(file: UploadFile = File(...), payload: UploadFile = File(...)):
    global PRICE_DF
    if PRICE_DF is None:
        PRICE_DF = load_price_table()

    # ---------- browser payload ----------
    try:
        body         = json.loads(await payload.read())
        meshes       = body.get("meshes", [])
        model_units  = (body.get("units") or "mm").lower()
    except Exception:
        return JSONResponse(400, {"detail": "Bad JSON payload"})

    inch_factor = UNIT_MULT.get(model_units, UNIT_MULT["mm"])

    # ---------- GLB ----------
    try:
        scene = trimesh.load(io.BytesIO(await file.read()), file_type="glb")
    except Exception as exc:
        return JSONResponse(400, {"detail": f"GLB load failed: {exc}"})

    geom_by_idx = list(scene.geometry.items())
    results: List[Dict[str, Any]] = []

    for idx, mesh_req in enumerate(meshes):
        want_name = (mesh_req.get("mesh_name") or "").lower()
        mat_raw   = (mesh_req.get("material")  or "any").lower()

        mesh = next((g for n, g in scene.geometry.items() if n.lower() == want_name), None)
        if mesh is None and idx < len(geom_by_idx):     # fallback
            want_name, mesh = geom_by_idx[idx]

        if mesh is None:
            results.append({**mesh_req, "cost": 0.0,
                            "volume_in3": None, "matched": "MESH NOT FOUND"})
            continue

        vol_in3 = mesh.volume * inch_factor
        if not vol_in3:                                 # non-watertight → bbox
            vol_in3 = np.prod(mesh.extents) * inch_factor

        # candidate CSV rows
        keys = MATERIAL_SYNONYM.get(mat_raw, [mat_raw]) if mat_raw != "any" else []
        subset = PRICE_DF
        if keys:
            mask = PRICE_DF["Title"].str.lower().apply(lambda t: any(k in t for k in keys))
            subset = PRICE_DF.loc[mask]
            if subset.empty:
                subset = PRICE_DF

        best_cost = None
        best_row  = None

        for _, row in subset.iterrows():
            m_pipe = PIPE_RE.search(row.Title)
            if m_pipe:
                diam, unit, length_ft = m_pipe.groups()
                try:
                    r_in = inches(float(diam), unit) / 2
                except ValueError:
                    continue
                pipe_vol = math.pi * r_in * r_in * float(length_ft) * IN_PER_FT
                unit_cost = row.UnitPrice / pipe_vol
            else:
                unit_cost = row.UnitCost

            est = unit_cost * vol_in3
            if best_cost is None or est < best_cost:
                best_cost, best_row = est, row

        if best_row is None:            # extreme fallback (shouldn’t happen)
            best_row  = subset.iloc[0]
            best_cost = vol_in3 * best_row.UnitCost

        results.append({
            "mesh"      : want_name,
            "material"  : mat_raw,
            "volume_in3": round(vol_in3, 2),
            "unit_cost" : round(best_cost / vol_in3, 4),
            "cost"      : round(best_cost, 2),
            "matched"   : best_row.Title,
        })

    return {"items": results}
