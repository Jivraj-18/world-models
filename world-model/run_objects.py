"""Turn image crops into textured 3D meshes with free image-to-3D Spaces (TRELLIS.2, Hunyuan3D-2.1).

Usage: uvx --from gradio_client python run_objects.py <crop.jpg> <out_dir> [trellis|hunyuan|all]
Writes <out_dir>/<crop>_<model>.glb
"""
import shutil
import sys
import time
from pathlib import Path

from gradio_client import Client, handle_file

TOKEN_FILE = Path.home() / ".cache/huggingface/token"
HF_TOKEN = TOKEN_FILE.read_text().strip() if TOKEN_FILE.exists() else None


def path_of(x):
    """Gradio file outputs come back as a path, {"value": path}, {"path": path} or {"video": path}."""
    if isinstance(x, dict):
        return x.get("value") or x.get("path") or x.get("video")
    return x


def save(src, dst: Path):
    src = path_of(src)
    if src and Path(src).exists():
        shutil.copy(src, dst)
        print(f"  saved {dst} ({dst.stat().st_size / 1e6:.1f} MB)", flush=True)
    else:
        print(f"  no file for {dst.name}: {src!r}", flush=True)


def trellis(img: Path, out: Path):
    c = Client("microsoft/TRELLIS.2", token=HF_TOKEN, verbose=False)
    c.predict(api_name="/start_session")
    pre = c.predict(input=handle_file(str(img)), api_name="/preprocess_image")
    c.predict(image=handle_file(path_of(pre)), seed=1, resolution="1536",
              ss_sampling_steps=25, shape_slat_sampling_steps=25, tex_slat_sampling_steps=25,
              api_name="/image_to_3d")
    glb = c.predict(decimation_target=300000, texture_size=2048, api_name="/extract_glb")
    save(glb[0], out / f"{img.stem}_trellis.glb")


def hunyuan(img: Path, out: Path):
    c = Client("tencent/Hunyuan3D-2.1", token=HF_TOKEN, verbose=False)
    res = c.predict(image=handle_file(str(img)), steps=40, guidance_scale=5.0, seed=1234,
                    octree_resolution=384, check_box_rembg=True, num_chunks=8000, randomize_seed=False,
                    api_name="/generation_all")
    # returns (white mesh, textured mesh, html, stats, seed); keep the textured one
    save(res[1], out / f"{img.stem}_hunyuan.glb")


if __name__ == "__main__":
    img, out = Path(sys.argv[1]), Path(sys.argv[2])
    which = sys.argv[3] if len(sys.argv) > 3 else "all"
    out.mkdir(parents=True, exist_ok=True)
    for name, fn in [("trellis", trellis), ("hunyuan", hunyuan)]:
        if which in (name, "all"):
            t = time.time()
            print(f"{name} on {img.name} ...", flush=True)
            try:
                fn(img, out)
                print(f"  {name} done in {time.time() - t:.0f}s", flush=True)
            except Exception as e:
                print(f"  {name} failed after {time.time() - t:.0f}s: {type(e).__name__}: {str(e)[:300]}", flush=True)
