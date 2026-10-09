"""Plot Lyra's recovered camera paths (top-down) and find the frame/camera matching the input photo.

For each run it reads <run>_cameras.npz and <run>_combined.mp4 from the outputs folder, finds the video frame
closest to the input photo, and writes:
  - an SVG with the zoom and orbit paths side by side
  - photo_cameras.json with that frame's camera converted to Three.js / SuperSplat axes (y up, -z forward)

Usage: uvx --from numpy --with pillow python plot_camera_paths.py <outputs_dir> <input_png> <out_svg> <runA> <runB>
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

FLIP = np.diag([1.0, -1.0, -1.0])  # OpenCV (y down, z forward) -> Three.js (y up, -z forward)


def photo_frame(video: Path, ref_png: Path) -> int:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-vf", "scale=104:60",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    frames = np.frombuffer(raw, np.uint8).reshape(-1, 60, 104, 3).astype(np.float32)
    ref = np.asarray(Image.open(ref_png).convert("RGB").resize((104, 60)), np.float32)
    return int(((frames - ref) ** 2).mean((1, 2, 3)).argmin())


def main():
    out_dir, ref_png, out_svg = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    runs = sys.argv[4:6]
    W, H, pad = 460, 360, 36
    parts, cams = [], {}
    for i, (run, color) in enumerate(zip(runs, ["#3f6a35", "#8a6a12"])):
        d = np.load(out_dir / f"{run}_cameras.npz")
        c2w = np.linalg.inv(d["w2c_render"])
        frame = photo_frame(out_dir / f"{run}_combined.mp4", ref_png)
        K = d["intrinsics_vipe"][frame]
        pos, fwd, up = FLIP @ c2w[frame, :3, 3], FLIP @ c2w[frame, :3, 2], FLIP @ -c2w[frame, :3, 1]
        cams[run] = dict(frame=frame, pos=pos.round(3).tolist(), target=(pos + 3 * fwd).round(3).tolist(),
                         up=up.round(3).tolist(), fov=round(float(np.degrees(2 * np.arctan(240 / K[1, 1]))), 1))

        p = c2w[:, :3, 3][:, [0, 2]]
        f = c2w[:, :3, 2][:, [0, 2]]
        lo, hi = p.min(0), p.max(0)
        span = max((hi - lo).max(), 1e-3) * 1.25
        c = (lo + hi) / 2
        ox = i * (W + 20)

        def T(q):  # world (x, z) -> svg; forward (+z) drawn upwards
            return (ox + pad + (q[0] - c[0]) / span * (W - 2 * pad) + (W - 2 * pad) / 2,
                    H - pad - ((q[1] - c[1]) / span * (H - 2 * pad) + (H - 2 * pad) / 2))

        title = ("A · zoom path" if "zoom" in run else "B · orbit path") + (" (fast)" if run.endswith("_fast") else "")
        parts.append(f'<text x="{ox + pad}" y="22" class="t">{title}</text>')
        parts.append(f'<polyline points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in map(T, p))}" fill="none" stroke="{color}" stroke-width="2.5"/>')
        for k in range(0, len(p), 20):
            a, b = T(p[k]), T(p[k] + f[k] * span * 0.06)
            parts.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="{color}" stroke-opacity=".55" stroke-width="1.5"/>')
        s, e, ph = T(p[0]), T(p[-1]), T(p[frame])
        parts += [f'<circle cx="{s[0]:.1f}" cy="{s[1]:.1f}" r="5" fill="#fff" stroke="{color}" stroke-width="2"/>',
                  f'<text x="{s[0] + 8:.1f}" y="{s[1] + 4:.1f}" class="l">frame 0</text>',
                  f'<circle cx="{e[0]:.1f}" cy="{e[1]:.1f}" r="5" fill="{color}"/>',
                  f'<text x="{e[0] + 8:.1f}" y="{e[1] + 4:.1f}" class="l">frame {len(p) - 1}</text>',
                  f'<rect x="{ph[0] - 6:.1f}" y="{ph[1] - 6:.1f}" width="12" height="12" fill="#c0392b"/>',
                  f'<text x="{ph[0] + 9:.1f}" y="{ph[1] - 8:.1f}" class="l">your photo (frame {frame})</text>']

    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {2 * W + 20} {H}" font-family="system-ui,sans-serif">'
           '<style>.t{font-size:15px;font-weight:600;fill:#24231f}.l{font-size:12px;fill:#6a665b}</style>'
           '<rect width="100%" height="100%" fill="#fffdf8"/>' + "\n".join(parts) +
           f'<text x="{pad}" y="{H - 8}" class="l">Top-down view of the camera positions recovered by VIPE · ticks show where the camera looks · forward is up</text></svg>')
    out_svg.write_text(svg)
    cam_file = out_svg.parent / "photo_cameras.json"
    allcams = json.loads(cam_file.read_text()) if cam_file.exists() else {}
    allcams.update(cams)
    cam_file.write_text(json.dumps(allcams, indent=1))
    print(json.dumps(cams, indent=1))


if __name__ == "__main__":
    main()
