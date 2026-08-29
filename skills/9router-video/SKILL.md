---
name: 9router-video
description: Generate videos via 9Router /v1/videos/generations - xAI Grok Imagine (async: submit, poll request_id, download MP4), Qwen/DashScope Wan + HappyHorse, and fal.ai (Veo 3.1, Sora 2, Kling, Seedance, Topaz, SeedVR and more) which both return the finished video from one blocking call. Use when the user wants to create, generate, or render a video, text-to-video (txt2vid), image-to-video, reference-to-video, video editing, upscaling, lipsync, or character swap.
---

# 9Router — Video Generation

Requires `NINEROUTER_URL` (and `NINEROUTER_KEY` if auth enabled). See https://raw.githubusercontent.com/decolua/9router/refs/heads/master/skills/9router/SKILL.md for setup.

Three providers, one endpoint set:

| Provider | Models | How a create call answers |
|---|---|---|
| `xai` | `grok-imagine-video` | returns `{"request_id"}`, you poll |
| `qwen` | Wan 3.0 / 2.7 / 2.6 / 2.5 / 2.2 / 2.1, HappyHorse 1.1/1.0, VACE, animate | **blocks until the render finishes** and returns `{"status":"done","video":{"url"}}` |
| `fal` | Veo 3.1, Sora 2, Kling, Seedance, Dreamactor, Omnihuman, BiRefNet, Bria, SeedVR, Topaz, Grok Imagine — 119 endpoints | **blocks until the render finishes** and returns `{"status":"done","video":{"url"}}` |

## xAI Grok Imagine

Requires a connected **xAI account** in the 9Router dashboard — either **Grok Build OAuth** (SuperGrok / X Premium+ subscription sign-in) or a direct **xAI API key** from console.x.ai. The two are separate auth types with separate billing; the dashboard shows which one each connection uses.

### Endpoints (async job flow)

The POST returns a `request_id` immediately, then you poll until the job is `done` or `failed`.

| Endpoint | Purpose |
|---|---|
| `POST /v1/videos/generations` | text-to-video / image-to-video |
| `POST /v1/videos/edits` | edit an existing video |
| `POST /v1/videos/extensions` | extend an existing video |
| `GET /v1/videos/{request_id}` | poll job status |

xAI request fields (passed through unchanged — see https://docs.x.ai/developers/rest-api-reference/inference/videos):

| Field | Required | Notes |
|---|---|---|
| `model` | no | `xai/grok-imagine-video` (prefix is stripped before upstream) |
| `prompt` | yes for T2V | video description |
| `duration` | no | seconds |
| `aspect_ratio` | no | `16:9`, `9:16`, `1:1`, `4:3`, `3:4`, `3:2`, `2:3` |
| `resolution` | no | `480p`, `720p`, `1080p` |
| `image` | no | `{ "url": "https://… or data:image/…;base64,…" }` for image-to-video |
| `video` | edits/extensions | `{ "url": "…mp4" }` or `{ "file_id": "…" }` |

### Examples

Submit a job:

```bash
curl -X POST "$NINEROUTER_URL/v1/videos/generations" \
  -H "Authorization: Bearer $NINEROUTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"xai/grok-imagine-video","prompt":"A cinematic tracking shot through a neon city at night","duration":8,"aspect_ratio":"16:9","resolution":"720p"}'
# → {"request_id":"abc123"}   (response header x-9router-connection-id: <id>)
```

Poll until done (echo the connection header back so the same account polls the job):

```bash
curl "$NINEROUTER_URL/v1/videos/abc123" \
  -H "Authorization: Bearer $NINEROUTER_KEY" \
  -H "x-connection-id: <id from create response>"
# → {"status":"pending","progress":42}
# → {"status":"done","video":{"url":"https://…mp4","duration":8},"model":"grok-imagine-video"}
# → {"status":"failed","error":{"code":"…","message":"…"}}
```

Download: fetch `video.url` from the `done` response.

### CLI one-shot

```bash
9router xai video \
  --prompt "A cinematic tracking shot through a neon city at night" \
  --output video.mp4
# options: --model --duration --aspect-ratio --resolution --image --timeout --port --api-key
```

Submits, polls with progress, downloads to `video.mp4.part`, atomically renames on success. Ctrl+C cancels cleanly; non-zero exit on failure.

## Qwen / DashScope (Wan, HappyHorse, VACE)

Requires a connected **Qwen (DashScope) API key** in the dashboard (`https://home.qwencloud.com/api-keys`).

Upstream is an async task API, but 9Router waits the render out for you: one
`POST /v1/videos/generations` returns the finished video. Renders take minutes,
so expect the call to block for a while and set a generous client timeout. If it
outlives the internal ceiling (`VIDEO_AWAIT_TIMEOUT_MS`, default 15 min), the
response falls back to `{"request_id","status":"processing"}` and you finish the
job with `GET /v1/videos/{request_id}` — same as the xAI flow.

**One request shape for all 33 models.** Every field is optional; fields a model
does not accept are dropped before the request leaves, so a prompt-only body
works everywhere. Illegal media combinations are rejected locally with a 400
instead of failing as a task minutes later.

```bash
curl -X POST "$NINEROUTER_URL/v1/videos/generations" \
  -H "Authorization: Bearer $NINEROUTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen/wan2.6-i2v-flash","prompt":"the cat turns and walks away","image":"https://example.com/cat.png","resolution":"720P","duration":5}'
# -> {"id":"c634…","request_id":"c634…","status":"done","video":{"url":"https://…mp4"}}
```

| Field | Notes |
|---|---|
| `model` | `qwen/<model-id>` (see the table below) |
| `prompt`, `negative_prompt` | text |
| `image`, `last_frame`, `reference_images`, `video`, `first_clip`, `last_clip`, `mask_image`, `mask_video`, `audio_url`, `reference_voice` | media: a public `https://` URL or `data:<mime>;base64,<data>`. Canonical `media: [{type,url}]` is accepted too. |
| `resolution` / `size` / `ratio` | `480P|720P|1080P`, `WIDTHxHEIGHT`, or `16:9`-style — cross-translated to whichever the model takes |
| `duration` | seconds |
| `audio`, `audio_setting`, `shot_type`, `prompt_extend`, `watermark`, `seed` | generation flags |
| `mode`, `check_image` | `wan2.2-animate-*` only |
| `function`, `obj_or_bg`, `control_condition`, `strength`, `mask_type`, `mask_frame_id`, `expand_ratio`, `{top,bottom,left,right}_scale` | `wan2.1-vace-plus` (general video editing) |

| Family | Models | Needs |
|---|---|---|
| Wan 3.0 (all-in-one) | `wan3.0-video`, `wan3.0-video-prime` | prompt and/or any media |
| Wan 2.7 | `wan2.7-i2v`, `wan2.7-t2v`, `wan2.7-r2v`, `wan2.7-videoedit` (+ dated variants) | i2v: `image`; r2v: `reference_images`; videoedit: `video` |
| HappyHorse | `happyhorse-1.1-i2v`, `-t2v`, `-r2v`, `happyhorse-1.0-video-edit` | as above |
| Image-to-video | `wan2.6-i2v-flash`, `wan2.6-i2v`, `wan2.5-i2v-preview`, `wan2.2-i2v-flash`, `wan2.2-i2v-plus`, `wan2.1-i2v-turbo`, `wan2.1-i2v-plus` | `image` |
| First+last frame | `wan2.2-kf2v-flash`, `wan2.1-kf2v-plus` | `image` + `last_frame` |
| Reference-to-video | `wan2.6-r2v-flash`, `wan2.6-r2v` | `reference_images` |
| Text-to-video | `wan2.6-t2v`, `wan2.5-t2v-preview`, `wan2.2-t2v-plus`, `wan2.1-t2v-turbo`, `wan2.1-t2v-plus` | `prompt` |
| General video editing | `wan2.1-vace-plus` | per `function` |
| Animation / character swap | `wan2.2-animate-move`, `wan2.2-animate-mix` | `image` + `video` |

Ask 9Router which fields a model takes: `GET /v1/models/info?id=qwen/wan3.0-video` returns its `params` and `capabilities`.

## fal.ai

Requires a connected **fal API key** in the dashboard (`https://fal.ai/dashboard/keys`).

Model ids are fal endpoint paths prefixed with the provider: `fal/<endpoint-id>`.
The `fal-ai/` owner prefix may be omitted (`fal/veo3.1` == `fal/fal-ai/veo3.1`).

```bash
curl -sS "$NINEROUTER_URL/v1/videos/generations" \
  -H "Authorization: Bearer $NINEROUTER_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"fal/fal-ai/veo3.1","prompt":"a serene lake at sunset","duration":8,"resolution":"1080p","ratio":"16:9","audio":true}'
```

```bash
# image-to-video, one blocking call
curl -sS "$NINEROUTER_URL/v1/videos/generations" \
  -H "Authorization: Bearer $NINEROUTER_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"fal/bytedance/seedance-2.5/image-to-video","prompt":"the cat turns and walks away","image":"https://example.com/cat.png"}'
```

### One body, every model

Every field except `model` is optional, so a prompt-only request works against
all 119 endpoints. Fields an endpoint does not accept are dropped before the
request leaves, and loose values snap into whatever that endpoint's schema
declares — the same `"duration": 8` becomes Veo's `"8s"`, Kling's `"10"` and
Sora's `8`; `"size": "1280x720"` becomes `resolution` + `aspect_ratio` (or
`target_resolution`) wherever those exist.

Generic names cross-map onto each endpoint's own field: `image` → `image_url` /
`start_image_url` / `first_frame_url`, `last_frame` → `end_image_url` /
`tail_image_url`, `video` → `video_url`, `reference_images` → `image_urls` /
`reference_image_urls`, `audio` → `generate_audio`, `ratio` → `aspect_ratio`.
Engine-variant fields (Topaz/SeedVR/BiRefNet/Sora model names) are sent as
`model_variant`, since `model` itself is the 9Router routing id.

A required media field that is missing is a local **400** naming the field in
generic terms, not a FAILED task minutes later:

```
fal video: fal-ai/veo3.1/image-to-video requires 'image' (source / first frame image URL)
```

### Families

| Family | Example ids |
|---|---|
| Veo 3.1 | `fal-ai/veo3.1`, `/fast`, `/lite`, `/image-to-video`, `/reference-to-video`, `/first-last-frame-to-video`, `/extend-video` |
| Sora 2 | `fal-ai/sora-2/text-to-video`, `/image-to-video`, `/video-to-video/remix`, `/characters` |
| Kling | `fal-ai/kling-video/{v1,v1.5,v1.6,v2,v2.1,v2.5-turbo,v2.6,v3,o1,o3}/...`, `/lipsync/*`, `/effects`, `/motion-control`, `/ai-avatar` |
| Seedance | `fal-ai/bytedance/seedance/v1{,.5}/...`, `bytedance/seedance-2.0/...`, `bytedance/seedance-2.5/...` |
| ByteDance other | `fal-ai/bytedance/dreamactor/v2`, `/omnihuman/v1.5`, `/video-stylize` |
| Upscale / restore | `fal-ai/topaz/upscale/video`, `topaz/upscale/video/{generative,precision}`, `fal-ai/seedvr/upscale/video` |
| Matting / background | `fal-ai/birefnet/{,v2/}video`, `bria/video/background-removal{,/v3}`, `bria/video/increase-resolution` |
| xAI | `xai/grok-imagine-video/{text,image}-to-video` |

Ask 9Router which fields a model takes: `GET /v1/models/info?id=fal/fal-ai/veo3.1`
returns its `params` and `capabilities`.

## Notes & limits

- Jobs are **account-bound** upstream: poll with the same connection that created the job (`x-connection-id` header, value from the create response's `x-9router-connection-id`). Echo `x-provider` back too (from `x-9router-provider`) so the poll reaches the provider that minted the id.
- Creation POSTs are **never auto-retried** (a retry could create and bill two videos). Only a 401→token-refresh→single-retry is performed, which upstream rejects before job creation.
- Video models are tagged `kind: "video"` and are excluded from chat model lists and chat fallback combos.
- Grok Build **subscription OAuth** tokens are sent to the same `api.x.ai/v1/videos` endpoints as API keys; whether a given subscription tier includes video-generation quota is controlled by xAI and is not verified by 9Router — a `403`/`permission_denied` from upstream means the connected account has no video access.
