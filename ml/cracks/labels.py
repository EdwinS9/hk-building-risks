"""Shared class / domain definitions for the crack specialists.

Architecture: TWO specialist models, one per surface domain, because surface
type is known at capture time (you point the drone at a facade or at a road) and
the two feed different downstream teams with different severity thresholds.

Each specialist is a 3-class detector:
  none   clean surface of that domain (clean concrete OR clean asphalt)
  crack  a crack on that domain's surface
  other  not a surface at all (person, animal, sky, vehicle, ...) -> the
         out-of-distribution sink so non-surface photos are not forced to crack.
"""

DOMAINS = ["facade", "asphalt"]

# Per-specialist output classes. Index in this list == model output index.
CLASSES = ["none", "crack", "other"]
CLASS_TO_IDX = {c: i for i, c in enumerate(CLASSES)}
IDX_TO_CLASS = {i: c for i, c in enumerate(CLASSES)}

# Overlay colour for a 'crack' tile depends on which specialist produced it.
DOMAIN_CRACK_COLOR = {
    "facade": (230, 25, 75),    # red
    "asphalt": (245, 130, 48),  # orange
}
