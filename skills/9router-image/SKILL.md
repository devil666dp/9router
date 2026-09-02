---
name: 9router-image
description: Generate images via 9Router /v1/images/generations using OpenAI / Gemini Imagen / DALL-E / FLUX / MiniMax / SDWebUI / ComfyUI / Codex / Qwen / Replicate (94 models incl. GPT Image 2, FLUX.2, Seedream, Imagen 4, Nano Banana Pro, Ideogram v3, Recraft) models. Use when the user wants to create, generate, draw, or render an image, picture, text-to-image (txt2img), image editing, inpainting with a mask, or upscaling.
---

# 9Router — Image Generation

Requires `NINEROUTER_URL` (and `NINEROUTER_KEY` if auth enabled). See https://raw.githubusercontent.com/decolua/9router/refs/heads/master/skills/9router/SKILL.md for setup.

## Discover

```bash
curl $NINEROUTER_URL/v1/models/image | jq '.data[].id'
# Per-model params/options (size enum, quality enum, capabilities like edit)
curl "$NINEROUTER_URL/v1/models/info?id=openai/dall-e-3"
```

## Endpoint

`POST $NINEROUTER_URL/v1/images/generations`

| Field | Required | Notes |
|---|---|---|
| `model` | yes | from `/v1/models/image` |
| `prompt` | yes | image description |
| `n` | no | count (provider-dependent) |
| `size` | no | `1024x1024`, `1792x1024`, ... |
| `quality` | no | `standard` / `hd` (OpenAI) |
| `response_format` | no | `url` (default) or `b64_json` |

Add query `?response_format=binary` to receive raw image bytes (handy for saving file).

## Examples

Save to file (binary):

```bash
curl -X POST "$NINEROUTER_URL/v1/images/generations?response_format=binary" \
  -H "Authorization: Bearer $NINEROUTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini/gemini-3-pro-image-preview","prompt":"watercolor mountains at sunrise","size":"1024x1024"}' \
  --output out.png
```

JS (URL response):

```js
const r = await fetch(`${process.env.NINEROUTER_URL}/v1/images/generations`, {
  method: "POST",
  headers: { "Authorization": `Bearer ${process.env.NINEROUTER_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model: "gemini/gemini-3-pro-image-preview", prompt: "neon city", size: "1024x1024" }),
});
const { data } = await r.json();
console.log(data[0].url || data[0].b64_json.slice(0, 40));
```

## Response shape

JSON (default `response_format=url`):
```json
{ "created": 1735000000, "data": [{ "url": "https://..." }] }
```

`response_format=b64_json`:
```json
{ "created": 1735000000, "data": [{ "b64_json": "iVBORw0KGgo..." }] }
```

Query `?response_format=binary` returns raw image bytes (Content-Type `image/png` or `image/jpeg`).

## Replicate

Requires a connected **Replicate API token** in the dashboard (`https://replicate.com/account/api-tokens`).

Model ids are Replicate `owner/name` paths prefixed with the provider:
`replicate/openai/gpt-image-2`. The owner stays part of the model id (only the
first slash splits provider from model). Append `:<version-hash>` to pin an exact
build; the 11 community image models already carry a pinned version.

94 models behind one prediction API — GPT Image 1/1.5/2, FLUX.2 (max/pro/flex/
dev/klein) and FLUX.1 (pro/ultra/dev/schnell/kontext/fill/canny/depth/redux),
Seedream 3/4/4.5/5-lite, Imagen 3/4 (+fast/ultra), Nano Banana 1/2/Pro, Ideogram
v2/v3, Recraft v3/v4 (+SVG, upscalers), Qwen-Image (+edit/edit-plus), Wan 2.7
image, HiDream, Z-Image, SDXL, SD 3.5, Bria, Luma Photon, Hunyuan Image 3,
Riverflow, Arrow 1.1, plus upscalers (Topaz, Clarity, Real-ESRGAN, Aura-SR).

Fast models return the image from the create POST (`Prefer: wait`); slower ones
are polled inside the adapter, so either way one call returns finished images.

```bash
curl -X POST "$NINEROUTER_URL/v1/images/generations" \
  -H "Authorization: Bearer $NINEROUTER_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"replicate/openai/gpt-image-2","prompt":"watercolor mountains at sunrise","size":"1024x1536","quality":"high","n":2}'
```

```bash
# edit: an image plus an instruction
curl -X POST "$NINEROUTER_URL/v1/images/generations" \
  -H "Authorization: Bearer $NINEROUTER_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"replicate/black-forest-labs/flux-kontext-pro","prompt":"make it snow","image":"https://example.com/street.png"}'

# inpaint with a mask
curl -X POST "$NINEROUTER_URL/v1/images/generations" \
  -H "Authorization: Bearer $NINEROUTER_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"replicate/black-forest-labs/flux-fill-dev","prompt":"a brass doorknob","image":"https://example.com/door.png","mask_image":"https://example.com/mask.png"}'

# upscale
curl -X POST "$NINEROUTER_URL/v1/images/generations" \
  -H "Authorization: Bearer $NINEROUTER_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"replicate/topazlabs/image-upscale","image":"https://example.com/photo.jpg","upscale_factor":4}'
```

### One body, every model

Every field except `model` is optional, so a prompt-only request works on all 94
models. Fields a model does not accept are **dropped** before the request leaves
(Replicate 422s on unknown input keys), and loose values snap into whatever that
model's schema declares.

- `n` reaches `num_outputs` / `number_of_images` / `num_images` / `num_results` /
  `max_images`.
- `image` reaches `input_image` / `image_prompt` / `control_image` /
  `redux_image` / `input_image_1` / `image_reference`, and becomes a one-item
  list on models whose `image` is an array (`qwen/qwen-image-edit-plus`).
- `images` reaches `input_images` / `image_input` / `init_images` / `references`;
  `mask_image` → `mask`; `ratio` → `aspect_ratio`; `upscale_factor` →
  `scale_factor` / `scale` / `factor` / `desired_increase`.
- `size` is translated into whatever the model speaks: a tier
  (`"2048x2048"` → Nano Banana Pro's `resolution: "2K"`), a ratio
  (`"1024x1536"` → GPT Image 2's `aspect_ratio: "2:3"`), an exact enum entry
  (Recraft's `size: "1365x1024"`), or `width` + `height` (Z-Image) — and the
  matching `aspect_ratio` comes along wherever the model takes one.
- Numbers snap to the nearest declared option, including labelled ones:
  `upscale_factor: 4` becomes Topaz's `"4x"`.

A required field that is missing is a local **400** naming it in generic terms:

```
replicate image: black-forest-labs/flux-fill-dev requires 'image' (source image URL)
```

Capabilities are derived from each model's own schema, not declared: a model with
a required image input is `edit`-only, an optional one is both, a `mask` field
adds `mask`. Across the 94 models: `text2img` 72, `edit` 70, `mask` 12.

Ask 9Router which fields a model takes:
`GET /v1/models/info?id=replicate/openai/gpt-image-2` returns its `params` and
`capabilities`.

## Provider quirks

Common fields above work everywhere. These add/override:

| Provider | Extra/changed fields | Notes |
|---|---|---|
| `openai`, `minimax`, `openrouter`, `recraft` | `quality`, `style`, `response_format` | Standard OpenAI shape |
| `gemini` (nano-banana) | — | Only `prompt`; ignores `size`/`n` |
| `codex` (gpt-5.4-image) | `image`, `images[]`, `image_detail`, `output_format`, `background` | SSE stream; **ChatGPT Plus/Pro required** |
| `huggingface` | — | Only `prompt`; returns single image |
| `nanobanana` | `image`, `images[]` (edit mode) | `size` → aspect ratio; async polling |
| `fal-ai` | `image` (img2img) | `n` → `num_images`; `size` → ratio; async |
| `stability-ai` | `style` (preset), `output_format` | `size` → `aspect_ratio` |
| `black-forest-labs` (FLUX) | `image` (ref) | `size` → exact `width`/`height`; async |
| `runwayml` | `image` (ref) | `size` → ratio; async; video models exist |
| `sdwebui`, `comfyui` | — | Localhost noAuth (`:7860` / `:8188`) |
| `replicate` | `image`, `images[]`, `mask_image`, `n`, plus every field the chosen model declares | 94 models, one prediction API; `size` → ratio / tier / `width`+`height`; blocking POST |
