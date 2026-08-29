"use client";

export function Row({ label, children }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <span className="w-full text-xs font-medium text-text-muted sm:w-20 sm:shrink-0">{label}</span>
      <div className="w-full min-w-0 flex-1">{children}</div>
    </div>
  );
}

export const KIND_EXAMPLE_CONFIG = {
  webSearch: {
    inputLabel: "Query",
    inputPlaceholder: "What is the latest news about AI?",
    defaultInput: "What is the latest news about AI?",
    bodyKey: "query",
    defaultResponse: `{\n  "results": [\n    { "title": "...", "url": "...", "snippet": "..." }\n  ]\n}`,
    extraFields: [
      { key: "search_type", label: "Type", type: "select", default: "web", options: ["web", "news"] },
      { key: "max_results", label: "Max results", type: "number", default: 5, min: 1, max: 100 },
      { key: "country", label: "Country", type: "text", default: "" },
      { key: "language", label: "Language", type: "text", default: "" },
    ],
  },
  webFetch: {
    inputLabel: "URL",
    inputPlaceholder: "https://example.com",
    defaultInput: "https://example.com",
    bodyKey: "url",
    defaultResponse: `{\n  "content": "...",\n  "title": "...",\n  "url": "..."\n}`,
    extraFields: [
      { key: "format", label: "Format", type: "select", default: "markdown", options: ["markdown", "text", "html"] },
      { key: "max_characters", label: "Max chars", type: "number", default: 0, min: 0 },
    ],
  },
  image: {
    inputLabel: "Prompt",
    inputPlaceholder: "A cute cat wearing a hat",
    defaultInput: "A cute cat wearing a hat",
    bodyKey: "prompt",
    defaultResponse: `{\n  "data": [\n    { "url": "...", "b64_json": "..." }\n  ]\n}`,
    extraFields: [
      { key: "n", label: "n", type: "number", default: 1, min: 1, max: 4 },
      { key: "size", label: "Size", type: "select", default: "auto", options: ["auto", "1024x1024", "1024x1536", "1536x1024", "1024x1792", "1792x1024"] },
      { key: "quality", label: "Quality", type: "select", default: "auto", options: ["auto", "low", "medium", "high", "standard", "hd"] },
      { key: "background", label: "Background", type: "select", default: "auto", options: ["auto", "transparent", "opaque"] },
      { key: "style", label: "Style", type: "select", default: "", options: ["", "vivid", "natural"] },
      { key: "response_format", label: "Format", type: "select", default: "", options: ["", "url", "b64_json"] },
      { key: "image_detail", label: "Image Detail", type: "select", default: "high", options: ["auto", "low", "high", "original"] },
      { key: "output_format", label: "Codec", type: "select", default: "png", options: ["png", "jpeg", "webp"] },
      // DashScope (qwen) — gated per model by `params` in the registry entry
      { key: "negative_prompt", label: "Negative Prompt", type: "text", default: "", placeholder: "blurry, low quality" },
      { key: "prompt_extend", label: "Prompt Extend", type: "select", default: "", options: ["", "true", "false"] },
      { key: "prompt_extend_mode", label: "Extend Mode", type: "select", default: "", options: ["", "direct", "agent"] },
      { key: "enable_thinking", label: "Thinking", type: "select", default: "", options: ["", "true", "false"] },
      { key: "thinking_mode", label: "Thinking Mode", type: "select", default: "", options: ["", "true", "false"] },
      { key: "enable_sequential", label: "Image Set", type: "select", default: "", options: ["", "true", "false"] },
      { key: "watermark", label: "Watermark", type: "select", default: "", options: ["", "true", "false"] },
      { key: "seed", label: "Seed", type: "number", default: "", min: 0, max: 2147483647 },
    ],
  },
  imageToText: {
    inputLabel: "Image URL",
    inputPlaceholder: "https://example.com/image.png",
    defaultInput: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg",
    bodyKey: "url",
    extraBody: { prompt: "Describe this image in detail" },
    defaultResponse: `{\n  "text": "A cat sitting on a windowsill...",\n  "model": "..."\n}`,
  },
  video: {
    inputLabel: "Prompt",
    inputPlaceholder: "A serene lake at sunset",
    defaultInput: "A serene lake at sunset",
    bodyKey: "prompt",
    defaultResponse: `{\n  "id": "...",\n  "status": "done",\n  "video": { "url": "..." }\n}`,
    // Video generation is one common request shape for every model: each field
    // below is optional, and every model receives only the ones it accepts
    // (gated here by the registry's per-model `params`, dropped again by the
    // provider adapter), so a prompt-only request works against all of them.
    extraFields: [
      { key: "negative_prompt", label: "Negative Prompt", type: "text", default: "", placeholder: "blurry, low quality" },
      // Media references — public https URL or a data: URI
      { key: "image", label: "Image", type: "text", default: "", placeholder: "https://... (first frame / subject)" },
      { key: "last_frame", label: "Last Frame", type: "text", default: "", placeholder: "https://... (end frame)" },
      { key: "reference_images", label: "Reference Image", type: "text", default: "", placeholder: "https://... (subject reference)" },
      { key: "video", label: "Video", type: "text", default: "", placeholder: "https://... (source / driving video)" },
      { key: "first_clip", label: "First Clip", type: "text", default: "", placeholder: "https://... (clip to extend)" },
      { key: "last_clip", label: "Last Clip", type: "text", default: "", placeholder: "https://... (clip to precede)" },
      { key: "mask_image", label: "Mask Image", type: "text", default: "", placeholder: "https://... (edit area)" },
      { key: "mask_video", label: "Mask Video", type: "text", default: "", placeholder: "https://... (edit area over time)" },
      { key: "audio_url", label: "Audio", type: "text", default: "", placeholder: "https://... (driving audio)" },
      { key: "reference_voice", label: "Reference Voice", type: "text", default: "", placeholder: "https://... (1-10s voice timbre)" },
      // Geometry — resolution/size/ratio are cross-translated per model
      { key: "resolution", label: "Resolution", type: "select", default: "", options: ["", "480P", "720P", "1080P"] },
      { key: "size", label: "Size", type: "select", default: "", options: ["", "832x480", "480x832", "1280x720", "720x1280", "960x960", "1920x1080", "1080x1920"] },
      { key: "ratio", label: "Ratio", type: "select", default: "", options: ["", "adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "4:5", "5:4", "21:9", "9:21"] },
      { key: "duration", label: "Duration (s)", type: "number", default: "", min: -1, max: 30 },
      // Generation flags
      { key: "audio", label: "Audio Track", type: "select", default: "", options: ["", "true", "false"] },
      { key: "audio_setting", label: "Audio Handling", type: "select", default: "", options: ["", "auto", "origin"] },
      { key: "shot_type", label: "Shot Type", type: "select", default: "", options: ["", "single", "multi"] },
      { key: "prompt_extend", label: "Prompt Extend", type: "select", default: "", options: ["", "true", "false"] },
      { key: "watermark", label: "Watermark", type: "select", default: "", options: ["", "true", "false"] },
      { key: "seed", label: "Seed", type: "number", default: "", min: 0, max: 2147483647 },
      // Animation models (wan2.2-animate-*)
      { key: "mode", label: "Mode", type: "select", default: "", options: ["", "wan-std", "wan-pro"] },
      { key: "check_image", label: "Check Image", type: "select", default: "", options: ["", "true", "false"] },
      // General video editing (VACE)
      { key: "function", label: "Function", type: "select", default: "", options: ["", "image_reference", "video_repainting", "video_edit", "video_extension", "video_outpainting"] },
      { key: "obj_or_bg", label: "Object / BG", type: "text", default: "", placeholder: "obj,bg (one per reference image)" },
      { key: "control_condition", label: "Control", type: "select", default: "", options: ["", "depth", "posebody", "posebodyface", "scribble"] },
      { key: "strength", label: "Strength", type: "number", default: "", min: 0, max: 1 },
      { key: "mask_type", label: "Mask Type", type: "select", default: "", options: ["", "tracking", "fixed"] },
      { key: "mask_frame_id", label: "Mask Frame", type: "number", default: "", min: 0 },
      { key: "expand_ratio", label: "Mask Expand", type: "number", default: "", min: 0, max: 1 },
      { key: "top_scale", label: "Expand Top", type: "number", default: "", min: 1, max: 2 },
      { key: "bottom_scale", label: "Expand Bottom", type: "number", default: "", min: 1, max: 2 },
      { key: "left_scale", label: "Expand Left", type: "number", default: "", min: 1, max: 2 },
      { key: "right_scale", label: "Expand Right", type: "number", default: "", min: 1, max: 2 },
    ],
  },
  music: {
    inputLabel: "Prompt",
    inputPlaceholder: "A calm piano melody",
    defaultInput: "A calm piano melody",
    bodyKey: "prompt",
    defaultResponse: `{\n  "data": [\n    { "url": "...", "format": "mp3" }\n  ]\n}`,
  },
};
