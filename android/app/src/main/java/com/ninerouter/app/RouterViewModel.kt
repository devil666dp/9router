package com.ninerouter.app

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

enum class Screen(val title: String, val web: String) {
    Endpoint("Endpoint & keys", "/dashboard/endpoint"), Providers("Providers", "/dashboard/providers"),
    Usage("Usage", "/dashboard/usage"), More("More", "/dashboard"),
    Combos("Combos", "/dashboard/combos"), Quota("Quota tracker", "/dashboard/quota"),
    Proxies("Proxy pools", "/dashboard/proxy-pools"), Saver("Token saver", "/dashboard/token-saver"),
    Settings("Settings", "/dashboard/profile"), Logs("Request details", "/dashboard/usage?tab=details"),
    Media("Media providers", "/dashboard/media-providers/image")
}

data class RouterState(
    val server: String = "", val connected: Boolean = false, val screen: Screen = Screen.Endpoint,
    val busy: Boolean = false, val error: String? = null, val notice: String? = null,
    val retryAfter: Int = 0, val auth: JSONObject = JSONObject(),
    val rows: List<JSONObject> = emptyList(), val settings: JSONObject = JSONObject(),
    val data: JSONObject = JSONObject(), val detail: JSONObject? = null,
    val period: String = "today", val page: Int = 1, val theme: String = "system",
    val dynamic: Boolean = true, val formOpen: Boolean = false, val edit: JSONObject? = null
)

class RouterViewModel(app: Application) : AndroidViewModel(app) {
    private val prefs = app.getSharedPreferences("preferences", Application.MODE_PRIVATE)
    private val store = EncryptedCookieStore(app)
    private val _state = MutableStateFlow(RouterState(
        server = prefs.getString("server", "") ?: "",
        theme = prefs.getString("theme", "system") ?: "system",
        dynamic = prefs.getBoolean("dynamic", true)))
    val state = _state.asStateFlow()
    private var api: RouterApi? = null
    private var operation: Job? = null
    private var countdown: Job? = null

    private fun launchAction(block: suspend () -> Unit) {
        if (_state.value.busy) return
        _state.update { it.copy(busy = true, error = null, notice = null) }
        operation = viewModelScope.launch {
            try { block() }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                _state.update { it.copy(error = e.message ?: "Connection failed. Please retry.") }
                if (e is ApiFailure && e.status == 429 && e.retryAfterSeconds > 0) {
                    countdown?.cancel()
                    countdown = viewModelScope.launch {
                        _state.update { it.copy(retryAfter = e.retryAfterSeconds) }
                        while (_state.value.retryAfter > 0) { delay(1000); _state.update { it.copy(retryAfter = it.retryAfter - 1) } }
                    }
                }
            } finally { _state.update { it.copy(busy = false) } }
        }
    }
    fun connect(server: String, password: String) = launchAction {
        val origin = serverOrigin(server, BuildConfig.DEBUG)
        if (api?.origin != origin) {
            api?.disconnect()
            api = RouterApi(origin, store)
        }
        val client = requireNotNull(api)
        val auth = client.request("/api/auth/status")
        _state.update { it.copy(auth = auth, server = origin.toString().trimEnd('/')) }
        if (!auth.optBoolean("authenticated") && auth.optBoolean("requireLogin", true)) {
            require(password.isNotBlank()) { "Enter your dashboard password. SSO-only deployments must use the browser dashboard." }
            client.request("/api/auth/login", "POST", json("password" to password))
        }
        prefs.edit().putString("server", origin.toString().trimEnd('/')).apply()
        _state.update { it.copy(connected = true, screen = Screen.Endpoint, detail = null) }
        load()
    }
    fun navigate(screen: Screen) {
        if (_state.value.busy) return
        _state.update { it.copy(screen = screen, rows = emptyList(), data = JSONObject(), detail = null, page = 1, formOpen = false, error = null) }
        refresh()
    }
    fun refresh() = launchAction { load() }
    fun setPeriod(period: String) { if (_state.value.busy) return; _state.update { it.copy(period = period) }; refresh() }
    fun setPage(page: Int) { if (_state.value.busy || page < 1) return; _state.update { it.copy(page = page) }; refresh() }
    private suspend fun load() {
        val client = requireNotNull(api)
        val s = _state.value
        when (s.screen) {
            Screen.Endpoint -> {
                val keys = client.request("/api/keys").objects("keys")
                val settings = client.request("/api/settings")
                _state.update { it.copy(rows = keys, settings = settings) }
            }
            Screen.Providers, Screen.Quota -> {
                val rows = client.request("/api/providers").objects("connections")
                if (s.screen == Screen.Providers) {
                    // Node metadata is optional: retain connections if an older server rejects it.
                    val nodes = try { client.request("/api/provider-nodes") }
                    catch (e: CancellationException) { throw e }
                    catch (_: Exception) { json("nodesError" to "Custom providers could not be loaded. Tap Refresh to retry.") }
                    _state.update { it.copy(rows = rows, data = nodes) }
                } else _state.update { it.copy(rows = rows) }
            }
            Screen.Combos -> {
                val rows = client.request("/api/combos").objects("combos")
                val settings = client.request("/api/settings")
                _state.update { it.copy(rows = rows, settings = settings) }
            }
            Screen.Proxies -> {
                val rows = client.request("/api/proxy-pools?includeUsage=true").objects("proxyPools")
                _state.update { it.copy(rows = rows) }
            }
            Screen.Usage -> {
                val data = client.request("/api/usage/stats?period=${s.period}")
                _state.update { it.copy(data = data) }
            }
            Screen.Logs -> {
                val data = client.request("/api/usage/request-details?page=${s.page}&pageSize=20")
                _state.update { it.copy(rows = data.objects("details"), data = data) }
            }
            Screen.Saver, Screen.Settings -> {
                val settings = client.request("/api/settings")
                _state.update { it.copy(settings = settings) }
            }
            else -> Unit
        }
    }
    /** Callback fires after the mutation, before reload, so reload failures cannot duplicate a save. */
    fun saveEntry(body: JSONObject, row: JSONObject? = null, saved: (JSONObject) -> Unit) = launchAction {
        val client = requireNotNull(api)
        val path = row?.getString("id")?.let { client.idPath(resource(), it) } ?: resource()
        val result = client.request(path, if (row == null) "POST" else "PUT", body)
        saved(result)
        load()
        _state.update { it.copy(notice = "Changes saved.") }
    }
    fun createNode(body: JSONObject, saved: (JSONObject) -> Unit) = launchAction {
        val result = requireNotNull(api).request("/api/provider-nodes", "POST", body).getJSONObject("node")
        saved(result)
        load()
        _state.update { it.copy(notice = "Provider created. Add an API key to connect it.") }
    }
    fun clearError() { if (!_state.value.busy) _state.update { it.copy(error = null) } }
    fun edit(row: JSONObject? = null) { _state.update { it.copy(formOpen = true, edit = row, error = null) } }
    fun closeForm() { if (!_state.value.busy) _state.update { it.copy(formOpen = false, edit = null) } }
    private fun resource() = when (_state.value.screen) {
        Screen.Endpoint -> "/api/keys"
        Screen.Providers -> "/api/providers"
        Screen.Combos -> "/api/combos"
        Screen.Proxies -> "/api/proxy-pools"
        else -> error("This screen does not have editable resources")
    }
    fun save(body: JSONObject) = launchAction {
        val client = requireNotNull(api)
        val id = _state.value.edit?.optString("id")?.takeIf(String::isNotBlank)
        val result = client.request(if (id == null) resource() else client.idPath(resource(), id), if (id == null) "POST" else "PUT", body)
        _state.update { it.copy(formOpen = false, edit = null,
            detail = if (it.screen == Screen.Endpoint && id == null) json("New API key — store securely" to result.optString("key")) else null) }
        load()
        _state.update { it.copy(notice = "Saved on your 9Router server.") }
    }
    fun delete(row: JSONObject) = launchAction {
        val client = requireNotNull(api)
        client.request(client.idPath(resource(), row.getString("id")), "DELETE")
        load()
        _state.update { it.copy(notice = "Deleted.") }
    }
    fun toggle(row: JSONObject, active: Boolean) = launchAction {
        val client = requireNotNull(api)
        client.request(client.idPath(resource(), row.getString("id")), "PUT", json("isActive" to active))
        load()
    }
    fun test(row: JSONObject) = launchAction {
        val client = requireNotNull(api)
        val result = if (_state.value.screen == Screen.Proxies) {
            client.request(client.idPath("/api/proxy-pools", row.getString("id")) + "/test", "POST")
        } else client.request("/api/providers/test-batch", "POST", json("mode" to "provider", "providerId" to row.getString("provider")))
        _state.update { it.copy(detail = result) }
        load()
    }
    fun quota(row: JSONObject) = launchAction {
        val client = requireNotNull(api)
        val value = client.request(client.idPath("/api/usage", row.getString("id")))
        _state.update { it.copy(detail = value) }
    }
    fun patchSettings(patch: JSONObject) = launchAction {
        requireNotNull(api).request("/api/settings", "PATCH", patch)
        load()
        _state.update { it.copy(notice = "Settings saved on the server.") }
    }
    fun strategy(row: JSONObject, strategy: String, judge: String) = launchAction {
        val client = requireNotNull(api)
        // Fetch immediately before merging, so unrelated combo strategies are preserved.
        val latest = client.request("/api/settings")
        val strategies = latest.optJSONObject("comboStrategies") ?: JSONObject()
        val name = row.getString("name")
        val entry = strategies.optJSONObject(name) ?: JSONObject()
        entry.put("fallbackStrategy", strategy).put("judgeModel", judge)
        if (strategy == "fallback") strategies.remove(name) else strategies.put(name, entry)
        client.request("/api/settings", "PATCH", json("comboStrategies" to strategies))
        load()
        _state.update { it.copy(notice = "Combo strategy saved.") }
    }
    fun adapter(capability: String, models: List<String>, enabled: Boolean, round: Boolean) = launchAction {
        val client = requireNotNull(api)
        val adapter = client.request("/api/settings").optJSONObject("capacityAdapter") ?: JSONObject()
        adapter.put(capability, json("enabled" to enabled, "roundRobin" to round, "models" to JSONArray(models)))
        client.request("/api/settings", "PATCH", json("capacityAdapter" to adapter))
        load()
        _state.update { it.copy(notice = "Adapter saved.") }
    }
    fun showDetail(value: JSONObject?) { _state.update { it.copy(detail = value) } }
    fun appearance(theme: String = _state.value.theme, dynamic: Boolean = _state.value.dynamic) {
        prefs.edit().putString("theme", theme).putBoolean("dynamic", dynamic).apply()
        _state.update { it.copy(theme = theme, dynamic = dynamic) }
    }
    fun disconnect() {
        if (_state.value.busy) return
        launchAction {
            var remoteLogoutFailed = false
            try { api?.request("/api/auth/logout", "POST") }
            catch (e: CancellationException) { throw e }
            catch (_: Exception) { remoteLogoutFailed = true }
            finally {
                api?.disconnect(); api = null; store.write("")
                countdown?.cancel()
                val old = _state.value
                _state.value = RouterState(server = old.server, theme = old.theme, dynamic = old.dynamic,
                    notice = if (remoteLogoutFailed) "Local session removed. The server could not confirm logout." else null)
            }
        }
    }
}
