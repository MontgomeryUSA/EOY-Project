from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import List
import trimesh
import json
import io

app = FastAPI()

# Allow frontend access from any origin (for dev purposes)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Example material prices (you can expand this or load from CSV)
MATERIAL_PRICES = {
    "pine": 0.03,    # dollars per cubic inch
    "oak":  0.05,
    "metal": 0.08,
    "plastic": 0.02
}

@app.post("/estimate")
async def estimate(
    file: UploadFile = File(...),
    payload: UploadFile = File(...)
):
    # Read and parse payload JSON
    payload_data = await payload.read()
    try:
        payload_json = json.loads(payload_data)
    except json.JSONDecodeError:
        return JSONResponse(status_code=400, content={"detail": "Invalid JSON in payload"})

    meshes_info = payload_json.get("meshes", [])

    # Load GLB file into Trimesh
    glb_data = await file.read()
    try:
        scene = trimesh.load(io.BytesIO(glb_data), file_type='glb')
    except Exception as e:
        return JSONResponse(status_code=400, content={"detail": f"Failed to load GLB: {str(e)}"})

    results = []

    for item in meshes_info:
        mesh_name = item.get("name")
        material_type = item.get("material")
        matched_name = "?"

        mesh = None
        for name, geom in scene.geometry.items():
            if name.lower() == mesh_name.lower():
                mesh = geom
                matched_name = name
                break

        if mesh is None:
            results.append({
                "mesh": mesh_name,
                "material": material_type,
                "cost": 0,
                "matched": "NOT FOUND"
            })
            continue

        # Volume in cubic inches (Trimesh gives mm^3, so convert)
        volume_mm3 = mesh.volume
        volume_in3 = volume_mm3 * 0.0000610237

        price_per_in3 = MATERIAL_PRICES.get(material_type.lower(), 0)
        cost = volume_in3 * price_per_in3

        results.append({
            "mesh": mesh_name,
            "material": material_type,
            "cost": cost,
            "matched": matched_name
        })

    return {"items": results}
