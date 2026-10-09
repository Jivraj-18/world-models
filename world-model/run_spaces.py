"""Run the free Hugging Face Space world models on one image and save their 3D outputs.

Usage: uvx --from gradio_client python run_spaces.py <image> <out_dir> [hyworld|sharp|all]
"""
import shutil
import sys
import time
from pathlib import Path

from gradio_client import Client, handle_file

# Authenticated calls get a much larger free ZeroGPU quota than anonymous ones.
TOKEN_FILE = Path.home() / ".cache/huggingface/token"
HF_TOKEN = TOKEN_FILE.read_text().strip() if TOKEN_FILE.exists() else None


def save(src, dst: Path):
    if src and Path(src).exists():
        shutil.copy(src, dst)
        print(f"  saved {dst} ({dst.stat().st_size / 1e6:.1f} MB)")
        return True
    print(f"  missing output for {dst.name}: {src!r}")
    return False


def run_hyworld(image: Path, out: Path):
    print("HY-World 2.0 (WorldMirror) ...")
    t = time.time()
    c = Client("prithivMLmods/HY-World-2.0-Demo", token=HF_TOKEN, verbose=False)
    c.predict(files=[handle_file(str(image))], time_interval=1.0, api_name="/on_files_uploaded")
    res = c.predict(
        frame_selector="All",
        show_camera=False,
        filter_sky_bg=False,
        show_mesh=True,
        filter_ambiguous=True,
        api_name="/reconstruct",
    )
    print(f"  done in {time.time() - t:.0f}s; status: {res[6]!r}")
    save(res[7], out / "hyworld_mesh.glb")
    save(res[8], out / "hyworld_splat.ply")
    depth = res[2]["path"] if isinstance(res[2], dict) else res[2]
    save(depth, out / "hyworld_depth.png")


def run_sharp(image: Path, out: Path):
    print("Apple SHARP ...")
    t = time.time()
    c = Client("gagndeep/Apple-Sharp-Image-to-3D-View-Synthesis", token=HF_TOKEN, verbose=False)
    res = c.predict(
        image_path=handle_file(str(image)),
        trajectory_type="rotate_forward",
        output_long_side=0,
        num_frames=60,
        fps=30,
        render_video=True,
        api_name="/run_sharp",
    )
    print(f"  done in {time.time() - t:.0f}s; info: {str(res[2])[:200]!r}")
    vid = res[0]["video"] if isinstance(res[0], dict) else res[0]
    save(vid, out / "sharp_preview.mp4")
    ply = res[1]["value"] if isinstance(res[1], dict) else res[1]  # DownloadButton returns {"value": path}
    save(ply, out / "sharp_splat.ply")


if __name__ == "__main__":
    image, out = Path(sys.argv[1]), Path(sys.argv[2])
    which = sys.argv[3] if len(sys.argv) > 3 else "all"
    out.mkdir(parents=True, exist_ok=True)
    for name, fn in [("hyworld", run_hyworld), ("sharp", run_sharp)]:
        if which in (name, "all"):
            try:
                fn(image, out)
            except Exception as e:  # keep going so one failing Space doesn't block the other
                print(f"  {name} failed: {type(e).__name__}: {e}")
