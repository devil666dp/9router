/**
 * Stamp which provider/model actually served a media request onto the response.
 *
 * A combo hands the caller a result from whichever member succeeded, which may not be the
 * one they asked for — and media responses mostly carry no model field of their own, so the
 * switch is otherwise invisible. Embedding models disagree on vector dimension and image
 * models on style and size, both of which matter downstream.
 *
 * The header is always set. A JSON body additionally gains a `model` field when it doesn't
 * already have one, so a plain `curl` (no `-i`) shows it too. Binary and streaming bodies
 * are passed through untouched — re-reading them would consume the stream.
 */

const SERVED_BY_HEADER = "x-9router-model";

export async function withServedByModel(response, provider, model) {
  if (!response) return response;

  const served = `${provider}/${model}`;
  const headers = new Headers(response.headers);
  headers.set(SERVED_BY_HEADER, served);

  const contentType = headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const isStream = contentType.includes("text/event-stream");

  if (!isJson || isStream) {
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }

  // JSON: add `model` when the provider didn't already report one.
  let payload;
  try {
    payload = await response.clone().json();
  } catch {
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload) || payload.model) {
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }

  const body = JSON.stringify({ ...payload, model: served });
  headers.delete("content-length");
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}
