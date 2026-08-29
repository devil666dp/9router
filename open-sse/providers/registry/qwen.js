// QwenCloud / DashScope media generation (Singapore intl endpoint).
// Chat lives on `alims-intl`; this entry is media-only.
//
// Model → endpoint/shape mapping lives with the adapters, not here:
//   images  open-sse/handlers/imageProviders/qwen.js  (PROFILES)
//   video   open-sse/handlers/videoProviders/qwen.js  (PROFILES)
// Each video model's `params` list is generated from that adapter's own profile
// table, so the dashboard's per-model fields cannot drift from what the request
// builder actually forwards.
export default {
  id: "qwen",
  priority: 55,
  alias: "qwen",
  aliases: [
    "qwen-image",
    "dashscope",
  ],
  uiAlias: "qwen",
  display: {
    name: "Qwen Media",
    icon: "image",
    color: "#615CED",
    textIcon: "QW",
    website: "https://qwencloud.com",
    notice: {
      apiKeyUrl: "https://home.qwencloud.com/api-keys",
    },
  },
  category: "apikey",
  authType: "apikey",
  transport: null,
  models: [
    // Qwen-Image 3.0 / 2.0 — text-to-image and image editing on the same id
    { id: "qwen-image-3.0-pro", name: "Qwen Image 3.0 Pro", params: ["n","size","negative_prompt","prompt_extend","prompt_extend_mode","enable_thinking","watermark","seed"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "qwen-image-3.0", name: "Qwen Image 3.0", params: ["n","size","negative_prompt","prompt_extend","prompt_extend_mode","enable_thinking","watermark","seed"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "qwen-image-2.0-pro", name: "Qwen Image 2.0 Pro", params: ["n","size","negative_prompt","prompt_extend","enable_thinking","watermark","seed"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "qwen-image-2.0", name: "Qwen Image 2.0", params: ["n","size","negative_prompt","prompt_extend","enable_thinking","watermark","seed"], capabilities: ["text2img","edit"], kind: "image" },
    // Qwen-Image editing line — image input required
    { id: "qwen-image-edit-max", name: "Qwen Image Edit Max", params: ["n","size","negative_prompt","prompt_extend","enable_thinking","watermark","seed"], capabilities: ["edit"], kind: "image" },
    { id: "qwen-image-edit-plus", name: "Qwen Image Edit Plus", params: ["n","size","negative_prompt","prompt_extend","enable_thinking","watermark","seed"], capabilities: ["edit"], kind: "image" },
    { id: "qwen-image-edit", name: "Qwen Image Edit", params: ["negative_prompt","watermark","seed"], capabilities: ["edit"], kind: "image" },
    // Legacy Qwen-Image line — fixed sizes, n fixed at 1
    { id: "qwen-image-max", name: "Qwen Image Max", params: ["size","negative_prompt","prompt_extend","watermark","seed"], capabilities: ["text2img"], kind: "image" },
    { id: "qwen-image-plus", name: "Qwen Image Plus", params: ["size","negative_prompt","prompt_extend","watermark","seed"], capabilities: ["text2img"], kind: "image" },
    { id: "qwen-image", name: "Qwen Image", params: ["size","negative_prompt","prompt_extend","watermark","seed"], capabilities: ["text2img"], kind: "image" },
    // Z-Image — no n
    { id: "z-image-turbo", name: "Z-Image Turbo", params: ["size","prompt_extend","seed"], capabilities: ["text2img"], kind: "image" },
    // Wan 2.7 / 2.6 — multimodal endpoint, generate + edit
    { id: "wan2.7-image-pro", name: "Wan 2.7 Image Pro", params: ["n","size","thinking_mode","enable_sequential","watermark","seed"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "wan2.7-image", name: "Wan 2.7 Image", params: ["n","size","thinking_mode","enable_sequential","watermark","seed"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "wan2.6-image", name: "Wan 2.6 Image", params: ["n","size","negative_prompt","prompt_extend","watermark","seed"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "wan2.6-t2i", name: "Wan 2.6 T2I", params: ["n","size","negative_prompt","prompt_extend","watermark","seed"], capabilities: ["text2img"], kind: "image" },
    // Wan <=2.5 — async-only synthesis endpoint
    { id: "wan2.5-t2i-preview", name: "Wan 2.5 T2I", params: ["n","size","negative_prompt","prompt_extend","watermark","seed"], capabilities: ["text2img"], kind: "image" },
    { id: "wan2.5-i2i-preview", name: "Wan 2.5 Edit", params: ["n","size","negative_prompt","prompt_extend","watermark","seed"], capabilities: ["edit"], kind: "image" },
    { id: "wan2.2-t2i-plus", name: "Wan 2.2 T2I Plus", params: ["n","size","negative_prompt","prompt_extend","watermark","seed"], capabilities: ["text2img"], kind: "image" },
    { id: "wan2.2-t2i-flash", name: "Wan 2.2 T2I Flash", params: ["n","size","negative_prompt","prompt_extend","watermark","seed"], capabilities: ["text2img"], kind: "image" },
    { id: "wan2.1-t2i-plus", name: "Wan 2.1 T2I Plus", params: ["n","size","negative_prompt","prompt_extend","watermark","seed"], capabilities: ["text2img"], kind: "image" },
    { id: "wan2.1-t2i-turbo", name: "Wan 2.1 T2I Turbo", params: ["n","size","negative_prompt","prompt_extend","watermark","seed"], capabilities: ["text2img"], kind: "image" },

    // ── Video ─────────────────────────────────────────────────────────────
    // Async task API upstream, one call here: POST waits the render out and
    // returns the finished video (falling back to a job id the client can poll
    // if the render outlives the wait).
    // Every field below is optional — a prompt-only request works on all of
    // them, and fields a model does not accept are dropped before the request
    // leaves (see the video adapter's PROFILES).
    { id: "wan3.0-video", name: "Wan 3.0 Video", params: ["prompt","negative_prompt","image","last_frame","reference_images","video","audio_url","reference_voice","resolution","ratio","duration","audio","prompt_extend","watermark","seed","size"], capabilities: ["text2video","image2video","reference2video","videoedit"], kind: "video" },
    { id: "wan3.0-video-prime", name: "Wan 3.0 Video Prime", params: ["prompt","negative_prompt","image","last_frame","reference_images","video","audio_url","reference_voice","resolution","ratio","duration","audio","prompt_extend","watermark","seed","size"], capabilities: ["text2video","image2video","reference2video","videoedit"], kind: "video" },
    { id: "wan2.7-i2v", name: "Wan 2.7 Image-to-Video", params: ["prompt","negative_prompt","image","last_frame","audio_url","first_clip","resolution","duration","prompt_extend","watermark","seed","size"], capabilities: ["image2video"], kind: "video" },
    { id: "wan2.7-i2v-2026-04-25", name: "Wan 2.7 Image-to-Video (2026-04-25)", params: ["prompt","negative_prompt","image","last_frame","audio_url","first_clip","resolution","duration","prompt_extend","watermark","seed","size"], capabilities: ["image2video"], kind: "video" },
    { id: "wan2.7-t2v", name: "Wan 2.7 Text-to-Video", params: ["prompt","negative_prompt","resolution","ratio","duration","prompt_extend","watermark","seed","size"], capabilities: ["text2video"], kind: "video" },
    { id: "wan2.7-t2v-2026-04-25", name: "Wan 2.7 Text-to-Video (2026-04-25)", params: ["prompt","negative_prompt","resolution","ratio","duration","prompt_extend","watermark","seed","size"], capabilities: ["text2video"], kind: "video" },
    { id: "wan2.7-t2v-2026-06-12", name: "Wan 2.7 Text-to-Video (2026-06-12)", params: ["prompt","negative_prompt","resolution","ratio","duration","prompt_extend","watermark","seed","size"], capabilities: ["text2video"], kind: "video" },
    { id: "wan2.7-r2v", name: "Wan 2.7 Reference-to-Video", params: ["prompt","negative_prompt","reference_images","video","image","reference_voice","resolution","ratio","duration","prompt_extend","watermark","seed","size"], capabilities: ["image2video","reference2video","videoedit"], kind: "video" },
    { id: "wan2.7-r2v-2026-06-12", name: "Wan 2.7 Reference-to-Video (2026-06-12)", params: ["prompt","negative_prompt","reference_images","video","image","reference_voice","resolution","ratio","duration","prompt_extend","watermark","seed","size"], capabilities: ["image2video","reference2video","videoedit"], kind: "video" },
    { id: "wan2.7-videoedit", name: "Wan 2.7 Video Edit", params: ["prompt","negative_prompt","video","reference_images","resolution","ratio","duration","audio_setting","prompt_extend","watermark","seed","size"], capabilities: ["reference2video","videoedit"], kind: "video" },
    { id: "happyhorse-1.1-i2v", name: "HappyHorse 1.1 Image-to-Video", params: ["prompt","image","resolution","duration","watermark","seed","size"], capabilities: ["image2video"], kind: "video" },
    { id: "happyhorse-1.1-t2v", name: "HappyHorse 1.1 Text-to-Video", params: ["prompt","resolution","ratio","duration","watermark","seed","size"], capabilities: ["text2video"], kind: "video" },
    { id: "happyhorse-1.1-r2v", name: "HappyHorse 1.1 Reference-to-Video", params: ["prompt","reference_images","resolution","ratio","duration","watermark","seed","size"], capabilities: ["reference2video"], kind: "video" },
    { id: "happyhorse-1.0-video-edit", name: "HappyHorse 1.0 Video Edit", params: ["prompt","video","reference_images","resolution","audio_setting","watermark","seed","size"], capabilities: ["reference2video","videoedit"], kind: "video" },
    { id: "wan2.6-i2v-flash", name: "Wan 2.6 I2V Flash", params: ["prompt","negative_prompt","image","audio_url","resolution","duration","prompt_extend","shot_type","audio","watermark","seed","size"], capabilities: ["image2video"], kind: "video" },
    { id: "wan2.6-i2v", name: "Wan 2.6 I2V", params: ["prompt","negative_prompt","image","audio_url","resolution","duration","prompt_extend","shot_type","watermark","seed","size"], capabilities: ["image2video"], kind: "video" },
    { id: "wan2.5-i2v-preview", name: "Wan 2.5 I2V", params: ["prompt","negative_prompt","image","audio_url","resolution","duration","prompt_extend","watermark","seed","size"], capabilities: ["image2video"], kind: "video" },
    { id: "wan2.2-i2v-flash", name: "Wan 2.2 I2V Flash", params: ["prompt","negative_prompt","image","resolution","duration","prompt_extend","watermark","seed","size"], capabilities: ["image2video"], kind: "video" },
    { id: "wan2.2-i2v-plus", name: "Wan 2.2 I2V Plus", params: ["prompt","negative_prompt","image","resolution","duration","prompt_extend","watermark","seed","size"], capabilities: ["image2video"], kind: "video" },
    { id: "wan2.1-i2v-turbo", name: "Wan 2.1 I2V Turbo", params: ["prompt","negative_prompt","image","resolution","duration","prompt_extend","watermark","seed","size"], capabilities: ["image2video"], kind: "video" },
    { id: "wan2.1-i2v-plus", name: "Wan 2.1 I2V Plus", params: ["prompt","negative_prompt","image","resolution","duration","prompt_extend","watermark","seed","size"], capabilities: ["image2video"], kind: "video" },
    { id: "wan2.2-kf2v-flash", name: "Wan 2.2 First-Last Frame Flash", params: ["prompt","negative_prompt","image","last_frame","resolution","duration","prompt_extend","watermark","seed","size"], capabilities: ["image2video"], kind: "video" },
    { id: "wan2.1-kf2v-plus", name: "Wan 2.1 First-Last Frame Plus", params: ["prompt","negative_prompt","image","last_frame","resolution","duration","prompt_extend","watermark","seed","size"], capabilities: ["image2video"], kind: "video" },
    { id: "wan2.6-r2v-flash", name: "Wan 2.6 R2V Flash", params: ["prompt","reference_images","video","size","duration","audio","shot_type","watermark","resolution","ratio"], capabilities: ["reference2video","videoedit"], kind: "video" },
    { id: "wan2.6-r2v", name: "Wan 2.6 R2V", params: ["prompt","reference_images","video","size","duration","audio","shot_type","watermark","resolution","ratio"], capabilities: ["reference2video","videoedit"], kind: "video" },
    { id: "wan2.6-t2v", name: "Wan 2.6 T2V", params: ["prompt","negative_prompt","audio_url","size","duration","shot_type","prompt_extend","watermark","seed","resolution","ratio"], capabilities: ["text2video"], kind: "video" },
    { id: "wan2.5-t2v-preview", name: "Wan 2.5 T2V", params: ["prompt","negative_prompt","audio_url","size","duration","prompt_extend","watermark","seed","resolution","ratio"], capabilities: ["text2video"], kind: "video" },
    { id: "wan2.2-t2v-plus", name: "Wan 2.2 T2V Plus", params: ["prompt","negative_prompt","size","duration","prompt_extend","watermark","seed","resolution","ratio"], capabilities: ["text2video"], kind: "video" },
    { id: "wan2.1-t2v-turbo", name: "Wan 2.1 T2V Turbo", params: ["prompt","negative_prompt","size","duration","prompt_extend","watermark","seed","resolution","ratio"], capabilities: ["text2video"], kind: "video" },
    { id: "wan2.1-t2v-plus", name: "Wan 2.1 T2V Plus", params: ["prompt","negative_prompt","size","duration","prompt_extend","watermark","seed","resolution","ratio"], capabilities: ["text2video"], kind: "video" },
    { id: "wan2.1-vace-plus", name: "Wan 2.1 VACE Plus (General Edit)", params: ["prompt","reference_images","video","mask_image","mask_video","first_clip","last_clip","image","last_frame","function","mask_frame_id","prompt_extend","size","obj_or_bg","control_condition","strength","mask_type","expand_ratio","top_scale","bottom_scale","left_scale","right_scale","resolution","ratio"], capabilities: ["image2video","reference2video","videoedit"], kind: "video" },
    { id: "wan2.2-animate-move", name: "Wan 2.2 Image-to-Animation", params: ["image","video","watermark","mode","check_image"], capabilities: ["image2video","videoedit"], kind: "video" },
    { id: "wan2.2-animate-mix", name: "Wan 2.2 Video Character Swap", params: ["image","video","watermark","mode","check_image"], capabilities: ["image2video","videoedit"], kind: "video" },
  ],
  serviceKinds: ["image", "video"],
  imageConfig: { baseUrl: "https://dashscope-intl.aliyuncs.com/api/v1" },
  // Creation and polling live on different paths here, so the adapter supplies
  // both; baseUrl is the API root it builds them from.
  videoConfig: { baseUrl: "https://dashscope-intl.aliyuncs.com/api/v1" },
};
