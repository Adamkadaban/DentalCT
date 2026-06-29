"""Parse Carestream CS 3D Imaging analysis XML into viewer-drawable overlays.

Coordinates are in volume units (0.15mm voxels). Tissue thresholds are
normalized 0..1. Uses stdlib xml.etree only.
"""

from __future__ import annotations

import pathlib
import xml.etree.ElementTree as ET

_CLASSES = ("Skin", "Flesh", "Bone", "Dentin", "Enamel", "Amalgam")


def _points(node):
    return [[float(p.get("x")), float(p.get("y")), float(p.get("z"))] for p in node.findall("Point")]


def parse_overlays(volume_dir: str | pathlib.Path) -> dict:
    files = sorted(pathlib.Path(volume_dir).glob("Analyses/*.xml"))
    if not files:
        return {"available": False}

    ctx = ET.parse(files[0]).getroot().find(".//VolumeContext")
    if ctx is None:
        return {"available": False}

    out: dict = {"available": True}

    lut = ctx.find("Lut2D")
    if lut is not None:
        out["window"] = {
            "center": float(lut.get("windowlevel")),
            "width": float(lut.get("windowwidth")),
        }

    classes = {}
    cl = ctx.find(".//ClassesLimits")
    if cl is not None:
        for name in _CLASSES:
            el = cl.find(name)
            if el is not None:
                classes[name] = [float(el.get("min")), float(el.get("max"))]
    out["classes"] = classes

    arch = []
    for tool in ctx.findall(".//ResamplesTool"):
        if tool.get("type") == "e_Arch":
            surf = tool.find(".//CurveSurface")
            if surf is not None:
                arch = _points(surf)
            break
    out["arch"] = arch

    canals = []
    for canal in ctx.findall(".//Canals/Canal"):
        canals.append({
            "color": [float(canal.get("R", 1)), float(canal.get("G", 0)), float(canal.get("B", 0))],
            "radius": float(canal.get("radius", 1)),
            "points": _points(canal),
        })
    out["canals"] = canals

    ortho = ctx.find("OrthoPositions")
    if ortho is not None:
        out["ortho"] = {a: float(ortho.get(a)) for a in ("x", "y", "z")}

    return out
