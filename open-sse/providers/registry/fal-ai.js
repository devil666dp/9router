// fal.ai — queue API for image and video generation.
//
// Video model → endpoint mapping and per-endpoint input schema live with the
// adapter, not here: open-sse/handlers/videoProviders/falAi.js (SPECS). Each
// video model's `params` list below is generated from that same table, so the
// dashboard's per-model fields cannot drift from what the request builder
// actually forwards. Adding a model, or a field on one, is one SPECS line.
export default {
  id: "fal-ai",
  priority: 90,
  hasFree: true,
  alias: "fal-ai",
  aliases: [
    "fal",
  ],
  uiAlias: "fal",
  display: {
    name: "Fal.ai",
    icon: "image",
    color: "#2563EB",
    textIcon: "FL",
    website: "https://fal.ai",
    notice: {
      apiKeyUrl: "https://fal.ai/dashboard/keys",
    },
  },
  category: "apikey",
  authType: "apikey",
  transport: null,
  models: [
    { id: "fal-ai/flux/schnell", name: "FLUX Schnell", params: ["n","size"], kind: "image" },
    { id: "fal-ai/flux/dev", name: "FLUX Dev", params: ["n","size"], kind: "image" },
    { id: "fal-ai/flux-pro/v1.1", name: "FLUX Pro v1.1", params: ["n","size"], kind: "image" },
    { id: "fal-ai/flux-pro/v1.1-ultra", name: "FLUX Pro v1.1 Ultra", params: ["n","size"], kind: "image" },
    { id: "fal-ai/recraft-v3", name: "Recraft V3", params: ["n","size","style"], kind: "image" },
    { id: "fal-ai/ideogram/v2", name: "Ideogram V2", params: ["n","size","style"], kind: "image" },
    { id: "fal-ai/stable-diffusion-v35-large", name: "SD 3.5 Large", params: ["n","size"], kind: "image" },


    // ── Video ─────────────────────────────────────────────────────────────
    // fal's queue is async-only, but one call is enough here: the POST waits the
    // render out and returns the finished video, falling back to a job id the
    // client can poll when the render outlives the wait.
    // Every field below is optional — a prompt-only request works on all of
    // them, and fields a model does not accept are dropped before the request
    // leaves (see the video adapter's SPECS).
    // bria/video
    { id: "bria/video/background-removal", name: "Bria Video Background Removal", params: ["video","background_color","output_container_and_codec","preserve_audio"], capabilities: ["videoedit"], kind: "video" },
    { id: "bria/video/background-removal/v3", name: "Bria Video Background Removal v3", params: ["video","auto_zoom","background_color","output_container_and_codec","preserve_audio"], capabilities: ["videoedit"], kind: "video" },
    { id: "bria/video/increase-resolution", name: "Bria Video Increase Resolution", params: ["video","desired_increase","output_container_and_codec","preserve_audio"], capabilities: ["videoedit"], kind: "video" },
    // bytedance/seedance-2.0
    { id: "bytedance/seedance-2.0/fast/image-to-video", name: "ByteDance Seedance 2.0 Fast Image to Video", params: ["prompt","image","last_frame","ratio","bitrate_mode","duration","end_user_id","audio","resolution","size"], capabilities: ["image2video"], kind: "video" },
    { id: "bytedance/seedance-2.0/fast/reference-to-video", name: "ByteDance Seedance 2.0 Fast Reference to Video", params: ["prompt","reference_images","video_urls","audio_urls","ratio","bitrate_mode","duration","end_user_id","audio","resolution","size"], capabilities: ["reference2video"], kind: "video" },
    { id: "bytedance/seedance-2.0/fast/text-to-video", name: "ByteDance Seedance 2.0 Fast Text to Video", params: ["prompt","ratio","bitrate_mode","duration","end_user_id","audio","resolution","size"], capabilities: ["text2video"], kind: "video" },
    { id: "bytedance/seedance-2.0/image-to-video", name: "ByteDance Seedance 2.0 Image to Video", params: ["prompt","image","last_frame","ratio","bitrate_mode","duration","end_user_id","audio","resolution","size"], capabilities: ["image2video"], kind: "video" },
    { id: "bytedance/seedance-2.0/mini/image-to-video", name: "ByteDance Seedance 2.0 Mini Image to Video", params: ["prompt","image","last_frame","ratio","duration","end_user_id","audio","resolution","size"], capabilities: ["image2video"], kind: "video" },
    { id: "bytedance/seedance-2.0/mini/reference-to-video", name: "ByteDance Seedance 2.0 Mini Reference to Video", params: ["prompt","reference_images","video_urls","audio_urls","ratio","duration","end_user_id","audio","resolution","size"], capabilities: ["reference2video"], kind: "video" },
    { id: "bytedance/seedance-2.0/mini/text-to-video", name: "ByteDance Seedance 2.0 Mini Text to Video", params: ["prompt","ratio","duration","end_user_id","audio","resolution","size"], capabilities: ["text2video"], kind: "video" },
    { id: "bytedance/seedance-2.0/reference-to-video", name: "ByteDance Seedance 2.0 Reference to Video", params: ["prompt","reference_images","video_urls","audio_urls","ratio","bitrate_mode","duration","end_user_id","audio","resolution","size"], capabilities: ["reference2video"], kind: "video" },
    { id: "bytedance/seedance-2.0/text-to-video", name: "ByteDance Seedance 2.0 Text to Video", params: ["prompt","ratio","bitrate_mode","duration","end_user_id","audio","resolution","size"], capabilities: ["text2video"], kind: "video" },
    // bytedance/seedance-2.5
    { id: "bytedance/seedance-2.5/image-to-video", name: "ByteDance Seedance 2.5 Image to Video", params: ["prompt","image","last_frame","ratio","bitrate_mode","duration","end_user_id","audio","resolution","size"], capabilities: ["image2video"], kind: "video" },
    { id: "bytedance/seedance-2.5/reference-to-video", name: "ByteDance Seedance 2.5 Reference to Video", params: ["prompt","reference_images","video_urls","audio_urls","ratio","bitrate_mode","duration","end_user_id","audio","resolution","size"], capabilities: ["reference2video"], kind: "video" },
    { id: "bytedance/seedance-2.5/text-to-video", name: "ByteDance Seedance 2.5 Text to Video", params: ["prompt","ratio","bitrate_mode","duration","end_user_id","audio","resolution","size"], capabilities: ["text2video"], kind: "video" },
    // fal-ai/birefnet
    { id: "fal-ai/birefnet/v2/video", name: "BiRefNet v2 Video", params: ["video","model_variant","operating_resolution","output_mask","refine_foreground","sync_mode","video_output_type","video_quality","video_write_mode"], capabilities: ["videoedit"], kind: "video" },
    // fal-ai/bytedance
    { id: "fal-ai/bytedance/dreamactor/v2", name: "ByteDance DreamActor v2", params: ["image","video","trim_first_second"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/bytedance/omnihuman", name: "ByteDance OmniHuman", params: ["image","audio_url"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/bytedance/omnihuman/v1.5", name: "ByteDance OmniHuman v1.5", params: ["prompt","image","audio_url","mask_image","resolution","turbo_mode","size"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/bytedance/seedance/v1.5/pro/image-to-video", name: "ByteDance Seedance v1.5 Pro Image to Video", params: ["prompt","image","last_frame","ratio","camera_fixed","duration","enable_safety_checker","audio","resolution","seed","size"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/bytedance/seedance/v1.5/pro/text-to-video", name: "ByteDance Seedance v1.5 Pro Text to Video", params: ["prompt","ratio","camera_fixed","duration","enable_safety_checker","audio","resolution","seed","size"], capabilities: ["text2video"], kind: "video" },
    { id: "fal-ai/bytedance/seedance/v1/lite/image-to-video", name: "ByteDance Seedance v1 Lite Image to Video", params: ["prompt","image","last_frame","ratio","camera_fixed","duration","enable_safety_checker","num_frames","resolution","seed","size"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/bytedance/seedance/v1/lite/reference-to-video", name: "ByteDance Seedance v1 Lite Reference to Video", params: ["prompt","reference_images","ratio","camera_fixed","duration","enable_safety_checker","num_frames","resolution","seed","size"], capabilities: ["reference2video"], kind: "video" },
    { id: "fal-ai/bytedance/seedance/v1/lite/text-to-video", name: "ByteDance Seedance v1 Lite Text to Video", params: ["prompt","ratio","camera_fixed","duration","enable_safety_checker","num_frames","resolution","seed","size"], capabilities: ["text2video"], kind: "video" },
    { id: "fal-ai/bytedance/seedance/v1/pro/fast/image-to-video", name: "ByteDance Seedance v1 Pro Fast Image to Video", params: ["prompt","image","ratio","camera_fixed","duration","enable_safety_checker","num_frames","resolution","seed","size"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/bytedance/seedance/v1/pro/fast/text-to-video", name: "ByteDance Seedance v1 Pro Fast Text to Video", params: ["prompt","ratio","camera_fixed","duration","enable_safety_checker","num_frames","resolution","seed","size"], capabilities: ["text2video"], kind: "video" },
    { id: "fal-ai/bytedance/seedance/v1/pro/image-to-video", name: "ByteDance Seedance v1 Pro Image to Video", params: ["prompt","image","last_frame","ratio","camera_fixed","duration","enable_safety_checker","num_frames","resolution","seed","size"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/bytedance/seedance/v1/pro/text-to-video", name: "ByteDance Seedance v1 Pro Text to Video", params: ["prompt","ratio","camera_fixed","duration","enable_safety_checker","num_frames","resolution","seed","size"], capabilities: ["text2video"], kind: "video" },
    { id: "fal-ai/bytedance/video-stylize", name: "ByteDance Video Stylize", params: ["image","style"], capabilities: ["image2video"], kind: "video" },
    // fal-ai/kling-video
    { id: "fal-ai/kling-video/ai-avatar/v2/pro", name: "Kling Video AI Avatar v2 Pro", params: ["prompt","image","audio_url"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/kling-video/ai-avatar/v2/standard", name: "Kling Video AI Avatar v2 Standard", params: ["prompt","image","audio_url"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/kling-video/lipsync/audio-to-video", name: "Kling Video Lipsync Audio to Video", params: ["video","audio_url"], capabilities: ["videoedit"], kind: "video" },
    { id: "fal-ai/kling-video/lipsync/text-to-video", name: "Kling Video Lipsync Text to Video", params: ["video","text","voice_id","voice_language","voice_speed"], capabilities: ["text2video","videoedit"], kind: "video" },
    { id: "fal-ai/kling-video/o1/image-to-video", name: "Kling Video O1 Image to Video", params: ["prompt","image","last_frame","duration"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/kling-video/o1/reference-to-video", name: "Kling Video O1 Reference to Video", params: ["prompt","reference_images","ratio","duration","elements","size"], capabilities: ["reference2video"], kind: "video" },
    { id: "fal-ai/kling-video/o1/standard/image-to-video", name: "Kling Video O1 Standard Image to Video", params: ["prompt","image","last_frame","duration"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/kling-video/o1/standard/reference-to-video", name: "Kling Video O1 Standard Reference to Video", params: ["prompt","reference_images","ratio","duration","elements","size"], capabilities: ["reference2video"], kind: "video" },
    { id: "fal-ai/kling-video/o1/standard/video-to-video/edit", name: "Kling Video O1 Standard Video to Video Edit", params: ["prompt","video","reference_images","elements","keep_audio"], capabilities: ["videoedit"], kind: "video" },
    { id: "fal-ai/kling-video/o1/standard/video-to-video/reference", name: "Kling Video O1 Standard Video to Video Reference", params: ["prompt","video","reference_images","ratio","duration","elements","keep_audio","size"], capabilities: ["videoedit"], kind: "video" },
    { id: "fal-ai/kling-video/o1/video-to-video/edit", name: "Kling Video O1 Video to Video Edit", params: ["prompt","video","reference_images","elements","keep_audio"], capabilities: ["videoedit"], kind: "video" },
    { id: "fal-ai/kling-video/o1/video-to-video/reference", name: "Kling Video O1 Video to Video Reference", params: ["prompt","video","reference_images","ratio","duration","elements","keep_audio","size"], capabilities: ["videoedit"], kind: "video" },
    { id: "fal-ai/kling-video/o3/pro/image-to-video", name: "Kling Video O3 Pro Image to Video", params: ["prompt","image","last_frame","duration","audio","multi_prompt","shot_type"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/kling-video/o3/pro/reference-to-video", name: "Kling Video O3 Pro Reference to Video", params: ["prompt","image","last_frame","reference_images","ratio","duration","elements","audio","multi_prompt","shot_type","size"], capabilities: ["reference2video"], kind: "video" },
    { id: "fal-ai/kling-video/o3/pro/text-to-video", name: "Kling Video O3 Pro Text to Video", params: ["prompt","ratio","duration","audio","multi_prompt","shot_type","size"], capabilities: ["text2video"], kind: "video" },
    { id: "fal-ai/kling-video/o3/pro/video-to-video/edit", name: "Kling Video O3 Pro Video to Video Edit", params: ["prompt","video","reference_images","elements","keep_audio","shot_type"], capabilities: ["videoedit"], kind: "video" },
    { id: "fal-ai/kling-video/o3/pro/video-to-video/reference", name: "Kling Video O3 Pro Video to Video Reference", params: ["prompt","video","reference_images","ratio","duration","elements","keep_audio","shot_type","size"], capabilities: ["videoedit"], kind: "video" },
    { id: "fal-ai/kling-video/o3/standard/image-to-video", name: "Kling Video O3 Standard Image to Video", params: ["prompt","image","last_frame","duration","audio","multi_prompt","shot_type"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/kling-video/o3/standard/reference-to-video", name: "Kling Video O3 Standard Reference to Video", params: ["prompt","image","last_frame","reference_images","ratio","duration","elements","audio","multi_prompt","shot_type","size"], capabilities: ["reference2video"], kind: "video" },
    { id: "fal-ai/kling-video/o3/standard/text-to-video", name: "Kling Video O3 Standard Text to Video", params: ["prompt","ratio","duration","audio","multi_prompt","shot_type","size"], capabilities: ["text2video"], kind: "video" },
    { id: "fal-ai/kling-video/o3/standard/video-to-video/edit", name: "Kling Video O3 Standard Video to Video Edit", params: ["prompt","video","reference_images","elements","keep_audio","shot_type"], capabilities: ["videoedit"], kind: "video" },
    { id: "fal-ai/kling-video/o3/standard/video-to-video/reference", name: "Kling Video O3 Standard Video to Video Reference", params: ["prompt","video","reference_images","ratio","duration","elements","keep_audio","shot_type","size"], capabilities: ["videoedit"], kind: "video" },
    { id: "fal-ai/kling-video/v1.5/pro/effects", name: "Kling Video v1.5 Pro Effects", params: ["effect_scene","reference_images","duration"], capabilities: ["reference2video"], kind: "video" },
    { id: "fal-ai/kling-video/v1.5/pro/image-to-video", name: "Kling Video v1.5 Pro Image to Video", params: ["prompt","image","negative_prompt","last_frame","mask_image","ratio","cfg_scale","duration","dynamic_masks","size"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/kling-video/v1.5/pro/text-to-video", name: "Kling Video v1.5 Pro Text to Video", params: ["prompt","negative_prompt","ratio","cfg_scale","duration","size"], capabilities: ["text2video"], kind: "video" },
    { id: "fal-ai/kling-video/v1.6/pro/effects", name: "Kling Video v1.6 Pro Effects", params: ["effect_scene","reference_images","duration"], capabilities: ["reference2video"], kind: "video" },
    { id: "fal-ai/kling-video/v1.6/pro/elements", name: "Kling Video v1.6 Pro Elements", params: ["prompt","reference_images","negative_prompt","ratio","duration","size"], capabilities: ["reference2video"], kind: "video" },
    { id: "fal-ai/kling-video/v1.6/pro/image-to-video", name: "Kling Video v1.6 Pro Image to Video", params: ["prompt","image","negative_prompt","last_frame","ratio","cfg_scale","duration","size"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/kling-video/v1.6/pro/text-to-video", name: "Kling Video v1.6 Pro Text to Video", params: ["prompt","negative_prompt","ratio","cfg_scale","duration","size"], capabilities: ["text2video"], kind: "video" },
    { id: "fal-ai/kling-video/v1.6/standard/effects", name: "Kling Video v1.6 Standard Effects", params: ["effect_scene","reference_images","duration"], capabilities: ["reference2video"], kind: "video" },
    { id: "fal-ai/kling-video/v1.6/standard/elements", name: "Kling Video v1.6 Standard Elements", params: ["prompt","reference_images","negative_prompt","ratio","duration","size"], capabilities: ["reference2video"], kind: "video" },
    { id: "fal-ai/kling-video/v1.6/standard/image-to-video", name: "Kling Video v1.6 Standard Image to Video", params: ["prompt","image","negative_prompt","cfg_scale","duration"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/kling-video/v1.6/standard/text-to-video", name: "Kling Video v1.6 Standard Text to Video", params: ["prompt","negative_prompt","ratio","cfg_scale","duration","size"], capabilities: ["text2video"], kind: "video" },
    { id: "fal-ai/kling-video/v1/pro/ai-avatar", name: "Kling Video v1 Pro AI Avatar", params: ["prompt","image","audio_url"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/kling-video/v1/standard/ai-avatar", name: "Kling Video v1 Standard AI Avatar", params: ["prompt","image","audio_url"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/kling-video/v1/standard/effects", name: "Kling Video v1 Standard Effects", params: ["effect_scene","reference_images","duration"], capabilities: ["reference2video"], kind: "video" },
    { id: "fal-ai/kling-video/v1/standard/image-to-video", name: "Kling Video v1 Standard Image to Video", params: ["prompt","image","negative_prompt","last_frame","mask_image","cfg_scale","duration","dynamic_masks"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/kling-video/v1/standard/text-to-video", name: "Kling Video v1 Standard Text to Video", params: ["prompt","negative_prompt","advanced_camera_control","ratio","camera_control","cfg_scale","duration","size"], capabilities: ["text2video"], kind: "video" },
    { id: "fal-ai/kling-video/v2.1/master/image-to-video", name: "Kling Video v2.1 Master Image to Video", params: ["prompt","image","negative_prompt","cfg_scale","duration"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/kling-video/v2.1/master/text-to-video", name: "Kling Video v2.1 Master Text to Video", params: ["prompt","negative_prompt","ratio","cfg_scale","duration","size"], capabilities: ["text2video"], kind: "video" },
    { id: "fal-ai/kling-video/v2.1/pro/image-to-video", name: "Kling Video v2.1 Pro Image to Video", params: ["prompt","image","negative_prompt","last_frame","cfg_scale","duration"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/kling-video/v2.1/standard/image-to-video", name: "Kling Video v2.1 Standard Image to Video", params: ["prompt","image","negative_prompt","cfg_scale","duration"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video", name: "Kling Video v2.5 Turbo Pro Image to Video", params: ["prompt","image","negative_prompt","last_frame","cfg_scale","duration"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/kling-video/v2.5-turbo/pro/text-to-video", name: "Kling Video v2.5 Turbo Pro Text to Video", params: ["prompt","negative_prompt","ratio","cfg_scale","duration","size"], capabilities: ["text2video"], kind: "video" },
    { id: "fal-ai/kling-video/v2.5-turbo/standard/image-to-video", name: "Kling Video v2.5 Turbo Standard Image to Video", params: ["prompt","image","negative_prompt","cfg_scale","duration"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/kling-video/v2.6/pro/image-to-video", name: "Kling Video v2.6 Pro Image to Video", params: ["prompt","image","negative_prompt","last_frame","duration","audio","voice_ids"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/kling-video/v2.6/pro/motion-control", name: "Kling Video v2.6 Pro Motion Control", params: ["prompt","image","video","character_orientation","keep_original_sound"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/kling-video/v2.6/pro/text-to-video", name: "Kling Video v2.6 Pro Text to Video", params: ["prompt","negative_prompt","ratio","cfg_scale","duration","audio","size"], capabilities: ["text2video"], kind: "video" },
    { id: "fal-ai/kling-video/v2.6/standard/motion-control", name: "Kling Video v2.6 Standard Motion Control", params: ["prompt","image","video","character_orientation","keep_original_sound"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/kling-video/v2/master/image-to-video", name: "Kling Video v2 Master Image to Video", params: ["prompt","image","negative_prompt","cfg_scale","duration"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/kling-video/v2/master/text-to-video", name: "Kling Video v2 Master Text to Video", params: ["prompt","negative_prompt","ratio","cfg_scale","duration","size"], capabilities: ["text2video"], kind: "video" },
    { id: "fal-ai/kling-video/v3/pro/image-to-video", name: "Kling Video v3 Pro Image to Video", params: ["prompt","image","negative_prompt","last_frame","cfg_scale","duration","elements","audio","multi_prompt","shot_type"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/kling-video/v3/pro/motion-control", name: "Kling Video v3 Pro Motion Control", params: ["prompt","image","video","character_orientation","elements","keep_original_sound"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/kling-video/v3/pro/text-to-video", name: "Kling Video v3 Pro Text to Video", params: ["prompt","negative_prompt","ratio","cfg_scale","duration","audio","multi_prompt","shot_type","size"], capabilities: ["text2video"], kind: "video" },
    { id: "fal-ai/kling-video/v3/standard/image-to-video", name: "Kling Video v3 Standard Image to Video", params: ["prompt","image","negative_prompt","last_frame","cfg_scale","duration","elements","audio","multi_prompt","shot_type"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/kling-video/v3/standard/motion-control", name: "Kling Video v3 Standard Motion Control", params: ["prompt","image","video","character_orientation","elements","keep_original_sound"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/kling-video/v3/standard/text-to-video", name: "Kling Video v3 Standard Text to Video", params: ["prompt","negative_prompt","ratio","cfg_scale","duration","audio","multi_prompt","shot_type","size"], capabilities: ["text2video"], kind: "video" },
    { id: "fal-ai/kling-video/v3/turbo/pro/image-to-video", name: "Kling Video v3 Turbo Pro Image to Video", params: ["prompt","image","duration","multi_prompt"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/kling-video/v3/turbo/pro/text-to-video", name: "Kling Video v3 Turbo Pro Text to Video", params: ["prompt","ratio","duration","multi_prompt","size"], capabilities: ["text2video"], kind: "video" },
    { id: "fal-ai/kling-video/v3/turbo/standard/image-to-video", name: "Kling Video v3 Turbo Standard Image to Video", params: ["prompt","image","duration","multi_prompt"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/kling-video/v3/turbo/standard/text-to-video", name: "Kling Video v3 Turbo Standard Text to Video", params: ["prompt","ratio","duration","multi_prompt","size"], capabilities: ["text2video"], kind: "video" },
    // fal-ai/seedvr
    { id: "fal-ai/seedvr/upscale/video", name: "SeedVR Upscale Video", params: ["video","noise_scale","output_format","output_quality","output_write_mode","seed","sync_mode","target_resolution","upscale_factor","upscale_mode","size"], capabilities: ["videoedit"], kind: "video" },
    // fal-ai/sora-2
    { id: "fal-ai/sora-2/characters", name: "Sora 2 Characters", params: ["video","name"], capabilities: ["videoedit"], kind: "video" },
    { id: "fal-ai/sora-2/image-to-video", name: "Sora 2 Image to Video", params: ["prompt","image","ratio","character_ids","delete_video","detect_and_block_ip","duration","model_variant","resolution","size"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/sora-2/image-to-video/pro", name: "Sora 2 Image to Video Pro", params: ["prompt","image","ratio","character_ids","delete_video","detect_and_block_ip","duration","resolution","size"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/sora-2/text-to-video", name: "Sora 2 Text to Video", params: ["prompt","ratio","character_ids","delete_video","detect_and_block_ip","duration","model_variant","resolution","size"], capabilities: ["text2video"], kind: "video" },
    { id: "fal-ai/sora-2/text-to-video/pro", name: "Sora 2 Text to Video Pro", params: ["prompt","ratio","character_ids","delete_video","detect_and_block_ip","duration","resolution","size"], capabilities: ["text2video"], kind: "video" },
    { id: "fal-ai/sora-2/video-to-video/remix", name: "Sora 2 Video to Video Remix", params: ["prompt","video_id","delete_video"], capabilities: ["videoedit"], kind: "video" },
    // fal-ai/topaz
    { id: "fal-ai/topaz/upscale/video", name: "Topaz Upscale Video", params: ["video","H264_output","compression","grain","halo","model_variant","noise","recover_detail","target_fps","upscale_factor"], capabilities: ["videoedit"], kind: "video" },
    // fal-ai/veo3.1
    { id: "fal-ai/veo3.1", name: "Veo 3.1", params: ["prompt","negative_prompt","ratio","auto_fix","duration","audio","resolution","safety_tolerance","seed","size"], capabilities: ["text2video"], kind: "video" },
    { id: "fal-ai/veo3.1/extend-video", name: "Veo 3.1 Extend Video", params: ["prompt","video","negative_prompt","ratio","auto_fix","duration","audio","resolution","safety_tolerance","seed","size"], capabilities: ["videoedit"], kind: "video" },
    { id: "fal-ai/veo3.1/fast", name: "Veo 3.1 Fast", params: ["prompt","negative_prompt","ratio","auto_fix","duration","audio","resolution","safety_tolerance","seed","size"], capabilities: ["text2video"], kind: "video" },
    { id: "fal-ai/veo3.1/fast/extend-video", name: "Veo 3.1 Fast Extend Video", params: ["prompt","video","negative_prompt","ratio","auto_fix","duration","audio","resolution","safety_tolerance","seed","size"], capabilities: ["videoedit"], kind: "video" },
    { id: "fal-ai/veo3.1/fast/first-last-frame-to-video", name: "Veo 3.1 Fast First Last Frame to Video", params: ["prompt","image","last_frame","negative_prompt","ratio","auto_fix","duration","audio","resolution","safety_tolerance","seed","size"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/veo3.1/fast/image-to-video", name: "Veo 3.1 Fast Image to Video", params: ["prompt","image","negative_prompt","ratio","auto_fix","duration","audio","resolution","safety_tolerance","seed","size"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/veo3.1/first-last-frame-to-video", name: "Veo 3.1 First Last Frame to Video", params: ["prompt","image","last_frame","negative_prompt","ratio","auto_fix","duration","audio","resolution","safety_tolerance","seed","size"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/veo3.1/image-to-video", name: "Veo 3.1 Image to Video", params: ["prompt","image","negative_prompt","ratio","auto_fix","duration","audio","resolution","safety_tolerance","seed","size"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/veo3.1/lite", name: "Veo 3.1 Lite", params: ["prompt","negative_prompt","ratio","auto_fix","duration","audio","resolution","safety_tolerance","seed","size"], capabilities: ["text2video"], kind: "video" },
    { id: "fal-ai/veo3.1/lite/first-last-frame-to-video", name: "Veo 3.1 Lite First Last Frame to Video", params: ["prompt","image","last_frame","negative_prompt","ratio","auto_fix","duration","audio","resolution","safety_tolerance","seed","size"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/veo3.1/lite/image-to-video", name: "Veo 3.1 Lite Image to Video", params: ["prompt","image","negative_prompt","ratio","auto_fix","duration","audio","resolution","safety_tolerance","seed","size"], capabilities: ["image2video"], kind: "video" },
    { id: "fal-ai/veo3.1/reference-to-video", name: "Veo 3.1 Reference to Video", params: ["prompt","reference_images","ratio","auto_fix","duration","audio","resolution","safety_tolerance","size"], capabilities: ["reference2video"], kind: "video" },
    // topaz/upscale
    { id: "topaz/upscale/video/generative", name: "Topaz Upscale Video Generative", params: ["video","H264_output","model_variant","softness","target_fps","upscale_factor"], capabilities: ["videoedit"], kind: "video" },
    { id: "topaz/upscale/video/precision", name: "Topaz Upscale Video Precision", params: ["video","H264_output","compression","grain","halo","model_variant","noise","recover_detail","target_fps","upscale_factor"], capabilities: ["videoedit"], kind: "video" },
    // xai/grok-imagine-video
    { id: "xai/grok-imagine-video/edit-video", name: "xAI Grok Imagine Video Edit Video", params: ["prompt","video","resolution","size"], capabilities: ["videoedit"], kind: "video" },
    { id: "xai/grok-imagine-video/extend-video", name: "xAI Grok Imagine Video Extend Video", params: ["prompt","video","duration"], capabilities: ["videoedit"], kind: "video" },
    { id: "xai/grok-imagine-video/image-to-video", name: "xAI Grok Imagine Video Image to Video", params: ["prompt","image","ratio","duration","resolution","size"], capabilities: ["image2video"], kind: "video" },
    { id: "xai/grok-imagine-video/reference-to-video", name: "xAI Grok Imagine Video Reference to Video", params: ["prompt","reference_images","ratio","duration","resolution","size"], capabilities: ["reference2video"], kind: "video" },
    { id: "xai/grok-imagine-video/text-to-video", name: "xAI Grok Imagine Video Text to Video", params: ["prompt","ratio","duration","resolution","size"], capabilities: ["text2video"], kind: "video" },
    { id: "xai/grok-imagine-video/v1.5/image-to-video", name: "xAI Grok Imagine Video v1.5 Image to Video", params: ["prompt","image","duration","resolution","size"], capabilities: ["image2video"], kind: "video" },
    { id: "xai/grok-imagine-video/v1.5/text-to-video", name: "xAI Grok Imagine Video v1.5 Text to Video", params: ["prompt","ratio","duration","resolution","size"], capabilities: ["text2video"], kind: "video" },
  ],
  serviceKinds: ["image", "video"],
  imageConfig: { baseUrl: "https://queue.fal.run" },
  // Creation and polling live on different paths under the same queue root, so
  // the adapter builds both; baseUrl is the API root it builds them from.
  videoConfig: { baseUrl: "https://queue.fal.run" },
};
