// Replicate — one prediction API in front of thousands of hosted models.
//
// Model → input-schema mapping lives with the adapters, not here:
//   images  open-sse/handlers/imageProviders/replicate.js  (SPECS)
//   video   open-sse/handlers/videoProviders/replicate.js  (SPECS)
// Every `params` and `capabilities` list below is GENERATED from those tables, so
// the dashboard's per-model inputs cannot drift from what the request builder
// actually forwards. Adding a model, or a field on one, is one SPECS line.
//
// Callers reach a model as `replicate/<owner>/<name>`, optionally pinned to an
// exact build with `:<version>`. 29 of these 199 are community models and
// carry a pinned version in open-sse/handlers/replicate/versions.js — they run
// from a different creation route, which is a property of the model rather than
// of the request (see open-sse/handlers/replicate/api.js).
export default {
  id: "replicate",
  priority: 85,
  alias: "replicate",
  aliases: [
    "rep",
  ],
  uiAlias: "replicate",
  display: {
    name: "Replicate",
    icon: "image",
    color: "#EA2ACA",
    textIcon: "RP",
    website: "https://replicate.com",
    notice: {
      apiKeyUrl: "https://replicate.com/account/api-tokens",
    },
  },
  category: "apikey",
  authType: "apikey",
  transport: null,
  models: [
    // ── Image (94) ──────────────────────────────────────────────────────────
    // black-forest-labs
    { id: "black-forest-labs/flux-1.1-pro", name: "FLUX 1.1 Pro", params: ["prompt","ratio","output_format","height","image","output_quality","prompt_upsampling","safety_tolerance","seed","width","size"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "black-forest-labs/flux-1.1-pro-ultra", name: "FLUX 1.1 Pro Ultra", params: ["prompt","image","image_prompt_strength","ratio","safety_tolerance","seed","raw","output_format","size"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "black-forest-labs/flux-2-dev", name: "FLUX.2 Dev", params: ["prompt","images","go_fast","ratio","width","height","seed","output_format","output_quality","disable_safety_checker","size"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "black-forest-labs/flux-2-flex", name: "FLUX.2 Flex", params: ["prompt","images","ratio","resolution","width","height","safety_tolerance","seed","prompt_upsampling","steps","guidance","output_format","output_quality","size"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "black-forest-labs/flux-2-klein-4b", name: "FLUX.2 Klein 4B", params: ["prompt","images","ratio","megapixels","seed","go_fast","output_format","output_quality","disable_safety_checker","size"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "black-forest-labs/flux-2-max", name: "FLUX.2 Max", params: ["prompt","images","ratio","resolution","width","height","safety_tolerance","seed","output_format","output_quality","size"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "black-forest-labs/flux-2-pro", name: "FLUX.2 Pro", params: ["prompt","images","ratio","resolution","width","height","safety_tolerance","seed","prompt_upsampling","output_format","output_quality","size"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "black-forest-labs/flux-canny-pro", name: "FLUX.1 Canny Pro", params: ["prompt","output_format","image","guidance","prompt_upsampling","safety_tolerance","seed","steps"], capabilities: ["edit"], kind: "image" },
    { id: "black-forest-labs/flux-depth-pro", name: "FLUX.1 Depth Pro", params: ["prompt","output_format","image","guidance","prompt_upsampling","safety_tolerance","seed","steps"], capabilities: ["edit"], kind: "image" },
    { id: "black-forest-labs/flux-dev", name: "FLUX.1 Dev", params: ["prompt","ratio","image","prompt_strength","n","num_inference_steps","guidance","seed","output_format","output_quality","disable_safety_checker","go_fast","megapixels","size"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "black-forest-labs/flux-fill-dev", name: "FLUX.1 Fill Dev", params: ["prompt","image","mask_image","n","num_inference_steps","guidance","seed","megapixels","output_format","output_quality","lora_weights","lora_scale","disable_safety_checker","size"], capabilities: ["edit","mask"], kind: "image" },
    { id: "black-forest-labs/flux-fill-pro", name: "FLUX.1 Fill Pro", params: ["prompt","image","mask_image","outpaint","seed","steps","prompt_upsampling","guidance","safety_tolerance","output_format"], capabilities: ["edit","mask"], kind: "image" },
    { id: "black-forest-labs/flux-kontext-dev", name: "FLUX.1 Kontext Dev", params: ["prompt","image","ratio","num_inference_steps","guidance","seed","output_format","output_quality","disable_safety_checker","go_fast","size"], capabilities: ["edit"], kind: "image" },
    { id: "black-forest-labs/flux-kontext-max", name: "FLUX.1 Kontext Max", params: ["prompt","ratio","output_format","image","prompt_upsampling","safety_tolerance","seed","size"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "black-forest-labs/flux-kontext-pro", name: "FLUX.1 Kontext Pro", params: ["prompt","ratio","output_format","image","prompt_upsampling","safety_tolerance","seed","size"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "black-forest-labs/flux-pro", name: "FLUX.1 Pro", params: ["prompt","ratio","output_format","guidance","height","image","output_quality","prompt_upsampling","safety_tolerance","seed","width","size"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "black-forest-labs/flux-redux-dev", name: "FLUX.1 Redux Dev", params: ["image","ratio","n","num_inference_steps","guidance","seed","output_format","output_quality","disable_safety_checker","megapixels","size"], capabilities: ["edit"], kind: "image" },
    { id: "black-forest-labs/flux-schnell", name: "FLUX.1 Schnell", params: ["prompt","ratio","n","num_inference_steps","seed","output_format","output_quality","disable_safety_checker","go_fast","megapixels","size"], capabilities: ["text2img"], kind: "image" },
    // bria
    { id: "bria/eraser", name: "Bria Eraser", params: ["image","mask_image","sync","content_moderation","preserve_alpha"], capabilities: ["text2img","edit","mask"], kind: "image" },
    { id: "bria/expand-image", name: "Bria Expand Image", params: ["prompt","image","ratio","canvas_size","original_image_size","original_image_location","negative_prompt","seed","preserve_alpha","sync","content_moderation","size"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "bria/fibo", name: "Bria FIBO", params: ["prompt","image","structured_prompt","negative_prompt","guidance_scale","ratio","seed","size"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "bria/fibo-edit", name: "Bria FIBO Edit", params: ["prompt","image","mask_image","structured_instruction","negative_prompt","guidance_scale","seed"], capabilities: ["text2img","edit","mask"], kind: "image" },
    { id: "bria/generate-background", name: "Bria Generate Background", params: ["image","bg_prompt","ref_image_url","negative_prompt","n","sync","fast","refine_prompt","enhance_ref_image","original_quality","force_rmbg","content_moderation","seed"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "bria/genfill", name: "Bria GenFill", params: ["prompt","image","mask_image","negative_prompt","mask_type","n","preserve_alpha","sync","seed","content_moderation"], capabilities: ["text2img","edit","mask"], kind: "image" },
    { id: "bria/image-3.2", name: "Bria Image 3.2", params: ["prompt","negative_prompt","n","ratio","guidance_scale","prompt_enhancement","enhance_image","seed","size"], capabilities: ["text2img"], kind: "image" },
    { id: "bria/increase-resolution", name: "Bria Increase Resolution", params: ["image","desired_increase","preserve_alpha","sync","content_moderation"], capabilities: ["text2img","edit"], kind: "image" },
    // bytedance
    { id: "bytedance/bagel", name: "BAGEL", params: ["prompt","image","task","enable_thinking","cfg_text_scale","cfg_img_scale","num_inference_steps","timestep_shift","cfg_renorm_type","cfg_renorm_min","seed","output_format","output_quality"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "bytedance/seedream-3", name: "Seedream 3", params: ["prompt","seed","ratio","size","width","height","guidance_scale"], capabilities: ["text2img"], kind: "image" },
    { id: "bytedance/seedream-4", name: "Seedream 4", params: ["prompt","images","size","ratio","width","height","sequential_image_generation","n","enhance_prompt"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "bytedance/seedream-4.5", name: "Seedream 4.5", params: ["prompt","images","size","ratio","width","height","sequential_image_generation","n","disable_safety_checker"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "bytedance/seedream-5-lite", name: "Seedream 5 Lite", params: ["prompt","images","size","ratio","sequential_image_generation","n","output_format","return_byteplus_urls"], capabilities: ["text2img","edit"], kind: "image" },
    // flux-kontext-apps
    { id: "flux-kontext-apps/multi-image-kontext-max", name: "Multi-Image Kontext Max", params: ["prompt","ratio","output_format","image","image_2","safety_tolerance","seed","size"], capabilities: ["edit"], kind: "image" },
    { id: "flux-kontext-apps/multi-image-kontext-pro", name: "Multi-Image Kontext Pro", params: ["prompt","ratio","output_format","image","image_2","safety_tolerance","seed","size"], capabilities: ["edit"], kind: "image" },
    { id: "flux-kontext-apps/restore-image", name: "Kontext Restore Image", params: ["output_format","image","safety_tolerance","seed"], capabilities: ["edit"], kind: "image" },
    // fofr
    { id: "fofr/sticker-maker", name: "Sticker Maker", params: ["prompt","negative_prompt","width","height","steps","n","output_format","output_quality","seed","size"], capabilities: ["text2img"], kind: "image" },
    // google
    { id: "google/imagen-3", name: "Imagen 3", params: ["prompt","ratio","safety_filter_level","output_format","size"], capabilities: ["text2img"], kind: "image" },
    { id: "google/imagen-3-fast", name: "Imagen 3 Fast", params: ["prompt","ratio","safety_filter_level","output_format","size"], capabilities: ["text2img"], kind: "image" },
    { id: "google/imagen-4", name: "Imagen 4", params: ["prompt","ratio","image_size","safety_filter_level","output_format","size"], capabilities: ["text2img"], kind: "image" },
    { id: "google/imagen-4-fast", name: "Imagen 4 Fast", params: ["prompt","ratio","safety_filter_level","output_format","size"], capabilities: ["text2img"], kind: "image" },
    { id: "google/imagen-4-ultra", name: "Imagen 4 Ultra", params: ["prompt","ratio","image_size","safety_filter_level","output_format","size"], capabilities: ["text2img"], kind: "image" },
    { id: "google/nano-banana", name: "Nano Banana", params: ["prompt","images","ratio","output_format","size"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "google/nano-banana-2", name: "Nano Banana 2", params: ["prompt","images","ratio","resolution","google_search","image_search","output_format","size"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "google/nano-banana-pro", name: "Nano Banana Pro", params: ["prompt","images","ratio","resolution","output_format","safety_filter_level","allow_fallback_model","size"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "google/upscaler", name: "Google Upscaler", params: ["image","upscale_factor","output_quality"], capabilities: ["edit"], kind: "image" },
    // ideogram-ai
    { id: "ideogram-ai/ideogram-v2", name: "Ideogram V2", params: ["prompt","ratio","resolution","magic_prompt_option","style_type","image","mask_image","negative_prompt","seed","size"], capabilities: ["text2img","edit","mask"], kind: "image" },
    { id: "ideogram-ai/ideogram-v2-turbo", name: "Ideogram V2 Turbo", params: ["prompt","ratio","resolution","magic_prompt_option","style_type","image","mask_image","negative_prompt","seed","size"], capabilities: ["text2img","edit","mask"], kind: "image" },
    { id: "ideogram-ai/ideogram-v3-balanced", name: "Ideogram V3 Balanced", params: ["prompt","ratio","resolution","magic_prompt_option","image","mask_image","style_type","style_reference_images","seed","style_preset","size"], capabilities: ["text2img","edit","mask"], kind: "image" },
    { id: "ideogram-ai/ideogram-v3-quality", name: "Ideogram V3 Quality", params: ["prompt","ratio","resolution","magic_prompt_option","image","mask_image","style_type","style_reference_images","seed","style_preset","size"], capabilities: ["text2img","edit","mask"], kind: "image" },
    { id: "ideogram-ai/ideogram-v3-turbo", name: "Ideogram V3 Turbo", params: ["prompt","ratio","resolution","magic_prompt_option","image","mask_image","style_type","style_reference_images","seed","style_preset","size"], capabilities: ["text2img","edit","mask"], kind: "image" },
    // leonardoai
    { id: "leonardoai/lucid-origin", name: "Leonardo Lucid Origin", params: ["prompt","ratio","generation_mode","contrast","prompt_enhance","n","style","size"], capabilities: ["text2img"], kind: "image" },
    // lucataco
    { id: "lucataco/omnigen2", name: "OmniGen2", params: ["prompt","image","image_2","image_3","negative_prompt","width","height","num_inference_steps","text_guidance_scale","image_guidance_scale","cfg_range_start","cfg_range_end","scheduler","max_input_image_side_length","max_pixels","seed","size"], capabilities: ["edit"], kind: "image" },
    // luma
    { id: "luma/photon", name: "Luma Photon", params: ["prompt","ratio","character_reference","image","image_reference_weight","seed","style_reference","style_reference_weight","size"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "luma/photon-flash", name: "Luma Photon Flash", params: ["prompt","ratio","character_reference","image","image_reference_weight","seed","style_reference","style_reference_weight","size"], capabilities: ["text2img","edit"], kind: "image" },
    // minimax
    { id: "minimax/image-01", name: "MiniMax Image 01", params: ["prompt","ratio","n","prompt_optimizer","subject_reference","size"], capabilities: ["text2img","edit"], kind: "image" },
    // nightmareai
    { id: "nightmareai/real-esrgan", name: "Real-ESRGAN", params: ["face_enhance","image","upscale_factor"], capabilities: ["edit"], kind: "image" },
    // nvidia
    { id: "nvidia/sana", name: "NVIDIA Sana", params: ["prompt","negative_prompt","model_variant","width","height","num_inference_steps","guidance_scale","pag_guidance_scale","seed","size"], capabilities: ["text2img"], kind: "image" },
    { id: "nvidia/sana-sprint-1.6b", name: "NVIDIA SANA Sprint 1.6B", params: ["prompt","width","height","inference_steps","intermediate_timesteps","guidance_scale","seed","output_format","output_quality","size"], capabilities: ["text2img"], kind: "image" },
    // openai
    { id: "openai/gpt-image-1", name: "GPT Image 1", params: ["prompt","openai_api_key","ratio","input_fidelity","images","n","quality","background","output_compression","output_format","content_moderation","user_id","size"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "openai/gpt-image-1.5", name: "GPT Image 1.5", params: ["prompt","openai_api_key","ratio","input_fidelity","images","n","quality","background","output_compression","output_format","content_moderation","user_id","size"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "openai/gpt-image-2", name: "GPT Image 2", params: ["prompt","openai_api_key","ratio","images","n","quality","background","output_compression","output_format","content_moderation","user_id","size"], capabilities: ["text2img","edit"], kind: "image" },
    // philz1337x
    { id: "philz1337x/clarity-pro-upscaler", name: "Clarity Pro Upscaler", params: ["image","upscale_factor","creativity","output_format"], capabilities: ["edit"], kind: "image" },
    { id: "philz1337x/clarity-upscaler", name: "Clarity Upscaler", params: ["prompt","image","negative_prompt","upscale_factor","dynamic","creativity","resemblance","tiling_width","tiling_height","model_variant","scheduler","num_inference_steps","seed","downscaling","downscaling_resolution","lora_links","custom_sd_model","sharpen","mask_image","handfix","pattern","output_format"], capabilities: ["edit","mask"], kind: "image" },
    // prunaai
    { id: "prunaai/flux-fast", name: "Pruna FLUX Fast", params: ["prompt","speed_mode","ratio","output_format","guidance","image_size","num_inference_steps","output_quality","seed","size"], capabilities: ["text2img"], kind: "image" },
    { id: "prunaai/hidream-l1-dev", name: "HiDream L1 Dev", params: ["prompt","model_type","speed_mode","resolution","seed","output_format","output_quality","size"], capabilities: ["text2img"], kind: "image" },
    { id: "prunaai/hidream-l1-fast", name: "HiDream L1 Fast", params: ["prompt","model_type","speed_mode","resolution","seed","output_format","output_quality","negative_prompt","size"], capabilities: ["text2img"], kind: "image" },
    { id: "prunaai/hidream-l1-full", name: "HiDream L1 Full", params: ["prompt","model_type","speed_mode","resolution","seed","output_format","output_quality","size"], capabilities: ["text2img"], kind: "image" },
    { id: "prunaai/p-image", name: "Pruna P-Image", params: ["prompt","ratio","width","height","prompt_upsampling","seed","disable_safety_checker","lora_weights","lora_scale","size"], capabilities: ["text2img"], kind: "image" },
    { id: "prunaai/p-image-edit", name: "Pruna P-Image Edit", params: ["prompt","images","turbo","ratio","seed","disable_safety_checker","size"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "prunaai/p-image-upscale", name: "Pruna P-Image Upscale", params: ["image","upscale_mode","target","upscale_factor","enhance_details","enhance_realism","output_format","output_quality","disable_safety_checker"], capabilities: ["edit"], kind: "image" },
    { id: "prunaai/wan-2.2-image", name: "Pruna Wan 2.2 Image", params: ["prompt","juiced","ratio","megapixels","seed","output_format","output_quality","lora_weights_transformer","lora_scale_transformer","lora_weights_transformer_2","lora_scale_transformer_2","size"], capabilities: ["text2img"], kind: "image" },
    { id: "prunaai/z-image-turbo", name: "Z-Image Turbo", params: ["prompt","height","width","num_inference_steps","guidance_scale","seed","go_fast","output_format","output_quality","n","safety_tolerance","negative_prompt","ratio","megapixels","disable_safety_checker","enable_safety_checker","size"], capabilities: ["text2img"], kind: "image" },
    // quiverai
    { id: "quiverai/arrow-1.1", name: "Arrow 1.1", params: ["prompt","instructions","images","temperature","top_p","presence_penalty"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "quiverai/arrow-1.1-max", name: "Arrow 1.1 Max", params: ["prompt","instructions","images","temperature","top_p","presence_penalty"], capabilities: ["text2img","edit"], kind: "image" },
    // qwen
    { id: "qwen/qwen-image", name: "Qwen Image", params: ["prompt","ratio","image_size","output_format","disable_safety_checker","enhance_prompt","extra_lora_scale","extra_lora_weights","go_fast","guidance","image","lora_scale","lora_weights","negative_prompt","num_inference_steps","output_quality","seed","strength","size"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "qwen/qwen-image-edit", name: "Qwen Image Edit", params: ["prompt","image","ratio","go_fast","seed","output_format","output_quality","disable_safety_checker","size"], capabilities: ["edit"], kind: "image" },
    { id: "qwen/qwen-image-edit-plus", name: "Qwen Image Edit Plus", params: ["prompt","ratio","output_format","disable_safety_checker","go_fast","image","output_quality","seed","size"], capabilities: ["edit"], kind: "image" },
    // recraft-ai
    { id: "recraft-ai/recraft-creative-upscale", name: "Recraft Creative Upscale", params: ["image"], capabilities: ["edit"], kind: "image" },
    { id: "recraft-ai/recraft-crisp-upscale", name: "Recraft Crisp Upscale", params: ["image"], capabilities: ["edit"], kind: "image" },
    { id: "recraft-ai/recraft-v3", name: "Recraft V3", params: ["prompt","ratio","size","style"], capabilities: ["text2img"], kind: "image" },
    { id: "recraft-ai/recraft-v3-svg", name: "Recraft V3 SVG", params: ["prompt","ratio","size","style"], capabilities: ["text2img"], kind: "image" },
    { id: "recraft-ai/recraft-v4-pro", name: "Recraft V4 Pro", params: ["prompt","ratio","size"], capabilities: ["text2img"], kind: "image" },
    { id: "recraft-ai/recraft-v4-svg", name: "Recraft V4 SVG", params: ["prompt","ratio","size"], capabilities: ["text2img"], kind: "image" },
    // sourceful
    { id: "sourceful/riverflow-2.0-pro", name: "Riverflow 2.0 Pro", params: ["prompt","images","resolution","ratio","output_format","font_urls","font_texts","transparency","enhance_prompt","max_iterations","safety_checker","size"], capabilities: ["text2img","edit"], kind: "image" },
    // stability-ai
    { id: "stability-ai/sdxl", name: "SDXL", params: ["prompt","negative_prompt","image","mask_image","width","height","n","scheduler","num_inference_steps","guidance_scale","prompt_strength","seed","refine","high_noise_frac","refine_steps","apply_watermark","lora_scale","disable_safety_checker","size"], capabilities: ["text2img","edit","mask"], kind: "image" },
    { id: "stability-ai/stable-diffusion-3.5-large", name: "Stable Diffusion 3.5 Large", params: ["prompt","ratio","cfg","image","prompt_strength","steps","seed","output_format","output_quality","size"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "stability-ai/stable-diffusion-3.5-large-turbo", name: "Stable Diffusion 3.5 Large Turbo", params: ["prompt","ratio","cfg","image","prompt_strength","steps","seed","output_format","output_quality","size"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "stability-ai/stable-diffusion-3.5-medium", name: "Stable Diffusion 3.5 Medium", params: ["prompt","ratio","cfg","image","prompt_strength","steps","seed","output_format","output_quality","size"], capabilities: ["text2img","edit"], kind: "image" },
    // tencent
    { id: "tencent/hunyuan-image-3", name: "Hunyuan Image 3.0", params: ["prompt","ratio","go_fast","seed","output_format","output_quality","disable_safety_checker","size"], capabilities: ["text2img"], kind: "image" },
    // topazlabs
    { id: "topazlabs/image-upscale", name: "Topaz Image Upscale", params: ["image","model_variant","upscale_factor","output_format","subject_detection","face_enhancement","face_enhancement_creativity","face_enhancement_strength"], capabilities: ["edit"], kind: "image" },
    // wan-video
    { id: "wan-video/wan-2.7-image", name: "Wan 2.7 Image", params: ["prompt","images","size","n","image_set_mode","thinking_mode","seed"], capabilities: ["text2img","edit"], kind: "image" },
    { id: "wan-video/wan-2.7-image-pro", name: "Wan 2.7 Image Pro", params: ["prompt","images","size","n","image_set_mode","thinking_mode","seed"], capabilities: ["text2img","edit"], kind: "image" },
    // xai
    { id: "xai/grok-imagine-image", name: "Grok Imagine Image", params: ["prompt","image","n","ratio","size"], capabilities: ["text2img","edit"], kind: "image" },
    // zsxkib
    { id: "zsxkib/aura-sr-v2", name: "AuraSR V2", params: ["image","max_batch_size","output_format","output_quality"], capabilities: ["edit"], kind: "image" },
    { id: "zsxkib/step1x-edit", name: "Step1X Edit", params: ["prompt","image","size_level","seed","output_format","output_quality"], capabilities: ["edit"], kind: "image" },

    // ── Video (105) ─────────────────────────────────────────────────────────
    // Renders outlive an HTTP request, so these are async: the create POST is
    // waited on briefly and then polled. A prompt-only request works on every
    // model that accepts one; fields a model does not accept are dropped before
    // the request leaves (see the video adapter's SPECS).
    // alibaba
    { id: "alibaba/happyhorse-1.0", name: "HappyHorse 1.0", params: ["prompt","image","resolution","ratio","duration","seed","size"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "alibaba/happyhorse-1.1", name: "HappyHorse 1.1", params: ["prompt","reference_images","resolution","ratio","duration","seed","size"], capabilities: ["text2video","reference2video"], kind: "video" },
    { id: "alibaba/wan-3", name: "Wan 3.0", params: ["prompt","image","negative_prompt","resolution","ratio","duration","enable_prompt_expansion","seed","size"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "alibaba/wan-3-prime", name: "Wan 3.0 Prime", params: ["prompt","image","negative_prompt","resolution","ratio","duration","enable_prompt_expansion","seed","size"], capabilities: ["text2video","image2video"], kind: "video" },
    // arielreplicate
    { id: "arielreplicate/robust_video_matting", name: "Robust Video Matting", params: ["video","output_type"], capabilities: ["videoedit"], kind: "video" },
    // bytedance
    { id: "bytedance/dreamactor-m2.0", name: "DreamActor M2.0", params: ["image","video","cut_first_second"], capabilities: ["image2video","videoedit"], kind: "video" },
    { id: "bytedance/latentsync", name: "LatentSync", params: ["video","audio","guidance_scale","seed"], capabilities: ["videoedit"], kind: "video" },
    { id: "bytedance/omni-human", name: "OmniHuman", params: ["audio","image"], capabilities: ["image2video"], kind: "video" },
    { id: "bytedance/seedance-1-lite", name: "Seedance 1 Lite", params: ["prompt","resolution","ratio","fps","camera_fixed","duration","image","last_frame","reference_images","seed","size"], capabilities: ["text2video","image2video","reference2video"], kind: "video" },
    { id: "bytedance/seedance-1-pro", name: "Seedance 1 Pro", params: ["prompt","image","last_frame","duration","resolution","ratio","fps","camera_fixed","seed","size"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "bytedance/seedance-1-pro-fast", name: "Seedance 1 Pro Fast", params: ["prompt","resolution","ratio","fps","camera_fixed","duration","image","seed","size"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "bytedance/seedance-1.5-pro", name: "Seedance 1.5 Pro", params: ["prompt","image","last_frame","duration","resolution","ratio","fps","camera_fixed","audio","seed","size"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "bytedance/seedance-2.0", name: "Seedance 2.0", params: ["prompt","image","last_frame","reference_images","reference_videos","reference_audios","duration","resolution","ratio","audio","seed","size"], capabilities: ["text2video","image2video","reference2video"], kind: "video" },
    { id: "bytedance/seedance-2.0-fast", name: "Seedance 2.0 Fast", params: ["prompt","image","last_frame","reference_images","reference_videos","reference_audios","duration","resolution","ratio","audio","seed","size"], capabilities: ["text2video","image2video","reference2video"], kind: "video" },
    { id: "bytedance/seedance-2.5", name: "Seedance 2.5", params: ["prompt","image","last_frame","reference_images","reference_videos","reference_audios","duration","resolution","ratio","audio","watermark","output_format","seed","size"], capabilities: ["text2video","image2video","reference2video"], kind: "video" },
    // cuuupid
    { id: "cuuupid/cogvideox-5b", name: "CogVideoX 5B", params: ["prompt","extend_prompt","steps","guidance","num_outputs","seed"], capabilities: ["text2video"], kind: "video" },
    // fictions-ai
    { id: "fictions-ai/autocaption", name: "Autocaption", params: ["video","transcript_file_input","output_video","output_transcript","subs_position","color","highlight_color","fontsize","MaxChars","opacity","font","stroke_color","stroke_width","kerning","right_to_left","translate"], capabilities: ["videoedit"], kind: "video" },
    // genmoai
    { id: "genmoai/mochi-1", name: "Mochi 1", params: ["prompt","num_frames","num_inference_steps","guidance_scale","fps","seed"], capabilities: ["text2video"], kind: "video" },
    // google
    { id: "google/veo-2", name: "Veo 2", params: ["prompt","image","ratio","duration","seed","size"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "google/veo-3", name: "Veo 3", params: ["prompt","ratio","duration","image","negative_prompt","resolution","audio","seed","size"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "google/veo-3-fast", name: "Veo 3 Fast", params: ["prompt","ratio","duration","image","negative_prompt","resolution","audio","seed","size"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "google/veo-3.1", name: "Veo 3.1", params: ["prompt","ratio","duration","image","last_frame","reference_images","negative_prompt","resolution","audio","seed","size"], capabilities: ["text2video","image2video","reference2video"], kind: "video" },
    { id: "google/veo-3.1-fast", name: "Veo 3.1 Fast", params: ["prompt","ratio","duration","image","last_frame","negative_prompt","resolution","audio","seed","size"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "google/veo-3.1-lite", name: "Veo 3.1 Lite", params: ["prompt","image","last_frame","ratio","duration","resolution","seed","size"], capabilities: ["text2video","image2video"], kind: "video" },
    // heygen
    { id: "heygen/lipsync-precision", name: "HeyGen Lipsync Precision", params: ["video","audio","enable_dynamic_duration","disable_music_track","enable_speech_enhancement"], capabilities: ["videoedit"], kind: "video" },
    { id: "heygen/lipsync-speed", name: "HeyGen Lipsync Speed", params: ["video","audio","enable_dynamic_duration","disable_music_track","enable_speech_enhancement"], capabilities: ["videoedit"], kind: "video" },
    // kwaivgi
    { id: "kwaivgi/kling-lip-sync", name: "Kling Lip Sync", params: ["voice_id","audio","text","video_id","video","voice_speed"], capabilities: ["videoedit"], kind: "video" },
    { id: "kwaivgi/kling-o1", name: "Kling O1", params: ["prompt","image","last_frame","reference_images","reference_video","video_reference_type","keep_original_sound","mode","ratio","duration","size"], capabilities: ["text2video","image2video","reference2video","videoedit"], kind: "video" },
    { id: "kwaivgi/kling-v1.6-pro", name: "Kling v1.6 Pro", params: ["prompt","ratio","duration","cfg_scale","last_frame","negative_prompt","reference_images","image","size"], capabilities: ["text2video","image2video","reference2video"], kind: "video" },
    { id: "kwaivgi/kling-v1.6-standard", name: "Kling v1.6 Standard", params: ["prompt","ratio","duration","cfg_scale","negative_prompt","reference_images","image","size"], capabilities: ["text2video","image2video","reference2video"], kind: "video" },
    { id: "kwaivgi/kling-v2.0", name: "Kling v2.0", params: ["prompt","ratio","duration","cfg_scale","negative_prompt","image","size"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "kwaivgi/kling-v2.1", name: "Kling v2.1", params: ["prompt","mode","duration","last_frame","negative_prompt","image"], capabilities: ["image2video"], kind: "video" },
    { id: "kwaivgi/kling-v2.1-master", name: "Kling v2.1 Master", params: ["prompt","ratio","duration","negative_prompt","image","size"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "kwaivgi/kling-v2.5-turbo-pro", name: "Kling v2.5 Turbo Pro", params: ["prompt","negative_prompt","image","last_frame","ratio","duration","guidance_scale","size"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "kwaivgi/kling-v2.6", name: "Kling v2.6", params: ["prompt","negative_prompt","image","ratio","duration","audio","size"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "kwaivgi/kling-v3-omni-video", name: "Kling v3 Omni Video", params: ["prompt","image","last_frame","reference_images","reference_video","video_reference_type","keep_original_sound","audio","mode","ratio","duration","multi_prompt","size"], capabilities: ["text2video","image2video","reference2video","videoedit"], kind: "video" },
    { id: "kwaivgi/kling-v3-video", name: "Kling v3 Video", params: ["prompt","negative_prompt","image","last_frame","mode","ratio","duration","audio","multi_prompt","size"], capabilities: ["text2video","image2video"], kind: "video" },
    // leonardoai
    { id: "leonardoai/motion-2.0", name: "Leonardo Motion 2.0", params: ["prompt","ratio","vibe_style","lighting_style","shot_type_style","color_theme_style","frame_interpolation","image","negative_prompt","prompt_enhance","size"], capabilities: ["text2video","image2video"], kind: "video" },
    // lightricks
    { id: "lightricks/ltx-video", name: "LTX Video", params: ["prompt","negative_prompt","image","image_noise_scale","target_size","ratio","cfg","steps","length","model_variant","seed","size"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "lightricks/ltx-video-0.9.7", name: "LTX Video 0.9.7", params: ["prompt","image","negative_prompt","width","height","num_frames","num_inference_steps","guidance_scale","fps","seed","size"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "lightricks/ltx-video-0.9.7-distilled", name: "LTX Video 0.9.7 Distilled", params: ["prompt","image","video","negative_prompt","resolution","ratio","num_frames","num_inference_steps","guidance_scale","fps","seed","downscale_factor","denoise_strength","final_inference_steps","conditioning_frames","go_fast","size"], capabilities: ["text2video","image2video","videoedit"], kind: "video" },
    // lucataco
    { id: "lucataco/real-esrgan-video", name: "Real-ESRGAN Video", params: ["video","resolution","model_variant","size"], capabilities: ["videoedit"], kind: "video" },
    // luma
    { id: "luma/modify-video", name: "Luma Modify Video", params: ["prompt","mode","image","video"], capabilities: ["text2video","image2video","videoedit"], kind: "video" },
    { id: "luma/ray-2-540p", name: "Luma Ray 2 540p", params: ["prompt","duration","ratio","concepts","last_frame","loop","image","size"], capabilities: ["text2video","image2video","reference2video"], kind: "video" },
    { id: "luma/ray-2-720p", name: "Luma Ray 2 720p", params: ["prompt","duration","ratio","concepts","last_frame","loop","image","size"], capabilities: ["text2video","image2video","reference2video"], kind: "video" },
    { id: "luma/ray-3.2", name: "Luma Ray 3.2", params: ["prompt","ratio","resolution","duration","hdr","exr_export","loop","image","last_frame","size"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "luma/ray-flash-2-540p", name: "Luma Ray Flash 2 540p", params: ["prompt","duration","ratio","concepts","last_frame","loop","image","size"], capabilities: ["text2video","image2video","reference2video"], kind: "video" },
    { id: "luma/ray-flash-2-720p", name: "Luma Ray Flash 2 720p", params: ["prompt","duration","ratio","concepts","last_frame","loop","image","size"], capabilities: ["text2video","image2video","reference2video"], kind: "video" },
    { id: "luma/reframe-video", name: "Luma Reframe Video", params: ["prompt","ratio","grid_position_x","grid_position_y","video","x_end","x_start","y_end","y_start","size"], capabilities: ["text2video","videoedit"], kind: "video" },
    // meta
    { id: "meta/sam-2-video", name: "SAM 2 Video", params: ["video","click_coordinates","click_labels","click_frames","click_object_ids","mask_type","annotation_type","output_video","video_fps","output_format","output_quality","output_frame_interval"], capabilities: ["videoedit"], kind: "video" },
    // minimax
    { id: "minimax/hailuo-02", name: "MiniMax Hailuo 02", params: ["prompt","duration","resolution","image","last_frame","prompt_optimizer","size"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "minimax/hailuo-2.3", name: "MiniMax Hailuo 2.3", params: ["prompt","duration","resolution","image","prompt_optimizer","size"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "minimax/hailuo-2.3-fast", name: "MiniMax Hailuo 2.3 Fast", params: ["prompt","duration","resolution","image","prompt_optimizer","size"], capabilities: ["image2video"], kind: "video" },
    { id: "minimax/video-01", name: "MiniMax Video 01", params: ["prompt","image","prompt_optimizer","subject_reference"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "minimax/video-01-director", name: "MiniMax Video 01 Director", params: ["prompt","image","prompt_optimizer"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "minimax/video-01-live", name: "MiniMax Video 01 Live", params: ["prompt","image","prompt_optimizer"], capabilities: ["image2video"], kind: "video" },
    // openai
    { id: "openai/sora-2", name: "Sora 2 API", params: ["prompt","openai_api_key","image","duration","ratio","size"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "openai/sora-2-pro", name: "Sora 2 Pro", params: ["prompt","openai_api_key","image","duration","ratio","resolution","size"], capabilities: ["text2video","image2video"], kind: "video" },
    // philz1337x
    { id: "philz1337x/crystal-video-upscaler", name: "Crystal Video Upscaler", params: ["video","scale_factor"], capabilities: ["videoedit"], kind: "video" },
    // pixverse
    { id: "pixverse/lipsync", name: "PixVerse Lipsync", params: ["video","audio"], capabilities: ["videoedit"], kind: "video" },
    { id: "pixverse/pixverse-v4", name: "PixVerse v4", params: ["prompt","image","last_frame","quality","ratio","duration","motion_mode","negative_prompt","seed","style","effect","sound_effect_switch","sound_effect_content","size"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "pixverse/pixverse-v4.5", name: "PixVerse v4.5", params: ["prompt","image","last_frame","quality","ratio","duration","motion_mode","negative_prompt","seed","style","effect","sound_effect_switch","sound_effect_content","size"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "pixverse/pixverse-v5", name: "PixVerse v5", params: ["prompt","image","last_frame","quality","ratio","duration","negative_prompt","seed","effect","size"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "pixverse/pixverse-v5.6", name: "PixVerse v5.6", params: ["prompt","image","last_frame","quality","ratio","duration","negative_prompt","seed","audio","thinking_type","size"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "pixverse/pixverse-v6", name: "PixVerse v6", params: ["prompt","image","last_frame","quality","ratio","duration","negative_prompt","seed","audio","generate_multi_clip_switch","size"], capabilities: ["text2video","image2video"], kind: "video" },
    // prunaai
    { id: "prunaai/p-video", name: "Pruna P-Video", params: ["prompt","image","last_frame","audio","duration","ratio","resolution","fps","draft","prompt_upsampling","disable_safety_filter","save_audio","seed","size"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "prunaai/p-video-animate", name: "Pruna P-Video Animate", params: ["video","image","instruction_prompt","resolution","target_fps","save_audio","ignore_audio","turbo","disable_safety_checker","seed","size"], capabilities: ["image2video","videoedit"], kind: "video" },
    { id: "prunaai/p-video-avatar", name: "Pruna P-Video Avatar", params: ["image","resolution","audio","voice","voice_script","voice_prompt","voice_language","seed","video_prompt","negative_prompt","strength_negative_prompt","disable_safety_filter","disable_prompt_upsampling","size"], capabilities: ["image2video"], kind: "video" },
    // runwayml
    { id: "runwayml/gen-4.5", name: "Runway Gen-4.5", params: ["prompt","image","ratio","duration","seed","size"], capabilities: ["text2video","image2video"], kind: "video" },
    // sync
    { id: "sync/lipsync-2", name: "Sync Lipsync 2", params: ["video","audio","sync_mode","temperature","active_speaker"], capabilities: ["videoedit"], kind: "video" },
    { id: "sync/lipsync-2-pro", name: "Sync Lipsync 2 Pro", params: ["video","audio","sync_mode","temperature","active_speaker"], capabilities: ["videoedit"], kind: "video" },
    // tencent
    { id: "tencent/hunyuan-video", name: "HunyuanVideo", params: ["prompt","width","height","video_length","infer_steps","embedded_guidance_scale","fps","seed","size"], capabilities: ["text2video"], kind: "video" },
    // tmappdev
    { id: "tmappdev/lipsync", name: "MuseTalk Lipsync", params: ["audio","video","bbox_shift","fps"], capabilities: ["videoedit"], kind: "video" },
    // topazlabs
    { id: "topazlabs/video-upscale", name: "Topaz Video Upscale", params: ["video","resolution","target_fps","size"], capabilities: ["videoedit"], kind: "video" },
    // veed
    { id: "veed/fabric-1.0", name: "VEED Fabric 1.0", params: ["image","audio","resolution","size"], capabilities: ["image2video"], kind: "video" },
    // vidu
    { id: "vidu/q3-pro", name: "Vidu Q3 Pro", params: ["prompt","image","last_frame","duration","ratio","resolution","audio","seed","size"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "vidu/q3-turbo", name: "Vidu Q3 Turbo", params: ["prompt","image","last_frame","duration","ratio","resolution","audio","seed","size"], capabilities: ["text2video","image2video"], kind: "video" },
    // wan-video
    { id: "wan-video/wan-2.1-1.3b", name: "Wan 2.1 1.3B", params: ["prompt","ratio","frame_num","resolution","sample_steps","sample_guide_scale","sample_shift","seed","size"], capabilities: ["text2video"], kind: "video" },
    { id: "wan-video/wan-2.2-i2v-a14b", name: "Wan 2.2 I2V A14B", params: ["prompt","image","go_fast","num_frames","resolution","frames_per_second","sample_steps","sample_shift","seed","size"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "wan-video/wan-2.2-i2v-fast", name: "Wan 2.2 I2V Fast", params: ["prompt","image","last_frame","num_frames","resolution","frames_per_second","interpolate_output","go_fast","sample_shift","seed","disable_safety_checker","lora_weights_transformer","lora_scale_transformer","lora_weights_transformer_2","lora_scale_transformer_2","size"], capabilities: ["image2video"], kind: "video" },
    { id: "wan-video/wan-2.2-s2v", name: "Wan 2.2 S2V", params: ["prompt","image","audio","num_frames_per_chunk","seed","interpolate"], capabilities: ["image2video"], kind: "video" },
    { id: "wan-video/wan-2.2-t2v-fast", name: "Wan 2.2 T2V Fast", params: ["prompt","optimize_prompt","num_frames","ratio","resolution","frames_per_second","interpolate_output","go_fast","sample_shift","seed","disable_safety_checker","lora_weights_transformer","lora_scale_transformer","lora_weights_transformer_2","lora_scale_transformer_2","size"], capabilities: ["text2video"], kind: "video" },
    { id: "wan-video/wan-2.5-i2v", name: "Wan 2.5 I2V", params: ["prompt","image","negative_prompt","audio","resolution","duration","enable_prompt_expansion","seed","size"], capabilities: ["image2video"], kind: "video" },
    { id: "wan-video/wan-2.5-i2v-fast", name: "Wan 2.5 I2V Fast", params: ["prompt","resolution","duration","audio","enable_prompt_expansion","image","negative_prompt","seed","size"], capabilities: ["image2video"], kind: "video" },
    { id: "wan-video/wan-2.5-t2v", name: "Wan 2.5 T2V", params: ["prompt","negative_prompt","audio","size","duration","enable_prompt_expansion","seed"], capabilities: ["text2video"], kind: "video" },
    { id: "wan-video/wan-2.5-t2v-fast", name: "Wan 2.5 T2V Fast", params: ["prompt","negative_prompt","audio","size","duration","enable_prompt_expansion","seed"], capabilities: ["text2video"], kind: "video" },
    { id: "wan-video/wan-2.6-i2v", name: "Wan 2.6 I2V", params: ["prompt","image","negative_prompt","audio","resolution","duration","enable_prompt_expansion","multi_shots","seed","size"], capabilities: ["image2video"], kind: "video" },
    { id: "wan-video/wan-2.6-t2v", name: "Wan 2.6 T2V", params: ["prompt","negative_prompt","audio","size","duration","enable_prompt_expansion","multi_shots","seed"], capabilities: ["text2video"], kind: "video" },
    { id: "wan-video/wan-2.7-i2v", name: "Wan 2.7 I2V", params: ["prompt","image","last_frame","video","audio","negative_prompt","resolution","duration","enable_prompt_expansion","seed","size"], capabilities: ["text2video","image2video","videoedit"], kind: "video" },
    { id: "wan-video/wan-2.7-r2v", name: "Wan 2.7 R2V", params: ["prompt","reference_images","reference_videos","negative_prompt","resolution","ratio","duration","shot_type","seed","size"], capabilities: ["text2video","reference2video"], kind: "video" },
    { id: "wan-video/wan-2.7-t2v", name: "Wan 2.7 T2V", params: ["prompt","negative_prompt","audio","resolution","ratio","duration","enable_prompt_expansion","seed","size"], capabilities: ["text2video"], kind: "video" },
    { id: "wan-video/wan-2.7-videoedit", name: "Wan 2.7 Video Edit", params: ["prompt","video","reference_image","resolution","ratio","duration","audio_setting","seed","size"], capabilities: ["image2video","videoedit"], kind: "video" },
    // wavespeedai
    { id: "wavespeedai/wan-2.1-i2v-480p", name: "Wan 2.1 I2V 480p", params: ["prompt","negative_prompt","ratio","image","fast_mode","seed","sample_guide_scale","sample_steps","sample_shift","lora_weights","lora_scale","disable_safety_checker","size"], capabilities: ["image2video"], kind: "video" },
    { id: "wavespeedai/wan-2.1-i2v-720p", name: "Wan 2.1 I2V 720p", params: ["prompt","negative_prompt","ratio","image","fast_mode","seed","sample_guide_scale","sample_steps","sample_shift","lora_weights","lora_scale","disable_safety_checker","size"], capabilities: ["image2video"], kind: "video" },
    { id: "wavespeedai/wan-2.1-t2v-480p", name: "Wan 2.1 T2V 480p", params: ["prompt","ratio","fast_mode","disable_safety_checker","lora_scale","lora_weights","negative_prompt","sample_guide_scale","sample_shift","sample_steps","seed","size"], capabilities: ["text2video"], kind: "video" },
    { id: "wavespeedai/wan-2.1-t2v-720p", name: "Wan 2.1 T2V 720p", params: ["prompt","negative_prompt","ratio","fast_mode","seed","sample_guide_scale","sample_steps","sample_shift","lora_weights","lora_scale","disable_safety_checker","size"], capabilities: ["text2video"], kind: "video" },
    // xai
    { id: "xai/grok-imagine-video", name: "Grok Imagine Video", params: ["prompt","image","video","duration","ratio","resolution","size"], capabilities: ["text2video","image2video","videoedit"], kind: "video" },
    { id: "xai/grok-imagine-video-1.5", name: "Grok Imagine Video 1.5", params: ["prompt","image","duration","ratio","resolution","size"], capabilities: ["image2video"], kind: "video" },
    { id: "xai/grok-imagine-video-extension", name: "Grok Imagine Video Extension", params: ["prompt","video","duration"], capabilities: ["videoedit"], kind: "video" },
    // zsxkib
    { id: "zsxkib/film-frame-interpolation-for-large-motion", name: "FILM Frame Interpolation", params: ["video","playback_frames_per_second","num_interpolation_steps"], capabilities: ["videoedit"], kind: "video" },
    { id: "zsxkib/hunyuan-video2video", name: "Hunyuan Video-to-Video", params: ["prompt","video","width","height","keep_proportion","steps","guidance_scale","denoise_strength","flow_shift","seed","frame_rate","crf","force_rate","force_size","custom_width","custom_height","frame_load_cap","skip_first_frames","select_every_nth","size"], capabilities: ["videoedit"], kind: "video" },
    { id: "zsxkib/mmaudio", name: "MMAudio", params: ["prompt","negative_prompt","video","duration","num_steps","cfg_strength","seed","image"], capabilities: ["text2video","image2video","videoedit"], kind: "video" },
    { id: "zsxkib/multitalk", name: "MultiTalk", params: ["prompt","image","audio","second_audio","num_frames","sampling_steps","seed","turbo"], capabilities: ["image2video"], kind: "video" },
    { id: "zsxkib/pyramid-flow", name: "Pyramid Flow", params: ["prompt","image","duration","guidance_scale","video_guidance_scale","frames_per_second"], capabilities: ["text2video","image2video"], kind: "video" },
    { id: "zsxkib/seedvr2", name: "SeedVR2", params: ["media","cfg_scale","sample_steps","sp_size","fps","seed","output_format","output_quality","apply_color_fix","model_variant"], capabilities: ["videoedit"], kind: "video" },
  ],
  serviceKinds: ["image", "video"],
  // Both kinds create and poll predictions under the same API root, so the
  // adapters build every path from it.
  imageConfig: { baseUrl: "https://api.replicate.com/v1" },
  videoConfig: { baseUrl: "https://api.replicate.com/v1" },
};
