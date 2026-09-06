package com.ninerouter.app

import kotlinx.coroutines.runBlocking
import okhttp3.Cookie
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.*
import org.junit.Test

private class MemoryStore : CookieStore {
    var value = ""
    override fun read() = value
    override fun write(value: String) { this.value = value }
}
class RouterApiTest {
    @Test fun rejectsUnsafeServerAddresses() {
        listOf("http://router.example.com", "https://user:pass@router.example.com", "https://router.example.com/v1", "https://router.example.com?key=x", "https://router.example.com/#x").forEach { value ->
            assertTrue(value, runCatching { serverOrigin(value) }.isFailure)
        }
        assertEquals("router.example.com", serverOrigin("https://router.example.com").host)
        assertTrue(runCatching { serverOrigin("http://192.168.1.3", true) }.isFailure)
        assertEquals("10.0.2.2", serverOrigin("http://10.0.2.2:20127", true).host)
    }
    @Test fun cookieNeverCrossesOriginAndCanBeCleared() {
        val store = MemoryStore()
        val origin = "https://router.example.com/".toHttpUrl()
        val jar = SessionCookies(origin, store)
        val cookie = Cookie.parse(origin, "auth_token=test-session; Path=/; HttpOnly; Secure; Max-Age=3600")!!
        jar.saveFromResponse(origin, listOf(cookie))
        assertEquals(1, jar.loadForRequest(origin.resolve("/api/keys")!!).size)
        assertTrue(jar.loadForRequest("https://other.example.com/".toHttpUrl()).isEmpty())
        assertTrue(jar.loadForRequest("http://router.example.com/".toHttpUrl()).isEmpty())
        assertTrue(jar.loadForRequest("https://router.example.com:8443/".toHttpUrl()).isEmpty())
        assertEquals(1, SessionCookies(origin, store).loadForRequest(origin).size)
        jar.clear()
        assertEquals("", store.value)
        assertTrue(jar.loadForRequest(origin).isEmpty())
    }
    @Test fun logoutCookieExpiresSession() {
        val origin = "https://router.example.com/".toHttpUrl()
        val jar = SessionCookies(origin, MemoryStore())
        jar.saveFromResponse(origin, listOf(Cookie.parse(origin, "auth_token=test; Path=/; Max-Age=60")!!))
        jar.saveFromResponse(origin, listOf(Cookie.parse(origin, "auth_token=; Path=/; Max-Age=0")!!))
        assertTrue(jar.loadForRequest(origin).isEmpty())
    }
    @Test fun backendContractsUseSessionCookieAndCorrectMethods() = runBlocking {
        val server = MockWebServer()
        server.start()
        try {
            server.enqueue(MockResponse().setBody("{\"success\":true}").addHeader("Set-Cookie", "auth_token=test; Path=/; HttpOnly"))
            server.enqueue(MockResponse().setBody("{\"keys\":[]}"))
            server.enqueue(MockResponse().setBody("{\"connection\":{\"id\":\"one\"}}"))
            val api = RouterApi(server.url("/"), MemoryStore())
            api.request("/api/auth/login", "POST", json("password" to "test-password"))
            assertEquals(0, api.request("/api/keys").objects("keys").size)
            api.request("/api/providers/one", "PUT", json("isActive" to false))
            val login = server.takeRequest()
            assertEquals("POST", login.method)
            assertEquals("/api/auth/login", login.path)
            assertEquals("test-password", org.json.JSONObject(login.body.readUtf8()).getString("password"))
            assertEquals("auth_token=test", server.takeRequest().getHeader("Cookie"))
            val update = server.takeRequest()
            assertEquals("PUT", update.method)
            assertFalse(org.json.JSONObject(update.body.readUtf8()).getBoolean("isActive"))
        } finally { server.shutdown() }
    }
    @Test fun errorsPreserveRetryAfterAndRedirectsAreNotFollowed() = runBlocking {
        val server = MockWebServer(); server.start()
        try {
            val api = RouterApi(server.url("/"), MemoryStore())
            server.enqueue(MockResponse().setResponseCode(429).setBody("{\"error\":\"Locked\",\"retryAfter\":30}"))
            val error = runCatching { api.request("/api/auth/login", "POST", json("password" to "bad")) }.exceptionOrNull() as ApiFailure
            assertEquals(429, error.status); assertEquals(30, error.retryAfterSeconds)
            server.enqueue(MockResponse().setResponseCode(302).setHeader("Location", "https://example.com/"))
            assertEquals(302, (runCatching { api.request("/api/keys") }.exceptionOrNull() as ApiFailure).status)
            assertEquals(2, server.requestCount)
        } finally { server.shutdown() }
    }
    @Test fun modelPriorityIsNotSortedOrDeduplicated() {
        assertEquals(listOf("a/model", "b/model", "a/model"), orderedModels(" a/model\n\nb/model\na/model\n"))
        assertTrue(validateComboName("my-combo.v2_1"))
        assertFalse(validateComboName("my combo"))
        assertFalse(validateComboName(""))
    }
}
