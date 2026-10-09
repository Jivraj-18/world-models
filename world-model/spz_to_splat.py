"""Decode a Niantic .spz Gaussian splat (versions 2-4) and write the compact .splat format.

Marble exports .spz in its raw OpenCV-style frame; pass --scale (metric_scale_factor from the world
response) to convert to metres, matching what ply_to_splat.py writes for the other models.

Decoding follows nianticlabs/spz load-spz.cc:
  position = int24 / 2^fractionalBits      scale = exp(byte / 16 - 10)
  alpha    = byte / 255                     colour = 0.5 + SH_C0 * (byte / 255 - 0.5) / 0.15  (bytes hold SH DC terms)
  rotation = smallest-three 10-bit (v3+), or xyz int8 with derived w (v2)

Usage: uvx --from numpy --with zstandard python spz_to_splat.py in.spz out.splat [--scale S] [--max-splats N]
"""
import argparse
import gzip
import struct

import numpy as np

SH_C0 = 0.28209479177387814
SPLAT = np.dtype([("p", "<f4", 3), ("s", "<f4", 3), ("c", "u1", 4), ("r", "u1", 4)])


def read_streams(raw: bytes):
    if raw[:4] == b"NGSP":  # v4: plaintext header + TOC + independent zstd streams
        import zstandard
        magic, version, n, sh_deg, frac, flags, n_streams, toc = struct.unpack_from("<IIIBBBBI", raw, 0)
        sizes = [struct.unpack_from("<QQ", raw, toc + 16 * i) for i in range(n_streams)]
        off = toc + 16 * n_streams
        streams = []
        d = zstandard.ZstdDecompressor()
        for comp, uncomp in sizes:
            streams.append(d.decompress(raw[off:off + comp], max_output_size=uncomp))
            off += comp
        return version, n, sh_deg, frac, streams
    data = gzip.decompress(raw)  # v1-3: one gzip stream, 16-byte header then attributes back to back
    magic, version, n, sh_deg, frac, flags, _ = struct.unpack_from("<IIIBBBB", data, 0)
    rot_bytes = 4 if version >= 3 else 3
    sizes = [n * 9, n, n * 3, n * 3, n * rot_bytes]
    streams, off = [], 16
    for sz in sizes:
        streams.append(data[off:off + sz])
        off += sz
    return version, n, sh_deg, frac, streams


def decode(path):
    version, n, sh_deg, frac, s = read_streams(open(path, "rb").read())
    pos_b, alpha_b, col_b, scale_b, rot_b = (np.frombuffer(x, np.uint8) for x in s[:5])

    p = pos_b.reshape(n, 3, 3).astype(np.int32)
    p = p[..., 0] | (p[..., 1] << 8) | (p[..., 2] << 16)
    p = np.where(p & 0x800000, p - (1 << 24), p).astype(np.float32) / (1 << frac)

    alpha = alpha_b.astype(np.float32) / 255
    sh_dc = (col_b.reshape(n, 3).astype(np.float32) / 255 - 0.5) / 0.15
    color = 0.5 + SH_C0 * sh_dc
    scale = np.exp(scale_b.reshape(n, 3).astype(np.float32) / 16 - 10)

    if version >= 3:
        comp = rot_b.reshape(n, 4).astype(np.uint32)
        comp = comp[:, 0] | (comp[:, 1] << 8) | (comp[:, 2] << 16) | (comp[:, 3] << 24)
        largest = comp >> 30
        q = np.zeros((n, 4), np.float32)  # x, y, z, w
        mask = (1 << 9) - 1
        for i in (3, 2, 1, 0):
            sel = largest != i
            mag = (comp & mask).astype(np.float32)
            neg = (comp >> 9) & 1
            val = np.sqrt(0.5) * mag / mask
            val = np.where(neg == 1, -val, val)
            q[sel, i] = val[sel]
            comp = np.where(sel, comp >> 10, comp)
        q[np.arange(n), largest] = np.sqrt(np.clip(1 - (q ** 2).sum(1), 0, 1))
    else:
        xyz = rot_b.reshape(n, 3).astype(np.float32) / 127.5 - 1
        w = np.sqrt(np.clip(1 - (xyz ** 2).sum(1), 0, 1))
        q = np.concatenate([xyz, w[:, None]], 1)
    return p, scale, color, alpha, q


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--max-splats", type=int, default=None)
    a = ap.parse_args()

    p, scale, color, alpha, q = decode(a.src)
    p, scale = p * a.scale, scale * a.scale
    order = np.argsort(-(alpha * scale.prod(1)))
    if a.max_splats:
        order = order[:a.max_splats]
    out = np.zeros(len(order), SPLAT)
    out["p"] = p[order]
    out["s"] = scale[order]
    out["c"] = np.clip(np.concatenate([color[order], alpha[order, None]], 1) * 255, 0, 255).astype(np.uint8)
    wxyz = q[order][:, [3, 0, 1, 2]]  # .splat stores w, x, y, z
    out["r"] = np.clip(wxyz * 128 + 128, 0, 255).astype(np.uint8)
    out.tofile(a.dst)
    print(f"{a.src}: {len(p):,} splats -> {a.dst}: {len(out):,} splats, {out.nbytes / 1e6:.1f} MB")
    print(f"  bounds min {p.min(0).round(2)} max {p.max(0).round(2)} median {np.median(p, 0).round(2)}")


if __name__ == "__main__":
    main()
