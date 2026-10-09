# World models vs a coding agent: one photo to 3D

One photo of the cast-iron spiral staircase in Vienna's Schönbrunn Palm House, turned into an explorable 3D scene by:

- **a coding agent** writing a procedural Three.js scene (`site/coded/`)
- **world models**: Apple SHARP and Tencent HY-World 2.0 (Hugging Face Spaces), World Labs Marble (API), Tencent HY-World 2.1 (web), and **NVIDIA Lyra 2.0** on Modal H100s
- **hybrids** that combine the coded staircase with world-model splats (`site/hybrid/`, `site/assembled/`)

Live site: https://jivraj-18.github.io/world-models/ · Lyra 2.0 story: https://jivraj-18.github.io/world-models/lyra/

## Layout

| Path | What |
|---|---|
| `site/` | The static site deployed to GitHub Pages by `.github/workflows/pages.yml` |
| `site/js/config.js` | Base URL of the assets on Cloudflare R2 |
| `world-model/run_spaces.py` | Sends the photo to the SHARP and HY-World 2.0 Hugging Face Spaces |
| `world-model/run_marble.py` | Generates and downloads a Marble world through the World Labs API |
| `world-model/run_objects.py` | Image-to-3D object meshes (TRELLIS.2, Hunyuan3D 2.1 Spaces) |
| `world-model/ply_to_splat.py`, `spz_to_splat.py` | Convert splats to the compact `.splat` web format |
| `world-model/cut_stair.py` | Fits a splat's scale to the coded stair and cuts out its own stair (hybrid) |
| `world-model/lyra/` | NVIDIA Lyra 2.0 on Modal: image build, checkpoint download, runs, resource logger |

## Assets

Models, videos and images are **not** in git. They live in Cloudflare R2, mirrored from `~/r2/world-models` and uploaded with `r2up world-models`. The bucket allows read-only CORS from this Pages domain and `localhost:8765`.

## Running Lyra 2.0

```bash
cd world-model/lyra
modal run --detach modal_download.py                       # 97 GB of checkpoints into a volume (CPU)
modal run modal_lyra.py::smoke                             # build the image, import check on an L4
modal run modal_lyra.py::generate --which A_zoom_fast,B_orbit_fast   # fast (DMD) runs, one H100 each
modal run modal_lyra.py::generate --which A_zoom,B_orbit             # full quality
modal volume get lyra2-outputs <run>/videos/palm_house_gs_ours/reconstructed_scene.ply .
```

## Credits and licences

- Photo: [“20250501 Palm House Schönbrunn 02”](https://commons.wikimedia.org/wiki/File:20250501_Palm_House_Sch%C3%B6nbrunn_02.jpg) by Flocci Nivis, CC BY-SA 4.0. All splats, renders and videos derived from it are shared under CC BY-SA 4.0.
- NVIDIA Lyra 2.0 and Apple SHARP outputs fall under research-only model licences; HY-World under Tencent's licence. This is a non-commercial research comparison.
