"""Generate a World Labs Marble world from the test photo + prompt via the World API, and download its assets.

Key is read from ~/.config/worldlabs/api_key. Standard library only.
Usage: python3 run_marble.py <image> <out_dir> [--model marble-1.1-plus] [--text-only]
       python3 run_marble.py <image> <out_dir> --world-id <id>   # resume: wait for an existing world and download it
"""
import argparse
import json
import time
import urllib.request
from pathlib import Path

API = "https://api.worldlabs.ai/marble/v1"
KEY = (Path.home() / ".config/worldlabs/api_key").read_text().strip()

PROMPT = (
    "Interior of a 19th-century Victorian palm house conservatory in Vienna. At the centre, a white-painted "
    "cast-iron spiral staircase winds anticlockwise around a slender central column up to a circular gallery high "
    "under the roof. The stair has pierced filigree risers, scrolled side panels, beaded balusters and a curved "
    "handrail, with a gothic-arched iron gate at its base. Above, a tall curved glass roof on cream iron ribs, with "
    "scalloped overlapping glass panes and a large diagonal tubular iron beam. Dense tropical planting all around: "
    "Mediterranean fan palms, a tall dark conifer, ferns and broadleaf climbers. Bright, hazy daylight through the "
    "glass, soft shadows, a gravel path around the stair's base."
)


def call(method, path, body=None):
    req = urllib.request.Request(
        API + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"WLT-Api-Key": KEY, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as r:  # generate can take minutes to respond
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path} -> {e.code}: {e.read().decode()[:500]}")


def upload(image: Path):
    prep = call("POST", "/media-assets:prepare_upload",
                {"file_name": image.name, "extension": image.suffix.lstrip(".").lower(), "kind": "image"})
    info = prep["upload_info"]
    headers = {"Content-Type": "image/jpeg", **(info.get("required_headers") or {})}
    req = urllib.request.Request(info["upload_url"], method="PUT", data=image.read_bytes(), headers=headers)
    urllib.request.urlopen(req, timeout=300).read()
    return prep["media_asset"]["media_asset_id"]


def download(url, dst: Path):
    with urllib.request.urlopen(url, timeout=600) as r:
        dst.write_bytes(r.read())
    print(f"  saved {dst} ({dst.stat().st_size / 1e6:.1f} MB)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("out")
    ap.add_argument("--model", default="marble-1.1-plus")
    ap.add_argument("--text-only", action="store_true")
    ap.add_argument("--world-id", help="skip generation; wait for this existing world and download it")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    tag = "text" if a.text_only else "image"

    print("credits before:", call("GET", "/credits"))
    if a.world_id:
        t0 = time.time()
        while True:
            world = call("GET", f"/worlds/{a.world_id}")
            world = world.get("world", world)
            if ((world.get("assets") or {}).get("splats") or {}).get("spz_urls"):
                break
            print(f"  {time.time() - t0:5.0f}s waiting for world assets", flush=True)
            time.sleep(30)
        return save_world(world, out, tag)
    if a.text_only:
        prompt = {"type": "text", "text_prompt": PROMPT}
    else:
        asset_id = upload(Path(a.image))
        print("uploaded media asset", asset_id)
        prompt = {"type": "image", "is_pano": False, "text_prompt": PROMPT,
                  "image_prompt": {"source": "media_asset", "media_asset_id": asset_id}}
    op = call("POST", "/worlds:generate", {"display_name": f"Palm House ({tag})", "model": a.model, "world_prompt": prompt})
    print("operation", op["operation_id"])

    t0 = time.time()
    while not op.get("done"):
        time.sleep(20)
        op = call("GET", f"/operations/{op['operation_id']}")
        prog = (op.get("metadata") or {}).get("progress") or {}
        print(f"  {time.time() - t0:5.0f}s {prog.get('status')} {prog.get('description', '')}", flush=True)
    if op.get("error"):
        raise SystemExit(f"generation failed: {op['error']}")

    save_world(op["response"], out, tag)


def save_world(world, out, tag):
    (out / f"marble_{tag}_world.json").write_text(json.dumps(world, indent=2))
    print("world:", world.get("world_marble_url"))
    assets = world["assets"]
    spz = assets["splats"]["spz_urls"]
    for k in ("500k", "full_res"):
        if spz.get(k):
            download(spz[k], out / f"marble_{tag}_{k}.spz")
    if (assets.get("mesh") or {}).get("collider_mesh_url"):
        download(assets["mesh"]["collider_mesh_url"], out / f"marble_{tag}_collider.glb")
    if (assets.get("imagery") or {}).get("pano_url"):
        download(assets["imagery"]["pano_url"], out / f"marble_{tag}_pano.jpg")
    print("scale metadata:", assets["splats"].get("semantics_metadata"))
    print("credits after:", call("GET", "/credits"))


if __name__ == "__main__":
    main()
