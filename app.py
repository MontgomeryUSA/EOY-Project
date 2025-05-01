# app.py
from __future__ import annotations
import io, json, math, pathlib, re
from typing import Any, Dict, List

import numpy as np
import pandas as pd
import trimesh
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ───────────────────────────── constants / regex
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

# ───────────────────────────── helpers
def price_float(txt) -> float | None:
    if pd.isna(txt): 
        return None
    if isinstance(txt, (int, float)):
        return float(txt)
    m = PRICE_RE.search(str(txt).replace(",", ""))
    return float(m.group(1)) if m else None

def board_volume_in3(title: str) -> float | None:
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
    u = (unit or "").lower()
    if u == "mm":
        return value / 25.4
    if u == "cm":
        return value / 2.54
    if u == "m":
        return value * 39.3701
    return value

def load_price_table() -> pd.DataFrame:
    df = pd.read_csv(CSV_PATH)
    assert {"Title","Price"}.issubset(df.columns)
    df["CleanPrice"] = df["Price"].apply(price_float)
    df["Volume_in3"] = df["Title"].apply(board_volume_in3)
    df = df.dropna(subset=["CleanPrice","Volume_in3"]).copy()
    df["PackQty"]   = df["Title"].str.extract(PACK_RE)[0].astype(float).fillna(1.0)
    df["UnitPrice"] = df["CleanPrice"] / df["PackQty"]
    df["UnitCost"]  = df["UnitPrice"] / df["Volume_in3"]
    return df

# ───────────────────────────── FastAPI
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

PRICE_DF: pd.DataFrame | None = None

@app.post("/estimate")
async def estimate(file: UploadFile = File(...), payload: UploadFile = File(...)):
    global PRICE_DF
    if PRICE_DF is None:
        PRICE_DF = load_price_table()

    # 1) parse browser payload
    try:
        body        = json.loads(await payload.read())
        meshes_req  = body.get("meshes", [])
        model_units = (body.get("units") or "mm").lower()
    except Exception:
        return JSONResponse(400, {"detail":"Bad JSON payload"})

    inch_factor = UNIT_MULT.get(model_units, UNIT_MULT["mm"])

    # 2) load GLB
    try:
        scene = trimesh.load(io.BytesIO(await file.read()), file_type="glb")
    except Exception as exc:
        return JSONResponse(400, {"detail":f"GLB load failed: {exc}"})

    # 3) build parts list with volumes
    parts: List[Dict[str,Any]] = []
    for idx, m in enumerate(meshes_req):
        name = (m.get("mesh_name") or "").lower()
        mesh = next((g for n,g in scene.geometry.items() if n.lower()==name), None)
        if mesh is None:
            # fallback by index
            geom_list = list(scene.geometry.items())
            if idx < len(geom_list):
                name, mesh = geom_list[idx]
        if mesh is None:
            vol = None
        else:
            vol = mesh.volume * inch_factor
            if not vol:  # non-watertight
                vol = np.prod(mesh.extents) * inch_factor
        parts.append({
            "idx":         idx,
            "mesh":        name,
            "material":    (m.get("material") or "any").lower(),
            "volume_in3":  vol,
            "orig":        m
        })

    # 4) group by material
    from collections import defaultdict
    by_mat: Dict[str,List[dict]] = defaultdict(list)
    for p in parts:
        by_mat[p["material"]].append(p)

    results: List[Dict[str,Any]] = [None]*len(parts)  # placeholder

    # 5) for each material, do first-fit decreasing
    for mat, group in by_mat.items():
        # filter price table to this material
        keys = MATERIAL_SYNONYM.get(mat, [mat]) if mat!="any" else []
        subset = PRICE_DF
        if keys:
            mask = PRICE_DF["Title"].str.lower().apply(lambda t:any(k in t for k in keys))
            subset = PRICE_DF.loc[mask]
            if subset.empty:
                subset = PRICE_DF

        # build stock list
        stock = []
        for rid, row in subset.iterrows():
            stock.append({
                "sku_id":    rid,
                "board_vol": row.Volume_in3,
                "price":     row.UnitPrice,
                "title":     row.Title
            })

        # sort parts descending by volume
        valid_parts = [p for p in group if p["volume_in3"] is not None]
        valid_parts.sort(key=lambda x:x["volume_in3"], reverse=True)

        bins: List[Dict[str,Any]] = []
        for p in valid_parts:
            vol = p["volume_in3"]
            # try fit into existing
            placed = False
            for b in bins:
                if vol <= b["remaining"]:
                    b["parts"].append(p)
                    b["remaining"] -= vol
                    p["bin"] = b
                    placed = True
                    break
            if placed:
                continue
            # need new bin → pick cheapest board that fits
            options = [b for b in stock if b["board_vol"] >= vol]
            if not options:
                options = stock  # fallback
            chosen = min(options, key=lambda x:x["price"])
            newb = {
                "sku_id":    chosen["sku_id"],
                "board_vol": chosen["board_vol"],
                "remaining": chosen["board_vol"] - vol,
                "price":     chosen["price"],
                "title":     chosen["title"],
                "parts":     [p]
            }
            bins.append(newb)
            p["bin"] = newb

        # allocate cost per part
        for b in bins:
            total_vol = sum(x["volume_in3"] for x in b["parts"])
            for i, x in enumerate(b["parts"]):
                volume = x["volume_in3"]
                if i == 0:
            # first piece pays its share
                    frac = volume / total_vol if total_vol else 0
                    cost = b["price"] * frac
                    unit_cost = cost / volume if volume else 0.0
                    matched = b["title"]
                else:
            # waste‑reused piece: free, note in matched
                    cost = 0.0
                    unit_cost = 0.0
                    matched = f"use waste from other ({b['title']}) part"

                results[x["idx"]] = {
            "mesh":        x["mesh"],
            "material":    mat,
            "volume_in3":  round(volume, 2),
            "unit_cost":   round(unit_cost, 4),
            "cost":        round(cost, 2),
            "matched":     matched
        }

        # meshes with no volume (not found) go here
        for p in group:
            if p["volume_in3"] is None:
                results[p["idx"]] = {
                    **p["orig"],
                    "volume_in3": None,
                    "unit_cost":  0.0,
                    "cost":       0.0,
                    "matched":    "MESH NOT FOUND"
                }

    return {"items": results}
