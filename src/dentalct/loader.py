"""Load a CS 3D Imaging volume (folder of JPEG-lossless DICOM slices) into a
single 16-bit HU volume cached on disk as a memmap-able .npy plus JSON meta.

Slices are ordered by InstanceNumber. HU = pixel*RescaleSlope + RescaleIntercept.
Geometry (voxel size, dims, default window) is read from the DICOM headers.
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

import numpy as np
import pydicom

VOLUME_NPY = "volume.npy"
META_JSON = "volume.meta.json"


def _slice_files(volume_dir: Path) -> list[Path]:
    files = list(volume_dir.glob("3DSlice*.dcm"))
    if not files:
        files = list(volume_dir.glob("*.dcm"))
    if not files:
        raise FileNotFoundError(f"no .dcm slices in {volume_dir}")

    def num(p: Path) -> int:
        # filenames are 3DSlice<N>.dcm — take the LAST run of digits so the
        # leading "3D" doesn't make every key identical (scrambles z-order).
        ms = re.findall(r"\d+", p.stem)
        return int(ms[-1]) if ms else 0

    return sorted(files, key=num)


def build(volume_dir: str | Path, out_dir: str | Path = "data") -> dict:
    """Decode every slice into one HU volume. Returns metadata dict.

    Cached: re-reading existing data/volume.npy is left to load()."""
    volume_dir = Path(volume_dir)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    files = _slice_files(volume_dir)

    ds0 = pydicom.dcmread(files[0])
    rows, cols = int(ds0.Rows), int(ds0.Columns)
    px, py = (float(v) for v in ds0.PixelSpacing)
    pz = float(getattr(ds0, "SliceThickness", py))
    slope = float(getattr(ds0, "RescaleSlope", 1))
    intercept = float(getattr(ds0, "RescaleIntercept", 0))
    n = len(files)

    vol = np.empty((n, rows, cols), dtype=np.int16)
    t0 = time.time()
    for i, f in enumerate(files):
        ds = pydicom.dcmread(f)
        a = ds.pixel_array.astype(np.int32) * int(slope) + int(intercept)
        vol[i] = a.astype(np.int16)
        if i % 50 == 0:
            print(f"  {i+1}/{n}  ({time.time()-t0:4.1f}s)", file=sys.stderr)

    np.save(out_dir / VOLUME_NPY, vol)
    meta = {
        "shape": [n, rows, cols],          # z, y, x
        "spacing_mm": [pz, py, px],        # z, y, x
        "axes": "ZYX",
        "window_center": float(getattr(ds0, "WindowCenter", 1048)),
        "window_width": float(getattr(ds0, "WindowWidth", 4096)),
        "hu_min": int(vol.min()),
        "hu_max": int(vol.max()),
        "patient": str(getattr(ds0, "PatientID", "")),
        "manufacturer": str(getattr(ds0, "Manufacturer", "")),
        "model": str(getattr(ds0, "ManufacturerModelName", "")),
        "modality": str(getattr(ds0, "Modality", "")),
    }
    (out_dir / META_JSON).write_text(json.dumps(meta, indent=2))
    print(f"built {meta['shape']} @ {meta['spacing_mm']}mm in {time.time()-t0:.1f}s",
          file=sys.stderr)
    return meta


def load(out_dir: str | Path = "data") -> tuple[np.ndarray, dict]:
    out_dir = Path(out_dir)
    meta = json.loads((out_dir / META_JSON).read_text())
    vol = np.load(out_dir / VOLUME_NPY, mmap_mode="r")
    return vol, meta


def load_or_build(volume_dir, out_dir="data") -> tuple[np.ndarray, dict]:
    if (Path(out_dir) / VOLUME_NPY).exists():
        return load(out_dir)
    build(volume_dir, out_dir)
    return load(out_dir)


def main() -> None:
    vd = sys.argv[1] if len(sys.argv) > 1 else "VOL_0"
    build(vd)


if __name__ == "__main__":
    main()
