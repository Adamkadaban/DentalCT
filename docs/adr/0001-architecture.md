# ADR 0001 — Architecture: Python decode backend + browser MPR/3D viewer

- Status: Accepted
- Date: 2026-06-28

## Context
We must read a Carestream CS 8100 3D CBCT (651 JPEG-lossless DICOM slices,
541×541×651, 0.15 mm) and visualize it like dental CT software (tri-planar MPR
+ 3D). Pixel data is JPEG-Lossless (TS 1.2.840.10008.1.2.4.70). The full volume
is ~381 MB int16 (~190M voxels) — too large to ship whole to a browser, but
fine in RAM on the host.

## Decision
- **Backend (Python)**: pydicom + pylibjpeg-libjpeg to decode once, cache a HU
  volume as `.npy` memmap. Serve oblique/orthogonal MPR slices + a downsampled
  volume for 3D over a tiny HTTP API.
- **Frontend (browser)**: zero-build static viewer, 4-pane dental layout,
  window/level presets, arch/canal overlays from the analysis XML.

## Alternatives considered
- Pure-browser (Cornerstone3D): heavy, awkward for 190M-voxel local volume.
- Desktop VTK/Qt: more deps, less shareable than a localhost page.

## Consequences
- Need decoder deps + a running localhost server. PHI never leaves machine.
