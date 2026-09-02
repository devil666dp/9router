// Replicate image generation + editing (https://api.replicate.com/v1).
//
// Replicate hosts every image family behind ONE prediction API, and only the
// input schema varies, so this adapter carries no per-model code: `SPECS` is a
// table of every model's accepted fields and everything else derives from it.
// See ../replicate/spec.js for the syntax and the shared machinery, and
// ../replicate/api.js for the protocol.
//
// The client-facing contract stays the ONE image body 9router publishes:
// `prompt` plus optional `n` / `size` / `image` / … . Generic names are resolved
// to whatever this model calls them, loose values snap into its enums, and
// anything it does not accept is dropped — Replicate 422s on unknown input keys.
//
// Fast models (FLUX schnell, SDXL) finish inside `Prefer: wait`, so the create
// call itself returns the image. Slower ones (gpt-image-2, Imagen, Seedream) come
// back still running and are polled here until they land.
import { sleep, nowSec, POLL_INTERVAL_MS, POLL_TIMEOUT_MS } from "./_base.js";
import {
  createUrl, createBody, pollUrl, buildHeaders,
  TERMINAL_STATUSES, outputUrls, predictionError, upstreamError,
  MAX_PREFER_WAIT_SECONDS,
} from "../replicate/api.js";
import { createCatalog, parseSize, ratioForSize, pinnedId } from "../replicate/spec.js";

// ── model input schemas (from each model's Replicate API reference) ──────────
// "owner/name": [display name, spec]
export const SPECS = {
  // black-forest-labs
  "black-forest-labs/flux-1.1-pro": ["FLUX 1.1 Pro",
    "aspect_ratio[custom,1:1,16:9,3:2,2:3,4:5,5:4,9:16,3:4,4:3],output_format[webp,jpg,png],height:i,image_prompt,output_quality:i,*prompt,prompt_upsampling:b,safety_tolerance:i,seed:i,width:i"],
  "black-forest-labs/flux-1.1-pro-ultra": ["FLUX 1.1 Pro Ultra",
    "*prompt,image_prompt,image_prompt_strength:n,aspect_ratio[21:9,16:9,3:2,4:3,5:4,1:1,4:5,3:4,2:3,9:16,9:21],safety_tolerance:i,seed:i,raw:b,output_format[jpg,png]"],
  "black-forest-labs/flux-2-dev": ["FLUX.2 Dev",
    "*prompt,input_images:a,go_fast:b,aspect_ratio[match_input_image,custom,1:1,16:9,3:2,2:3,4:5,5:4,9:16,3:4,4:3],width:i,height:i,seed:i,output_format[webp,jpg,png],output_quality:i,disable_safety_checker:b"],
  "black-forest-labs/flux-2-flex": ["FLUX.2 Flex",
    "*prompt,input_images:a,aspect_ratio[match_input_image,custom,1:1,16:9,3:2,2:3,4:5,5:4,9:16,3:4,4:3],resolution[match_input_image,0.5 MP,1 MP,2 MP,4 MP],width:i,height:i,safety_tolerance:i,seed:i,prompt_upsampling:b,steps:i,guidance:n,output_format[webp,jpg,png],output_quality:i"],
  "black-forest-labs/flux-2-klein-4b": ["FLUX.2 Klein 4B",
    "*prompt,images:a,aspect_ratio[1:1,16:9,9:16,3:2,2:3,4:3,3:4,5:4,4:5,21:9,9:21,match_input_image],output_megapixels[0.25,0.5,1,2,4],seed:i,go_fast:b,output_format[webp,jpg,png],output_quality:i,disable_safety_checker:b"],
  "black-forest-labs/flux-2-max": ["FLUX.2 Max",
    "*prompt,input_images:a,aspect_ratio[match_input_image,custom,1:1,16:9,3:2,2:3,4:5,5:4,9:16,3:4,4:3],resolution[match_input_image,0.5 MP,1 MP,2 MP,4 MP],width:i,height:i,safety_tolerance:i,seed:i,output_format[webp,jpg,png],output_quality:i"],
  "black-forest-labs/flux-2-pro": ["FLUX.2 Pro",
    "*prompt,input_images:a,aspect_ratio[match_input_image,custom,1:1,16:9,3:2,2:3,4:5,5:4,9:16,3:4,4:3],resolution[0.5 MP,1 MP,2 MP,4 MP],width:i,height:i,safety_tolerance:i,seed:i,prompt_upsampling:b,output_format[webp,jpg,png],output_quality:i"],
  "black-forest-labs/flux-canny-pro": ["FLUX.1 Canny Pro",
    "output_format[jpg,png],*control_image,guidance:n,*prompt,prompt_upsampling:b,safety_tolerance:i,seed:i,steps:i"],
  "black-forest-labs/flux-depth-pro": ["FLUX.1 Depth Pro",
    "output_format[jpg,png],*control_image,guidance:n,*prompt,prompt_upsampling:b,safety_tolerance:i,seed:i,steps:i"],
  "black-forest-labs/flux-dev": ["FLUX.1 Dev",
    "*prompt,aspect_ratio[1:1,16:9,21:9,3:2,2:3,4:5,5:4,3:4,4:3,9:16,9:21],image,prompt_strength:n,num_outputs:i,num_inference_steps:i,guidance:n,seed:i,output_format[webp,jpg,png],output_quality:i,disable_safety_checker:b,go_fast:b,megapixels[1,0.25]"],
  "black-forest-labs/flux-fill-dev": ["FLUX.1 Fill Dev",
    "*prompt,*image,mask,num_outputs:i,num_inference_steps:i,guidance:n,seed:i,megapixels[1,0.25,match_input],output_format[webp,jpg,png],output_quality:i,lora_weights,lora_scale:n,disable_safety_checker:b"],
  "black-forest-labs/flux-fill-pro": ["FLUX.1 Fill Pro",
    "*prompt,*image,mask,outpaint[None,Zoom out 1.5x,Zoom out 2x,Make square,Left outpaint,Right outpaint,Top outpaint,Bottom outpaint],seed:i,steps:i,prompt_upsampling:b,guidance:n,safety_tolerance:i,output_format[jpg,png]"],
  "black-forest-labs/flux-kontext-dev": ["FLUX.1 Kontext Dev",
    "*prompt,*input_image,aspect_ratio[1:1,16:9,21:9,3:2,2:3,4:5,5:4,3:4,4:3,9:16,9:21,match_input_image],num_inference_steps:i,guidance:n,seed:i,output_format[webp,jpg,png],output_quality:i,disable_safety_checker:b,go_fast:b"],
  "black-forest-labs/flux-kontext-max": ["FLUX.1 Kontext Max",
    "aspect_ratio[match_input_image,1:1,16:9,9:16,4:3,3:4,3:2,2:3,4:5,5:4,21:9,9:21,2:1,1:2],output_format[jpg,png],input_image,*prompt,prompt_upsampling:b,safety_tolerance:i,seed:i"],
  "black-forest-labs/flux-kontext-pro": ["FLUX.1 Kontext Pro",
    "aspect_ratio[match_input_image,1:1,16:9,9:16,4:3,3:4,3:2,2:3,4:5,5:4,21:9,9:21,2:1,1:2],output_format[jpg,png],input_image,*prompt,prompt_upsampling:b,safety_tolerance:i,seed:i"],
  "black-forest-labs/flux-pro": ["FLUX.1 Pro",
    "aspect_ratio[custom,1:1,16:9,3:2,2:3,4:5,5:4,9:16,3:4,4:3],output_format[webp,jpg,png],guidance:n,height:i,image_prompt,output_quality:i,*prompt,prompt_upsampling:b,safety_tolerance:i,seed:i,width:i"],
  "black-forest-labs/flux-redux-dev": ["FLUX.1 Redux Dev",
    "*redux_image,aspect_ratio[1:1,16:9,21:9,3:2,2:3,4:5,5:4,3:4,4:3,9:16,9:21],num_outputs:i,num_inference_steps:i,guidance:n,seed:i,output_format[webp,jpg,png],output_quality:i,disable_safety_checker:b,megapixels[1,0.25]"],
  "black-forest-labs/flux-schnell": ["FLUX.1 Schnell",
    "*prompt,aspect_ratio[1:1,16:9,21:9,3:2,2:3,4:5,5:4,3:4,4:3,9:16,9:21],num_outputs:i,num_inference_steps:i,seed:i,output_format[webp,jpg,png],output_quality:i,disable_safety_checker:b,go_fast:b,megapixels[1,0.25]"],
  // bria
  "bria/eraser": ["Bria Eraser",
    "image,mask,sync:b,content_moderation:b,preserve_alpha:b"],
  "bria/expand-image": ["Bria Expand Image",
    "image,aspect_ratio[1:1,2:3,3:2,3:4,4:3,4:5,5:4,9:16,16:9],canvas_size:a,original_image_size:a,original_image_location:a,prompt,negative_prompt,seed:i,preserve_alpha:b,sync:b,content_moderation:b"],
  "bria/fibo": ["Bria FIBO",
    "*prompt,image,structured_prompt,negative_prompt,guidance_scale:i,aspect_ratio[1:1,2:3,3:2,3:4,4:3,4:5,5:4,9:16,16:9],seed:i"],
  "bria/fibo-edit": ["Bria FIBO Edit",
    "instruction,image,mask,structured_instruction,negative_prompt,guidance_scale:i,seed:i"],
  "bria/generate-background": ["Bria Generate Background",
    "image,bg_prompt,ref_image_url,negative_prompt,num_results:i,sync:b,fast:b,refine_prompt:b,enhance_ref_image:b,original_quality:b,force_rmbg:b,content_moderation:b,seed:i"],
  "bria/genfill": ["Bria GenFill",
    "image,mask,*prompt,negative_prompt,mask_type[manual,automatic],num_results:i,preserve_alpha:b,sync:b,seed:i,content_moderation:b"],
  "bria/image-3.2": ["Bria Image 3.2",
    "*prompt,negative_prompt,num_results:i,aspect_ratio[1:1,2:3,3:2,3:4,4:3,4:5,5:4,9:16,16:9],guidance_scale:n,prompt_enhancement:b,enhance_image:b,seed:i"],
  "bria/increase-resolution": ["Bria Increase Resolution",
    "image,desired_increase:i[2,4],preserve_alpha:b,sync:b,content_moderation:b"],
  // bytedance
  "bytedance/bagel": ["BAGEL",
    "*prompt,image,task[text-to-image,image-editing,image-understanding],enable_thinking:b,cfg_text_scale:n,cfg_img_scale:n,num_inference_steps:i,timestep_shift:n,cfg_renorm_type[global,local,text_channel],cfg_renorm_min:n,seed:i,output_format[webp,jpg,png],output_quality:i"],
  "bytedance/seedream-3": ["Seedream 3",
    "*prompt,seed:i,aspect_ratio[1:1,3:4,4:3,16:9,9:16,2:3,3:2,21:9,custom],size[small,regular,big],width:i,height:i,guidance_scale:n"],
  "bytedance/seedream-4": ["Seedream 4",
    "*prompt,image_input:a,size[1K,2K,4K,custom],aspect_ratio[match_input_image,1:1,4:3,3:4,16:9,9:16,3:2,2:3,21:9],width:i,height:i,sequential_image_generation[disabled,auto],max_images:i,enhance_prompt:b"],
  "bytedance/seedream-4.5": ["Seedream 4.5",
    "*prompt,image_input:a,size[2K,4K,custom],aspect_ratio[match_input_image,1:1,4:3,3:4,4:5,5:4,16:9,9:16,3:2,2:3,21:9,9:21],width:i,height:i,sequential_image_generation[disabled,auto],max_images:i,disable_safety_checker:b"],
  "bytedance/seedream-5-lite": ["Seedream 5 Lite",
    "*prompt,image_input:a,size[2K,3K],aspect_ratio[match_input_image,1:1,4:3,3:4,16:9,9:16,3:2,2:3,21:9],sequential_image_generation[disabled,auto],max_images:i,output_format[png,jpeg],return_byteplus_urls:b"],
  // flux-kontext-apps
  "flux-kontext-apps/multi-image-kontext-max": ["Multi-Image Kontext Max",
    "aspect_ratio[match_input_image,1:1,16:9,9:16,4:3,3:4,3:2,2:3,4:5,5:4,21:9,9:21,2:1,1:2],output_format[jpg,png],*input_image_1,*input_image_2,*prompt,safety_tolerance:i,seed:i"],
  "flux-kontext-apps/multi-image-kontext-pro": ["Multi-Image Kontext Pro",
    "aspect_ratio[match_input_image,1:1,16:9,9:16,4:3,3:4,3:2,2:3,4:5,5:4,21:9,9:21,2:1,1:2],output_format[jpg,png],*input_image_1,*input_image_2,*prompt,safety_tolerance:i,seed:i"],
  "flux-kontext-apps/restore-image": ["Kontext Restore Image",
    "output_format[jpg,png],*input_image,safety_tolerance:i,seed:i"],
  // fofr
  "fofr/sticker-maker": ["Sticker Maker",
    "prompt,negative_prompt,width:i,height:i,steps:i,number_of_images:i,output_format[webp,jpg,png],output_quality:i,seed:i"],
  // google
  "google/imagen-3": ["Imagen 3",
    "*prompt,aspect_ratio[1:1,9:16,16:9,3:4,4:3],safety_filter_level[block_low_and_above,block_medium_and_above,block_only_high],output_format[jpg,png]"],
  "google/imagen-3-fast": ["Imagen 3 Fast",
    "*prompt,aspect_ratio[1:1,9:16,16:9,3:4,4:3],safety_filter_level[block_low_and_above,block_medium_and_above,block_only_high],output_format[jpg,png]"],
  "google/imagen-4": ["Imagen 4",
    "*prompt,aspect_ratio[1:1,9:16,16:9,3:4,4:3],image_size[1K,2K],safety_filter_level[block_low_and_above,block_medium_and_above,block_only_high],output_format[jpg,png]"],
  "google/imagen-4-fast": ["Imagen 4 Fast",
    "*prompt,aspect_ratio[1:1,9:16,16:9,3:4,4:3],safety_filter_level[block_low_and_above,block_medium_and_above,block_only_high],output_format[jpg,png]"],
  "google/imagen-4-ultra": ["Imagen 4 Ultra",
    "*prompt,aspect_ratio[1:1,9:16,16:9,3:4,4:3],image_size[1K,2K],safety_filter_level[block_low_and_above,block_medium_and_above,block_only_high],output_format[jpg,png]"],
  "google/nano-banana": ["Nano Banana",
    "*prompt,image_input:a,aspect_ratio[match_input_image,1:1,2:3,3:2,3:4,4:3,4:5,5:4,9:16,16:9,21:9],output_format[jpg,png]"],
  "google/nano-banana-2": ["Nano Banana 2",
    "*prompt,image_input:a,aspect_ratio[match_input_image,1:1,1:4,1:8,2:3,3:2,3:4,4:1,4:3,4:5,5:4,8:1,9:16,16:9,21:9],resolution[1K,2K,4K],google_search:b,image_search:b,output_format[jpg,png]"],
  "google/nano-banana-pro": ["Nano Banana Pro",
    "*prompt,image_input:a,aspect_ratio[match_input_image,1:1,2:3,3:2,3:4,4:3,4:5,5:4,9:16,16:9,21:9],resolution[1K,2K,4K],output_format[jpg,png],safety_filter_level[block_low_and_above,block_medium_and_above,block_only_high],allow_fallback_model:b"],
  "google/upscaler": ["Google Upscaler",
    "*image,upscale_factor[x2,x4],compression_quality:i"],
  // ideogram-ai
  "ideogram-ai/ideogram-v2": ["Ideogram V2",
    "aspect_ratio[1:1,16:9,9:16,4:3,3:4,3:2,2:3,16:10,10:16,3:1,1:3],resolution[None,512x1536,576x1408,576x1472,576x1536,640x1344,640x1408,640x1472,640x1536,704x1152,704x1216,704x1280,704x1344,704x1408,704x1472,736x1312,768x1088,768x1216,768x1280,768x1344,832x960,832x1024,832x1088,832x1152,832x1216,832x1248,864x1152,896x960,896x1024,896x1088,896x1120,896x1152,960x832,960x896,960x1024,960x1088,1024x832,1024x896,1024x960,1024x1024,1088x768,1088x832,1088x896,1088x960,1120x896,1152x704,1152x832,1152x864,1152x896,1216x704,1216x768,1216x832,1248x832,1280x704,1280x768,1280x800,1312x736,1344x640,1344x704,1344x768,1408x576,1408x640,1408x704,1472x576,1472x640,1472x704,1536x512,1536x576,1536x640],magic_prompt_option[Auto,On,Off],style_type[None,Auto,General,Realistic,Design,Render 3D,Anime],image,mask,negative_prompt,*prompt,seed:i"],
  "ideogram-ai/ideogram-v2-turbo": ["Ideogram V2 Turbo",
    "aspect_ratio[1:1,16:9,9:16,4:3,3:4,3:2,2:3,16:10,10:16,3:1,1:3],resolution[None,512x1536,576x1408,576x1472,576x1536,640x1344,640x1408,640x1472,640x1536,704x1152,704x1216,704x1280,704x1344,704x1408,704x1472,736x1312,768x1088,768x1216,768x1280,768x1344,832x960,832x1024,832x1088,832x1152,832x1216,832x1248,864x1152,896x960,896x1024,896x1088,896x1120,896x1152,960x832,960x896,960x1024,960x1088,1024x832,1024x896,1024x960,1024x1024,1088x768,1088x832,1088x896,1088x960,1120x896,1152x704,1152x832,1152x864,1152x896,1216x704,1216x768,1216x832,1248x832,1280x704,1280x768,1280x800,1312x736,1344x640,1344x704,1344x768,1408x576,1408x640,1408x704,1472x576,1472x640,1472x704,1536x512,1536x576,1536x640],magic_prompt_option[Auto,On,Off],style_type[None,Auto,General,Realistic,Design,Render 3D,Anime],image,mask,negative_prompt,*prompt,seed:i"],
  "ideogram-ai/ideogram-v3-balanced": ["Ideogram V3 Balanced",
    "*prompt,aspect_ratio[1:3,3:1,1:2,2:1,9:16,16:9,10:16,16:10,2:3,3:2,3:4,4:3,4:5,5:4,1:1],resolution[None,512x1536,576x1408,576x1472,576x1536,640x1344,640x1408,640x1472,640x1536,704x1152,704x1216,704x1280,704x1344,704x1408,704x1472,736x1312,768x1088,768x1216,768x1280,768x1344,800x1280,832x960,832x1024,832x1088,832x1152,832x1216,832x1248,864x1152,896x960,896x1024,896x1088,896x1120,896x1152,960x832,960x896,960x1024,960x1088,1024x832,1024x896,1024x960,1024x1024,1088x768,1088x832,1088x896,1088x960,1120x896,1152x704,1152x832,1152x864,1152x896,1216x704,1216x768,1216x832,1248x832,1280x704,1280x768,1280x800,1312x736,1344x640,1344x704,1344x768,1408x576,1408x640,1408x704,1472x576,1472x640,1472x704,1536x512,1536x576,1536x640],magic_prompt_option[Auto,On,Off],image,mask,style_type[None,Auto,General,Realistic,Design],style_reference_images:a,seed:i,style_preset[None,80s Illustration,90s Nostalgia,Abstract Organic,Analog Nostalgia,Art Brut,Art Deco,Art Poster,Aura,Avant Garde,Bauhaus,Blueprint,Blurry Motion,Bright Art,C4D Cartoon,Children's Book,Collage,Coloring Book I,Coloring Book II,Cubism,Dark Aura,Doodle,Double Exposure,Dramatic Cinema,Editorial,Emotional Minimal,Ethereal Party,Expired Film,Flat Art,Flat Vector,Forest Reverie,Geo Minimalist,Glass Prism,Golden Hour,Graffiti I,Graffiti II,Halftone Print,High Contrast,Hippie Era,Iconic,Japandi Fusion,Jazzy,Long Exposure,Magazine Editorial,Minimal Illustration,Mixed Media,Monochrome,Nightlife,Oil Painting,Old Cartoons,Paint Gesture,Pop Art,Retro Etching,Riviera Pop,Spotlight 80s,Stylized Red,Surreal Collage,Travel Poster,Vintage Geo,Vintage Poster,Watercolor,Weird,Woodblock Print]"],
  "ideogram-ai/ideogram-v3-quality": ["Ideogram V3 Quality",
    "*prompt,aspect_ratio[1:3,3:1,1:2,2:1,9:16,16:9,10:16,16:10,2:3,3:2,3:4,4:3,4:5,5:4,1:1],resolution[None,512x1536,576x1408,576x1472,576x1536,640x1344,640x1408,640x1472,640x1536,704x1152,704x1216,704x1280,704x1344,704x1408,704x1472,736x1312,768x1088,768x1216,768x1280,768x1344,800x1280,832x960,832x1024,832x1088,832x1152,832x1216,832x1248,864x1152,896x960,896x1024,896x1088,896x1120,896x1152,960x832,960x896,960x1024,960x1088,1024x832,1024x896,1024x960,1024x1024,1088x768,1088x832,1088x896,1088x960,1120x896,1152x704,1152x832,1152x864,1152x896,1216x704,1216x768,1216x832,1248x832,1280x704,1280x768,1280x800,1312x736,1344x640,1344x704,1344x768,1408x576,1408x640,1408x704,1472x576,1472x640,1472x704,1536x512,1536x576,1536x640],magic_prompt_option[Auto,On,Off],image,mask,style_type[None,Auto,General,Realistic,Design],style_reference_images:a,seed:i,style_preset[None,80s Illustration,90s Nostalgia,Abstract Organic,Analog Nostalgia,Art Brut,Art Deco,Art Poster,Aura,Avant Garde,Bauhaus,Blueprint,Blurry Motion,Bright Art,C4D Cartoon,Children's Book,Collage,Coloring Book I,Coloring Book II,Cubism,Dark Aura,Doodle,Double Exposure,Dramatic Cinema,Editorial,Emotional Minimal,Ethereal Party,Expired Film,Flat Art,Flat Vector,Forest Reverie,Geo Minimalist,Glass Prism,Golden Hour,Graffiti I,Graffiti II,Halftone Print,High Contrast,Hippie Era,Iconic,Japandi Fusion,Jazzy,Long Exposure,Magazine Editorial,Minimal Illustration,Mixed Media,Monochrome,Nightlife,Oil Painting,Old Cartoons,Paint Gesture,Pop Art,Retro Etching,Riviera Pop,Spotlight 80s,Stylized Red,Surreal Collage,Travel Poster,Vintage Geo,Vintage Poster,Watercolor,Weird,Woodblock Print]"],
  "ideogram-ai/ideogram-v3-turbo": ["Ideogram V3 Turbo",
    "*prompt,aspect_ratio[1:3,3:1,1:2,2:1,9:16,16:9,10:16,16:10,2:3,3:2,3:4,4:3,4:5,5:4,1:1],resolution[None,512x1536,576x1408,576x1472,576x1536,640x1344,640x1408,640x1472,640x1536,704x1152,704x1216,704x1280,704x1344,704x1408,704x1472,736x1312,768x1088,768x1216,768x1280,768x1344,800x1280,832x960,832x1024,832x1088,832x1152,832x1216,832x1248,864x1152,896x960,896x1024,896x1088,896x1120,896x1152,960x832,960x896,960x1024,960x1088,1024x832,1024x896,1024x960,1024x1024,1088x768,1088x832,1088x896,1088x960,1120x896,1152x704,1152x832,1152x864,1152x896,1216x704,1216x768,1216x832,1248x832,1280x704,1280x768,1280x800,1312x736,1344x640,1344x704,1344x768,1408x576,1408x640,1408x704,1472x576,1472x640,1472x704,1536x512,1536x576,1536x640],magic_prompt_option[Auto,On,Off],image,mask,style_type[None,Auto,General,Realistic,Design],style_reference_images:a,seed:i,style_preset[None,80s Illustration,90s Nostalgia,Abstract Organic,Analog Nostalgia,Art Brut,Art Deco,Art Poster,Aura,Avant Garde,Bauhaus,Blueprint,Blurry Motion,Bright Art,C4D Cartoon,Children's Book,Collage,Coloring Book I,Coloring Book II,Cubism,Dark Aura,Doodle,Double Exposure,Dramatic Cinema,Editorial,Emotional Minimal,Ethereal Party,Expired Film,Flat Art,Flat Vector,Forest Reverie,Geo Minimalist,Glass Prism,Golden Hour,Graffiti I,Graffiti II,Halftone Print,High Contrast,Hippie Era,Iconic,Japandi Fusion,Jazzy,Long Exposure,Magazine Editorial,Minimal Illustration,Mixed Media,Monochrome,Nightlife,Oil Painting,Old Cartoons,Paint Gesture,Pop Art,Retro Etching,Riviera Pop,Spotlight 80s,Stylized Red,Surreal Collage,Travel Poster,Vintage Geo,Vintage Poster,Watercolor,Weird,Woodblock Print]"],
  // leonardoai
  "leonardoai/lucid-origin": ["Leonardo Lucid Origin",
    "*prompt,aspect_ratio[1:1,16:9,9:16,3:2,2:3,4:5,5:4,3:4,4:3,2:1,1:2,3:1,1:3],generation_mode[standard,ultra],contrast[low,medium,high],prompt_enhance:b,num_images:i,style[bokeh,cinematic,cinematic_close_up,creative,dynamic,fashion,film,food,hdr,long_exposure,macro,minimalist,monochrome,moody,neutral,none,portrait,retro,stock_photo,unprocessed,vibrant]"],
  // lucataco
  "lucataco/omnigen2": ["OmniGen2",
    "prompt,*image,image_2,image_3,negative_prompt,width:i,height:i,num_inference_steps:i,text_guidance_scale:n,image_guidance_scale:n,cfg_range_start:n,cfg_range_end:n,scheduler[euler,dpmsolver],max_input_image_side_length:i,max_pixels:i,seed:i"],
  // luma
  "luma/photon": ["Luma Photon",
    "aspect_ratio[1:1,3:4,4:3,9:16,16:9,9:21,21:9],character_reference,image_reference,image_reference_weight:n,*prompt,seed:i,style_reference,style_reference_weight:n"],
  "luma/photon-flash": ["Luma Photon Flash",
    "aspect_ratio[1:1,3:4,4:3,9:16,16:9,9:21,21:9],character_reference,image_reference,image_reference_weight:n,*prompt,seed:i,style_reference,style_reference_weight:n"],
  // minimax
  "minimax/image-01": ["MiniMax Image 01",
    "aspect_ratio[1:1,16:9,4:3,3:2,2:3,3:4,9:16,21:9],number_of_images:i,*prompt,prompt_optimizer:b,subject_reference"],
  // nightmareai
  "nightmareai/real-esrgan": ["Real-ESRGAN",
    "face_enhance:b,*image,scale:n"],
  // nvidia
  "nvidia/sana": ["NVIDIA Sana",
    "prompt,negative_prompt,model_variant[1600M-1024px,1600M-1024px-multilang,1600M-512px,600M-1024px-multilang,600M-512px-multilang],width:i,height:i,num_inference_steps:i,guidance_scale:n,pag_guidance_scale:n,seed:i"],
  "nvidia/sana-sprint-1.6b": ["NVIDIA SANA Sprint 1.6B",
    "prompt,width:i,height:i,inference_steps:i,intermediate_timesteps:n,guidance_scale:n,seed:i,output_format[webp,jpg,png],output_quality:i"],
  // openai
  "openai/gpt-image-1": ["GPT Image 1",
    "*openai_api_key,*prompt,aspect_ratio[1:1,3:2,2:3],input_fidelity[low,high],input_images:a,number_of_images:i,quality[low,medium,high,auto],background[auto,transparent,opaque],output_compression:i,output_format[png,jpeg,webp],moderation[auto,low],user_id"],
  "openai/gpt-image-1.5": ["GPT Image 1.5",
    "*prompt,openai_api_key,aspect_ratio[1:1,3:2,2:3],input_fidelity[low,high],input_images:a,number_of_images:i,quality[low,medium,high,auto],background[auto,transparent,opaque],output_compression:i,output_format[png,jpeg,webp],moderation[auto,low],user_id"],
  "openai/gpt-image-2": ["GPT Image 2",
    "*prompt,openai_api_key,aspect_ratio[1:1,3:2,2:3,4:3,3:4,16:9,9:16,auto,1024x1024,1536x1024,1024x1536,1536x1152,1152x1536,2048x2048,2048x1152,1152x2048,3840x2160,2160x3840],input_images:a,number_of_images:i,quality[low,medium,high,auto],background[auto,transparent,opaque],output_compression:i,output_format[png,jpeg,webp],moderation[auto,low],user_id"],
  // philz1337x
  "philz1337x/clarity-pro-upscaler": ["Clarity Pro Upscaler",
    "*image,scale_factor:i[2,4,8,16],creativity:n,output_format[png,jpg]"],
  "philz1337x/clarity-upscaler": ["Clarity Upscaler",
    "*image,prompt,negative_prompt,scale_factor:n,dynamic:n,creativity:n,resemblance:n,tiling_width:i[16,32,48,64,80,96,112,128,144,160,176,192,208,224,240,256],tiling_height:i[16,32,48,64,80,96,112,128,144,160,176,192,208,224,240,256],sd_model,scheduler[DPM++ 2M Karras,DPM++ SDE Karras,DPM++ 2M SDE Exponential,DPM++ 2M SDE Karras,Euler a,Euler,LMS,Heun,DPM2,DPM2 a,DPM++ 2S a,DPM++ 2M,DPM++ SDE,DPM++ 2M SDE,DPM++ 2M SDE Heun,DPM++ 2M SDE Heun Karras,DPM++ 2M SDE Heun Exponential,DPM++ 3M SDE,DPM++ 3M SDE Karras,DPM++ 3M SDE Exponential,DPM fast,DPM adaptive,LMS Karras,DPM2 Karras,DPM2 a Karras,DPM++ 2S a Karras,Restart,DDIM,PLMS,UniPC],num_inference_steps:i,seed:i,downscaling:b,downscaling_resolution:i,lora_links,custom_sd_model,sharpen:n,mask,handfix[disabled,hands_only,image_and_hands],pattern:b,output_format[webp,jpg,png]"],
  // prunaai
  "prunaai/flux-fast": ["Pruna FLUX Fast",
    "speed_mode[Lightly Juiced 🍊 (more consistent),Juiced 🔥 (default),Extra Juiced 🔥 (more speed),Blink of an eye 👁️],aspect_ratio[1:1,16:9,21:9,3:2,2:3,4:5,5:4,3:4,4:3,9:16,9:21],output_format[png,jpg,webp],guidance:n,image_size:i,num_inference_steps:i,output_quality:i,*prompt,seed:i"],
  "prunaai/hidream-l1-dev": ["HiDream L1 Dev",
    "*prompt,model_type[dev],speed_mode[Unsqueezed 🍋 (highest quality),Lightly Juiced 🍊 (more consistent),Juiced 🔥 (more speed),Extra Juiced 🚀 (even more speed)],resolution[1024 × 1024 (Square),768 × 1360 (Portrait),1360 × 768 (Landscape),880 × 1168 (Portrait),1168 × 880 (Landscape),1248 × 832 (Landscape),832 × 1248 (Portrait)],seed:i,output_format[png,jpg,webp],output_quality:i"],
  "prunaai/hidream-l1-fast": ["HiDream L1 Fast",
    "*prompt,model_type[fast],speed_mode[Unsqueezed 🍋 (highest quality),Lightly Juiced 🍊 (more consistent),Juiced 🔥 (more speed),Extra Juiced 🚀 (even more speed)],resolution[1024 × 1024 (Square),768 × 1360 (Portrait),1360 × 768 (Landscape),880 × 1168 (Portrait),1168 × 880 (Landscape),1248 × 832 (Landscape),832 × 1248 (Portrait)],seed:i,output_format[png,jpg,webp],output_quality:i,negative_prompt"],
  "prunaai/hidream-l1-full": ["HiDream L1 Full",
    "*prompt,model_type[full],speed_mode[Unsqueezed 🍋 (highest quality),Lightly Juiced 🍊 (more consistent),Juiced 🔥 (more speed),Extra Juiced 🚀 (even more speed)],resolution[1024 × 1024 (Square),768 × 1360 (Portrait),1360 × 768 (Landscape),880 × 1168 (Portrait),1168 × 880 (Landscape),1248 × 832 (Landscape),832 × 1248 (Portrait)],seed:i,output_format[png,jpg,webp],output_quality:i"],
  "prunaai/p-image": ["Pruna P-Image",
    "*prompt,aspect_ratio[1:1,16:9,9:16,4:3,3:4,3:2,2:3,custom],width:i,height:i,prompt_upsampling:b,seed:i,disable_safety_checker:b,lora_weights,lora_scale:n"],
  "prunaai/p-image-edit": ["Pruna P-Image Edit",
    "*prompt,images:a,turbo:b,aspect_ratio[match_input_image,1:1,16:9,9:16,4:3,3:4,3:2,2:3],seed:i,disable_safety_checker:b"],
  "prunaai/p-image-upscale": ["Pruna P-Image Upscale",
    "*image,upscale_mode[target,factor],target:i,factor:n,enhance_details:b,enhance_realism:b,output_format[webp,jpg,png],output_quality:i,disable_safety_checker:b"],
  "prunaai/wan-2.2-image": ["Pruna Wan 2.2 Image",
    "*prompt,juiced:b,aspect_ratio[1:1,16:9,9:16,4:3,3:4,21:9],megapixels:i[1,2],seed:i,output_format[png,jpg,webp],output_quality:i,lora_weights_transformer,lora_scale_transformer:n,lora_weights_transformer_2,lora_scale_transformer_2:n"],
  "prunaai/z-image-turbo": ["Z-Image Turbo",
    "*prompt,height:i,width:i,num_inference_steps:i,guidance_scale:n,seed:i,go_fast:b,output_format[png,jpg,webp],output_quality:i,num_outputs:i,safety_tolerance:i,negative_prompt,aspect_ratio,megapixels,disable_safety_checker:b,enable_safety_checker:b"],
  // quiverai
  "quiverai/arrow-1.1": ["Arrow 1.1",
    "*prompt,instructions,references:a,temperature:n,top_p:n,presence_penalty:n"],
  "quiverai/arrow-1.1-max": ["Arrow 1.1 Max",
    "*prompt,instructions,references:a,temperature:n,top_p:n,presence_penalty:n"],
  // qwen
  "qwen/qwen-image": ["Qwen Image",
    "aspect_ratio[1:1,16:9,9:16,4:3,3:4,3:2,2:3],image_size[optimize_for_quality,optimize_for_speed],output_format[webp,jpg,png],disable_safety_checker:b,enhance_prompt:b,extra_lora_scale:a,extra_lora_weights:a,go_fast:b,guidance:n,image,lora_scale:n,lora_weights,negative_prompt,num_inference_steps:i,output_quality:i,*prompt,seed:i,strength:n"],
  "qwen/qwen-image-edit": ["Qwen Image Edit",
    "*prompt,*image,aspect_ratio[1:1,16:9,9:16,4:3,3:4,match_input_image],go_fast:b,seed:i,output_format[webp,jpg,png],output_quality:i,disable_safety_checker:b"],
  "qwen/qwen-image-edit-plus": ["Qwen Image Edit Plus",
    "aspect_ratio[1:1,16:9,9:16,4:3,3:4,match_input_image],output_format[webp,jpg,png],disable_safety_checker:b,go_fast:b,*image:a,output_quality:i,*prompt,seed:i"],
  // recraft-ai
  "recraft-ai/recraft-creative-upscale": ["Recraft Creative Upscale",
    "*image"],
  "recraft-ai/recraft-crisp-upscale": ["Recraft Crisp Upscale",
    "*image"],
  "recraft-ai/recraft-v3": ["Recraft V3",
    "aspect_ratio[Not set,1:1,4:3,3:4,3:2,2:3,16:9,9:16,1:2,2:1,7:5,5:7,4:5,5:4,3:5,5:3],size[1024x1024,1365x1024,1024x1365,1536x1024,1024x1536,1820x1024,1024x1820,1024x2048,2048x1024,1434x1024,1024x1434,1024x1280,1280x1024,1024x1707,1707x1024],style[any,realistic_image,digital_illustration,digital_illustration/pixel_art,digital_illustration/hand_drawn,digital_illustration/grain,digital_illustration/infantile_sketch,digital_illustration/2d_art_poster,digital_illustration/handmade_3d,digital_illustration/hand_drawn_outline,digital_illustration/engraving_color,digital_illustration/2d_art_poster_2,realistic_image/b_and_w,realistic_image/hard_flash,realistic_image/hdr,realistic_image/natural_light,realistic_image/studio_portrait,realistic_image/enterprise,realistic_image/motion_blur],*prompt"],
  "recraft-ai/recraft-v3-svg": ["Recraft V3 SVG",
    "aspect_ratio[Not set,1:1,4:3,3:4,3:2,2:3,16:9,9:16,1:2,2:1,7:5,5:7,4:5,5:4,3:5,5:3],size[1024x1024,1365x1024,1024x1365,1536x1024,1024x1536,1820x1024,1024x1820,1024x2048,2048x1024,1434x1024,1024x1434,1024x1280,1280x1024,1024x1707,1707x1024],style[any,engraving,line_art,line_circuit,linocut],*prompt"],
  "recraft-ai/recraft-v4-pro": ["Recraft V4 Pro",
    "*prompt,aspect_ratio[Not set,1:1,4:3,3:4,3:2,2:3,16:9,9:16,1:2,2:1,4:5,5:4,6:10,14:10,10:14],size[2048x2048,3072x1536,1536x3072,2560x1664,1664x2560,2432x1792,1792x2432,2304x1792,1792x2304,1664x2688,2560x1792,1792x2560,2688x1536,1536x2688]"],
  "recraft-ai/recraft-v4-svg": ["Recraft V4 SVG",
    "*prompt,aspect_ratio[Not set,1:1,4:3,3:4,3:2,2:3,16:9,9:16,1:2,2:1,14:10,10:14,4:5,5:4,6:10],size[1024x1024,1536x768,768x1536,1280x832,832x1280,1216x896,896x1216,1152x896,896x1152,832x1344,1280x896,896x1280,1344x768,768x1344]"],
  // sourceful
  "sourceful/riverflow-2.0-pro": ["Riverflow 2.0 Pro",
    "*instruction,init_images:a,super_resolution_refs:a,resolution[1K,2K,4K],aspect_ratio[auto,21:9,16:9,3:2,4:3,5:4,1:1,4:5,3:4,2:3,9:16],output_format[webp,png],font_urls:a,font_texts:a,transparency:b,enhance_prompt:b,max_iterations:i,safety_checker:b"],
  // stability-ai
  "stability-ai/sdxl": ["SDXL",
    "prompt,negative_prompt,image,mask,width:i,height:i,num_outputs:i,scheduler[DDIM,DPMSolverMultistep,HeunDiscrete,KarrasDPM,K_EULER_ANCESTRAL,K_EULER,PNDM],num_inference_steps:i,guidance_scale:n,prompt_strength:n,seed:i,refine[no_refiner,expert_ensemble_refiner,base_image_refiner],high_noise_frac:n,refine_steps:i,apply_watermark:b,lora_scale:n,disable_safety_checker:b"],
  "stability-ai/stable-diffusion-3.5-large": ["Stable Diffusion 3.5 Large",
    "prompt,aspect_ratio[1:1,16:9,21:9,3:2,2:3,4:5,5:4,3:4,4:3,9:16,9:21],cfg:n,image,prompt_strength:n,steps:i,seed:i,output_format[webp,jpg,png],output_quality:i"],
  "stability-ai/stable-diffusion-3.5-large-turbo": ["Stable Diffusion 3.5 Large Turbo",
    "prompt,aspect_ratio[1:1,16:9,21:9,3:2,2:3,4:5,5:4,3:4,4:3,9:16,9:21],cfg:n,image,prompt_strength:n,steps:i,seed:i,output_format[webp,jpg,png],output_quality:i"],
  "stability-ai/stable-diffusion-3.5-medium": ["Stable Diffusion 3.5 Medium",
    "prompt,aspect_ratio[1:1,16:9,21:9,3:2,2:3,4:5,5:4,3:4,4:3,9:16,9:21],cfg:n,image,prompt_strength:n,steps:i,seed:i,output_format[webp,jpg,png],output_quality:i"],
  // tencent
  "tencent/hunyuan-image-3": ["Hunyuan Image 3.0",
    "*prompt,aspect_ratio[1:1,16:9,21:9,3:2,2:3,4:5,5:4,3:4,4:3,9:16,9:21],go_fast:b,seed:i,output_format[webp,jpg,png],output_quality:i,disable_safety_checker:b"],
  // topazlabs
  "topazlabs/image-upscale": ["Topaz Image Upscale",
    "*image,enhance_model[Standard V2,Low Resolution V2,CGI,High Fidelity V2,Text Refine],upscale_factor[None,2x,4x,6x],output_format[jpg,png],subject_detection[None,All,Foreground,Background],face_enhancement:b,face_enhancement_creativity:n,face_enhancement_strength:n"],
  // wan-video
  "wan-video/wan-2.7-image": ["Wan 2.7 Image",
    "*prompt,images:a,size[1K,2K,1024*1024,2048*2048,1280*720,720*1280,2048*1152,1152*2048,1024*768,768*1024,2048*1536,1536*2048],num_outputs:i,image_set_mode:b,thinking_mode:b,seed:i"],
  "wan-video/wan-2.7-image-pro": ["Wan 2.7 Image Pro",
    "*prompt,images:a,size[1K,2K,4K,1024*1024,2048*2048,4096*4096,1280*720,720*1280,2048*1152,1152*2048,4096*2304,2304*4096,1024*768,768*1024,2048*1536,1536*2048,4096*3072,3072*4096],num_outputs:i,image_set_mode:b,thinking_mode:b,seed:i"],
  // xai
  "xai/grok-imagine-image": ["Grok Imagine Image",
    "*prompt,image,n:i,aspect_ratio[1:1,16:9,9:16,4:3,3:4,3:2,2:3,2:1,1:2,19.5:9,9:19.5,20:9,9:20,auto]"],
  // zsxkib
  "zsxkib/aura-sr-v2": ["AuraSR V2",
    "*image,max_batch_size:i,output_format[webp,jpg,png],output_quality:i"],
  "zsxkib/step1x-edit": ["Step1X Edit",
    "*image,prompt,size_level:i[512,768,1024],seed:i,output_format[webp,jpg,png],output_quality:i"],
};

// ── client field → model field ───────────────────────────────────────────────
// 9router publishes ONE image request body, so the generic names it documents
// (`prompt`, `n`, `size`, `ratio`, `image`, `images`, `mask_image`, …) have to
// land on whatever each model calls the same thing. Each entry lists the body
// keys a model field will accept, in priority order; a field absent from this
// map only accepts its own name, which is what makes the long tail (guidance,
// num_inference_steps, style_type, megapixels, speed_mode, …) work with no
// per-field code.
//
// `image` leads every reference-image entry because it is the ONE name the
// dashboard's edit affordance and the /v1/images/edits body both send.
const FIELD_SOURCES = {
  // how many images to return
  num_outputs: ["num_outputs", "n"],
  number_of_images: ["number_of_images", "n"],
  num_results: ["num_results", "n"],
  num_images: ["num_images", "n"],
  max_images: ["max_images", "n"],
  n: ["n"],
  // single source / reference image. `image` is itself a required ARRAY on
  // qwen-image-edit-plus, and castType turns one URL into a one-item list, so
  // the same body works there without a second name.
  image: ["image", "input_image", "image_prompt"],
  input_image: ["input_image", "image", "image_prompt"],
  image_prompt: ["image_prompt", "image", "input_image"],
  control_image: ["control_image", "image", "input_image"],
  redux_image: ["redux_image", "image", "input_image"],
  ref_image_url: ["ref_image_url", "image_reference", "image"],
  // Multi-slot models number their inputs. `images` fills slot 2 and 3 from a
  // list so one body can drive them, and `image` still fills slot 1.
  input_image_1: ["input_image_1", "image", "input_image"],
  input_image_2: ["input_image_2", "image_2", "last_frame"],
  image_2: ["image_2", "last_frame"],
  image_3: ["image_3"],
  // typed references (Luma, MiniMax). A caller who only has `image` gets the
  // model's own default reading of it, which for these is the image reference.
  image_reference: ["image_reference", "image"],
  character_reference: ["character_reference", "image"],
  style_reference: ["style_reference", "style_image", "image"],
  subject_reference: ["subject_reference", "image"],
  // image lists
  input_images: ["input_images", "images", "image", "reference_images"],
  image_input: ["image_input", "images", "image", "reference_images"],
  images: ["images", "image", "reference_images"],
  init_images: ["init_images", "images", "image"],
  references: ["references", "reference_images", "images", "image"],
  super_resolution_refs: ["super_resolution_refs", "reference_images"],
  style_reference_images: ["style_reference_images", "style_images", "images"],
  // masks
  mask: ["mask", "mask_image", "mask_url"],
  // the edit instruction. A model that calls its prompt something else still
  // reads the one `prompt` every 9router image request carries.
  instruction: ["instruction", "prompt"],
  instructions: ["instructions"],
  bg_prompt: ["bg_prompt", "prompt"],
  structured_prompt: ["structured_prompt"],
  structured_instruction: ["structured_instruction"],
  // geometry. `size` reaches ratio-only and tier-only models through derived();
  // where the model's own `size`/`resolution` is an enum, snapEnum places it.
  aspect_ratio: ["aspect_ratio", "ratio"],
  size: ["size", "resolution"],
  resolution: ["resolution", "size"],
  image_size: ["image_size", "resolution", "size"],
  megapixels: ["megapixels", "output_megapixels"],
  output_megapixels: ["output_megapixels", "megapixels"],
  size_level: ["size_level"],
  canvas_size: ["canvas_size", "size"],
  // upscalers each name their factor differently, and `upscale_factor` is the
  // one the dashboard publishes.
  upscale_factor: ["upscale_factor", "scale_factor", "scale"],
  scale_factor: ["scale_factor", "upscale_factor", "scale"],
  scale: ["scale", "upscale_factor", "scale_factor"],
  factor: ["factor", "upscale_factor", "scale_factor", "scale"],
  desired_increase: ["desired_increase", "upscale_factor", "scale_factor"],
  // Engine-variant inputs: a `model` input naming an internal checkpoint. The
  // body's own `model` is the 9router routing id, so it is never read here.
  model: ["model_variant", "variant", "engine"],
  model_variant: ["model_variant", "variant", "engine"],
  sd_model: ["sd_model", "model_variant"],
  enhance_model: ["enhance_model", "model_variant"],
  // output
  output_format: ["output_format"],
  output_quality: ["output_quality", "compression_quality"],
  compression_quality: ["compression_quality", "output_quality"],
  output_compression: ["output_compression", "output_quality"],
  // safety. One `safety_checker` request reaches every spelling, including the
  // two models that publish both polarities.
  disable_safety_checker: ["disable_safety_checker"],
  enable_safety_checker: ["enable_safety_checker"],
  safety_checker: ["safety_checker"],
  safety_tolerance: ["safety_tolerance"],
  safety_filter_level: ["safety_filter_level"],
  content_moderation: ["content_moderation", "moderation"],
  moderation: ["moderation", "content_moderation"],
};

// Human wording for a missing required field, so the 400 tells the caller what
// to send rather than echoing the model's internal field name.
const HINTS = {
  prompt: "'prompt'",
  instruction: "'prompt' (edit instruction)",
  image: "'image' (source image URL)",
  input_image: "'image' (source image URL)",
  image_prompt: "'image' (reference image URL)",
  control_image: "'image' (control image URL)",
  redux_image: "'image' (source image URL)",
  input_image_1: "'image' (first image URL)",
  input_image_2: "'image_2' (second image URL)",
  input_images: "'image' or 'images' (one or more image URLs)",
  image_input: "'image' or 'images' (one or more image URLs)",
  images: "'image' or 'images' (one or more image URLs)",
  reference_images: "'images' (one or more reference image URLs)",
  mask: "'mask_image' (mask image URL)",
  openai_api_key: "'openai_api_key' (your own OpenAI key, billed by OpenAI)",
};

// Client-facing name for a model field, used to build the registry's per-model
// `params` (and therefore the dashboard's inputs). Anything not named here is
// published under its own Replicate name.
//
// The count fields all publish as `n`, and every single-image field as `image`,
// because those are the names the shared image request documents.
const PUBLIC_NAMES = {
  num_outputs: "n",
  number_of_images: "n",
  num_results: "n",
  num_images: "n",
  max_images: "n",
  input_image: "image",
  image_prompt: "image",
  control_image: "image",
  redux_image: "image",
  image_reference: "image",
  input_image_1: "image",
  input_image_2: "image_2",
  input_images: "images",
  image_input: "images",
  init_images: "images",
  references: "images",
  super_resolution_refs: "images",
  mask: "mask_image",
  aspect_ratio: "ratio",
  instruction: "prompt",
  scale_factor: "upscale_factor",
  scale: "upscale_factor",
  factor: "upscale_factor",
  output_megapixels: "megapixels",
  model: "model_variant",
  sd_model: "model_variant",
  enhance_model: "model_variant",
  compression_quality: "output_quality",
  moderation: "content_moderation",
};

// Body keys that are 9router routing metadata, never model input.
const NON_INPUT_KEYS = new Set(["model", "response_format", "stream", "user", "quality_preset"]);

/**
 * Extra body keys derived from `size`, so the one common request works against
 * models that only speak in aspect ratios or explicit dimensions (and vice
 * versa). Never overrides what the caller sent explicitly, and "auto" is left
 * for the model to interpret.
 *
 * `width`/`height` are derived only for models that take them AND have no size
 * enum of their own. On FLUX.2 and Seedream those two fields are read only in a
 * "custom" mode the caller did not ask for, so filling them alongside a snapped
 * `resolution`/`size` would describe two different pictures; where they are the
 * only way to say a size (z-image-turbo), they are all there is.
 */
function derived(body, spec) {
  const raw = typeof body?.size === "string" ? body.size.trim() : "";
  if (!raw || raw.toLowerCase() === "auto") return {};
  const dim = parseSize(raw);
  if (!dim) return {};
  const out = {};
  if (!body?.aspect_ratio && !body?.ratio) out.aspect_ratio = ratioForSize(dim);
  const sized = ["size", "resolution", "image_size", "megapixels", "output_megapixels"]
    .some((name) => spec?.fields?.get(name)?.values?.length);
  if (!sized) {
    if (body?.width === undefined && spec?.fields?.has("width")) out.width = dim.width;
    if (body?.height === undefined && spec?.fields?.has("height")) out.height = dim.height;
  }
  return out;
}

/**
 * `size` is offered whenever a model speaks in ratios, tiers or dimensions —
 * one `size: "1280x720"` then reaches all of them. Models whose own `size` field
 * already exists publish that instead, since the spec snaps into it directly.
 */
function extraFields(spec) {
  if (spec.fields.has("size")) return [];
  for (const name of ["aspect_ratio", "resolution", "image_size", "megapixels", "output_megapixels", "width"]) {
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
  label: "replicate image",
  derived,
  extraFields,
});

export const { normalizeModelId, resolveSpec, buildInput, modelFields, catalogue } = CATALOG;

// Every field on any model that takes an image, from the census of all 94
// schemas (`format: uri`, or an array of them). A model with one of these can
// edit; one that REQUIRES one can only edit.
const IMAGE_FIELDS = [
  "image", "input_image", "image_prompt", "control_image", "redux_image", "ref_image_url",
  "input_image_1", "input_image_2", "image_2", "image_3",
  "image_reference", "character_reference", "style_reference", "subject_reference",
  "input_images", "image_input", "images", "init_images", "references",
  "super_resolution_refs", "style_reference_images",
];

/**
 * What a model can do, from its own schema.
 *
 * A model with a required image field can only edit; one with an optional image
 * field does both; one with none is text-to-image. Deriving this from the spec
 * rather than declaring it per model is what keeps the dashboard's edit affordance
 * honest — a model that gained an image input gains the affordance with it.
 */
export function modelCapabilities(model) {
  const spec = resolveSpec(model);
  if (!spec) return ["text2img"];
  const has = IMAGE_FIELDS.filter((name) => spec.fields.has(name));
  const caps = [];
  const requiresImage = has.some((name) => spec.fields.get(name).required);
  if (!requiresImage) caps.push("text2img");
  if (has.length) caps.push("edit");
  if (spec.fields.has("mask")) caps.push("mask");
  return caps.length ? caps : ["text2img"];
}

// ── adapter ─────────────────────────────────────────────────────────────────
// Replicate is async, but a single blocking call is enough for most image
// models: `Prefer: wait` holds the create open until the render lands. Slower
// ones return still-running and are polled here, so the caller always gets
// finished images from one POST — the shape every other image provider returns.

// Wait this long inside the create call before falling back to polling. This is
// Replicate's own ceiling for `Prefer: wait`.
const PREFER_WAIT_SECONDS = MAX_PREFER_WAIT_SECONDS;

/** Poll a prediction until it leaves starting/processing. */
async function pollPrediction(prediction, headers) {
  let current = prediction;
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  const url = current?.urls?.get || pollUrl(current?.id);

  while (!TERMINAL_STATUSES.has(current?.status)) {
    if (Date.now() >= deadline) throw new Error("Replicate prediction polling timeout");
    await sleep(POLL_INTERVAL_MS);
    const res = await fetch(url, { headers });
    const text = await res.text().catch(() => "");
    if (!res.ok) throw new Error(`Replicate prediction status ${res.status}: ${upstreamError(text, res.status)}`);
    try {
      current = JSON.parse(text);
    } catch {
      throw new Error("Replicate: unparseable prediction status");
    }
  }
  return current;
}

export default {
  async: true,

  buildUrl: (model) => {
    const spec = resolveSpec(model);
    if (!spec) throw new Error(`replicate image: unknown model '${model}'`);
    // The resolved id keeps a caller's `:hash` when they pinned one; createUrl
    // reads the version to pick the route (see ../replicate/versions.js).
    return createUrl(pinnedId(model, spec));
  },

  buildHeaders: (credentials) => buildHeaders(credentials, { create: true, waitSeconds: PREFER_WAIT_SECONDS }),

  buildBody: (model, body) => {
    const spec = resolveSpec(model);
    if (!spec) throw new Error(`replicate image: unknown model '${model}'`);
    return createBody(pinnedId(model, spec), buildInput(model, body));
  },

  /**
   * `Prefer: wait` means a finished prediction may already be here; anything
   * still running is polled to completion. Either way `normalize` sees a
   * terminal prediction, so it never has to know which path ran.
   */
  async parseResponse(response, { headers }) {
    const text = await response.text().catch(() => "");
    let prediction;
    try {
      prediction = JSON.parse(text);
    } catch {
      throw new Error("Replicate: unparseable prediction response");
    }
    // Polls must not carry the create-only Prefer/Content-Type headers.
    const pollHeaders = { Accept: "application/json", ...(headers?.Authorization ? { Authorization: headers.Authorization } : {}) };
    const settled = TERMINAL_STATUSES.has(prediction?.status) ? prediction : await pollPrediction(prediction, pollHeaders);

    if (settled?.status !== "succeeded") {
      const detail = predictionError(settled);
      throw new Error(`Replicate prediction ${settled?.status || "failed"}${detail ? `: ${detail}` : ""}`);
    }
    return settled;
  },

  normalize: (prediction, prompt) => {
    // A model may hand back its rewritten prompt alongside the images; passing it
    // through matches what the OpenAI-shaped response documents.
    const revised = typeof prediction?.output?.revised_prompt === "string" ? prediction.output.revised_prompt : prompt;
    return {
      created: nowSec(),
      data: outputUrls(prediction?.output).map((url) => ({ url, revised_prompt: revised })),
    };
  },
};
