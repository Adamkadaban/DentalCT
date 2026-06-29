# DentalCT — Engineering Notes

A reader/visualizer for a Carestream **CS 8100 3D** CBCT scan exported by **CS 3D Imaging**.

## Dataset facts (decoded from DICOM headers + cache/analysis XML)
- Source app: `CS 3D Imaging` v3.10.27.0 (Carestream). Volume dir `VOL_0/`.
- Series: 651 slices `3DSlice1.dcm … 3DSlice651.dcm`, modality CT (CBCT).
- Pixel grid: **541 × 541 × 651**, **0.15 mm isotropic** voxels.
- 16-bit, MONOCHROME2, unsigned; HU rescale slope=1, intercept=-1000.
- Default window: level 1048 / width 4096.
- Transfer syntax `1.2.840.10008.1.2.4.70` = **JPEG Lossless, Process 14 SV1** → pixel data is encapsulated/compressed; needs a JPEG-lossless decoder (pydicom + pylibjpeg-libjpeg).
- Patient: Hassan^Adam, ID 1187 → **PHI: never commit DICOMs**.

## Companion files
- `VOL_0/FilesManager.xml` — slice manifest.
- `VOL_0/Cache/*.dat` — 381MB raw decompressed volume (541*541*651*2 ≈ 381MB). Mirror of pixel data; we decode DICOMs directly for correct geometry.
- `VOL_0/Cache/*.serie` — manufacturer/model, FDK recon, "CS 8100 3D".
- `VOL_0/Analyses/*.xml` — `IToothContext`: arch curve, mandibular canal polyline, crop box, tissue class LUT, camera. Overlay source.

## Architecture
- `src/dentalct/` — Python: DICOM loader → cached HU volume (`.npy` memmap), MPR sampler, server.
- `viewer/` — browser 4-pane dental layout (axial/coronal/sagittal + 3D), W/L presets, overlays.
- Backend serves MPR slices + downsampled volume; nothing leaves the machine.

## Prior art reviewed
Cornerstone3D/OHIF, Kitware VolView, VTK — all validate load→MPR+3D. We build custom, scoped to this scan.

## Running
Server runs as a user service (foreground blocks the shell): `dentalct.service`
-> `systemctl --user start|stop|status dentalct`, listens on localhost:8000.
