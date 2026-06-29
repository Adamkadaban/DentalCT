# ADR 0002 — Sort slices by trailing filename number (z-order bug)

- Status: Accepted
- Date: 2026-06-28

## Context
Tri-planar reformats (coronal/sagittal) showed severe horizontal banding while
axial looked correct. Diagnosis: `_slice_files` sorted by `re.search(r"(\d+)")`
on `3DSlice<N>` — which matched the leading "3", so every key was identical and
slices stacked in arbitrary glob order. Axial (a single native slice) looked
fine; reformats exposed the scrambled Z (±700 HU jumps between adjacent slices).

## Decision
Sort by the **last** digit run: `re.findall(r"\d+", stem)[-1]`, equal to
InstanceNumber for this dataset. Rebuild cache after the fix.

## Consequences
Adjacent-slice variation is now smooth; reformats are anatomically correct.
Lesson: validate volumes with an off-axis reformat, not just axial. A future
hardening step could sort by ImagePositionPatient[z] from headers.
