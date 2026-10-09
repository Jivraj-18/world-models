"""Refine a Lyra 2.0 Gaussian splat against its own generated video with gsplat, and measure whether it helps.

Protocol
  - Start from Lyra's reconstructed_scene.ply (11.2M Gaussians) and Lyra's per-frame cameras (w2c_render).
  - Hold out every 10th video frame; never train on them.
  - Sanity check: our render of the original splat vs NVIDIA's own render (gs_trajectory.mp4).
  - Baseline: PSNR / SSIM of the original splat vs the generated video, on held-out and training frames.
  - Refine: standard 3DGS loss (0.8 L1 + 0.2 D-SSIM), low learning rates, no densification. Evaluate on the
    held-out frames every EVAL_EVERY steps and keep the best checkpoint by held-out PSNR (guards overfitting).
  - Save the refined PLY, metrics.json, side-by-side comparisons and a render of the full camera path.

Usage:
  modal volume create lyra2-refine
  modal volume put lyra2-refine <run>_reconstructed_scene.ply <run>_combined.mp4 <run>_cameras.npz <run>_gs_trajectory.mp4 /in/
  modal run modal_refine.py --run B_orbit
  modal volume get lyra2-refine /out/<run> .
"""
import json
import time

import modal

app = modal.App("lyra2-refine")
vol = modal.Volume.from_name("lyra2-refine", create_if_missing=True)
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg")
    .pip_install("torch==2.4.1", "numpy<2", "av==12.3.0", "pillow", "torchmetrics==1.4.2",
                 index_url="https://download.pytorch.org/whl/cu124", extra_index_url="https://pypi.org/simple")
    .pip_install("gsplat==1.5.3+pt24cu124", find_links="https://docs.gsplat.studio/whl/pt24cu124/gsplat/")
)

STEPS, EVAL_EVERY, HOLDOUT_EVERY = 3000, 500, 10
LR = dict(means=2e-5, scales=2e-3, quats=5e-4, opacities=1e-2, dc=1e-3)  # gentle: refine, don't rebuild


@app.function(image=image, gpu="H100", volumes={"/vol": vol}, timeout=3600, memory=65536)
def refine(run: str):
    import av
    import numpy as np
    import torch
    import torch.nn.functional as F
    from gsplat import rasterization
    from PIL import Image
    from torchmetrics.functional.image import structural_similarity_index_measure as ssim_fn

    t0 = time.time()
    dev = "cuda"
    inp, out = f"/vol/in/{run}", f"/vol/out/{run}"
    import os
    os.makedirs(out, exist_ok=True)

    # ---- load splat (standard 3DGS PLY) ----
    with open(f"{inp}_reconstructed_scene.ply", "rb") as f:
        header = []
        while (line := f.readline().decode().strip()) != "end_header":
            header.append(line)
        props = [l.split()[-1] for l in header if l.startswith("property")]
        n = int(next(l for l in header if l.startswith("element vertex")).split()[-1])
        data = np.frombuffer(f.read(n * 4 * len(props)), np.float32).reshape(n, len(props))
    col = {p: data[:, i] for i, p in enumerate(props)}
    T = lambda a: torch.tensor(np.ascontiguousarray(a), device=dev, dtype=torch.float32)
    params = {
        "means": T(np.stack([col["x"], col["y"], col["z"]], 1)),
        "scales": T(np.stack([col["scale_0"], col["scale_1"], col["scale_2"]], 1)),
        "quats": T(np.stack([col["rot_0"], col["rot_1"], col["rot_2"], col["rot_3"]], 1)),
        "opacities": T(col["opacity"]),
        "dc": T(np.stack([col["f_dc_0"], col["f_dc_1"], col["f_dc_2"]], 1))[:, None, :],
    }
    orig = {k: v.clone() for k, v in params.items()}
    print(f"loaded {n:,} gaussians in {time.time() - t0:.0f}s", flush=True)

    # ---- frames and cameras ----
    def frames(path):
        with av.open(path) as c:
            return np.stack([fr.to_ndarray(format="rgb24") for fr in c.decode(video=0)])
    vid = torch.tensor(frames(f"{inp}_combined.mp4"), device=dev).float() / 255  # [T,H,W,3]
    nv_render = torch.tensor(frames(f"{inp}_gs_trajectory.mp4"), device=dev).float() / 255
    cams = np.load(f"{inp}_cameras.npz")
    viewmats = T(cams["w2c_render"])
    Ks = T(cams["intrinsics_vipe"])
    Tn, H, W, _ = vid.shape
    hold = [i for i in range(Tn) if i % HOLDOUT_EVERY == 5]   # 5, 15, 25, ...
    train = [i for i in range(Tn) if i % HOLDOUT_EVERY != 5]
    print(f"{Tn} frames {W}x{H}; train {len(train)}, held out {len(hold)}", flush=True)

    def render(p, i, mode="classic"):
        img, _, _ = rasterization(
            p["means"], F.normalize(p["quats"], dim=-1), torch.exp(p["scales"]), torch.sigmoid(p["opacities"]),
            p["dc"], viewmats[i:i + 1], Ks[i:i + 1], W, H, sh_degree=0, rasterize_mode=mode)  # black background (default)
        return img[0].clamp(0, 1)

    def psnr(a, b):
        return float(-10 * torch.log10(F.mse_loss(a, b)))

    def ssim(a, b):
        return float(ssim_fn(a.permute(2, 0, 1)[None], b.permute(2, 0, 1)[None], data_range=1.0))

    @torch.no_grad()
    def evaluate(p, idx):
        ps, ss = [], []
        for i in idx:
            r = render(p, i)
            ps.append(psnr(r, vid[i])); ss.append(ssim(r, vid[i]))
        return round(float(np.mean(ps)), 3), round(float(np.mean(ss)), 4)

    # ---- sanity check: our render of the original vs NVIDIA's render ----
    with torch.no_grad():
        sanity = {m: round(float(np.mean([psnr(render(params, i, m), nv_render[i]) for i in hold])), 2)
                  for m in ("classic", "antialiased")}
    print("our render vs NVIDIA render (PSNR, higher = more identical):", sanity, flush=True)

    metrics = {"run": run, "gaussians": n, "steps": STEPS, "lr": LR, "sanity_vs_nvidia_render_psnr": sanity,
               "baseline": {"heldout": evaluate(params, hold), "train": evaluate(params, train[::5])}, "curve": []}
    print("baseline (PSNR, SSIM):", metrics["baseline"], flush=True)

    # ---- refine ----
    for v in params.values():
        v.requires_grad_(True)
    opt = torch.optim.Adam([{"params": [params[k]], "lr": LR[k], "name": k} for k in params], eps=1e-15)
    best = (metrics["baseline"]["heldout"][0], 0, {k: v.detach().clone() for k, v in params.items()})
    rng = np.random.default_rng(0)
    t1 = time.time()
    for step in range(1, STEPS + 1):
        i = int(rng.choice(train))
        r = render(params, i)
        gt = vid[i]
        loss = 0.8 * F.l1_loss(r, gt) + 0.2 * (1 - ssim_fn(r.permute(2, 0, 1)[None], gt.permute(2, 0, 1)[None], data_range=1.0))
        opt.zero_grad(set_to_none=True)
        loss.backward()
        opt.step()
        if step % EVAL_EVERY == 0:
            h = evaluate(params, hold)
            tr = evaluate(params, train[::5])
            metrics["curve"].append({"step": step, "heldout": h, "train": tr, "sec": round(time.time() - t1)})
            print(f"step {step}: held-out {h}  train {tr}  ({time.time() - t1:.0f}s)", flush=True)
            if h[0] > best[0]:
                best = (h[0], step, {k: v.detach().clone() for k, v in params.items()})
    metrics["best_step"] = best[1]
    p_best = best[2]
    metrics["refined"] = {"heldout": evaluate(p_best, hold), "train": evaluate(p_best, train[::5])}
    metrics["refine_seconds"] = round(time.time() - t1)
    print("refined (best by held-out):", metrics["refined"], "at step", best[1], flush=True)

    # ---- outputs ----
    with torch.no_grad():
        for i in hold[::max(1, len(hold) // 6)][:6]:
            row = torch.cat([vid[i], render(orig, i), render(p_best, i)], 1)
            Image.fromarray((row.cpu().numpy() * 255).astype(np.uint8)).save(f"{out}/compare_frame{i:03d}.jpg", quality=92)
        with av.open(f"{out}/refined_render.mp4", "w") as c:
            s = c.add_stream("libx264", rate=16)
            s.width, s.height, s.pix_fmt = W * 2, H, "yuv420p"
            s.options = {"crf": "18"}
            for i in range(Tn):
                fr = torch.cat([render(orig, i), render(p_best, i)], 1)
                c.mux(s.encode(av.VideoFrame.from_ndarray((fr.cpu().numpy() * 255).astype(np.uint8), format="rgb24")))
            c.mux(s.encode())
        cols = {"x": p_best["means"][:, 0], "y": p_best["means"][:, 1], "z": p_best["means"][:, 2]}
        out_arr = np.stack([
            (cols[p] if p in cols else
             p_best["scales"][:, int(p[-1])] if p.startswith("scale_") else
             p_best["quats"][:, int(p[-1])] if p.startswith("rot_") else
             p_best["opacities"] if p == "opacity" else
             p_best["dc"][:, 0, int(p[-1])] if p.startswith("f_dc_") else
             torch.tensor(col[p], device=dev)).detach().float().cpu().numpy()
            for p in props], 1).astype(np.float32)
        with open(f"{out}/refined_scene.ply", "wb") as f:
            f.write(("\n".join(["ply"] + [l for l in header if l != "ply"] + ["end_header"]) + "\n").encode())
            f.write(out_arr.tobytes())
    metrics["total_seconds"] = round(time.time() - t0)
    json.dump(metrics, open(f"{out}/metrics.json", "w"), indent=1)
    vol.commit()
    return metrics


@app.local_entrypoint()
def main(run: str = "B_orbit"):
    print(json.dumps(refine.remote(run), indent=1))
