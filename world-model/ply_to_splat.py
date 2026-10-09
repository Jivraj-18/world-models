"""Convert a 3D Gaussian Splatting .ply into the compact .splat format (32 bytes per splat).

Layout per splat (antimatter15 format, read by @mkkellogg/gaussian-splats-3d):
  position float32 x3 | scale float32 x3 | color uint8 RGBA | rotation uint8 x4 (quaternion w,x,y,z)

Splats are sorted by visual importance (opacity x volume) so --max-splats keeps the ones that matter.

Usage: uvx --from numpy python ply_to_splat.py in.ply out.splat [--max-splats N]
"""
import argparse

import numpy as np

SH_C0 = 0.28209479177387814

PLY_TYPES = {"float": "f4", "float32": "f4", "double": "f8", "uchar": "u1", "uint8": "u1",
             "int": "i4", "int32": "i4", "uint": "u4", "short": "i2", "ushort": "u2"}


def read_ply(path):
    with open(path, "rb") as f:
        header = []
        while True:
            line = f.readline().decode("ascii").strip()
            header.append(line)
            if line == "end_header":
                break
        offset = f.tell()
    if "format binary_little_endian 1.0" not in header:
        raise ValueError("only binary little-endian PLY is supported")
    count, props, in_vertex = 0, [], False
    for line in header:
        parts = line.split()
        if parts[:2] == ["element", "vertex"]:
            count, in_vertex = int(parts[2]), True
        elif parts[:1] == ["element"]:
            in_vertex = False
        elif parts[:1] == ["property"] and in_vertex:
            props.append((parts[-1], "<" + PLY_TYPES[parts[1]]))
    return np.fromfile(path, dtype=np.dtype(props), count=count, offset=offset)


def convert(src, dst, max_splats=None):
    v = read_ply(src)
    names = v.dtype.names
    pos = np.stack([v["x"], v["y"], v["z"]], 1).astype(np.float32)
    scale = np.exp(np.stack([v["scale_0"], v["scale_1"], v["scale_2"]], 1)).astype(np.float32)
    if "f_dc_0" in names:
        rgb = 0.5 + SH_C0 * np.stack([v["f_dc_0"], v["f_dc_1"], v["f_dc_2"]], 1)
    else:
        rgb = np.stack([v["red"], v["green"], v["blue"]], 1) / 255.0
    op = v["opacity"]
    # Standard 3DGS stores opacity as a logit; some exporters (HY-World WorldMirror) store it already in [0, 1].
    alpha = op if (op.min() >= 0 and op.max() <= 1) else 1 / (1 + np.exp(-op))
    rot = np.stack([v["rot_0"], v["rot_1"], v["rot_2"], v["rot_3"]], 1)
    rot /= np.linalg.norm(rot, axis=1, keepdims=True)

    order = np.argsort(-(alpha * scale.prod(1)))
    if max_splats:
        order = order[:max_splats]

    out = np.zeros(len(order), dtype=[("p", "<f4", 3), ("s", "<f4", 3), ("c", "u1", 4), ("r", "u1", 4)])
    out["p"] = pos[order]
    out["s"] = scale[order]
    out["c"] = np.clip(np.concatenate([rgb[order], alpha[order, None]], 1) * 255, 0, 255).astype(np.uint8)
    out["r"] = np.clip(rot[order] * 128 + 128, 0, 255).astype(np.uint8)
    out.tofile(dst)
    print(f"{src}: {len(v):,} splats -> {dst}: {len(out):,} splats, {out.nbytes / 1e6:.1f} MB")
    print(f"  bounds min {pos.min(0).round(2)} max {pos.max(0).round(2)} median {np.median(pos, 0).round(2)}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--max-splats", type=int, default=None)
    a = ap.parse_args()
    convert(a.src, a.dst, a.max_splats)
