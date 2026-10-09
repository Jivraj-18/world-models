"""Remove the world model's own staircase from a .splat so the coded staircase can replace it (hybrid).

Splat space (OpenCV camera frame) is mapped into the coded scene exactly as the hybrid page does it:
  world = PhotoCameraPose * RotX(pi) * scale * p
then every splat inside the stair's cylinder (radius R around the y axis) is dropped.

With --scale auto, the scale is chosen so the most splats land on the coded stair's cylinder:
single-image models only know depth up to scale, so this pins the photographed stair to the coded one.

Usage: uvx --from numpy python cut_stair.py in.splat out.splat --scale auto [--radius 1.45]
"""
import argparse

import numpy as np

EYE = np.array([0.9, 2.0, 6.6])     # coded scene photo-view camera (site/hybrid/js/main.js PHOTO)
TARGET = np.array([0.0, 5.4, 0.0])
SPLAT = np.dtype([("p", "<f4", 3), ("s", "<f4", 3), ("c", "u1", 4), ("r", "u1", 4)])


def look_at_rotation(eye, target, up=np.array([0.0, 1.0, 0.0])):
    # Same convention as THREE.Matrix4.lookAt: the camera's +z axis points from target to eye.
    z = eye - target
    z /= np.linalg.norm(z)
    x = np.cross(up, z)
    x /= np.linalg.norm(x)
    y = np.cross(z, x)
    return np.stack([x, y, z], 1)


def best_scale(d, lo=0.2, hi=20.0):
    """Scale that puts the most splats inside the stair cylinder (radius 1.25 m, 0-11 m high)."""
    def hits(sc):
        w = d * sc + EYE
        r = np.hypot(w[:, 0], w[:, 2])
        return ((r < 1.25) & (w[:, 1] > 0) & (w[:, 1] < 11)).sum()
    coarse = max(np.geomspace(lo, hi, 80), key=hits)
    return max(np.linspace(coarse * 0.9, coarse * 1.1, 41), key=hits)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--scale", default="auto")
    ap.add_argument("--radius", type=float, default=1.45)
    a = ap.parse_args()

    s = np.fromfile(a.src, dtype=SPLAT)
    p = s["p"].astype(np.float64)
    p[:, 1:] *= -1  # RotX(pi): OpenCV (y down, z forward) -> Three.js (y up, -z forward)
    d = p @ look_at_rotation(EYE, TARGET).T
    scale = best_scale(d) if a.scale == "auto" else float(a.scale)
    world = d * scale + EYE
    keep = np.hypot(world[:, 0], world[:, 2]) > a.radius
    s[keep].tofile(a.dst)
    print(f"scale {scale:.2f}")
    print(f"kept {keep.sum():,} of {len(s):,} splats ({(~keep).sum():,} inside the stair cylinder removed)")


if __name__ == "__main__":
    main()
