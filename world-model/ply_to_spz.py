"""Thin a large 3DGS .ply spatially and write it as a compressed .spz (Niantic format, version 2).

Why: picking the "most important" splats by opacity x volume keeps big, soft, far-away blobs and drops the
small sharp splats near the camera (on Lyra's output the kept set was 3.4x larger and 3.7x farther away).
Instead we keep, in every voxel, only the most opaque splat, with voxels that grow with distance from the
origin (the first camera), so near detail survives and redundant far splats go.

SPZ v2 layout (gzip of): 16-byte header | positions 24-bit fixed (n*9) | alpha u8 (n) | colour u8 (n*3,
SH DC packed as dc*0.15+0.5) | scale u8 (n*3, (log s + 10) * 16) | rotation u8 (n*3, xyz of unit quat with w>=0).

Usage: uvx --from numpy python ply_to_spz.py in.ply out.spz [--voxel 0.015] [--per-metre 0.004] [--min-alpha 0.02]
"""
import argparse
import gzip
import struct

import numpy as np

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))  # sibling module, also under python -I
from ply_to_splat import read_ply  # noqa: E402

SH_C0 = 0.28209479177387814
FRAC_BITS = 12  # 24-bit signed fixed point: +/-2048 units at 1/4096 precision


def thin(pos, alpha, voxel, per_metre):
    """Indices of the most opaque splat in each distance-scaled voxel."""
    dist = np.linalg.norm(pos, axis=1)
    size = np.maximum(voxel, dist * per_metre)
    # Quantise by a size class so neighbouring splats share a grid; log2 classes keep it to a few grids.
    cls = np.floor(np.log2(size / voxel)).astype(np.int64)
    cell = voxel * (2.0 ** cls)
    key = np.floor(pos / cell[:, None]).astype(np.int64)
    k = np.concatenate([key, cls[:, None]], 1)
    # Sort by (cell, -alpha) and keep the first of each cell.
    order = np.lexsort((-alpha, k[:, 3], k[:, 2], k[:, 1], k[:, 0]))
    ks = k[order]
    first = np.ones(len(order), bool)
    first[1:] = np.any(ks[1:] != ks[:-1], axis=1)
    return order[first]


def write_spz(path, pos, alpha, rgb, scale, quat_wxyz):
    n = len(pos)
    q = np.round(pos * (1 << FRAC_BITS)).astype(np.int64)
    q = np.clip(q, -(1 << 23), (1 << 23) - 1) & 0xFFFFFF
    pos_b = np.stack([q & 0xFF, (q >> 8) & 0xFF, (q >> 16) & 0xFF], -1).astype(np.uint8).reshape(n, 9)
    alpha_b = np.clip(np.round(alpha * 255), 0, 255).astype(np.uint8)
    dc = (rgb - 0.5) / SH_C0
    col_b = np.clip(np.round((dc * 0.15 + 0.5) * 255), 0, 255).astype(np.uint8)
    scale_b = np.clip(np.round((np.log(np.maximum(scale, 1e-12)) + 10) * 16), 0, 255).astype(np.uint8)
    qn = quat_wxyz / np.linalg.norm(quat_wxyz, axis=1, keepdims=True)
    qn = np.where(qn[:, :1] < 0, -qn, qn)  # w >= 0 so it can be rebuilt from xyz
    rot_b = np.clip(np.round(qn[:, 1:] * 127.5 + 127.5), 0, 255).astype(np.uint8)
    header = struct.pack("<IIIBBBB", 0x5053474E, 2, n, 0, FRAC_BITS, 0, 0)
    body = b"".join([header, pos_b.tobytes(), alpha_b.tobytes(), col_b.tobytes(), scale_b.tobytes(), rot_b.tobytes()])
    with gzip.open(path, "wb", compresslevel=6) as f:
        f.write(body)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--voxel", type=float, default=0.015, help="voxel edge near the camera (scene units)")
    ap.add_argument("--per-metre", type=float, default=0.004, help="voxel growth per unit of distance")
    ap.add_argument("--min-alpha", type=float, default=0.02)
    ap.add_argument("--max-dist", type=float, default=150.0)
    a = ap.parse_args()

    v = read_ply(a.src)
    pos = np.stack([v["x"], v["y"], v["z"]], 1).astype(np.float32)
    op = v["opacity"]
    alpha = op if (op.min() >= 0 and op.max() <= 1) else 1 / (1 + np.exp(-op))
    ok = (alpha >= a.min_alpha) & (np.linalg.norm(pos, axis=1) <= a.max_dist)
    idx = np.nonzero(ok)[0]
    keep = idx[thin(pos[idx], alpha[idx], a.voxel, a.per_metre)]

    rgb = 0.5 + SH_C0 * np.stack([v["f_dc_0"], v["f_dc_1"], v["f_dc_2"]], 1)[keep]
    scale = np.exp(np.stack([v["scale_0"], v["scale_1"], v["scale_2"]], 1))[keep]
    quat = np.stack([v["rot_0"], v["rot_1"], v["rot_2"], v["rot_3"]], 1)[keep]
    write_spz(a.dst, pos[keep], alpha[keep], rgb, scale, quat)

    d_all, d_keep = np.linalg.norm(pos, axis=1), np.linalg.norm(pos[keep], axis=1)
    s_all, s_keep = np.exp(np.stack([v["scale_0"], v["scale_1"], v["scale_2"]], 1)).max(1), scale.max(1)
    import os
    print(f"{len(v):,} -> {len(keep):,} splats ({len(keep) / len(v):.0%}), {os.path.getsize(a.dst) / 1e6:.1f} MB")
    print(f"  median size  all {np.median(s_all):.4f}  kept {np.median(s_keep):.4f}")
    print(f"  median dist  all {np.median(d_all):.2f}  kept {np.median(d_keep):.2f}")


if __name__ == "__main__":
    main()
