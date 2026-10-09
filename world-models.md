# World Models: Access Tiers & Trial Plan

As of 2026-10-09

## Summary

Start with the cloud-hosted models: five services let us test world models for free, and four of them can be called from code, so an LLM can drive them. This file sorts every world model we found into three groups by how hard it is to run:

1. **Cloud, free to try:** runs in a browser or through an API, nothing to install. We start here.
2. **Open weights, self-host on GPU:** free to download, but needs anywhere from a laptop to several 80 GB GPUs.
3. **Closed and paid:** often the strongest, but no free access. Parked for later.

The goal of the trial is to test whether an LLM driving a world model produces better 3D scenes than an LLM coding agent working alone. Two kinds of world model matter here:

- Ones that **output 3D files** (splats or meshes). These can be compared directly with a coding agent's scene.
- Ones that only **stream interactive video**. These suit a separate game-engine test.

## Tier 1: Cloud-hosted, free to try (start here)

The easiest way to start is the Hugging Face Spaces: they're free, need only a Python client, and HY-World 2.0 and SHARP return real 3D splats. Marble gives the best quality but only 4 worlds a month, and the free plan can't export.

| Service | Models | Free allowance | Output | LLM can call it | Setup effort |
| --- | --- | --- | --- | --- | --- |
| [Hugging Face Spaces](https://huggingface.co/spaces/prithivMLmods/HY-World-2.0-Demo) (ZeroGPU) | HY-World 2.0 (reconstruction), Apple SHARP, LingBot-World v2, HY-WorldPlay, Cosmos3-Nano, nvidia/Cosmos3-Action-Viewer, plus Hunyuan3D-2.1 and TRELLIS.2 for single objects | Free daily GPU quota; PRO ($9/mo) gives 5× | 3DGS `.ply` (HY-World, SHARP), video (the rest) | Yes, via Python `gradio_client` | Very low: free HF account and a token |
| [Marble](https://marble.worldlabs.ai/pricing) (World Labs) | Marble 1.1 | 7,000 credits, about 4 worlds a month; text, image, multi-image and 360° panorama input; Chisel 3D layout editor | Explorable world viewed in the browser; no export on the free plan | No. The [API](https://docs.worldlabs.ai/api/pricing) is paid only (minimum $5, about $0.20 per draft world) | Very low: browser only |
| [build.nvidia.com](https://build.nvidia.com/nvidia/cosmos-transfer2_5-2b) | Cosmos Transfer 2.5 (2B) | Free endpoint: 1,000 credits, up to 40 requests/min | Photoreal video generated from depth, edge or segmentation control video | Yes, REST API | Low: account and API key |
| [Reactor](https://docs.reactor.inc/resources/billing) | LingBot World 2 ($0.42/min), LingBot ($0.30/min), HappyOyster ($1.67/min) | Free signup credits, expire after 90 days (amount not stated) | Real-time interactive video stream controlled by actions | Yes, SDK | Low: account and SDK |
| [Meta AI Demos](https://aidemos.meta.com/segment-anything/editor/convert-image-to-3d) | SAM 3D Objects | Free | 3D objects with scene layout | No, browser only | Very low |

HF Space IDs, all running on 2026-10-09:

- `prithivMLmods/HY-World-2.0-Demo`
- `gagndeep/Apple-Sharp-Image-to-3D-View-Synthesis`
- `innoai/lingbot-world-v2`
- `gagndeep/HF-Worldplay`
- `multimodalart/Cosmos3-Nano`
- `nvidia/Cosmos3-Action-Viewer`
- `tencent/Hunyuan3D-2.1`
- `microsoft/TRELLIS.2`

Most are community uploads, not official, so they can go down. Two were not usable on that date: `dn6/matrix-game-2` had a configuration error and `ggamecrazy/lyra2-explorable-scene` was paused.

## Tier 2: Open weights, self-host on GPU

The weights are free, but most of these need a 24–80 GB GPU. SHARP is the only one that runs on almost anything. Check each license before any commercial use: Lyra 2.0 is research-only and LingBot-World v2 is non-commercial.

| Model | Output | GPU / VRAM | Speed | License |
| --- | --- | --- | --- | --- |
| [Apple SHARP](https://github.com/apple/ml-sharp) | 3DGS `.ply` from 1 image | CPU, CUDA or Mac (MPS); rendering video needs CUDA | Under 1 s | See LICENSE_MODEL |
| [Meta SAM 3D Objects](https://github.com/facebookresearch/sam-3d-objects) | Per-object 3D plus layout, splat `.ply` | Not published | Not published | SAM License |
| [HY-World 2.0: WorldMirror](https://github.com/Tencent-Hunyuan/HY-World-2.0) (1.2B) | Mesh, 3DGS, point cloud, depth | About 12–24 GB (third-party estimate); CUDA 12.8 | Not published | Tencent license |
| [HY-World 2.0: full generation](https://github.com/Tencent-Hunyuan/HY-World-2.0) | Explorable 3DGS and mesh world | Pano 80B + WorldStereo 17B: likely several 80 GB GPUs | Not published | Tencent license |
| [NVIDIA Lyra 2.0](https://github.com/nv-tlabs/lyra/tree/main/Lyra-2) | Walkthrough video plus 3DGS `.ply` | Tested on 1× H100 80 GB | About 9 min per 80 frames (about 35 s with the `--use_dmd` fast mode) + 1 min reconstruction | Research-only model license |
| [Matrix-Game 3.0](https://github.com/SkyworkAI/Matrix-Game/tree/main/Matrix-Game-3) (5B) | Interactive video | Tested on A100/H100; 64 GB system RAM | 40 fps at 720p | Apache 2.0 |
| [Matrix-Game 2.0](https://github.com/SkyworkAI/Matrix-Game/tree/main/Matrix-Game-2) | Interactive video, keyboard and mouse | 24 GB minimum; 64 GB system RAM | 25 fps | MIT |
| [HY-WorldPlay](https://github.com/Tencent-Hunyuan/HY-WorldPlay) (8B / 5B) | Interactive video, WASD control | 72 GB on 1 GPU; 28 GB per GPU across 8 | 24 fps | Tencent license |
| [LingBot-World v2](https://github.com/Robbyant/lingbot-world-v2) (14B / 1.3B) | Interactive video, action control | 14B: 8 GPUs; 1.3B: 4 GPUs | Up to 60 fps at 720p | CC BY-NC-SA 4.0 (non-commercial) |
| [NVIDIA Cosmos 3](https://docs.nvidia.com/nim/cosmos/latest/support-matrix.html) Nano / Super | Physics video for robotics and driving | Nano: 79 GB or more; Super: 121 GB, or 2× 79 GB | Not real-time | OpenMDW (commercial use allowed) |
| [Oasis 500M](https://github.com/etched-ai/open-oasis) (Decart) | Minecraft-style interactive video | 1 consumer GPU | Real-time | Open weights |

Where a model has no published VRAM figure, the third-party estimates above are approximate.

## Tier 3: Closed and paid (parked for later)

These are the strongest models, but none is open source or free enough for an automated trial. Genie 3 has the best quality people have seen, and Marble's paid plans are the cheapest way to get exportable 3D worlds.

| Model | Access / price | Output | Why it might matter later |
| --- | --- | --- | --- |
| [Google Genie 3 / Project Genie](https://blog.google/innovation-and-ai/models-and-research/google-deepmind/project-genie/) | Google AI Ultra (about $250/mo), US 18+ at launch; 60 s sessions; no API | Interactive video, no 3D export | The quality ceiling reviewers compare everything else against |
| [Marble paid plans](https://marble.worldlabs.ai/pricing) | Standard $20/mo (12 worlds: splat and low-res collider export); Pro $35/mo (25 worlds: textured mesh plus commercial rights); Max $95/mo (75 worlds) | 3DGS, collider mesh, textured GLB | The cheapest way to get exportable worlds into the pipeline |
| [World Labs API](https://docs.worldlabs.ai/api/pricing) | $1 per 1,250 credits, minimum $5; about $0.20 per draft world, about $1.20–1.28 per standard world | Same as Marble | LLM-drivable Marble; costs a few dollars for the whole trial |
| [Runway GWM Worlds 2](https://www.deeplearning.ai/the-batch/runways-gwm-1-models-generate-videos-with-consistent-physics-for-robots-and-entertainment) | Research preview (Sept 2026); the free 125 credits likely don't cover it; video starts at Standard $15/mo | Real-time 720p/24 fps with audio, no fixed session length | Long, open-ended interactive sessions |
| [Odyssey-2 Pro / Odyssey-3](https://odyssey.ml/the-gpt-2-moment-for-world-models) | Free consumer app; developer API since Jan 2026 (free tier not confirmed); Odyssey-3 announced Sept 2026 | Interactive video | A general-purpose world model with an API |
| [Decart Oasis 3](https://techcrunch.com/2026/06/10/decarts-new-world-model-can-simulate-hours-of-photorealistic-driving-with-some-caveats/) | API at $0.02/s | Real-time driving simulation | Hours-long consistency |
| World Labs Atlas | Partner early access only (Sept 2026) | "Omni" model trained on text, image, video and 3D together | The next generation after Marble |
| [Tencent HY 3D web](https://3d.hunyuan.tencent.com) | Free trial with a queue, or by application | HY-World in the browser | An official hosted option if the HF Space fails |

Some Tier 3 dates and prices come from secondary sources. Confirm them before spending money.

## Trial plan (cloud first)

The first trial turns one photo into a walkable 3D scene, with four arms compared on the same images. A coding agent and a 3D-output world model both end with a 3D scene, so this is a fair comparison.

| Arm | What runs | Tier | Cost |
| --- | --- | --- | --- |
| A. LLM only | Claude Code looks at the photo and writes a Three.js scene with walk controls | — | Tokens only |
| B1. World model, quality reference | The LLM writes the Marble prompt and Chisel layout; we capture fixed views in the browser | 1 | Free (4 worlds) |
| B2. World model, automated | LLM → HY-World 2.0 and SHARP Spaces via `gradio_client` → `.ply` splat → the LLM builds a Three.js viewer with colliders | 1 | Free (daily quota) |
| C. Hybrid | Arm A's scene rendered as depth and edge video → Cosmos Transfer 2.5 re-renders it photoreal | 1 | Free endpoint |
| D. Interactive (optional) | The LLM steers LingBot World 2 on Reactor toward a goal ("walk to the door"), compared with the same goal in arm A | 1 | Free signup credits |

**Test images (3, keeping 1 Marble world in reserve):**

1. A simple empty room
2. A kitchen with a central island (Marble's known occlusion failure)
3. An outdoor street, or a piece of stylized concept art

**Metrics:**

- Similarity to the photo from the original camera (LPIPS / DINO)
- Blind 1–5 ratings of 3 new viewpoints
- Consistency when the camera turns 180° and back
- Whether you can walk without clipping
- An edit task ("move the table 1 m left, make the sofa red"), timed
- Cost per scene (GPU minutes, tokens, dollars)

**Run order:**

1. Arm A and arm B2 (HF Spaces)
2. Arm C (Cosmos Transfer)
3. Arm B1 (Marble, once the test images are final)
4. Arm D (Reactor)

If cloud results look promising, move to Tier 2 (Lyra 2.0 on a rented H100) or the World Labs API in Tier 3.

## Caveats

- The Twitter/X channel failed during research (the CLI got 404s from X's API), so X sentiment is missing.
- The hosted Spaces are community uploads, not official, so they can break or disappear.
- Reactor doesn't publish how many free signup credits you get.
- The Marble free plan can't export, so it is a visual reference only, not part of an automated pipeline.

## Sources

- Pricing and access: [Marble pricing](https://marble.worldlabs.ai/pricing), [World Labs API pricing](https://docs.worldlabs.ai/api/pricing), [Reactor billing](https://docs.reactor.inc/resources/billing), [build.nvidia.com Cosmos](https://build.nvidia.com/search?q=cosmos), [NVIDIA forum on API credits](https://forums.developer.nvidia.com/t/api-credits-for-build-nvidia-com/306633), [Runway free plan](https://help.runwayml.com/hc/en-us/articles/50404627334547-Free-plan-details)
- Hugging Face Spaces: [HY-World 2.0 Demo](https://huggingface.co/spaces/prithivMLmods/HY-World-2.0-Demo), [Cosmos3-Nano](https://huggingface.co/spaces/multimodalart/Cosmos3-Nano)
- Model repos: [HY-World 2.0](https://github.com/Tencent-Hunyuan/HY-World-2.0), [HY-WorldPlay](https://github.com/Tencent-Hunyuan/HY-WorldPlay), [Lyra 2](https://github.com/nv-tlabs/lyra/tree/main/Lyra-2), [Matrix-Game 3](https://github.com/SkyworkAI/Matrix-Game/tree/main/Matrix-Game-3), [Matrix-Game 2](https://github.com/SkyworkAI/Matrix-Game/tree/main/Matrix-Game-2), [LingBot-World v2](https://github.com/Robbyant/lingbot-world-v2), [ml-sharp](https://github.com/apple/ml-sharp), [SAM 3D Objects](https://github.com/facebookresearch/sam-3d-objects), [open-oasis](https://github.com/etched-ai/open-oasis), [NIM Cosmos support matrix](https://docs.nvidia.com/nim/cosmos/latest/support-matrix.html)
- Closed models: [Project Genie](https://blog.google/innovation-and-ai/models-and-research/google-deepmind/project-genie/), [Runway GWM-1 (The Batch)](https://www.deeplearning.ai/the-batch/runways-gwm-1-models-generate-videos-with-consistent-physics-for-robots-and-entertainment), [Odyssey](https://odyssey.ml/the-gpt-2-moment-for-world-models), [Decart (TechCrunch)](https://techcrunch.com/2026/06/10/decarts-new-world-model-can-simulate-hours-of-photorealistic-driving-with-some-caveats/)
- Third-party estimates: [Clore HY-World guide](https://docs.clore.ai/guides/guides_v2-hi/3d/hunyuan-world-2), [Cosmos 3 (Koenig)](https://academy.kspl.tech/blog/nvidia-cosmos-3-tutorial-open-physical-ai-omnimodel), [Cosmos 3 (Spheron)](https://www.spheron.network/blog/deploy-nvidia-cosmos-3-gpu-cloud-physical-ai/)
