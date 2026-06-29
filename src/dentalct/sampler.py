"""Multi-planar reconstruction sampler. Volume is int16 HU, axes Z,Y,X.

Provides orthogonal slices (axial/coronal/sagittal), optional thick-slab
projection (avg/MIP), window/level to 8-bit, and a downsampled volume for 3D.
"""
from __future__ import annotations

import numpy as np

PLANES = ("axial", "coronal", "sagittal")


def n_slices(vol, plane: str) -> int:
    z, y, x = vol.shape
    return {"axial": z, "coronal": y, "sagittal": x}[plane]


def _slab(vol, plane: str, idx: int, thickness: int, mode: str) -> np.ndarray:
    z, y, x = vol.shape
    h = max(thickness, 1) // 2
    if plane == "axial":
        a, b = max(idx - h, 0), min(idx + h + 1, z)
        sub = vol[a:b, :, :]; axis = 0
    elif plane == "coronal":
        a, b = max(idx - h, 0), min(idx + h + 1, y)
        sub = vol[:, a:b, :]; axis = 1
    else:  # sagittal
        a, b = max(idx - h, 0), min(idx + h + 1, x)
        sub = vol[:, :, a:b]; axis = 2
    if sub.shape[axis] == 1:
        return np.squeeze(sub, axis=axis)
    if mode == "mip":
        return sub.max(axis=axis)
    return sub.mean(axis=axis)


def slice_image(vol, plane: str, idx: int, wc: float, ww: float,
                thickness: int = 1, mode: str = "avg") -> np.ndarray:
    """Return an 8-bit grayscale 2D image, oriented head-up."""
    img = _slab(vol, plane, idx, thickness, mode).astype(np.float32)
    lo, hi = wc - ww / 2, wc + ww / 2
    img = np.clip((img - lo) / max(hi - lo, 1), 0, 1) * 255
    img = img.astype(np.uint8)
    # coronal/sagittal: z grows toward apex, flip so superior is up
    if plane in ("coronal", "sagittal"):
        img = img[::-1]
    return img


def downsampled(vol, factor: int = 3) -> np.ndarray:
    """Coarse int16 volume for 3D rendering (~every Nth voxel)."""
    return np.ascontiguousarray(vol[::factor, ::factor, ::factor])
