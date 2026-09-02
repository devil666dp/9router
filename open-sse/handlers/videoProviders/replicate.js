// Replicate video generation (https://api.replicate.com/v1).
//
// Replicate hosts every video family behind ONE prediction API, and only the
// input schema varies, so this adapter carries no per-model code: `SPECS` is a
// table of every model's accepted fields and everything else derives from it —
// which fields are forwarded, how loose values snap into enums, which media a
// model requires, the local 400 wording when it is missing, and the registry
// `params` the dashboard renders. Adding a model, or a field on one, is one line.
//
// See ../replicate/spec.js for the spec syntax and shared machinery, and
// ../replicate/api.js for the protocol.
//
// The client-facing contract stays the ONE video body every 9router video model
// takes: `prompt` plus optional fields. Generic aliases (`image`, `last_frame`,
// `video`, `reference_images`, `ratio`, `audio`, `duration`, `resolution`, …) are
// resolved to whatever THIS model happens to call them, loose values are snapped
// into its enums, and anything it does not accept is dropped rather than
// forwarded — Replicate 422s on unknown input keys.
import {
  createUrl, createBody, pollUrl, buildHeaders,
  mapStatus, outputUrls, predictionError,
} from "../replicate/api.js";
import { createCatalog, parseSize, tierForSize, ratioForSize, pinnedId } from "../replicate/spec.js";

// ── model input schemas (from each model's Replicate API reference) ──────────
// "owner/name": [display name, spec]
export const SPECS = {
  // alibaba
  "alibaba/happyhorse-1.0": ["HappyHorse 1.0",
    "prompt,image,resolution[720p,1080p],aspect_ratio[16:9,9:16,1:1,4:3,3:4],duration:i[3,4,5,6,7,8,9,10,11,12,13,14,15],seed:i"],
  "alibaba/happyhorse-1.1": ["HappyHorse 1.1",
    "prompt,images:a,resolution[720p,1080p],aspect_ratio[16:9,9:16,1:1,4:3,3:4],duration:i[3,4,5,6,7,8,9,10,11,12,13,14,15],seed:i"],
  "alibaba/wan-3": ["Wan 3.0",
    "*prompt,image,negative_prompt,resolution[480p,720p,1080p],aspect_ratio[adaptive,16:9,9:16,1:1,4:3,3:4],duration:i,enable_prompt_expansion:b,seed:i"],
  "alibaba/wan-3-prime": ["Wan 3.0 Prime",
    "*prompt,image,negative_prompt,resolution[480p,720p,1080p],aspect_ratio[adaptive,16:9,9:16,1:1,4:3,3:4],duration:i,enable_prompt_expansion:b,seed:i"],
  // arielreplicate
  "arielreplicate/robust_video_matting": ["Robust Video Matting",
    "*input_video,output_type[green-screen,alpha-mask,foreground-mask]"],
  // bytedance
  "bytedance/dreamactor-m2.0": ["DreamActor M2.0",
    "*image,*video,cut_first_second:b"],
  "bytedance/latentsync": ["LatentSync",
    "video,audio,guidance_scale:n,seed:i"],
  "bytedance/omni-human": ["OmniHuman",
    "*audio,*image"],
  "bytedance/seedance-1-lite": ["Seedance 1 Lite",
    "resolution[480p,720p,1080p],aspect_ratio[16:9,4:3,1:1,3:4,9:16,21:9,9:21],fps:i[24],camera_fixed:b,duration:i,image,last_frame_image,*prompt,reference_images:a,seed:i"],
  "bytedance/seedance-1-pro": ["Seedance 1 Pro",
    "*prompt,image,last_frame_image,duration:i,resolution[480p,720p,1080p],aspect_ratio[16:9,4:3,1:1,3:4,9:16,21:9,9:21],fps:i[24],camera_fixed:b,seed:i"],
  "bytedance/seedance-1-pro-fast": ["Seedance 1 Pro Fast",
    "resolution[480p,720p,1080p],aspect_ratio[16:9,4:3,1:1,3:4,9:16,21:9,9:21],fps:i[24],camera_fixed:b,duration:i,image,*prompt,seed:i"],
  "bytedance/seedance-1.5-pro": ["Seedance 1.5 Pro",
    "*prompt,image,last_frame_image,duration:i,resolution[480p,720p,1080p],aspect_ratio[16:9,4:3,1:1,3:4,9:16,21:9,9:21],fps:i[24],camera_fixed:b,generate_audio:b,seed:i"],
  "bytedance/seedance-2.0": ["Seedance 2.0",
    "*prompt,image,last_frame_image,reference_images:a,reference_videos:a,reference_audios:a,duration:i,resolution[480p,720p,1080p,4k],aspect_ratio[16:9,4:3,1:1,3:4,9:16,21:9,9:21,adaptive],generate_audio:b,seed:i"],
  "bytedance/seedance-2.0-fast": ["Seedance 2.0 Fast",
    "*prompt,image,last_frame_image,reference_images:a,reference_videos:a,reference_audios:a,duration:i,resolution[480p,720p],aspect_ratio[16:9,4:3,1:1,3:4,9:16,21:9,9:21,adaptive],generate_audio:b,seed:i"],
  "bytedance/seedance-2.5": ["Seedance 2.5",
    "prompt,image,last_frame_image,reference_images:a,reference_videos:a,reference_audios:a,duration:i,resolution[480p,720p],aspect_ratio[16:9,4:3,1:1,3:4,9:16,21:9,adaptive],generate_audio:b,watermark:b,output_format[mp4,mov],seed:i"],
  // cuuupid
  "cuuupid/cogvideox-5b": ["CogVideoX 5B",
    "*prompt,extend_prompt:b,steps:i,guidance:n,num_outputs:i,seed:i"],
  // fictions-ai
  "fictions-ai/autocaption": ["Autocaption",
    "*video_file_input,transcript_file_input,output_video:b,output_transcript:b,subs_position[bottom75,center,top,bottom,left,right],color,highlight_color,fontsize:n,MaxChars:i,opacity:n,font[Poppins/Poppins-Bold.ttf,Poppins/Poppins-BoldItalic.ttf,Poppins/Poppins-ExtraBold.ttf,Poppins/Poppins-ExtraBoldItalic.ttf,Poppins/Poppins-Black.ttf,Poppins/Poppins-BlackItalic.ttf,Atkinson_Hyperlegible/AtkinsonHyperlegible-Bold.ttf,Atkinson_Hyperlegible/AtkinsonHyperlegible-BoldItalic.ttf,M_PLUS_Rounded_1c/MPLUSRounded1c-ExtraBold.ttf,Arial/Arial_Bold.ttf,Arial/Arial_BoldItalic.ttf,Tajawal/Tajawal-Bold.ttf,Tajawal/Tajawal-ExtraBold.ttf,Tajawal/Tajawal-Black.ttf],stroke_color,stroke_width:n,kerning:n,right_to_left:b,translate:b"],
  // genmoai
  "genmoai/mochi-1": ["Mochi 1",
    "prompt,num_frames:i,num_inference_steps:i,guidance_scale:n,fps:i,seed:i"],
  // google
  "google/veo-2": ["Veo 2",
    "prompt,image,aspect_ratio[16:9,9:16],duration:i[5,6,7,8],seed:i"],
  "google/veo-3": ["Veo 3",
    "*prompt,aspect_ratio[16:9,9:16],duration:i[4,6,8],image,negative_prompt,resolution[720p,1080p],generate_audio:b,seed:i"],
  "google/veo-3-fast": ["Veo 3 Fast",
    "*prompt,aspect_ratio[16:9,9:16],duration:i[4,6,8],image,negative_prompt,resolution[720p,1080p],generate_audio:b,seed:i"],
  "google/veo-3.1": ["Veo 3.1",
    "*prompt,aspect_ratio[16:9,9:16],duration:i[4,6,8],image,last_frame,reference_images:a,negative_prompt,resolution[720p,1080p],generate_audio:b,seed:i"],
  "google/veo-3.1-fast": ["Veo 3.1 Fast",
    "*prompt,aspect_ratio[16:9,9:16],duration:i[4,6,8],image,last_frame,negative_prompt,resolution[720p,1080p],generate_audio:b,seed:i"],
  "google/veo-3.1-lite": ["Veo 3.1 Lite",
    "*prompt,image,last_frame,aspect_ratio[16:9,9:16],duration:i[4,6,8],resolution[720p,1080p],seed:i"],
  // heygen
  "heygen/lipsync-precision": ["HeyGen Lipsync Precision",
    "*video,*audio,enable_dynamic_duration:b,disable_music_track:b,enable_speech_enhancement:b"],
  "heygen/lipsync-speed": ["HeyGen Lipsync Speed",
    "*video,*audio,enable_dynamic_duration:b,disable_music_track:b,enable_speech_enhancement:b"],
  // kwaivgi
  "kwaivgi/kling-lip-sync": ["Kling Lip Sync",
    "voice_id[en_AOT,en_oversea_male1,en_girlfriend_4_speech02,en_chat_0407_5-1,en_uk_boy1,en_PeppaPig_platform,en_ai_huangzhong_712,en_calm_story1,en_uk_man2,en_reader_en_m-v1,en_commercial_lady_en_f-v1,zh_genshin_vindi2,zh_zhinen_xuesheng,zh_tiyuxi_xuedi,zh_ai_shatang,zh_genshin_klee2,zh_genshin_kirara,zh_ai_kaiya,zh_tiexin_nanyou,zh_ai_chenjiahao_712,zh_girlfriend_1_speech02,zh_chat1_female_new-3,zh_girlfriend_2_speech02,zh_cartoon-boy-07,zh_cartoon-girl-01,zh_ai_huangyaoshi_712,zh_you_pingjing,zh_ai_laoguowang_712,zh_chengshu_jiejie,zh_zhuxi_speech02,zh_uk_oldman3,zh_laopopo_speech02,zh_heainainai_speech02,zh_dongbeilaotie_speech02,zh_chongqingxiaohuo_speech02,zh_chuanmeizi_speech02,zh_chaoshandashu_speech02,zh_ai_taiwan_man2_speech02,zh_xianzhanggui_speech02,zh_tianjinjiejie_speech02,zh_diyinnansang_DB_CN_M_04-v2,zh_yizhipiannan-v1,zh_guanxiaofang-v2,zh_tianmeixuemei-v1,zh_daopianyansang-v1,zh_mengwa-v1],audio_file,text,video_id,video_url,voice_speed:n"],
  "kwaivgi/kling-o1": ["Kling O1",
    "*prompt,start_image,end_image,reference_images:a,reference_video,video_reference_type[feature,base],keep_original_sound:b,mode[std,pro],aspect_ratio[16:9,9:16,1:1],duration:i[3,4,5,6,7,8,9,10]"],
  "kwaivgi/kling-v1.6-pro": ["Kling v1.6 Pro",
    "aspect_ratio[16:9,9:16,1:1],duration:i[5,10],cfg_scale:n,end_image,negative_prompt,*prompt,reference_images:a,start_image"],
  "kwaivgi/kling-v1.6-standard": ["Kling v1.6 Standard",
    "aspect_ratio[16:9,9:16,1:1],duration:i[5,10],cfg_scale:n,negative_prompt,*prompt,reference_images:a,start_image"],
  "kwaivgi/kling-v2.0": ["Kling v2.0",
    "aspect_ratio[16:9,9:16,1:1],duration:i[5,10],cfg_scale:n,negative_prompt,*prompt,start_image"],
  "kwaivgi/kling-v2.1": ["Kling v2.1",
    "mode[standard,pro],duration:i[5,10],end_image,negative_prompt,*prompt,*start_image"],
  "kwaivgi/kling-v2.1-master": ["Kling v2.1 Master",
    "aspect_ratio[16:9,9:16,1:1],duration:i[5,10],negative_prompt,*prompt,start_image"],
  "kwaivgi/kling-v2.5-turbo-pro": ["Kling v2.5 Turbo Pro",
    "*prompt,negative_prompt,start_image,end_image,aspect_ratio[16:9,9:16,1:1],duration:i[5,10],guidance_scale:n"],
  "kwaivgi/kling-v2.6": ["Kling v2.6",
    "*prompt,negative_prompt,start_image,aspect_ratio[16:9,9:16,1:1],duration:i[5,10],generate_audio:b"],
  "kwaivgi/kling-v3-omni-video": ["Kling v3 Omni Video",
    "*prompt,start_image,end_image,reference_images:a,reference_video,video_reference_type[feature,base],keep_original_sound:b,generate_audio:b,mode[standard,pro,4k],aspect_ratio[16:9,9:16,1:1],duration:i,multi_prompt"],
  "kwaivgi/kling-v3-video": ["Kling v3 Video",
    "*prompt,negative_prompt,start_image,end_image,mode[standard,pro,4k],aspect_ratio[16:9,9:16,1:1],duration:i,generate_audio:b,multi_prompt"],
  // leonardoai
  "leonardoai/motion-2.0": ["Leonardo Motion 2.0",
    "aspect_ratio[9:16,16:9,2:3,4:5],vibe_style[None,clay,color_sketch,logo,papercraft,pro_photo,sci_fi,sketch,stock_footage,streetshot],lighting_style[None,backlight,candle_lit,chiaroscuro,film_haze,foggy,golden_hour,hardlight,lens_flare,light_art,low_key,luminous,mystical,rainy,soft_light,volumetric],shot_type_style[None,bokeh,cinematic,close_up,overhead,spiritual,spooky],color_theme_style[None,autumn,complimentary,cool,dark,earthy,electric,iridescent,pastel,split,terracotta_teal,ultraviolet,vibrant,warm],frame_interpolation:b,image,negative_prompt,*prompt,prompt_enhance:b"],
  // lightricks
  "lightricks/ltx-video": ["LTX Video",
    "prompt,negative_prompt,image,image_noise_scale:n,target_size:i[512,576,640,704,768,832,896,960,1024],aspect_ratio[1:1,1:2,2:1,2:3,3:2,3:4,4:3,4:5,5:4,9:16,16:9,9:21,21:9],cfg:n,steps:i,length:i[97,129,161,193,225,257],model[0.9.1,0.9],seed:i"],
  "lightricks/ltx-video-0.9.7": ["LTX Video 0.9.7",
    "*prompt,image,negative_prompt,width:i,height:i,num_frames:i,num_inference_steps:i,guidance_scale:n,fps:i,seed:i"],
  "lightricks/ltx-video-0.9.7-distilled": ["LTX Video 0.9.7 Distilled",
    "*prompt,image,video,negative_prompt,resolution:i[480,720],aspect_ratio[16:9,1:1,9:16,match_input_image],num_frames:i,num_inference_steps:i,guidance_scale:n,fps:i,seed:i,downscale_factor:n,denoise_strength:n,final_inference_steps:i,conditioning_frames:i,go_fast:b"],
  // lucataco
  "lucataco/real-esrgan-video": ["Real-ESRGAN Video",
    "*video_path,resolution[FHD,2k,4k],model[RealESRGAN_x4plus,RealESRGAN_x4plus_anime_6B,realesr-animevideov3]"],
  // luma
  "luma/modify-video": ["Luma Modify Video",
    "mode[adhere_1,adhere_2,adhere_3,flex_1,flex_2,flex_3,reimagine_1,reimagine_2,reimagine_3],first_frame,prompt,video"],
  "luma/ray-2-540p": ["Luma Ray 2 540p",
    "duration:i[5,9],aspect_ratio[1:1,3:4,4:3,9:16,16:9,9:21,21:9],concepts:a,end_image,loop:b,*prompt,start_image"],
  "luma/ray-2-720p": ["Luma Ray 2 720p",
    "duration:i[5,9],aspect_ratio[1:1,3:4,4:3,9:16,16:9,9:21,21:9],concepts:a,end_image,loop:b,*prompt,start_image"],
  "luma/ray-3.2": ["Luma Ray 3.2",
    "*prompt,aspect_ratio[9:16,3:4,1:1,4:3,16:9,21:9],resolution[540p,720p,1080p],duration:i[5,10],hdr:b,exr_export:b,loop:b,start_image,end_image"],
  "luma/ray-flash-2-540p": ["Luma Ray Flash 2 540p",
    "duration:i[5,9],aspect_ratio[1:1,3:4,4:3,9:16,16:9,9:21,21:9],concepts:a,end_image,loop:b,*prompt,start_image"],
  "luma/ray-flash-2-720p": ["Luma Ray Flash 2 720p",
    "duration:i[5,9],aspect_ratio[1:1,3:4,4:3,9:16,16:9,9:21,21:9],concepts:a,end_image,loop:b,*prompt,start_image"],
  "luma/reframe-video": ["Luma Reframe Video",
    "aspect_ratio[1:1,3:4,4:3,9:16,16:9,9:21,21:9],grid_position_x:i,grid_position_y:i,prompt,video,x_end:i,x_start:i,y_end:i,y_start:i"],
  // meta
  "meta/sam-2-video": ["SAM 2 Video",
    "*input_video,*click_coordinates,click_labels,click_frames,click_object_ids,mask_type[binary,highlighted,greenscreen],annotation_type[mask,box,both],output_video:b,video_fps:i,output_format[webp,jpg,png],output_quality:i,output_frame_interval:i"],
  // minimax
  "minimax/hailuo-02": ["MiniMax Hailuo 02",
    "duration:i[6,10],resolution[512p,768p,1080p],first_frame_image,last_frame_image,*prompt,prompt_optimizer:b"],
  "minimax/hailuo-2.3": ["MiniMax Hailuo 2.3",
    "duration:i[6,10],resolution[768p,1080p],first_frame_image,*prompt,prompt_optimizer:b"],
  "minimax/hailuo-2.3-fast": ["MiniMax Hailuo 2.3 Fast",
    "duration:i[6,10],resolution[768p,1080p],*first_frame_image,*prompt,prompt_optimizer:b"],
  "minimax/video-01": ["MiniMax Video 01",
    "first_frame_image,*prompt,prompt_optimizer:b,subject_reference"],
  "minimax/video-01-director": ["MiniMax Video 01 Director",
    "first_frame_image,*prompt,prompt_optimizer:b"],
  "minimax/video-01-live": ["MiniMax Video 01 Live",
    "*first_frame_image,*prompt,prompt_optimizer:b"],
  // openai
  "openai/sora-2": ["Sora 2 API",
    "openai_api_key,*prompt,input_reference,seconds:i[4,8,12],aspect_ratio[portrait,landscape]"],
  "openai/sora-2-pro": ["Sora 2 Pro",
    "openai_api_key,*prompt,input_reference,seconds:i[4,8,12],aspect_ratio[portrait,landscape],resolution[standard,high]"],
  // philz1337x
  "philz1337x/crystal-video-upscaler": ["Crystal Video Upscaler",
    "*video,scale_factor:n"],
  // pixverse
  "pixverse/lipsync": ["PixVerse Lipsync",
    "*video,*audio"],
  "pixverse/pixverse-v4": ["PixVerse v4",
    "*prompt,image,last_frame_image,quality[360p,540p,720p,1080p],aspect_ratio[16:9,9:16,1:1],duration:i[5,8],motion_mode[normal,smooth],negative_prompt,seed:i,style[None,anime,3d_animation,clay,cyberpunk,comic],effect,sound_effect_switch:b,sound_effect_content"],
  "pixverse/pixverse-v4.5": ["PixVerse v4.5",
    "*prompt,image,last_frame_image,quality[360p,540p,720p,1080p],aspect_ratio[16:9,9:16,1:1],duration:i[5,8],motion_mode[normal,smooth],negative_prompt,seed:i,style[None,anime,3d_animation,clay,cyberpunk,comic],effect,sound_effect_switch:b,sound_effect_content"],
  "pixverse/pixverse-v5": ["PixVerse v5",
    "*prompt,image,last_frame_image,quality[360p,540p,720p,1080p],aspect_ratio[16:9,9:16,1:1],duration:i[5,8],negative_prompt,seed:i,effect"],
  "pixverse/pixverse-v5.6": ["PixVerse v5.6",
    "*prompt,image,last_frame_image,quality[360p,540p,720p,1080p],aspect_ratio[16:9,9:16,1:1],duration:i[5,8,10],negative_prompt,seed:i,generate_audio_switch:b,thinking_type[disabled,enabled,auto]"],
  "pixverse/pixverse-v6": ["PixVerse v6",
    "*prompt,image,last_frame_image,quality[360p,540p,720p,1080p],aspect_ratio[16:9,9:16,1:1],duration:i[5,8,10,15],negative_prompt,seed:i,generate_audio_switch:b,generate_multi_clip_switch:b"],
  // prunaai
  "prunaai/p-video": ["Pruna P-Video",
    "*prompt,image,last_frame_image,audio,duration:i,aspect_ratio[16:9,9:16,4:3,3:4,3:2,2:3,1:1],resolution[720p,1080p],fps:i[24,48],draft:b,prompt_upsampling:b,disable_safety_filter:b,save_audio:b,seed:i"],
  "prunaai/p-video-animate": ["Pruna P-Video Animate",
    "*video,*image,instruction_prompt,resolution[720p,1080p],target_fps[original,24,48],save_audio:b,ignore_audio:b,turbo:b,disable_safety_checker:b,seed:i"],
  "prunaai/p-video-avatar": ["Pruna P-Video Avatar",
    "*image,resolution[720p,1080p],audio,voice[Zephyr (Female),Puck (Male),Charon (Male),Kore (Female),Fenrir (Male),Leda (Female),Orus (Male),Aoede (Female),Callirrhoe (Female),Autonoe (Female),Enceladus (Male),Iapetus (Male),Umbriel (Male),Algenib (Male),Despina (Female),Erinome (Female),Laomedeia (Female),Achernar (Female),Algieba (Male),Schedar (Male),Gacrux (Female),Pulcherrima (Female),Achird (Male),Zubenelgenubi (Male),Vindemiatrix (Female),Sadachbia (Male),Sadaltager (Male),Sulafat (Female),Alnilam (Male),Rasalgethi (Male)],voice_script,voice_prompt,voice_language[English (US),English (UK),Spanish,French,German,Italian,Portuguese (Brazil),Japanese,Korean,Hindi],seed:i,video_prompt,negative_prompt,strength_negative_prompt:n,disable_safety_filter:b,disable_prompt_upsampling:b"],
  // runwayml
  "runwayml/gen-4.5": ["Runway Gen-4.5",
    "*prompt,image,aspect_ratio[16:9,9:16,4:3,3:4,1:1,21:9],duration:i[5,10],seed:i"],
  // sync
  "sync/lipsync-2": ["Sync Lipsync 2",
    "*video,*audio,sync_mode[loop,bounce,cut_off,silence,remap],temperature:n,active_speaker:b"],
  "sync/lipsync-2-pro": ["Sync Lipsync 2 Pro",
    "*video,*audio,sync_mode[loop,bounce,cut_off,silence,remap],temperature:n,active_speaker:b"],
  // tencent
  "tencent/hunyuan-video": ["HunyuanVideo",
    "prompt,width:i,height:i,video_length:i,infer_steps:i,embedded_guidance_scale:n,fps:i,seed:i"],
  // tmappdev
  "tmappdev/lipsync": ["MuseTalk Lipsync",
    "audio_input,video_input,bbox_shift:i,fps:i"],
  // topazlabs
  "topazlabs/video-upscale": ["Topaz Video Upscale",
    "*video,target_resolution[720p,1080p,4k],target_fps:i"],
  // veed
  "veed/fabric-1.0": ["VEED Fabric 1.0",
    "*image,*audio,resolution[480p,720p]"],
  // vidu
  "vidu/q3-pro": ["Vidu Q3 Pro",
    "*prompt,start_image,end_image,duration:i,aspect_ratio[16:9,9:16,3:4,4:3,1:1],resolution[540p,720p,1080p],audio:b,seed:i"],
  "vidu/q3-turbo": ["Vidu Q3 Turbo",
    "*prompt,start_image,end_image,duration:i,aspect_ratio[16:9,9:16,3:4,4:3,1:1],resolution[540p,720p,1080p],audio:b,seed:i"],
  // wan-video
  "wan-video/wan-2.1-1.3b": ["Wan 2.1 1.3B",
    "*prompt,aspect_ratio[16:9,9:16],frame_num:i[17,33,49,65,81],resolution[480p],sample_steps:i,sample_guide_scale:n,sample_shift:n,seed:i"],
  "wan-video/wan-2.2-i2v-a14b": ["Wan 2.2 I2V A14B",
    "*prompt,image,go_fast:b,num_frames:i,resolution[480p,720p],frames_per_second:i,sample_steps:i,sample_shift:n,seed:i"],
  "wan-video/wan-2.2-i2v-fast": ["Wan 2.2 I2V Fast",
    "*prompt,*image,last_image,num_frames:i,resolution[480p,720p],frames_per_second:i,interpolate_output:b,go_fast:b,sample_shift:n,seed:i,disable_safety_checker:b,lora_weights_transformer,lora_scale_transformer:n,lora_weights_transformer_2,lora_scale_transformer_2:n"],
  "wan-video/wan-2.2-s2v": ["Wan 2.2 S2V",
    "*prompt,*image,*audio,num_frames_per_chunk:i,seed:i,interpolate:b"],
  "wan-video/wan-2.2-t2v-fast": ["Wan 2.2 T2V Fast",
    "*prompt,optimize_prompt:b,num_frames:i,aspect_ratio[16:9,9:16],resolution[480p,720p],frames_per_second:i,interpolate_output:b,go_fast:b,sample_shift:n,seed:i,disable_safety_checker:b,lora_weights_transformer,lora_scale_transformer:n,lora_weights_transformer_2,lora_scale_transformer_2:n"],
  "wan-video/wan-2.5-i2v": ["Wan 2.5 I2V",
    "*image,*prompt,negative_prompt,audio,resolution[480p,720p,1080p],duration:i[5,10],enable_prompt_expansion:b,seed:i"],
  "wan-video/wan-2.5-i2v-fast": ["Wan 2.5 I2V Fast",
    "resolution[720p,1080p],duration:i[5,10],audio,enable_prompt_expansion:b,*image,negative_prompt,*prompt,seed:i"],
  "wan-video/wan-2.5-t2v": ["Wan 2.5 T2V",
    "*prompt,negative_prompt,audio,size[832*480,480*832,1280*720,720*1280,1920*1080,1080*1920],duration:i[5,10],enable_prompt_expansion:b,seed:i"],
  "wan-video/wan-2.5-t2v-fast": ["Wan 2.5 T2V Fast",
    "*prompt,negative_prompt,audio,size[1280*720,720*1280,1920*1080,1080*1920],duration:i[5,10],enable_prompt_expansion:b,seed:i"],
  "wan-video/wan-2.6-i2v": ["Wan 2.6 I2V",
    "*image,*prompt,negative_prompt,audio,resolution[720p,1080p],duration:i[5,10,15],enable_prompt_expansion:b,multi_shots:b,seed:i"],
  "wan-video/wan-2.6-t2v": ["Wan 2.6 T2V",
    "*prompt,negative_prompt,audio,size[1280*720,720*1280,1920*1080,1080*1920],duration:i[5,10,15],enable_prompt_expansion:b,multi_shots:b,seed:i"],
  "wan-video/wan-2.7-i2v": ["Wan 2.7 I2V",
    "first_frame,last_frame,first_clip,audio,prompt,negative_prompt,resolution[720p,1080p],duration:i,enable_prompt_expansion:b,seed:i"],
  "wan-video/wan-2.7-r2v": ["Wan 2.7 R2V",
    "*prompt,reference_images:a,reference_videos:a,negative_prompt,resolution[720p,1080p],aspect_ratio[16:9,9:16,1:1,4:3,3:4],duration:i,shot_type[single,multi],seed:i"],
  "wan-video/wan-2.7-t2v": ["Wan 2.7 T2V",
    "*prompt,negative_prompt,audio,resolution[720p,1080p],aspect_ratio[16:9,9:16,1:1,4:3,3:4],duration:i,enable_prompt_expansion:b,seed:i"],
  "wan-video/wan-2.7-videoedit": ["Wan 2.7 Video Edit",
    "*video,*prompt,reference_image,resolution[720p,1080p],aspect_ratio[auto,16:9,9:16,1:1,4:3,3:4],duration:i,audio_setting[auto,origin],seed:i"],
  // wavespeedai
  "wavespeedai/wan-2.1-i2v-480p": ["Wan 2.1 I2V 480p",
    "*prompt,negative_prompt,aspect_ratio[16:9,9:16],*image,fast_mode[Off,Balanced,Fast],seed:i,sample_guide_scale:n,sample_steps:i,sample_shift:i,lora_weights,lora_scale:n,disable_safety_checker:b"],
  "wavespeedai/wan-2.1-i2v-720p": ["Wan 2.1 I2V 720p",
    "*prompt,negative_prompt,aspect_ratio[16:9,9:16],*image,fast_mode[Off,Balanced,Fast],seed:i,sample_guide_scale:n,sample_steps:i,sample_shift:i,lora_weights,lora_scale:n,disable_safety_checker:b"],
  "wavespeedai/wan-2.1-t2v-480p": ["Wan 2.1 T2V 480p",
    "aspect_ratio[16:9,9:16],fast_mode[Off,Balanced,Fast],disable_safety_checker:b,lora_scale:n,lora_weights,negative_prompt,*prompt,sample_guide_scale:n,sample_shift:i,sample_steps:i,seed:i"],
  "wavespeedai/wan-2.1-t2v-720p": ["Wan 2.1 T2V 720p",
    "*prompt,negative_prompt,aspect_ratio[16:9,9:16],fast_mode[Off,Balanced,Fast],seed:i,sample_guide_scale:n,sample_steps:i,sample_shift:i,lora_weights,lora_scale:n,disable_safety_checker:b"],
  // xai
  "xai/grok-imagine-video": ["Grok Imagine Video",
    "*prompt,image,video,duration:i,aspect_ratio[auto,16:9,4:3,1:1,9:16,3:4,3:2,2:3],resolution[720p,480p]"],
  "xai/grok-imagine-video-1.5": ["Grok Imagine Video 1.5",
    "*prompt,*image,duration:i,aspect_ratio[auto,16:9,4:3,1:1,9:16,3:4,3:2,2:3],resolution[720p,480p]"],
  "xai/grok-imagine-video-extension": ["Grok Imagine Video Extension",
    "*prompt,*video,duration:i"],
  // zsxkib
  "zsxkib/film-frame-interpolation-for-large-motion": ["FILM Frame Interpolation",
    "*mp4,playback_frames_per_second:i,num_interpolation_steps:i"],
  "zsxkib/hunyuan-video2video": ["Hunyuan Video-to-Video",
    "*video,prompt,width:i,height:i,keep_proportion:b,steps:i,guidance_scale:n,denoise_strength:n,flow_shift:i,seed:i,frame_rate:i,crf:i,force_rate:i,force_size,custom_width:i,custom_height:i,frame_load_cap:i,skip_first_frames:i,select_every_nth:i"],
  "zsxkib/mmaudio": ["MMAudio",
    "prompt,negative_prompt,video,duration:n,num_steps:i,cfg_strength:n,seed:i,image"],
  "zsxkib/multitalk": ["MultiTalk",
    "*image,*first_audio,prompt,second_audio,num_frames:i,sampling_steps:i,seed:i,turbo:b"],
  "zsxkib/pyramid-flow": ["Pyramid Flow",
    "*prompt,image,duration:i,guidance_scale:n,video_guidance_scale:n,frames_per_second:i[8,24]"],
  "zsxkib/seedvr2": ["SeedVR2",
    "*media,cfg_scale:n,sample_steps:i,sp_size:i,fps:i,seed:i,output_format[png,webp,jpg],output_quality:i,apply_color_fix:b,model_variant[3b,7b]"],
};

// ── client field → model field ───────────────────────────────────────────────
// 9router publishes ONE video request body, so the generic names it documents
// (`prompt`, `image`, `last_frame`, `video`, `reference_images`, `audio`,
// `ratio`, `resolution`, `duration`, …) have to land on whatever each model calls
// the same thing. Each entry lists the body keys a model field will accept, in
// priority order; a field absent from this map only accepts its own name, which
// is what makes the long tail (sample_shift, cfg_scale, num_frames, lora_scale,
// …) work with no per-field code.
const FIELD_SOURCES = {
  // first / source frame
  image: ["image", "start_image", "first_frame", "first_frame_image"],
  start_image: ["start_image", "image", "first_frame", "first_frame_image"],
  first_frame: ["first_frame", "image", "start_image"],
  first_frame_image: ["first_frame_image", "image", "start_image", "first_frame"],
  subject_reference: ["subject_reference", "reference_image", "image"],
  reference_image: ["reference_image", "image"],
  input_reference: ["input_reference", "image", "reference_image"],
  // last / end frame
  last_frame: ["last_frame", "last_frame_image", "end_image", "last_image"],
  last_frame_image: ["last_frame_image", "last_frame", "end_image", "last_image"],
  end_image: ["end_image", "last_frame", "last_frame_image", "last_image"],
  last_image: ["last_image", "last_frame", "last_frame_image", "end_image"],
  // source video
  video: ["video", "input_video", "video_url"],
  input_video: ["input_video", "video", "video_url"],
  video_input: ["video_input", "video", "input_video"],
  video_path: ["video_path", "video", "input_video"],
  video_file_input: ["video_file_input", "video", "input_video"],
  video_url: ["video_url", "video", "input_video"],
  reference_video: ["reference_video", "video"],
  first_clip: ["first_clip", "video", "input_video"],
  // `media` (SeedVR2) and `mp4` (FILM) name the source clip; both also accept a
  // still, which is why the generic `image` is a fallback rather than the lead.
  media: ["media", "video", "input_video", "image"],
  mp4: ["mp4", "video", "input_video"],
  // reference lists
  reference_images: ["reference_images", "images", "image"],
  images: ["images", "reference_images", "image"],
  reference_videos: ["reference_videos", "videos", "video"],
  reference_audios: ["reference_audios", "audios", "audio"],
  concepts: ["concepts", "reference_images"],
  // audio. `audio` is a URL on the lipsync/S2V models and a boolean
  // generate-audio switch on Vidu, and the spec's declared type decides which —
  // a URL cast to boolean fails and is dropped, a `true` cast to string is not a
  // URL upstream either, so the two never cross.
  audio: ["audio", "audio_file", "audio_input", "audio_url"],
  audio_file: ["audio_file", "audio", "audio_input", "audio_url"],
  audio_input: ["audio_input", "audio", "audio_file", "audio_url"],
  first_audio: ["first_audio", "audio", "audio_file"],
  generate_audio: ["generate_audio", "audio"],
  generate_audio_switch: ["generate_audio_switch", "generate_audio", "audio"],
  keep_original_sound: ["keep_original_sound", "keep_audio"],
  // geometry
  aspect_ratio: ["aspect_ratio", "ratio"],
  target_resolution: ["target_resolution", "resolution"],
  quality: ["quality", "resolution"],
  size: ["size", "resolution"],
  // duration
  seconds: ["seconds", "duration"],
  video_length: ["video_length", "num_frames"],
  // Engine-variant inputs. A few models take a `model` input naming an internal
  // checkpoint; the body's own `model` is the 9router routing id, so it is never
  // read here — the variant comes from `model_variant`.
  model: ["model_variant", "variant", "engine"],
  model_variant: ["model_variant", "variant", "engine"],
  frames_per_second: ["frames_per_second", "fps"],
  playback_frames_per_second: ["playback_frames_per_second", "fps"],
  frame_rate: ["frame_rate", "fps"],
  video_fps: ["video_fps", "fps"],
  target_fps: ["target_fps", "fps"],
};

// Human wording for a missing required field, so the 400 tells the caller what
// to send rather than echoing the model's internal field name.
const HINTS = {
  prompt: "'prompt'",
  image: "'image' (source / first frame image URL)",
  start_image: "'image' (start frame image URL)",
  first_frame: "'image' (first frame image URL)",
  first_frame_image: "'image' (first frame image URL)",
  last_frame: "'last_frame' (end frame image URL)",
  last_frame_image: "'last_frame' (end frame image URL)",
  end_image: "'last_frame' (end frame image URL)",
  video: "'video' (source video URL)",
  input_video: "'video' (source video URL)",
  video_input: "'video' (source video URL)",
  video_path: "'video' (source video URL)",
  video_file_input: "'video' (source video URL)",
  media: "'video' or 'image' (source media URL)",
  mp4: "'video' (source video URL)",
  audio: "'audio' (driving audio URL)",
  first_audio: "'audio' (driving audio URL)",
  reference_images: "'reference_images' (one or more image URLs)",
  click_coordinates: "'click_coordinates' (e.g. \"[[500,375]]\")",
  openai_api_key: "'openai_api_key' (your own OpenAI key, billed by OpenAI)",
};

// Client-facing name for a model field, used to build the registry's per-model
// `params` (and therefore the dashboard's inputs). Anything not named here is
// published under its own Replicate name.
const PUBLIC_NAMES = {
  start_image: "image",
  first_frame: "image",
  first_frame_image: "image",
  input_reference: "image",
  last_frame_image: "last_frame",
  end_image: "last_frame",
  last_image: "last_frame",
  input_video: "video",
  video_input: "video",
  video_path: "video",
  video_file_input: "video",
  video_url: "video",
  mp4: "video",
  first_clip: "video",
  images: "reference_images",
  generate_audio: "audio",
  generate_audio_switch: "audio",
  audio_file: "audio",
  audio_input: "audio",
  first_audio: "audio",
  aspect_ratio: "ratio",
  seconds: "duration",
  target_resolution: "resolution",
  model: "model_variant",
};

// Body keys that are 9router routing metadata, never model input.
const NON_INPUT_KEYS = new Set(["model", "response_format", "stream", "user", "n"]);

/**
 * Extra body keys derived from `size`, so the one common request works against
 * models that only speak in resolution tiers and aspect ratios. Never overrides
 * what the caller sent explicitly.
 *
 * Models whose OWN `size` field is an enum of `WIDTH*HEIGHT` strings (Wan 2.5/2.6
 * text-to-video) are left alone: their spec snaps the caller's `size` into that
 * enum directly, and deriving a tier for them would be noise.
 */
function derivedGeometry(body, spec) {
  const raw = typeof body?.size === "string" ? body.size.trim() : "";
  if (!raw || raw.toLowerCase() === "auto") return {};
  const dim = parseSize(raw);
  if (!dim) return {};
  const out = {};
  const ratio = ratioForSize(dim);
  const tier = tierForSize(dim);
  if (!body?.resolution) out.resolution = tier;
  if (!body?.ratio && !body?.aspect_ratio) out.aspect_ratio = ratio;
  // Only models that take explicit dimensions get them; everywhere else the
  // spec drops the keys, so filling them costs nothing.
  if (body?.width === undefined && spec?.fields?.has("width")) out.width = dim.width;
  if (body?.height === undefined && spec?.fields?.has("height")) out.height = dim.height;
  return out;
}

/** `size` is offered whenever a model speaks in tiers, ratios or dimensions. */
function extraFields(spec) {
  if (spec.fields.has("size")) return [];
  for (const name of ["resolution", "target_resolution", "quality", "aspect_ratio", "width"]) {
    if (spec.fields.has(name)) return ["size"];
  }
  return [];
}

const CATALOG = createCatalog({
  specs: SPECS,
  fieldSources: FIELD_SOURCES,
  hints: HINTS,
  publicNames: PUBLIC_NAMES,
  nonInputKeys: NON_INPUT_KEYS,
  label: "replicate video",
  derived: derivedGeometry,
  extraFields,
});

export const { normalizeModelId, resolveSpec, buildInput, modelFields, catalogue } = CATALOG;

// ── capabilities ────────────────────────────────────────────────────────────
// Derived from each model's own schema rather than declared per model, so a
// model that gains a reference-image input gains the affordance with it and the
// dashboard cannot drift from what the request builder accepts.

const FIRST_FRAME_FIELDS = ["image", "start_image", "first_frame", "first_frame_image", "input_reference", "subject_reference", "reference_image"];
const REFERENCE_FIELDS = ["reference_images", "images", "reference_videos", "reference_audios", "concepts"];
const VIDEO_FIELDS = ["video", "input_video", "video_input", "video_path", "video_file_input", "video_url", "reference_video", "first_clip", "media", "mp4"];

/**
 * What a model can do, from its fields.
 *
 * A required video input means the model transforms an existing clip
 * (upscale, lipsync, restyle, matting) — `videoedit`. A required still or audio
 * means it animates that input rather than a prompt. Anything with no required
 * media can be driven by text alone, and the optional inputs it does have are
 * reported alongside so the dashboard offers them.
 */
export function modelCapabilities(model) {
  const spec = resolveSpec(model);
  if (!spec) return ["text2video"];
  const has = (names) => names.filter((name) => spec.fields.has(name));
  const required = (names) => has(names).some((name) => spec.fields.get(name).required);

  const firsts = has(FIRST_FRAME_FIELDS);
  const refs = has(REFERENCE_FIELDS);
  const videos = has(VIDEO_FIELDS);
  const needsMedia = required(FIRST_FRAME_FIELDS) || required(REFERENCE_FIELDS) || required(VIDEO_FIELDS) || required(["audio", "first_audio", "audio_file", "audio_input"]);

  const caps = [];
  if (!needsMedia && spec.fields.has("prompt")) caps.push("text2video");
  if (firsts.length) caps.push("image2video");
  if (refs.length) caps.push("reference2video");
  if (videos.length) caps.push("videoedit");
  return caps.length ? caps : ["text2video"];
}

// ── response normalization ──────────────────────────────────────────────────

/**
 * Extras worth passing through from a finished prediction.
 *
 * Anything Replicate reports alongside the file — the seed a caller needs to
 * reproduce a render, the transcript the autocaption models emit — travels back
 * with it, while the file itself is lifted into `video`.
 */
function extraOutput(prediction) {
  const extras = {};
  const output = prediction?.output;
  if (output && typeof output === "object" && !Array.isArray(output)) {
    for (const key of ["seed", "transcript", "text", "thumbnail", "id", "name"]) {
      const value = output[key];
      if (value !== undefined && typeof value !== "object") extras[key] = value;
    }
  }
  if (prediction?.metrics) extras.usage = prediction.metrics;
  return extras;
}

/**
 * Create response -> `{ request_id }`.
 *
 * Replicate prediction ids are self-sufficient — `GET /v1/predictions/{id}`
 * answers for any model — so unlike fal nothing has to be packed into the id the
 * client polls with.
 */
export function normalizeCreate(payload) {
  const id = payload?.id;
  if (!id) {
    const detail = payload?.detail || payload?.error || payload?.title || "no prediction id returned";
    throw new Error(`replicate video: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
  return {
    request_id: id,
    id,
    status: mapStatus(payload?.status),
  };
}

/**
 * Prediction -> the poll shape clients already expect from /v1/videos.
 *
 * A prediction only carries `output` once it has succeeded, and a succeeded
 * prediction whose output holds no file URL is reported as still processing
 * rather than as an empty success — that keeps the await loop waiting instead of
 * answering with nothing.
 */
export function normalizePoll(payload, { requestId = null } = {}) {
  const id = requestId || payload?.id || null;
  const state = mapStatus(payload?.status);
  const failed = payload?.status === "failed" || payload?.status === "canceled";
  const url = failed ? null : outputUrls(payload?.output)[0] || null;

  const normalized = {
    id,
    request_id: id,
    status: failed ? "failed" : url ? "done" : state === "done" ? "processing" : state,
  };

  if (url) normalized.video = { url };
  if (failed) {
    normalized.error = {
      code: payload?.status === "canceled" ? "canceled" : "prediction_failed",
      message: predictionError(payload) || `replicate prediction ${payload?.status || "failed"}`,
    };
  }
  Object.assign(normalized, extraOutput(payload));
  return normalized;
}

// ── adapter ─────────────────────────────────────────────────────────────────

export default {
  /**
   * Which route a create takes follows the model's version, not the request —
   * see ../replicate/versions.js. A caller's own `:hash` is preserved and wins.
   */
  createUrl: (model) => {
    const spec = resolveSpec(model);
    if (!spec) throw new Error(`replicate video: unknown model '${model}'`);
    return createUrl(pinnedId(model, spec));
  },

  /** Every prediction polls the same model-independent endpoint. */
  pollUrl: (taskId) => pollUrl(taskId),

  // No `Prefer: wait` on video: renders run for minutes, so holding the create
  // open buys nothing and the await loop below does the waiting.
  buildHeaders: (credentials, { create = false } = {}) => buildHeaders(credentials, { create }),

  buildBody: (model, body) => {
    const spec = resolveSpec(model);
    if (!spec) throw new Error(`replicate video: unknown model '${model}'`);
    return createBody(pinnedId(model, spec), buildInput(model, body));
  },

  normalizeCreate,

  /**
   * A Replicate prediction carries its output inline, so one GET finishes the
   * job — no second fetch, and nothing here needs the poll context.
   */
  normalizePoll: (payload, { requestId } = {}) => normalizePoll(payload, { requestId }),

  /**
   * Replicate's prediction API is async, so creation returns an id and nothing
   * else. Rather than make every caller implement a polling loop, the core waits
   * the render out and answers the create request with the finished video; if the
   * render outlives that wait, the response still carries the prediction id and
   * GET /v1/videos/{id} finishes the job.
   */
  awaitCompletion: true,

  // Renders run from seconds (frame interpolation, matting) to minutes (Veo,
  // Sora, Kling), and a prediction GET is cheap, so poll often enough that short
  // jobs answer quickly.
  pollIntervalMs: 4000,

  /** Every request field this model accepts, for the registry's per-model params. */
  modelFields,
};
