// fal.ai video generation — queue API (https://queue.fal.run).
//
// fal ships ~120 video endpoints across a dozen families, but they are all the
// same protocol and only the INPUT SCHEMA varies:
//
//   POST /{endpoint_id}                       -> { request_id, status_url, ... }
//   GET  /{endpoint_id}/requests/{id}/status  -> { status: IN_QUEUE|IN_PROGRESS|COMPLETED }
//   GET  /{endpoint_id}/requests/{id}         -> { video: { url, ... } }
//
// So this adapter carries NO per-model code. `SPECS` below is a generated table
// of every endpoint's accepted fields (name, JSON type, enum), and everything
// else — which fields are forwarded, which enum value a loose input snaps to,
// which media a model requires, what the dashboard offers per model — is
// derived from it. Adding a model (or a field on an existing one) is one line in
// SPECS; no logic changes.
//
// Spec syntax, per field, comma separated:
//   name              string
//   *name             required
//   name:b|i|n|a|o    boolean / integer / number / array / object (default string)
//   name[a,b,c]       enum of accepted values
//
// The client-facing contract stays the ONE video body every 9router video model
// takes: `prompt` plus optional fields. Generic aliases (`image`, `last_frame`,
// `video`, `reference_images`, `ratio`, `audio`, `duration`, `resolution`, …)
// are resolved to whatever THIS endpoint happens to call them (ALIASES), loose
// values are snapped into its enums, and anything it does not accept is dropped
// rather than forwarded — fal 422s on unknown keys. Only genuinely required
// media is enforced, with a local 400 naming the field.
import { PROVIDER_MEDIA } from "../../providers/index.js";

const API_ROOT = (PROVIDER_MEDIA["fal-ai"]?.videoConfig?.baseUrl || "https://queue.fal.run").replace(/\/$/, "");

// ── endpoint input schemas (generated from fal's OpenAPI documents) ─────────
export const SPECS = {
  "bria/video/background-removal":
    "*video_url,background_color[Transparent,Black,White,Gray,Red,Green,Blue,Yellow,Cyan,Magenta,Orange],output_container_and_codec[mp4_h265,mp4_h264,webm_vp9,mov_h265,mov_proresks,mkv_h265,mkv_h264,mkv_vp9,gif],preserve_audio:b",
  "bria/video/background-removal/v3":
    "*video_url,auto_zoom:b,background_color[Transparent,Black,White,Gray,Red,Green,Blue,Yellow,Cyan,Magenta,Orange],output_container_and_codec[mp4_h265,mp4_h264,webm_vp9,mov_h265,mov_proresks,mkv_h265,mkv_h264,mkv_vp9,gif],preserve_audio:b",
  "bria/video/increase-resolution":
    "*video_url,desired_increase[2,4],output_container_and_codec[mp4_h265,mp4_h264,webm_vp9,mov_h265,mov_proresks,mkv_h265,mkv_h264,mkv_vp9,gif],preserve_audio:b",
  "bytedance/seedance-2.0/fast/image-to-video":
    "*prompt,*image_url,end_image_url,aspect_ratio[auto,21:9,16:9,4:3,1:1,3:4,9:16],bitrate_mode[standard,high],duration[auto,4,5,6,7,8,9,10,11,12,13,14,15],end_user_id,generate_audio:b,resolution[480p,720p]",
  "bytedance/seedance-2.0/fast/reference-to-video":
    "*prompt,image_urls:a,video_urls:a,audio_urls:a,aspect_ratio[auto,21:9,16:9,4:3,1:1,3:4,9:16],bitrate_mode[standard,high],duration[auto,4,5,6,7,8,9,10,11,12,13,14,15],end_user_id,generate_audio:b,resolution[480p,720p]",
  "bytedance/seedance-2.0/fast/text-to-video":
    "*prompt,aspect_ratio[auto,21:9,16:9,4:3,1:1,3:4,9:16],bitrate_mode[standard,high],duration[auto,4,5,6,7,8,9,10,11,12,13,14,15],end_user_id,generate_audio:b,resolution[480p,720p]",
  "bytedance/seedance-2.0/image-to-video":
    "*prompt,*image_url,end_image_url,aspect_ratio[auto,21:9,16:9,4:3,1:1,3:4,9:16],bitrate_mode[standard,high],duration[auto,4,5,6,7,8,9,10,11,12,13,14,15],end_user_id,generate_audio:b,resolution[480p,720p,1080p,4k]",
  "bytedance/seedance-2.0/mini/image-to-video":
    "*prompt,*image_url,end_image_url,aspect_ratio[auto,21:9,16:9,4:3,1:1,3:4,9:16],duration[auto,4,5,6,7,8,9,10,11,12,13,14,15],end_user_id,generate_audio:b,resolution[480p,720p]",
  "bytedance/seedance-2.0/mini/reference-to-video":
    "*prompt,image_urls:a,video_urls:a,audio_urls:a,aspect_ratio[auto,21:9,16:9,4:3,1:1,3:4,9:16],duration[auto,4,5,6,7,8,9,10,11,12,13,14,15],end_user_id,generate_audio:b,resolution[480p,720p]",
  "bytedance/seedance-2.0/mini/text-to-video":
    "*prompt,aspect_ratio[auto,21:9,16:9,4:3,1:1,3:4,9:16],duration[auto,4,5,6,7,8,9,10,11,12,13,14,15],end_user_id,generate_audio:b,resolution[480p,720p]",
  "bytedance/seedance-2.0/reference-to-video":
    "*prompt,image_urls:a,video_urls:a,audio_urls:a,aspect_ratio[auto,21:9,16:9,4:3,1:1,3:4,9:16],bitrate_mode[standard,high],duration[auto,4,5,6,7,8,9,10,11,12,13,14,15],end_user_id,generate_audio:b,resolution[480p,720p,1080p,4k]",
  "bytedance/seedance-2.0/text-to-video":
    "*prompt,aspect_ratio[auto,21:9,16:9,4:3,1:1,3:4,9:16],bitrate_mode[standard,high],duration[auto,4,5,6,7,8,9,10,11,12,13,14,15],end_user_id,generate_audio:b,resolution[480p,720p,1080p,4k]",
  "bytedance/seedance-2.5/image-to-video":
    "*prompt,*image_url,end_image_url,aspect_ratio,bitrate_mode[standard,high],duration[auto,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30],end_user_id,generate_audio:b,resolution[480p,720p,1080p]",
  "bytedance/seedance-2.5/reference-to-video":
    "*prompt,image_urls:a,video_urls:a,audio_urls:a,aspect_ratio[auto,21:9,16:9,4:3,1:1,3:4,9:16],bitrate_mode[standard,high],duration[auto,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30],end_user_id,generate_audio:b,resolution[480p,720p,1080p]",
  "bytedance/seedance-2.5/text-to-video":
    "*prompt,aspect_ratio[auto,21:9,16:9,4:3,1:1,3:4,9:16],bitrate_mode[standard,high],duration[auto,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30],end_user_id,generate_audio:b,resolution[480p,720p,1080p]",
  "fal-ai/birefnet/v2/video":
    "*video_url,model[General Use (Light),General Use (Light 2K),General Use (Heavy),Matting,Portrait,General Use (Dynamic)],operating_resolution[1024x1024,2048x2048,2304x2304],output_mask:b,refine_foreground:b,sync_mode:b,video_output_type[X264 (.mp4),VP9 (.webm),PRORES4444 (.mov),GIF (.gif)],video_quality[low,medium,high,maximum],video_write_mode[fast,balanced,small]",
  "fal-ai/bytedance/dreamactor/v2":
    "*image_url,*video_url,trim_first_second:b",
  "fal-ai/bytedance/omnihuman":
    "*image_url,*audio_url",
  "fal-ai/bytedance/omnihuman/v1.5":
    "*image_url,*audio_url,prompt,mask_url,resolution[720p,1080p],turbo_mode:b",
  "fal-ai/bytedance/seedance/v1.5/pro/image-to-video":
    "*prompt,*image_url,end_image_url,aspect_ratio[21:9,16:9,4:3,1:1,3:4,9:16,auto],camera_fixed:b,duration[4,5,6,7,8,9,10,11,12],enable_safety_checker:b,generate_audio:b,resolution[480p,720p,1080p],seed:i",
  "fal-ai/bytedance/seedance/v1.5/pro/text-to-video":
    "*prompt,aspect_ratio[21:9,16:9,4:3,1:1,3:4,9:16,auto],camera_fixed:b,duration[4,5,6,7,8,9,10,11,12],enable_safety_checker:b,generate_audio:b,resolution[480p,720p,1080p],seed:i",
  "fal-ai/bytedance/seedance/v1/lite/image-to-video":
    "*prompt,*image_url,end_image_url,aspect_ratio[21:9,16:9,4:3,1:1,3:4,9:16,auto],camera_fixed:b,duration[2,3,4,5,6,7,8,9,10,11,12],enable_safety_checker:b,num_frames:i,resolution[480p,720p,1080p],seed:i",
  "fal-ai/bytedance/seedance/v1/lite/reference-to-video":
    "*prompt,*reference_image_urls:a,aspect_ratio[21:9,16:9,4:3,1:1,3:4,9:16,auto],camera_fixed:b,duration[2,3,4,5,6,7,8,9,10,11,12],enable_safety_checker:b,num_frames:i,resolution[480p,720p],seed:i",
  "fal-ai/bytedance/seedance/v1/lite/text-to-video":
    "*prompt,aspect_ratio[21:9,16:9,4:3,1:1,3:4,9:16,9:21],camera_fixed:b,duration[2,3,4,5,6,7,8,9,10,11,12],enable_safety_checker:b,num_frames:i,resolution[480p,720p,1080p],seed:i",
  "fal-ai/bytedance/seedance/v1/pro/fast/image-to-video":
    "*prompt,*image_url,aspect_ratio[21:9,16:9,4:3,1:1,3:4,9:16,auto],camera_fixed:b,duration[2,3,4,5,6,7,8,9,10,11,12],enable_safety_checker:b,num_frames:i,resolution[480p,720p,1080p],seed:i",
  "fal-ai/bytedance/seedance/v1/pro/fast/text-to-video":
    "*prompt,aspect_ratio[21:9,16:9,4:3,1:1,3:4,9:16],camera_fixed:b,duration[2,3,4,5,6,7,8,9,10,11,12],enable_safety_checker:b,num_frames:i,resolution[480p,720p,1080p],seed:i",
  "fal-ai/bytedance/seedance/v1/pro/image-to-video":
    "*prompt,*image_url,end_image_url,aspect_ratio[21:9,16:9,4:3,1:1,3:4,9:16,auto],camera_fixed:b,duration[2,3,4,5,6,7,8,9,10,11,12],enable_safety_checker:b,num_frames:i,resolution[480p,720p,1080p],seed:i",
  "fal-ai/bytedance/seedance/v1/pro/text-to-video":
    "*prompt,aspect_ratio[21:9,16:9,4:3,1:1,3:4,9:16],camera_fixed:b,duration[2,3,4,5,6,7,8,9,10,11,12],enable_safety_checker:b,num_frames:i,resolution[480p,720p,1080p],seed:i",
  "fal-ai/bytedance/video-stylize":
    "*image_url,*style",
  "fal-ai/kling-video/ai-avatar/v2/pro":
    "*image_url,*audio_url,prompt",
  "fal-ai/kling-video/ai-avatar/v2/standard":
    "*image_url,*audio_url,prompt",
  "fal-ai/kling-video/lipsync/audio-to-video":
    "*video_url,*audio_url",
  "fal-ai/kling-video/lipsync/text-to-video":
    "*video_url,*text,*voice_id,voice_language[zh,en],voice_speed:n",
  "fal-ai/kling-video/o1/image-to-video":
    "*prompt,*start_image_url,end_image_url,duration[3,4,5,6,7,8,9,10]",
  "fal-ai/kling-video/o1/reference-to-video":
    "*prompt,image_urls:a,aspect_ratio[16:9,9:16,1:1],duration[3,4,5,6,7,8,9,10],elements:a",
  "fal-ai/kling-video/o1/standard/image-to-video":
    "*prompt,*start_image_url,end_image_url,duration[3,4,5,6,7,8,9,10]",
  "fal-ai/kling-video/o1/standard/reference-to-video":
    "*prompt,image_urls:a,aspect_ratio[16:9,9:16,1:1],duration[3,4,5,6,7,8,9,10],elements:a",
  "fal-ai/kling-video/o1/standard/video-to-video/edit":
    "*prompt,*video_url,image_urls:a,elements:a,keep_audio:b",
  "fal-ai/kling-video/o1/standard/video-to-video/reference":
    "*prompt,*video_url,image_urls:a,aspect_ratio[auto,16:9,9:16,1:1],duration[3,4,5,6,7,8,9,10],elements:a,keep_audio:b",
  "fal-ai/kling-video/o1/video-to-video/edit":
    "*prompt,*video_url,image_urls:a,elements:a,keep_audio:b",
  "fal-ai/kling-video/o1/video-to-video/reference":
    "*prompt,*video_url,image_urls:a,aspect_ratio[auto,16:9,9:16,1:1],duration[3,4,5,6,7,8,9,10],elements:a,keep_audio:b",
  "fal-ai/kling-video/o3/pro/image-to-video":
    "*image_url,prompt,end_image_url,duration[3,4,5,6,7,8,9,10,11,12,13,14,15],generate_audio:b,multi_prompt:a,shot_type[customize,intelligent]",
  "fal-ai/kling-video/o3/pro/reference-to-video":
    "prompt,start_image_url,end_image_url,image_urls:a,aspect_ratio[16:9,9:16,1:1],duration[3,4,5,6,7,8,9,10,11,12,13,14,15],elements:a,generate_audio:b,multi_prompt:a,shot_type[customize,intelligent]",
  "fal-ai/kling-video/o3/pro/text-to-video":
    "prompt,aspect_ratio[16:9,9:16,1:1],duration[3,4,5,6,7,8,9,10,11,12,13,14,15],generate_audio:b,multi_prompt:a,shot_type[customize,intelligent]",
  "fal-ai/kling-video/o3/pro/video-to-video/edit":
    "*prompt,*video_url,image_urls:a,elements:a,keep_audio:b,shot_type",
  "fal-ai/kling-video/o3/pro/video-to-video/reference":
    "*prompt,*video_url,image_urls:a,aspect_ratio[auto,16:9,9:16,1:1],duration[3,4,5,6,7,8,9,10,11,12,13,14,15],elements:a,keep_audio:b,shot_type",
  "fal-ai/kling-video/o3/standard/image-to-video":
    "*image_url,prompt,end_image_url,duration[3,4,5,6,7,8,9,10,11,12,13,14,15],generate_audio:b,multi_prompt:a,shot_type[customize,intelligent]",
  "fal-ai/kling-video/o3/standard/reference-to-video":
    "prompt,start_image_url,end_image_url,image_urls:a,aspect_ratio[16:9,9:16,1:1],duration[3,4,5,6,7,8,9,10,11,12,13,14,15],elements:a,generate_audio:b,multi_prompt:a,shot_type[customize,intelligent]",
  "fal-ai/kling-video/o3/standard/text-to-video":
    "prompt,aspect_ratio[16:9,9:16,1:1],duration[3,4,5,6,7,8,9,10,11,12,13,14,15],generate_audio:b,multi_prompt:a,shot_type[customize,intelligent]",
  "fal-ai/kling-video/o3/standard/video-to-video/edit":
    "*prompt,*video_url,image_urls:a,elements:a,keep_audio:b,shot_type",
  "fal-ai/kling-video/o3/standard/video-to-video/reference":
    "*prompt,*video_url,image_urls:a,aspect_ratio[auto,16:9,9:16,1:1],duration[3,4,5,6,7,8,9,10,11,12,13,14,15],elements:a,keep_audio:b,shot_type",
  "fal-ai/kling-video/v1.5/pro/effects":
    "*effect_scene,input_image_urls:a,duration[5,10]",
  "fal-ai/kling-video/v1.5/pro/image-to-video":
    "*prompt,*image_url,negative_prompt,tail_image_url,static_mask_url,aspect_ratio[16:9,9:16,1:1],cfg_scale:n,duration[5,10],dynamic_masks:a",
  "fal-ai/kling-video/v1.5/pro/text-to-video":
    "*prompt,negative_prompt,aspect_ratio[16:9,9:16,1:1],cfg_scale:n,duration[5,10]",
  "fal-ai/kling-video/v1.6/pro/effects":
    "*effect_scene,input_image_urls:a,duration[5,10]",
  "fal-ai/kling-video/v1.6/pro/elements":
    "*prompt,*input_image_urls:a,negative_prompt,aspect_ratio[16:9,9:16,1:1],duration[5,10]",
  "fal-ai/kling-video/v1.6/pro/image-to-video":
    "*prompt,*image_url,negative_prompt,tail_image_url,aspect_ratio[16:9,9:16,1:1],cfg_scale:n,duration[5,10]",
  "fal-ai/kling-video/v1.6/pro/text-to-video":
    "*prompt,negative_prompt,aspect_ratio[16:9,9:16,1:1],cfg_scale:n,duration[5,10]",
  "fal-ai/kling-video/v1.6/standard/effects":
    "*effect_scene,input_image_urls:a,duration[5,10]",
  "fal-ai/kling-video/v1.6/standard/elements":
    "*prompt,*input_image_urls:a,negative_prompt,aspect_ratio[16:9,9:16,1:1],duration[5,10]",
  "fal-ai/kling-video/v1.6/standard/image-to-video":
    "*prompt,*image_url,negative_prompt,cfg_scale:n,duration[5,10]",
  "fal-ai/kling-video/v1.6/standard/text-to-video":
    "*prompt,negative_prompt,aspect_ratio[16:9,9:16,1:1],cfg_scale:n,duration[5,10]",
  "fal-ai/kling-video/v1/pro/ai-avatar":
    "*image_url,*audio_url,prompt",
  "fal-ai/kling-video/v1/standard/ai-avatar":
    "*image_url,*audio_url,prompt",
  "fal-ai/kling-video/v1/standard/effects":
    "*effect_scene,input_image_urls:a,duration[5,10]",
  "fal-ai/kling-video/v1/standard/image-to-video":
    "*prompt,*image_url,negative_prompt,tail_image_url,static_mask_url,cfg_scale:n,duration[5,10],dynamic_masks:a",
  "fal-ai/kling-video/v1/standard/text-to-video":
    "*prompt,negative_prompt,advanced_camera_control:o,aspect_ratio[16:9,9:16,1:1],camera_control[down_back,forward_up,right_turn_forward,left_turn_forward],cfg_scale:n,duration[5,10]",
  "fal-ai/kling-video/v2.1/master/image-to-video":
    "*prompt,*image_url,negative_prompt,cfg_scale:n,duration[5,10]",
  "fal-ai/kling-video/v2.1/master/text-to-video":
    "*prompt,negative_prompt,aspect_ratio[16:9,9:16,1:1],cfg_scale:n,duration[5,10]",
  "fal-ai/kling-video/v2.1/pro/image-to-video":
    "*prompt,*image_url,negative_prompt,tail_image_url,cfg_scale:n,duration[5,10]",
  "fal-ai/kling-video/v2.1/standard/image-to-video":
    "*prompt,*image_url,negative_prompt,cfg_scale:n,duration[5,10]",
  "fal-ai/kling-video/v2.5-turbo/pro/image-to-video":
    "*prompt,*image_url,negative_prompt,tail_image_url,cfg_scale:n,duration[5,10]",
  "fal-ai/kling-video/v2.5-turbo/pro/text-to-video":
    "*prompt,negative_prompt,aspect_ratio[16:9,9:16,1:1],cfg_scale:n,duration[5,10]",
  "fal-ai/kling-video/v2.5-turbo/standard/image-to-video":
    "*prompt,*image_url,negative_prompt,cfg_scale:n,duration[5,10]",
  "fal-ai/kling-video/v2.6/pro/image-to-video":
    "*prompt,*start_image_url,negative_prompt,end_image_url,duration[5,10],generate_audio:b,voice_ids:a",
  "fal-ai/kling-video/v2.6/pro/motion-control":
    "*image_url,*video_url,*character_orientation[image,video],prompt,keep_original_sound:b",
  "fal-ai/kling-video/v2.6/pro/text-to-video":
    "*prompt,negative_prompt,aspect_ratio[16:9,9:16,1:1],cfg_scale:n,duration[5,10],generate_audio:b",
  "fal-ai/kling-video/v2.6/standard/motion-control":
    "*image_url,*video_url,*character_orientation[image,video],prompt,keep_original_sound:b",
  "fal-ai/kling-video/v2/master/image-to-video":
    "*prompt,*image_url,negative_prompt,cfg_scale:n,duration[5,10]",
  "fal-ai/kling-video/v2/master/text-to-video":
    "*prompt,negative_prompt,aspect_ratio[16:9,9:16,1:1],cfg_scale:n,duration[5,10]",
  "fal-ai/kling-video/v3/pro/image-to-video":
    "*start_image_url,prompt,negative_prompt,end_image_url,cfg_scale:n,duration[3,4,5,6,7,8,9,10,11,12,13,14,15],elements:a,generate_audio:b,multi_prompt:a,shot_type[customize,intelligent]",
  "fal-ai/kling-video/v3/pro/motion-control":
    "*image_url,*video_url,*character_orientation[image,video],prompt,elements:a,keep_original_sound:b",
  "fal-ai/kling-video/v3/pro/text-to-video":
    "prompt,negative_prompt,aspect_ratio[16:9,9:16,1:1],cfg_scale:n,duration[3,4,5,6,7,8,9,10,11,12,13,14,15],generate_audio:b,multi_prompt:a,shot_type[customize,intelligent]",
  "fal-ai/kling-video/v3/standard/image-to-video":
    "*start_image_url,prompt,negative_prompt,end_image_url,cfg_scale:n,duration[3,4,5,6,7,8,9,10,11,12,13,14,15],elements:a,generate_audio:b,multi_prompt:a,shot_type[customize,intelligent]",
  "fal-ai/kling-video/v3/standard/motion-control":
    "*image_url,*video_url,*character_orientation[image,video],prompt,elements:a,keep_original_sound:b",
  "fal-ai/kling-video/v3/standard/text-to-video":
    "prompt,negative_prompt,aspect_ratio[16:9,9:16,1:1],cfg_scale:n,duration[3,4,5,6,7,8,9,10,11,12,13,14,15],generate_audio:b,multi_prompt:a,shot_type[customize,intelligent]",
  "fal-ai/kling-video/v3/turbo/pro/image-to-video":
    "*image_url,prompt,duration[3,4,5,6,7,8,9,10,11,12,13,14,15],multi_prompt:a",
  "fal-ai/kling-video/v3/turbo/pro/text-to-video":
    "prompt,aspect_ratio[16:9,9:16,1:1],duration[3,4,5,6,7,8,9,10,11,12,13,14,15],multi_prompt:a",
  "fal-ai/kling-video/v3/turbo/standard/image-to-video":
    "*image_url,prompt,duration[3,4,5,6,7,8,9,10,11,12,13,14,15],multi_prompt:a",
  "fal-ai/kling-video/v3/turbo/standard/text-to-video":
    "prompt,aspect_ratio[16:9,9:16,1:1],duration[3,4,5,6,7,8,9,10,11,12,13,14,15],multi_prompt:a",
  "fal-ai/seedvr/upscale/video":
    "*video_url,noise_scale:n,output_format[X264 (.mp4),VP9 (.webm),PRORES4444 (.mov),GIF (.gif)],output_quality[low,medium,high,maximum],output_write_mode[fast,balanced,small],seed:i,sync_mode:b,target_resolution[720p,1080p,1440p,2160p],upscale_factor:n,upscale_mode[target,factor]",
  "fal-ai/sora-2/characters":
    "*video_url,*name",
  "fal-ai/sora-2/image-to-video":
    "*prompt,*image_url,aspect_ratio[auto,9:16,16:9],character_ids:a,delete_video:b,detect_and_block_ip:b,duration:i[4,8,12,16,20],model[sora-2,sora-2-2025-12-08,sora-2-2025-10-06],resolution[auto,720p]",
  "fal-ai/sora-2/image-to-video/pro":
    "*prompt,*image_url,aspect_ratio[auto,9:16,16:9],character_ids:a,delete_video:b,detect_and_block_ip:b,duration:i[4,8,12,16,20],resolution[auto,720p,1080p,true_1080p]",
  "fal-ai/sora-2/text-to-video":
    "*prompt,aspect_ratio[9:16,16:9],character_ids:a,delete_video:b,detect_and_block_ip:b,duration:i[4,8,12,16,20],model[sora-2,sora-2-2025-12-08,sora-2-2025-10-06],resolution",
  "fal-ai/sora-2/text-to-video/pro":
    "*prompt,aspect_ratio[9:16,16:9],character_ids:a,delete_video:b,detect_and_block_ip:b,duration:i[4,8,12,16,20],resolution[720p,1080p,true_1080p]",
  "fal-ai/sora-2/video-to-video/remix":
    "*prompt,*video_id,delete_video:b",
  "fal-ai/topaz/upscale/video":
    "*video_url,H264_output:b,compression:n,grain:n,halo:n,model[Proteus,Artemis HQ,Artemis MQ,Artemis LQ,Gaia HQ,Gaia CG,Gaia 2,Nyx,Nyx Fast,Nyx XL,Nyx HF,Starlight Precise 2.5,Starlight HQ,Starlight Mini,Starlight Sharp,Starlight Fast 2,Starlight Precise 1,Starlight Precise 2,Starlight Fast 1],noise:n,recover_detail:n,target_fps:i,upscale_factor:n",
  "fal-ai/veo3.1":
    "*prompt,negative_prompt,aspect_ratio[16:9,9:16],auto_fix:b,duration[4s,6s,8s],generate_audio:b,resolution[720p,1080p,4k],safety_tolerance[1,2,3,4,5,6],seed:i",
  "fal-ai/veo3.1/extend-video":
    "*prompt,*video_url,negative_prompt,aspect_ratio[auto,16:9,9:16],auto_fix:b,duration,generate_audio:b,resolution,safety_tolerance[1,2,3,4,5,6],seed:i",
  "fal-ai/veo3.1/fast":
    "*prompt,negative_prompt,aspect_ratio[16:9,9:16],auto_fix:b,duration[4s,6s,8s],generate_audio:b,resolution[720p,1080p,4k],safety_tolerance[1,2,3,4,5,6],seed:i",
  "fal-ai/veo3.1/fast/extend-video":
    "*prompt,*video_url,negative_prompt,aspect_ratio[auto,16:9,9:16],auto_fix:b,duration,generate_audio:b,resolution,safety_tolerance[1,2,3,4,5,6],seed:i",
  "fal-ai/veo3.1/fast/first-last-frame-to-video":
    "*prompt,*first_frame_url,*last_frame_url,negative_prompt,aspect_ratio[auto,16:9,9:16],auto_fix:b,duration[4s,6s,8s],generate_audio:b,resolution[720p,1080p,4k],safety_tolerance[1,2,3,4,5,6],seed:i",
  "fal-ai/veo3.1/fast/image-to-video":
    "*prompt,*image_url,negative_prompt,aspect_ratio[auto,16:9,9:16],auto_fix:b,duration[4s,6s,8s],generate_audio:b,resolution[720p,1080p,4k],safety_tolerance[1,2,3,4,5,6],seed:i",
  "fal-ai/veo3.1/first-last-frame-to-video":
    "*prompt,*first_frame_url,*last_frame_url,negative_prompt,aspect_ratio[auto,16:9,9:16],auto_fix:b,duration[4s,6s,8s],generate_audio:b,resolution[720p,1080p,4k],safety_tolerance[1,2,3,4,5,6],seed:i",
  "fal-ai/veo3.1/image-to-video":
    "*prompt,*image_url,negative_prompt,aspect_ratio[auto,16:9,9:16],auto_fix:b,duration[4s,6s,8s],generate_audio:b,resolution[720p,1080p,4k],safety_tolerance[1,2,3,4,5,6],seed:i",
  "fal-ai/veo3.1/lite":
    "*prompt,negative_prompt,aspect_ratio[16:9,9:16],auto_fix:b,duration[4s,6s,8s],generate_audio:b,resolution[720p,1080p],safety_tolerance[1,2,3,4,5,6],seed:i",
  "fal-ai/veo3.1/lite/first-last-frame-to-video":
    "*prompt,*first_frame_url,*last_frame_url,negative_prompt,aspect_ratio[auto,16:9,9:16],auto_fix:b,duration,generate_audio:b,resolution[720p,1080p],safety_tolerance[1,2,3,4,5,6],seed:i",
  "fal-ai/veo3.1/lite/image-to-video":
    "*prompt,*image_url,negative_prompt,aspect_ratio[auto,16:9,9:16],auto_fix:b,duration[4s,6s,8s],generate_audio:b,resolution[720p,1080p],safety_tolerance[1,2,3,4,5,6],seed:i",
  "fal-ai/veo3.1/reference-to-video":
    "*prompt,*image_urls:a,aspect_ratio[16:9,9:16],auto_fix:b,duration,generate_audio:b,resolution[720p,1080p,4k],safety_tolerance[1,2,3,4,5,6]",
  "topaz/upscale/video/generative":
    "*video_url,H264_output:b,model[Starlight Precise 2.6,Starlight HQ,Starlight Mini,Starlight Sharp,Starlight Fast 2],softness:n,target_fps:i,upscale_factor:n",
  "topaz/upscale/video/precision":
    "*video_url,H264_output:b,compression:n,grain:n,halo:n,model[Proteus,Proteus Natural,Iris,Iris Low Quality,Dione DV,Dione TV,Dione Robust,Dione Dehalo,Dione Robust Dehalo,Artemis High Quality,Artemis Medium Quality,Artemis Low Quality,Artemis Strong Halo,Artemis Medium Halo,Artemis Aliasing & Moire,Gaia HQ,Gaia CG,Gaia 2,Rhea,Theia Fine Tune Detail,Theia Fine Tune Fidelity],noise:n,recover_detail:n,target_fps:i,upscale_factor:n",
  "xai/grok-imagine-video/edit-video":
    "*prompt,*video_url,resolution[auto,480p,720p]",
  "xai/grok-imagine-video/extend-video":
    "*prompt,*video_url,duration:i",
  "xai/grok-imagine-video/image-to-video":
    "*prompt,*image_url,aspect_ratio[auto,16:9,4:3,3:2,1:1,2:3,3:4,9:16],duration:i,resolution[480p,720p]",
  "xai/grok-imagine-video/reference-to-video":
    "*prompt,*reference_image_urls:a,aspect_ratio[16:9,4:3,3:2,1:1,2:3,3:4,9:16],duration:i,resolution[480p,720p]",
  "xai/grok-imagine-video/text-to-video":
    "*prompt,aspect_ratio[16:9,4:3,3:2,1:1,2:3,3:4,9:16],duration:i,resolution[480p,720p]",
  "xai/grok-imagine-video/v1.5/image-to-video":
    "*prompt,*image_url,duration:i,resolution[480p,720p,1080p]",
  "xai/grok-imagine-video/v1.5/text-to-video":
    "*prompt,aspect_ratio[16:9,4:3,3:2,1:1,2:3,3:4,9:16],duration:i,resolution[480p,720p,1080p]",
};

// ── spec parsing ────────────────────────────────────────────────────────────
// One SPECS string per endpoint is parsed once into a field table. Everything
// downstream reads this table, so nothing else needs to know about the syntax.

const TYPE_CODES = { b: "boolean", i: "integer", n: "number", a: "array", o: "object" };

function parseSpec(spec) {
  const fields = new Map();
  const required = [];
  // Split on commas that are NOT inside an enum bracket.
  let depth = 0;
  let token = "";
  const tokens = [];
  for (const ch of spec) {
    if (ch === "[") depth++;
    else if (ch === "]") depth--;
    if (ch === "," && depth === 0) {
      tokens.push(token);
      token = "";
      continue;
    }
    token += ch;
  }
  if (token) tokens.push(token);

  for (const raw of tokens) {
    const entry = raw.trim();
    if (!entry) continue;
    const isRequired = entry.startsWith("*");
    let rest = isRequired ? entry.slice(1) : entry;
    let values = null;
    const open = rest.indexOf("[");
    if (open !== -1 && rest.endsWith("]")) {
      values = rest.slice(open + 1, -1).split(",").map((v) => v.trim()).filter(Boolean);
      rest = rest.slice(0, open);
    }
    const [name, code] = rest.split(":");
    if (!name) continue;
    fields.set(name, { name, type: TYPE_CODES[code] || "string", values, required: isRequired });
    if (isRequired) required.push(name);
  }
  return { fields, required };
}

const SPEC_CACHE = new Map();

/** Field table for an endpoint id, or null when the endpoint is unknown. */
export function resolveSpec(model) {
  const id = normalizeModelId(model);
  if (!id) return null;
  if (SPEC_CACHE.has(id)) return SPEC_CACHE.get(id);
  const raw = SPECS[id];
  const parsed = raw ? { id, ...parseSpec(raw) } : null;
  SPEC_CACHE.set(id, parsed);
  return parsed;
}

/**
 * fal endpoint ids are paths (`fal-ai/veo3.1/fast`), and callers reach them
 * through `fal/<endpoint id>`, so the provider prefix may or may not have been
 * stripped by the time the model gets here. Both spellings resolve, and a
 * family shorthand that omits fal's owner segment (`veo3.1` for
 * `fal-ai/veo3.1`) resolves too, since that is how the ids read in the docs.
 */
export function normalizeModelId(model) {
  let id = String(model || "").trim().replace(/^\/+|\/+$/g, "");
  if (!id) return "";
  if (SPECS[id]) return id;
  const stripped = id.replace(/^(fal-ai|fal)\//, "");
  if (SPECS[stripped]) return stripped;
  for (const owner of ["fal-ai/", "bytedance/", "bria/", "topaz/", "xai/"]) {
    if (SPECS[owner + stripped]) return owner + stripped;
  }
  return id;
}

// ── client field → endpoint field ───────────────────────────────────────────
// 9router publishes ONE video request body for every provider, so the generic
// names it documents (`image`, `last_frame`, `video`, `reference_images`,
// `ratio`, `audio`, …) have to land on whatever this endpoint calls the same
// thing. Each entry lists the body keys an endpoint field will accept, in
// priority order; a field absent from this map only accepts its own name, which
// is what makes the long tail (cfg_scale, effect_scene, style, upscale_factor,
// …) work with no per-field code.
const FIELD_SOURCES = {
  image_url: ["image_url", "image", "first_frame", "first_frame_url", "start_image_url"],
  start_image_url: ["start_image_url", "image_url", "image", "first_frame", "first_frame_url"],
  first_frame_url: ["first_frame_url", "first_frame", "image_url", "image"],
  end_image_url: ["end_image_url", "end_image", "last_frame", "last_frame_url", "tail_image_url"],
  last_frame_url: ["last_frame_url", "last_frame", "end_image_url", "end_image"],
  tail_image_url: ["tail_image_url", "last_frame", "last_frame_url", "end_image_url", "end_image"],
  video_url: ["video_url", "video"],
  audio_url: ["audio_url", "audio_file", "driving_audio"],
  mask_url: ["mask_url", "mask_image", "mask"],
  static_mask_url: ["static_mask_url", "mask_image", "mask_url", "mask"],
  image_urls: ["image_urls", "reference_images", "reference_image_urls", "images"],
  reference_image_urls: ["reference_image_urls", "reference_images", "image_urls", "images"],
  input_image_urls: ["input_image_urls", "reference_images", "image_urls", "images"],
  video_urls: ["video_urls", "reference_videos", "videos"],
  audio_urls: ["audio_urls", "reference_audios", "audios"],
  aspect_ratio: ["aspect_ratio", "ratio"],
  // A handful of endpoints (Topaz/BiRefNet/Sora) take a `model` input naming an
  // internal engine variant. The body's own `model` is the 9router routing id,
  // so it is never read here — the variant comes from `model_variant`.
  model: ["model_variant", "variant", "engine"],
  target_resolution: ["target_resolution", "resolution"],
  generate_audio: ["generate_audio", "audio"],
  keep_audio: ["keep_audio", "keep_original_sound"],
  keep_original_sound: ["keep_original_sound", "keep_audio"],
  preserve_audio: ["preserve_audio", "keep_audio", "keep_original_sound"],
};

// Human wording for a missing required field, so the 400 tells the caller what
// to send rather than echoing fal's internal field name.
const HINTS = {
  prompt: "prompt",
  image_url: "'image' (source / first frame image URL)",
  start_image_url: "'image' (start frame image URL)",
  first_frame_url: "'image' (first frame image URL)",
  end_image_url: "'last_frame' (end frame image URL)",
  last_frame_url: "'last_frame' (last frame image URL)",
  video_url: "'video' (source video URL)",
  audio_url: "'audio_url' (driving audio URL)",
  image_urls: "'reference_images' (one or more image URLs)",
  reference_image_urls: "'reference_images' (one or more image URLs)",
  input_image_urls: "'reference_images' (one or more image URLs)",
  effect_scene: "'effect_scene' (effect template name)",
  style: "'style' (stylization preset)",
  video_id: "'video_id' (id of a previously generated Sora video)",
  name: "'name' (character name)",
  text: "'text' (lipsync script)",
  voice_id: "'voice_id' (lipsync voice)",
  character_orientation: "'character_orientation' ('image' or 'video')",
  model: "'model_variant' (engine variant name)",
};

// Client-facing name for an endpoint field, used to build the registry's
// per-model `params` (and therefore the dashboard's inputs). Anything not named
// here is published under its own fal name.
const PUBLIC_NAMES = {
  image_url: "image",
  start_image_url: "image",
  first_frame_url: "image",
  end_image_url: "last_frame",
  last_frame_url: "last_frame",
  tail_image_url: "last_frame",
  video_url: "video",
  image_urls: "reference_images",
  reference_image_urls: "reference_images",
  input_image_urls: "reference_images",
  mask_url: "mask_image",
  static_mask_url: "mask_image",
  generate_audio: "audio",
  aspect_ratio: "ratio",
  model: "model_variant",
};

// ── value coercion ──────────────────────────────────────────────────────────
// fal validates types strictly (422 on a string where a boolean belongs) and
// rejects any value outside a field's enum. Dashboard selects and shell callers
// both produce strings, and one 9router body is sent to models whose enums
// disagree (duration "5" vs "8s" vs 8), so every value is cast to the field's
// declared type and snapped into its enum when it has one.

function castType(type, value) {
  if (type === "boolean") {
    if (typeof value === "boolean") return value;
    const s = String(value).toLowerCase();
    if (s === "true" || s === "1") return true;
    if (s === "false" || s === "0") return false;
    return undefined;
  }
  if (type === "integer") {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : undefined;
  }
  if (type === "number") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  if (type === "array") {
    if (Array.isArray(value)) {
      const items = value.filter((v) => v !== undefined && v !== null && v !== "");
      return items.length ? items : undefined;
    }
    if (value && typeof value === "object") return [value];
    const parts = String(value).split(",").map((s) => s.trim()).filter(Boolean);
    return parts.length ? parts : undefined;
  }
  if (type === "object") {
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
  return typeof value === "string" ? value : String(value);
}

/**
 * Snap a caller value onto one of the field's accepted values.
 *
 * Exact, then case-insensitive, then numeric-nearest — the last one is what lets
 * `duration: 8` satisfy Veo's `["4s","6s","8s"]`, Kling's `["5","10"]` and
 * Sora's `[4,8,12,16,20]` from the same request. A value that matches none of
 * them (`resolution: "4k"` on a 720p-only model) is dropped rather than
 * forwarded, since fal would reject the whole request for it.
 */
function snapEnum(field, value) {
  const wanted = String(value).trim();
  for (const option of field.values) {
    if (String(option) === wanted) return castType(field.type, option);
  }
  const lower = wanted.toLowerCase();
  for (const option of field.values) {
    if (String(option).toLowerCase() === lower) return castType(field.type, option);
  }
  const target = parseFloat(wanted);
  if (Number.isFinite(target)) {
    let best;
    let bestDelta = Infinity;
    for (const option of field.values) {
      const n = parseFloat(String(option));
      if (!Number.isFinite(n)) continue;
      const delta = Math.abs(n - target);
      if (delta < bestDelta) {
        best = option;
        bestDelta = delta;
      }
    }
    if (best !== undefined) return castType(field.type, best);
  }
  return undefined;
}

function coerceField(field, value) {
  if (field.values && field.type !== "array" && field.type !== "object") return snapEnum(field, value);
  return castType(field.type, value);
}

// Values for fields fal marks required but a prompt-only caller cannot know.
// Anything not defaulted here and genuinely missing gets a local 400.
const DEFAULTS = {
  character_orientation: "image",
};

// Geometry: a caller may send `size` ("1280x720") where the endpoint wants a
// resolution tier plus an aspect ratio, so a pixel size is translated instead of
// dropped. Pixel counts, not names, decide the tier.
const TIER_PIXELS = [
  ["480p", 832 * 480],
  ["720p", 1280 * 720],
  ["1080p", 1920 * 1080],
  ["1440p", 2560 * 1440],
  ["2160p", 3840 * 2160],
  ["4k", 3840 * 2160],
];

function parseSize(value) {
  const match = String(value || "").match(/(\d{2,5})\s*[x*×]\s*(\d{2,5})/i);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

function tierForSize(dim) {
  const pixels = dim.width * dim.height;
  let best = TIER_PIXELS[0][0];
  let bestDelta = Infinity;
  for (const [tier, area] of TIER_PIXELS) {
    const delta = Math.abs(area - pixels);
    if (delta < bestDelta) {
      best = tier;
      bestDelta = delta;
    }
  }
  return best;
}

function ratioForSize(dim) {
  const ratios = [
    ["21:9", 21 / 9], ["16:9", 16 / 9], ["3:2", 3 / 2], ["4:3", 4 / 3], ["1:1", 1],
    ["3:4", 3 / 4], ["2:3", 2 / 3], ["9:16", 9 / 16], ["9:21", 9 / 21],
  ];
  const actual = dim.width / dim.height;
  let best = "16:9";
  let bestDelta = Infinity;
  for (const [name, value] of ratios) {
    const delta = Math.abs(value - actual);
    if (delta < bestDelta) {
      best = name;
      bestDelta = delta;
    }
  }
  return best;
}

/**
 * Extra body keys derived from `size`, so the one common request works against
 * models that only speak in tiers and ratios. Never overrides what the caller
 * sent explicitly.
 */
function derivedGeometry(body) {
  const dim = parseSize(body?.size);
  if (!dim) return {};
  const derived = {};
  if (body?.resolution === undefined || body.resolution === "") derived.resolution = tierForSize(dim);
  if (body?.ratio === undefined || body.ratio === "") derived.ratio = ratioForSize(dim);
  if (body?.aspect_ratio === undefined || body.aspect_ratio === "") derived.aspect_ratio = derived.ratio || ratioForSize(dim);
  return derived;
}

// ── request construction ────────────────────────────────────────────────────

// Body keys that are 9router routing/geometry metadata, never fal input.
const NON_INPUT_KEYS = new Set(["model", "size", "n", "response_format", "stream", "user"]);

/**
 * Build the fal input body for any endpoint.
 *
 * Every accepted field is filled from the first body key that supplies it, cast
 * to its declared type, and snapped into its enum; nothing else is forwarded.
 * That is the whole "one body, all models" contract — `cfg_scale` sent to a Veo
 * model is dropped, sent to a Kling model it is honored, and neither request
 * needed code here to say so.
 */
export function buildCreateBody(model, body) {
  const spec = resolveSpec(model);
  if (!spec) throw new Error(`fal video: unknown model '${model}'`);

  const derived = derivedGeometry(body);
  const read = (key) => {
    const value = body?.[key] !== undefined ? body[key] : derived[key];
    return value === undefined || value === null || value === "" ? undefined : value;
  };

  const input = {};
  for (const field of spec.fields.values()) {
    const sources = FIELD_SOURCES[field.name] || [field.name];
    let coerced;
    for (const source of sources) {
      if (NON_INPUT_KEYS.has(source)) continue;
      const value = read(source);
      if (value === undefined) continue;
      coerced = coerceField(field, value);
      if (coerced !== undefined) break;
    }
    if (coerced === undefined && DEFAULTS[field.name] !== undefined && field.required) {
      coerced = coerceField(field, DEFAULTS[field.name]);
    }
    if (coerced !== undefined) input[field.name] = coerced;
  }

  const missing = spec.required.filter((name) => input[name] === undefined);
  if (missing.length) {
    const label = missing.map((name) => HINTS[name] || `'${name}'`).join(", ");
    throw new Error(`fal video: ${spec.id} requires ${label}`);
  }

  return input;
}

// ── request id ──────────────────────────────────────────────────────────────
// fal's status and result URLs both need the ENDPOINT id in the path, but the
// core hands the adapter only the id it returned from create (and clients poll
// GET /v1/videos/{id} with nothing else). So the endpoint travels inside the id
// and is split back out when polling.
//
// The id has to survive as ONE path segment, because that is what
// /v1/videos/{id} matches — and fal endpoint ids are paths ("fal-ai/veo3.1"). So
// their slashes are carried as ":" and restored on the way back. Neither ":" nor
// "~" occurs in a fal endpoint id (they are [a-z0-9/.-]) or in its UUID request
// ids, which makes both substitutions reversible.
const ID_SEPARATOR = "~";
const PATH_SEPARATOR = ":";

function encodeRequestId(endpointId, requestId) {
  return `${endpointId.split("/").join(PATH_SEPARATOR)}${ID_SEPARATOR}${requestId}`;
}

function decodeRequestId(value) {
  const raw = String(value || "");
  const index = raw.lastIndexOf(ID_SEPARATOR);
  if (index === -1) return { endpointId: null, requestId: raw };
  return {
    endpointId: raw.slice(0, index).split(PATH_SEPARATOR).join("/"),
    requestId: raw.slice(index + 1),
  };
}

// ── introspection ───────────────────────────────────────────────────────────

/**
 * Every request field this model accepts, in one flat list.
 *
 * The provider registry stores this per model so the dashboard can gate its
 * inputs, and generating it from the same SPECS table the request builder reads
 * is what keeps the two from drifting apart. Fields are published under their
 * generic 9router names where one exists (`image`, `last_frame`, `video`,
 * `reference_images`, `ratio`, `audio`), because those are the names the shared
 * video request documents.
 */
export function modelFields(model) {
  const spec = resolveSpec(model);
  if (!spec) return ["prompt"];
  const fields = [];
  const add = (key) => {
    if (key && !fields.includes(key)) fields.push(key);
  };
  if (spec.fields.has("prompt")) add("prompt");
  for (const field of spec.fields.values()) {
    if (field.name === "prompt") continue;
    add(PUBLIC_NAMES[field.name] || field.name);
  }
  // `size` is accepted everywhere a tier or ratio is, and translated on the way
  // out, so it is offered whenever either of those exists.
  if (spec.fields.has("resolution") || spec.fields.has("aspect_ratio") || spec.fields.has("target_resolution")) add("size");
  return fields;
}

// ── response normalization ──────────────────────────────────────────────────

// fal queue states -> the status vocabulary /v1/videos already publishes, so a
// client polls one contract no matter which provider rendered the video.
const STATUS_MAP = {
  IN_QUEUE: "pending",
  IN_PROGRESS: "processing",
  COMPLETED: "done",
};

/**
 * The finished video's URL.
 *
 * Nearly every fal video endpoint answers `{ video: File }`; the upscalers and
 * BiRefNet return the same File under a different key, and Sora's remix returns
 * only ids. Each candidate is a plain object with a `url`, so one ordered lookup
 * covers the whole catalogue.
 */
function extractFile(output) {
  for (const key of ["video", "output_video", "result_video", "video_file", "upscaled_video"]) {
    const candidate = output?.[key];
    if (typeof candidate?.url === "string" && candidate.url) return candidate;
    if (typeof candidate === "string" && /^https?:\/\//.test(candidate)) return { url: candidate };
  }
  return null;
}

/** Fields worth passing through beyond the video itself (Sora ids, masks, seed). */
function extraOutput(output) {
  const extras = {};
  for (const key of ["seed", "video_id", "thumbnail", "spritesheet", "mask_video", "id", "name"]) {
    if (output?.[key] !== undefined) extras[key] = output[key];
  }
  return extras;
}

/** Create response -> `{ request_id }`, with the endpoint id carried along. */
export function normalizeCreate(payload, model) {
  const requestId = payload?.request_id;
  if (!requestId) {
    const detail = payload?.detail || payload?.error || payload?.message || "no request_id returned";
    throw new Error(`fal video: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
  const endpointId = normalizeModelId(model);
  const id = endpointId ? encodeRequestId(endpointId, requestId) : requestId;
  return {
    request_id: id,
    id,
    status: STATUS_MAP[payload?.status] || "pending",
    ...(payload?.queue_position !== undefined ? { queue_position: payload.queue_position } : {}),
  };
}

/**
 * Queue status (and, once COMPLETED, the model output merged in) -> the poll
 * shape clients already expect from /v1/videos.
 *
 * A COMPLETED request that failed carries `error`/`error_type` instead of an
 * output, so "completed" alone does not mean success — a status with no video
 * and no error stays `processing`, which keeps the await loop waiting rather
 * than answering with an empty result.
 */
export function normalizePoll(payload, { requestId = null, output = null } = {}) {
  const id = requestId || payload?.request_id || null;
  const state = STATUS_MAP[payload?.status] || "processing";
  const failed = !!(payload?.error || payload?.error_type);
  const file = extractFile(output || payload);

  const normalized = {
    id,
    request_id: id,
    status: failed ? "failed" : file ? "done" : state === "done" ? "processing" : state,
    ...(payload?.queue_position !== undefined ? { queue_position: payload.queue_position } : {}),
  };

  if (file) {
    const duration = Number(file.duration ?? (output || payload)?.duration);
    normalized.video = {
      url: file.url,
      ...(Number.isFinite(duration) ? { duration } : {}),
      ...(file.content_type ? { content_type: file.content_type } : {}),
      ...(file.width ? { width: file.width } : {}),
      ...(file.height ? { height: file.height } : {}),
      ...(file.fps ? { fps: file.fps } : {}),
    };
  }
  if (failed) {
    const message = payload.error;
    normalized.error = {
      code: payload.error_type || "request_failed",
      message: typeof message === "string" && message ? message : `fal request ${payload?.status || "failed"}`,
    };
  }
  const extras = extraOutput(output || payload);
  if (Object.keys(extras).length) Object.assign(normalized, extras);
  if (payload?.metrics) normalized.usage = payload.metrics;

  return normalized;
}

// The endpoint id is recoverable from the create response itself: fal returns
// absolute status/response URLs of the form
// `https://queue.fal.run/{endpoint_id}/requests/{id}/status`. Reading it back
// from there means creation needs nothing threaded through from the request.
function endpointFromUrls(payload) {
  for (const key of ["status_url", "response_url", "cancel_url"]) {
    const value = payload?.[key];
    if (typeof value !== "string") continue;
    const match = value.match(/^https?:\/\/[^/]+\/(.+?)\/requests\//);
    if (match) return match[1];
  }
  return null;
}

// ── URLs ────────────────────────────────────────────────────────────────────

function statusUrl(endpointId, requestId) {
  return `${API_ROOT}/${endpointId}/requests/${encodeURIComponent(requestId)}/status`;
}

function resultUrl(endpointId, requestId) {
  return `${API_ROOT}/${endpointId}/requests/${encodeURIComponent(requestId)}`;
}

// ── adapter ─────────────────────────────────────────────────────────────────

function authHeaders(credentials) {
  const headers = { Accept: "application/json" };
  const key = credentials?.apiKey || credentials?.accessToken;
  // fal authenticates with `Key <token>`, NOT `Bearer` — a Bearer header is
  // rejected as unauthenticated.
  if (key) headers.Authorization = `Key ${key}`;
  return headers;
}

export default {
  /** Creation posts straight to the endpoint id: POST /{endpoint_id}. */
  createUrl: (model) => {
    const spec = resolveSpec(model);
    if (!spec) throw new Error(`fal video: unknown model '${model}'`);
    return `${API_ROOT}/${spec.id}`;
  },

  /**
   * Polling targets the status endpoint, which answers for a queued, running or
   * finished request alike. The endpoint id needed for the path travels inside
   * the request id (see encodeRequestId); an id without one is polled against
   * the model it names, which cannot happen for ids this adapter minted.
   */
  pollUrl: (taskId) => {
    const { endpointId, requestId } = decodeRequestId(taskId);
    if (!endpointId) throw new Error(`fal video: request id is missing its endpoint (${taskId})`);
    return `${statusUrl(endpointId, requestId)}?logs=0`;
  },

  buildHeaders: (credentials, { create = false } = {}) => {
    const headers = authHeaders(credentials);
    if (create) headers["Content-Type"] = "application/json";
    return headers;
  },

  buildBody: (model, body) => buildCreateBody(model, body),

  /**
   * The endpoint id is read back out of the create response's own URLs, so the
   * id handed to the client is self-describing and its later polls need no
   * extra header to find their way home.
   */
  normalizeCreate: (payload) => normalizeCreate(payload, endpointFromUrls(payload)),

  /**
   * A fal status carries no output, so a COMPLETED request needs one more GET
   * against the result URL — that is the queue protocol, and it is why this
   * normalizer is async and takes the poll context. Until then the status alone
   * is enough to report pending/processing/failed.
   */
  normalizePoll: async (payload, { credentials, requestId, signal } = {}) => {
    const { endpointId, requestId: falId } = decodeRequestId(requestId || payload?.request_id);
    const publicId = requestId || (endpointId ? encodeRequestId(endpointId, falId) : falId);
    if (payload?.status !== "COMPLETED" || payload?.error || payload?.error_type || !endpointId) {
      return normalizePoll(payload, { requestId: publicId });
    }
    let output = null;
    try {
      const res = await fetch(resultUrl(endpointId, falId), { headers: authHeaders(credentials), signal });
      if (res.ok) output = await res.json();
    } catch {
      // Leave output null: the poll then reports "processing" and the next one
      // retries, rather than failing a job that upstream says succeeded.
    }
    return normalizePoll(payload, { requestId: publicId, output });
  },

  /**
   * fal's queue is async-only, so creation returns an id and nothing else.
   * Rather than make every caller implement a polling loop, the core waits the
   * render out and answers the create request with the finished video; if the
   * render outlives that wait, the response still carries the request id and
   * GET /v1/videos/{id} finishes the job.
   */
  awaitCompletion: true,

  // Renders run from seconds (upscalers) to minutes (Veo/Sora), and status is a
  // cheap call, so poll often enough that short jobs answer quickly.
  pollIntervalMs: 4000,

  /** Every request field this model accepts, for the registry's per-model params. */
  modelFields,
};
