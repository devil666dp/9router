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
      // fal.ai video — gated per model by `params` in the registry entry, which
      // is generated from the adapter's SPECS table, so these cannot drift from
      // what each endpoint actually accepts.
      { key: "video_urls", label: "Reference Videos", type: "text", default: "", placeholder: "https://a.mp4, https://b.mp4" },
      { key: "audio_urls", label: "Reference Audio", type: "text", default: "", placeholder: "https://a.mp3, https://b.mp3" },
      { key: "elements", label: "Elements", type: "text", default: "", placeholder: "JSON array of reference elements" },
      { key: "multi_prompt", label: "Multi Prompt", type: "text", default: "", placeholder: "JSON array of timed prompts" },
      { key: "dynamic_masks", label: "Dynamic Masks", type: "text", default: "", placeholder: "JSON array of motion brush masks" },
      { key: "camera_control", label: "Camera", type: "select", default: "", options: ["", "down_back", "forward_up", "right_turn_forward", "left_turn_forward"] },
      { key: "advanced_camera_control", label: "Camera (adv.)", type: "text", default: "", placeholder: "JSON camera config" },
      { key: "effect_scene", label: "Effect", type: "text", default: "", placeholder: "effect template name" },
      { key: "style", label: "Stylize", type: "text", default: "", placeholder: "stylization preset" },
      { key: "character_ids", label: "Character IDs", type: "text", default: "", placeholder: "id1, id2" },
      { key: "character_orientation", label: "Orientation", type: "select", default: "", options: ["", "image", "video"] },
      { key: "video_id", label: "Video ID", type: "text", default: "", placeholder: "id of a previous generation" },
      { key: "name", label: "Character Name", type: "text", default: "", placeholder: "Ada" },
      // Lipsync
      { key: "text", label: "Lipsync Text", type: "text", default: "", placeholder: "line to speak" },
      { key: "voice_id", label: "Voice", type: "text", default: "", placeholder: "voice id" },
      { key: "voice_ids", label: "Voices", type: "text", default: "", placeholder: "voice1, voice2" },
      { key: "voice_language", label: "Voice Lang", type: "select", default: "", options: ["", "zh", "en"] },
      { key: "voice_speed", label: "Voice Speed", type: "number", default: "", min: 0.8, max: 2 },
      // Generation controls
      { key: "cfg_scale", label: "CFG Scale", type: "number", default: "", min: 0, max: 1 },
      { key: "num_frames", label: "Frames", type: "number", default: "", min: 1, max: 1000 },
      { key: "target_fps", label: "Target FPS", type: "number", default: "", min: 1, max: 120 },
      { key: "safety_tolerance", label: "Safety", type: "select", default: "", options: ["", "1", "2", "3", "4", "5", "6"] },
      { key: "bitrate_mode", label: "Bitrate", type: "select", default: "", options: ["", "standard", "high"] },
      { key: "camera_fixed", label: "Fixed Camera", type: "select", default: "", options: ["", "true", "false"] },
      { key: "auto_fix", label: "Auto Fix", type: "select", default: "", options: ["", "true", "false"] },
      { key: "enable_safety_checker", label: "Safety Checker", type: "select", default: "", options: ["", "true", "false"] },
      { key: "keep_audio", label: "Keep Audio", type: "select", default: "", options: ["", "true", "false"] },
      { key: "keep_original_sound", label: "Keep Sound", type: "select", default: "", options: ["", "true", "false"] },
      { key: "preserve_audio", label: "Preserve Audio", type: "select", default: "", options: ["", "true", "false"] },
      { key: "turbo_mode", label: "Turbo", type: "select", default: "", options: ["", "true", "false"] },
      { key: "trim_first_second", label: "Trim 1st Sec", type: "select", default: "", options: ["", "true", "false"] },
      { key: "delete_video", label: "Delete Upstream", type: "select", default: "", options: ["", "true", "false"] },
      { key: "detect_and_block_ip", label: "Block IP", type: "select", default: "", options: ["", "true", "false"] },
      { key: "sync_mode", label: "Sync Mode", type: "select", default: "", options: ["", "true", "false"] },
      { key: "end_user_id", label: "End User", type: "text", default: "", placeholder: "abuse-tracking id" },
      // Upscale / restore / matting
      { key: "model_variant", label: "Engine", type: "text", default: "", placeholder: "e.g. Proteus, Starlight HQ" },
      { key: "upscale_mode", label: "Upscale Mode", type: "select", default: "", options: ["", "target", "factor"] },
      { key: "upscale_factor", label: "Upscale x", type: "number", default: "", min: 1, max: 8 },
      { key: "target_resolution", label: "Target Res", type: "select", default: "", options: ["", "720p", "1080p", "1440p", "2160p"] },
      { key: "operating_resolution", label: "Operating Res", type: "select", default: "", options: ["", "1024x1024", "2048x2048", "2304x2304"] },
      { key: "desired_increase", label: "Increase", type: "select", default: "", options: ["", "2", "4"] },
      { key: "noise_scale", label: "Noise Scale", type: "number", default: "", min: 0, max: 1 },
      { key: "noise", label: "Denoise", type: "number", default: "", min: 0, max: 1 },
      { key: "grain", label: "Grain", type: "number", default: "", min: 0, max: 1 },
      { key: "halo", label: "Dehalo", type: "number", default: "", min: 0, max: 1 },
      { key: "compression", label: "Compression", type: "number", default: "", min: 0, max: 1 },
      { key: "recover_detail", label: "Recover Detail", type: "number", default: "", min: 0, max: 1 },
      { key: "softness", label: "Softness", type: "number", default: "", min: 0, max: 1 },
      { key: "H264_output", label: "H.264 Out", type: "select", default: "", options: ["", "true", "false"] },
      { key: "auto_zoom", label: "Auto Zoom", type: "select", default: "", options: ["", "true", "false"] },
      { key: "output_mask", label: "Output Mask", type: "select", default: "", options: ["", "true", "false"] },
      { key: "refine_foreground", label: "Refine FG", type: "select", default: "", options: ["", "true", "false"] },
      { key: "background_color", label: "Background", type: "select", default: "", options: ["", "Transparent", "Black", "White", "Gray", "Red", "Green", "Blue", "Yellow", "Cyan", "Magenta", "Orange"] },
      // Output container / quality
      { key: "output_format", label: "Output Format", type: "select", default: "", options: ["", "X264 (.mp4)", "VP9 (.webm)", "PRORES4444 (.mov)", "GIF (.gif)"] },
      { key: "video_output_type", label: "Output Type", type: "select", default: "", options: ["", "X264 (.mp4)", "VP9 (.webm)", "PRORES4444 (.mov)", "GIF (.gif)"] },
      { key: "output_container_and_codec", label: "Container", type: "select", default: "", options: ["", "mp4_h265", "mp4_h264", "webm_vp9", "mov_h265", "mov_proresks", "mkv_h265", "mkv_h264", "mkv_vp9", "gif"] },
      { key: "output_quality", label: "Output Quality", type: "select", default: "", options: ["", "low", "medium", "high", "maximum"] },
      { key: "video_quality", label: "Video Quality", type: "select", default: "", options: ["", "low", "medium", "high", "maximum"] },
      { key: "output_write_mode", label: "Write Mode", type: "select", default: "", options: ["", "fast", "balanced", "small"] },
      { key: "video_write_mode", label: "Video Write", type: "select", default: "", options: ["", "fast", "balanced", "small"] },
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
