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


def _resample_curve(pts: np.ndarray, n: int) -> np.ndarray:
    """Resample an (M,2) xy polyline to n points evenly by arc length."""
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    u = np.linspace(0, s[-1], n)
    x = np.interp(u, s, pts[:, 0]); y = np.interp(u, s, pts[:, 1])
    return np.stack([x, y], 1)


def panoramic(vol, arch_xy, wc, ww, thickness=10, samples=600):
    """Curved/panoramic reconstruction: for each point along the arch, average
    a slab ±thickness along the curve normal, over the full z height.
    arch_xy: list of [x,y] in voxel index space. Returns 8-bit (z, samples)."""
    z, y, x = vol.shape
    pts = _resample_curve(np.asarray(arch_xy, float), samples)
    tang = np.gradient(pts, axis=0)
    nrm = np.stack([-tang[:, 1], tang[:, 0]], 1)
    nrm /= (np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-6)
    offs = np.arange(-thickness, thickness + 1)
    strip = np.zeros((z, samples), np.float32)
    for o in offs:
        sx = np.clip((pts[:, 0] + nrm[:, 0] * o).astype(int), 0, x - 1)
        sy = np.clip((pts[:, 1] + nrm[:, 1] * o).astype(int), 0, y - 1)
        strip += vol[:, sy, sx]
    strip /= len(offs)
    lo, hi = wc - ww / 2, wc + ww / 2
    img = np.clip((strip - lo) / max(hi - lo, 1), 0, 1) * 255
    return img.astype(np.uint8)[::-1]            # superior up


def cross_section(vol, arch_xy, wc, ww, pos=0.5, half=70, samples=600, canals=None):
    """One buccal-lingual cross-section perpendicular to the arch at fractional
    position pos (0..1). Returns 8-bit (z, 2*half) image, superior up.
    If canals given, overlays nerve canal where it crosses the cut (RGB)."""
    z, y, x = vol.shape
    pts = _resample_curve(np.asarray(arch_xy, float), samples)
    tang = np.gradient(pts, axis=0)
    nrm = np.stack([-tang[:, 1], tang[:, 0]], 1)
    nrm /= (np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-6)
    i = int(np.clip(pos, 0, 1) * (samples - 1)); cx, cy = pts[i]; nx, ny = nrm[i]
    o = np.arange(-half, half)
    sx = np.clip((cx + nx * o).astype(int), 0, x - 1)
    sy = np.clip((cy + ny * o).astype(int), 0, y - 1)
    img = vol[:, sy, sx].astype(np.float32)
    lo, hi = wc - ww / 2, wc + ww / 2
    g = (np.clip((img - lo) / max(hi - lo, 1), 0, 1) * 255).astype(np.uint8)[::-1]
    if not canals:
        return g
    out = np.stack([g, g, g], -1)                    # to RGB
    tx, ty = pts[i] - pts[max(i - 1, 0)]; tl = (tx*tx+ty*ty) ** .5 + 1e-6
    for cn in canals:
        p = np.asarray(cn["points"], float)
        t = np.linspace(0, 1, len(p)); td = np.linspace(0, 1, len(p) * 40)
        dense = np.stack([np.interp(td, t, p[:, k]) for k in range(3)], 1)
        for px, py, pz in dense:
            along = ((px-cx)*tx + (py-cy)*ty) / tl   # dist along arch from cut
            off = (px-cx)*nx + (py-cy)*ny            # buccal-lingual offset
            if abs(along) < 4 and abs(off) < half:
                col = int(off + half); row = z - 1 - int(pz)
                rr = max(2, int(cn.get("radius", 1.25) / 0.15))
                for dy in range(-rr, rr + 1):
                    for dx in range(-rr, rr + 1):
                        if dx*dx+dy*dy <= rr*rr:
                            r, c = row+dy, col+dx
                            if 0 <= r < z and 0 <= c < 2*half: out[r, c] = [255, 128, 0]
    return out


def oblique(vol, wc, ww, az=0.0, el=0.0, depth=0.0, size=400):
    """Free-angle reformat: a plane through the volume centre, rotated by
    azimuth/elevation (deg), shifted along its normal by depth (voxels).
    az tilts about z (axial), el lifts the plane. Returns 8-bit (size,size)."""
    z, y, x = vol.shape
    a, e = np.radians(az), np.radians(el)
    n = np.array([np.cos(e) * np.cos(a), np.cos(e) * np.sin(a), np.sin(e)])  # xyz
    u = np.array([-np.sin(a), np.cos(a), 0.0])                # in-plane horizontal
    v = np.cross(n, u)                                        # in-plane vertical
    c = np.array([x, y, z]) / 2 + n * depth
    g = np.linspace(-size / 2, size / 2, size)
    gu, gv = np.meshgrid(g, g)
    px = c[0] + gu * u[0] + gv * v[0]
    py = c[1] + gu * u[1] + gv * v[1]
    pz = c[2] + gu * u[2] + gv * v[2]
    xi = np.clip(px.astype(int), 0, x - 1); yi = np.clip(py.astype(int), 0, y - 1)
    zi = np.clip(pz.astype(int), 0, z - 1)
    img = vol[zi, yi, xi].astype(np.float32)
    lo, hi = wc - ww / 2, wc + ww / 2
    return (np.clip((img - lo) / max(hi - lo, 1), 0, 1) * 255).astype(np.uint8)[::-1]

