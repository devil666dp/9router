package com.ninerouter.app

import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.*
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

fun json(vararg pairs: Pair<String, Any?>) = JSONObject().apply {
    pairs.forEach { (key, value) -> put(key, value ?: JSONObject.NULL) }
}
fun JSONObject.objects(key: String): List<JSONObject> {
    val values = optJSONArray(key) ?: return emptyList()
    return (0 until values.length()).mapNotNull { values.optJSONObject(it) }
}
fun JSONArray.strings() = (0 until length()).map { optString(it) }

/** Only a server origin is accepted. Never silently discard URL credentials/paths. */
fun serverOrigin(input: String, debug: Boolean = false): HttpUrl {
    val url = input.trim().toHttpUrl()
    require(url.username.isEmpty() && url.password.isEmpty()) { "Do not include credentials in the URL." }
    require(url.encodedPath == "/" && url.query == null && url.fragment == null) {
        "Enter the server origin only, without /v1, /dashboard, a query, or a fragment."
    }
    require(url.isHttps || (debug && url.host in setOf("localhost", "127.0.0.1", "10.0.2.2"))) {
        "HTTPS is required. Debug builds also allow HTTP on localhost and 10.0.2.2."
    }
    return url
}

/** The encrypted store implementation lives in SessionStore.kt; tests use an in-memory store. */
interface CookieStore { fun read(): String; fun write(value: String) }
class SessionCookies(private val origin: HttpUrl, private val store: CookieStore) : CookieJar {
    private var cookies = runCatching {
        val saved = JSONObject(store.read().ifBlank { "{}" })
        if (saved.optString("origin") != origin.toString()) emptyList()
        else (saved.optJSONArray("cookies") ?: JSONArray()).strings().mapNotNull { Cookie.parse(origin, it) }
    }.getOrDefault(emptyList())

    @Synchronized override fun loadForRequest(url: HttpUrl): List<Cookie> {
        if (!sameOrigin(url, origin)) return emptyList()
        return cookies.filter { it.expiresAt > System.currentTimeMillis() && it.matches(url) }
    }
    @Synchronized override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        if (!sameOrigin(url, origin)) return
        // Restrict to dashboard session, never persist provider OAuth/SSO cookies.
        cookies.filter { it.name == "auth_token" }.forEach { incoming ->
            this.cookies = this.cookies.filterNot { it.name == incoming.name } + incoming
        }
        this.cookies = this.cookies.filter { it.expiresAt > System.currentTimeMillis() }
        store.write(json("origin" to origin.toString(), "cookies" to JSONArray(this.cookies.map { it.toString() })).toString())
    }
    @Synchronized fun clear() { cookies = emptyList(); store.write("") }
}
fun sameOrigin(a: HttpUrl, b: HttpUrl) = a.scheme == b.scheme && a.host == b.host && a.port == b.port
class ApiFailure(val status: Int, val retryAfterSeconds: Int, message: String) : IOException(message)

class RouterApi(val origin: HttpUrl, store: CookieStore) {
    val sessions = SessionCookies(origin, store)
    private val http = OkHttpClient.Builder()
        .cookieJar(sessions)
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .callTimeout(120, TimeUnit.SECONDS)
        .followRedirects(false).followSslRedirects(false)
        // Mutations are never automatically replayed after network failure.
        .retryOnConnectionFailure(false)
        .build()

    suspend fun request(path: String, method: String = "GET", body: JSONObject? = null): JSONObject {
        require(path.startsWith("/api/") && !path.startsWith("//"))
        val url = requireNotNull(origin.resolve(path))
        require(sameOrigin(origin, url))
        val payload = if (method in setOf("POST", "PUT", "PATCH")) {
            (body ?: JSONObject()).toString().toRequestBody("application/json; charset=utf-8".toMediaType())
        } else null
        val request = Request.Builder().url(url).header("Accept", "application/json")
            .header("Cache-Control", "no-store").method(method, payload).build()
        return suspendCancellableCoroutine { continuation ->
            val call = http.newCall(request)
            continuation.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    if (continuation.isActive) continuation.resumeWithException(e)
                }
                override fun onResponse(call: Call, response: Response) {
                    val result = runCatching {
                        response.use {
                            // Bound payloads: refuse unexpected HTML/oversized responses instead of showing a blank screen.
                            val source = requireNotNull(it.body).source()
                            source.request(4L * 1024 * 1024 + 1)
                            if (source.buffer.size > 4L * 1024 * 1024) throw IOException("Response too large. Use the web dashboard for this view.")
                            val text = source.readUtf8()
                            val parsed = runCatching { JSONObject(text.ifBlank { "{}" }) }.getOrNull()
                            if (!it.isSuccessful) {
                                throw ApiFailure(it.code,
                                    parsed?.optInt("retryAfter") ?: it.header("Retry-After")?.toIntOrNull() ?: 0,
                                    parsed?.optString("error")?.takeIf(String::isNotBlank)
                                        ?: "Server returned HTTP ${it.code}. Check the server address and authentication.")
                            }
                            parsed ?: throw IOException("Expected JSON from 9Router. Check the server address.")
                        }
                    }
                    if (continuation.isActive) result.fold({ continuation.resume(it) }, { continuation.resumeWithException(it) })
                }
            })
        }
    }
    fun disconnect() { http.dispatcher.cancelAll(); sessions.clear() }
    fun idPath(base: String, id: String) = origin.newBuilder().encodedPath(base)
        .addPathSegment(id).build().encodedPath
}
