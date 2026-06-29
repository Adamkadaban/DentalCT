# 3D Rendering — cinematic VRT techniques (research)

Goal: match CS 3D Imaging's "photographed skull" look. We have ALL data —
gap was purely rendering. Sources: Kitware VolView CT-Bone preset, vtk.js
vtkVolumeFS.glsl, three.js VolumeShader, Exposure Render (Kroes 2012),
Siemens Cinematic VRT (Comaniciu/Engel), Kindlmann gradient TFs.

Applied in `viewer/vol3d.js`:
- Ivory transfer fn: bone (.55,.42,.32)→cortical (.95,.86,.66)→enamel white.
- Front-to-back compositing + early-ray-termination (a>0.97).
- Gradient-magnitude opacity modulation (sharpens surfaces, kills mass speckle).
- Local diffuse + short soft-shadow ray (crevice/socket darkening).
- Jitter ray start (anti-banding). Orbit/wheel-zoom/right-drag pan.

Not yet: full multi-light env/HDRI, multi-ray AO, factor-1 full res, denoise.
