// Replicate — version pins for the models that need one.
//
// Replicate has two creation routes and which one a model takes is a property OF
// THE MODEL, not of the request:
//
//   official  POST /v1/models/{owner}/{name}/predictions   { input }
//   community POST /v1/predictions                         { version, input }
//
// An official model is maintained by Replicate, always warm, and has a stable
// input schema, so it runs from `owner/name` alone and never needs a hash here.
// A community model has no route of its own — posting to `/v1/models/...` for one
// is a 404 — so the only way to run it is to name a version, and 9router has to
// carry that version itself.
//
// The cost is the obvious one: a pin is a snapshot. When one of these authors
// publishes a new version this table keeps running the old one until it is
// updated, and if a version is deleted the model stops working. That is the
// tradeoff community models come with; the alternative (a lookup of
// `GET /v1/models/{owner}/{name}` before every render) would add a round trip
// and an auth-shaped failure mode to every single request. A caller who wants a
// different version can always pin their own: `replicate/<owner>/<name>:<hash>`
// wins over this table.
//
// Verified against each model's own page: `is_official: false` AND absent from
// https://replicate.com/collections/official.
export const COMMUNITY_VERSIONS = {
  // image
  "bytedance/bagel": "7dd8def79e503990740db4704fa81af995d440fefe714958531d7044d2757c9c",
  "fofr/sticker-maker": "4acb778eb059772225ec213948f0660867b2e03f277448f18cf1800b96a65a1a",
  "lucataco/omnigen2": "5b9ea1d0821a60be9c861ebfc3513d121ecd8cab1932d3aa8d703e517988502e",
  "nvidia/sana": "c6b5d2b7459910fec94432e9e1203c3cdce92d6db20f714f1355747990b52fa6",
  "nvidia/sana-sprint-1.6b": "038aee6907b53a5c148780983e39a50ce7cd0747b4e2642e78387f48cf36039a",
  "philz1337x/clarity-upscaler": "dfad41707589d68ecdccd1dfa600d55a208f9310748e44bfe35b4a6291453d5e",
  "prunaai/hidream-l1-dev": "4dfcd146c0def4812455415f55556f6bc84025dcb15193cf1977f01bd384d191",
  "prunaai/hidream-l1-full": "03d58532fd29e39fd2ed80e86c3da1cebec28ef2734081cf1366710d30388f42",
  "stability-ai/sdxl": "7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc",
  "zsxkib/aura-sr-v2": "5c137257cce8d5ce16e8a334b70e9e025106b5580affed0bc7d48940b594e74c",
  "zsxkib/step1x-edit": "12b5a5a61e3419f792eb56cfc16eed046252740ebf5d470228f9b4cf2c861610",
  // video
  "arielreplicate/robust_video_matting": "73d2128a371922d5d1abf0712a1d974be0e4e2358cc1218e4e34714767232bac",
  "bytedance/latentsync": "637ce1919f807ca20da3a448ddc2743535d2853649574cd52a933120e9b9e293",
  "cuuupid/cogvideox-5b": "5b14e2c2c648efecc8d36c6353576552f8a124e690587212f8e8bb17ecda3d8c",
  "fictions-ai/autocaption": "18a45ff0d95feb4449d192bbdc06b4a6df168fa33def76dfc51b78ae224b599b",
  "genmoai/mochi-1": "1944af04d098ef69bed7f9d335d102e652203f268ec4aaa2d836f6217217e460",
  "lightricks/ltx-video": "8c47da666861d081eeb4d1261853087de23923a268a69b63febdf5dc1dee08e4",
  "lightricks/ltx-video-0.9.7": "b1a80c6dbce390c23bb52aecebc0e09d445ac12136dd4dc539350c76030fc815",
  "lightricks/ltx-video-0.9.7-distilled": "e7f2778ec419047c564a6620b2d9bf7d6c64673411bf2ae13e628ee2b2c0b5b1",
  "lucataco/real-esrgan-video": "3e56ce4b57863bd03048b42bc09bdd4db20d427cca5fde9d8ae4dc60e1bb4775",
  "meta/sam-2-video": "33432afdfc06a10da6b4018932893d39b0159f838b6d11dd1236dff85cc5ec1d",
  "tencent/hunyuan-video": "6c9132aee14409cd6568d030453f1ba50f5f3412b844fe67f78a9eb62d55664f",
  "tmappdev/lipsync": "569bcd925698ea23d4bece4528546992012d84267ce2438ecc803618ce23764c",
  "zsxkib/film-frame-interpolation-for-large-motion": "222d67420da179935a68afff47093bab48705fe9e09c3c79268c1eb2ee7c5e91",
  "zsxkib/hunyuan-video2video": "d550f226f28b1030c2fedd2947f39f19b4b0233b50364904538caaf037fb18d3",
  "zsxkib/mmaudio": "62871fb59889b2d7c13777f08deb3b36bdff88f7e1d53a50ad7694548a41b484",
  "zsxkib/multitalk": "0bd2390c40618c910ffc345b36c8fd218fd8fa59c9124aa641fea443fa203b44",
  "zsxkib/pyramid-flow": "8e221e66498a52bb3a928a4b49d85379c99ca60fec41511265deec35d547c1fb",
  "zsxkib/seedvr2": "ca98249be9cb623f02a80a7851a2b1a33d5104c251a8f5a1588f251f79bf7c78",
};

/**
 * The version a model must be run at, or null when it runs from its name.
 *
 * A caller's own pin (`owner/name:hash`) always wins — that is the escape hatch
 * from the table above. Everything else is a lookup: a community model gets its
 * pinned version, an official model gets null and takes the official route.
 */
export function resolveVersion(modelId) {
  const raw = String(modelId || "").trim();
  const colon = raw.indexOf(":");
  if (colon !== -1) {
    const pinned = raw.slice(colon + 1).trim();
    return pinned || null;
  }
  return COMMUNITY_VERSIONS[raw] || null;
}
