<h1 align="center">DentalCT</h1>
<p align="center">A dental CBCT viewer that runs entirely in your browser.</p>
<p align="center">
  <a href="https://3dct.hackback.zip"><img alt="live" src="https://img.shields.io/badge/live-3dct.hackback.zip-2563eb"></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-3178c6"></a>
  <img alt="100% local" src="https://img.shields.io/badge/data-100%25_local-2e7d32">
  <img alt="made with vibes" src="https://img.shields.io/badge/made_with-vibes-ff69b4">
</p>

Drop a Carestream **CS 3D Imaging** export (`.zip` of JPEG-lossless DICOMs) and
get tri-planar MPR, a cinematic 3D volume, panoramic, implant cross-sections
with nerve canal, and oblique reformats. No upload, no install — the scan is
decoded and rendered locally and never leaves your machine.

## Use it

Open **[3dct.hackback.zip](https://3dct.hackback.zip)** and drop your zip. That's it.

## Run locally

```bash
cd web && python3 -m http.server 8000   # static, no backend
```

There's also a Python reference build (`uv pip install -e .` → `dentalct-server VOL_0`).

## Layout
- `web/` — the static site (zip → decode → viewer), deployed via Pages
- `src/dentalct/` — Python reference: loader, MPR sampler, server
- `docs/adr/`, `docs/notes/` — decisions & engineering notes

Patient DICOMs are PHI and git-ignored.
