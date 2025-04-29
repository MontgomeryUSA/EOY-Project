import trimesh
import pandas as pd
import numpy as np
import re

def parse_dimensions(title):
    actual_match = re.findall(r'Actual[: ]?([\d.]+)\s*in.*?x\s*([\d.]+)\s*in.*?x\s*([\d.]+)\s*in', title, re.IGNORECASE)
    if actual_match:
        dims = list(map(float, actual_match[0]))
        return np.prod(dims)
    matches = re.findall(r'([\d.]+)\s*(in|ft)', title.lower())
    if len(matches) >= 3:
        dims = []
        for value, unit in matches[:3]:
            val = float(value)
            if unit == 'ft':
                val *= 12
            dims.append(val)
        return np.prod(dims)
    return None

def clean_price(price_str):
    if not isinstance(price_str, str):
        return None
    match = re.search(r'\$([\d.]+)', price_str)
    if match:
        return float(match.group(1))
    return None

def estimate_mesh_costs(glb_path, mesh_material_pairs, csv_path='results.csv'):
    scene = trimesh.load(glb_path)
    df = pd.read_csv(csv_path)

    output = []

    for mesh_name, material_type in mesh_material_pairs:
        volume = None

        # Get volume for this mesh
        if mesh_name in scene.geometry:
            mesh = scene.geometry[mesh_name].copy()
            try:
                transform, _ = scene.graph.get(mesh_name)
                mesh.apply_transform(transform)
            except:
                pass
            volume = mesh.volume * 61023.7  # m³ to in³
        else:
            output.append({'mesh': mesh_name, 'material': material_type, 'volume': None, 'cost': 0.0, 'matched': 'Mesh not found'})
            continue

        # Match material to pricing
        material_match = None
        cost = 0.0

        for _, row in df.iterrows():
            title = str(row['Title']).lower()
            price = clean_price(row['Price'])
            mat_volume = parse_dimensions(title)

            if not price or not mat_volume:
                continue

            if material_type.lower() in title:
                unit_cost = price / mat_volume
                cost = volume * unit_cost
                material_match = row['Title']
                break

        output.append({
            'mesh': mesh_name,
            'material': material_type,
            'volume': volume,
            'cost': cost,
            'matched': material_match or 'No match'
        })

    return output
