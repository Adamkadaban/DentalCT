# DentalCT

Reader & visualizer for a Carestream **CS 8100 3D** CBCT scan exported by
**CS 3D Imaging** (a folder of JPEG-lossless DICOM slices). Tri-planar MPR +
3D rendering, like dental CT software.

> The DICOM data is real patient PHI and is git-ignored. Keep it local.

## Quick start
```bash
uv venv && . .venv/bin/activate
uv pip install -e .
dentalct-server VOL_0          # decodes once, caches, serves at :8000
# open http://localhost:8000
```

## Layout
- `src/dentalct/` — loader, MPR sampler, HTTP server
- `viewer/` — browser UI (axial/coronal/sagittal + 3D)
- `docs/notes/` — engineering notes;  `docs/adr/` — architecture decisions

See `docs/notes/01-dataset.md` for the decoded scan specifics.
