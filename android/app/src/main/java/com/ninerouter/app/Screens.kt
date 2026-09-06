package com.ninerouter.app

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import org.json.JSONArray
import org.json.JSONObject

fun openDashboard(context: Context, server: String, path: String) {
    runCatching {
        val origin = serverOrigin(server, BuildConfig.DEBUG)
        val url = requireNotNull(origin.resolve(path))
        require(sameOrigin(origin, url))
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url.toString())))
    }.onFailure { Toast.makeText(context, it.message ?: "Cannot open browser", Toast.LENGTH_LONG).show() }
}
private fun copy(context: Context, value: String, sensitive: Boolean = false) {
    val clip = ClipData.newPlainText("9Router", value)
    if (sensitive) clip.description.extras = android.os.PersistableBundle().apply {
        putBoolean("android.content.extra.IS_SENSITIVE", true)
    }
    context.getSystemService(ClipboardManager::class.java).setPrimaryClip(clip)
    Toast.makeText(context, "Copied", Toast.LENGTH_SHORT).show()
}
@Composable fun Section(title: String, content: @Composable ColumnScope.() -> Unit) {
    Card(Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            content()
        }
    }
}
@Composable fun ToggleRow(title: String, checked: Boolean, enabled: Boolean = true, change: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(title, Modifier.weight(1f))
        Switch(checked, change, enabled = enabled, modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp))
    }
}
@OptIn(ExperimentalLayoutApi::class)
@Composable fun Choice(label: String, value: String, options: List<String>, enabled: Boolean = true, change: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, style = MaterialTheme.typography.labelLarge)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            options.forEach { option -> FilterChip(selected = value == option, onClick = { change(option) },
                label = { Text(option) }, enabled = enabled) }
        }
    }
}

/** Server-owned diagnostic fields, with progressive disclosure rather than guessed schemas. */
@Composable fun JsonFields(value: JSONObject, depth: Int = 0) {
    value.keys().asSequence().toList().forEach { key ->
        val field = value.opt(key)
        val label = key.replace(Regex("([a-z])([A-Z])"), "$1 $2").replaceFirstChar { it.uppercase() }
        if (field is JSONObject || field is JSONArray) {
            var expanded by remember(key, depth) { mutableStateOf(false) }
            TextButton(onClick = { expanded = !expanded }) { Text("${if (expanded) "−" else "+"} $label") }
            if (expanded && depth < 6) Column(Modifier.padding(start = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (field is JSONObject) JsonFields(field, depth + 1)
                else if (field is JSONArray) {
                    for (i in 0 until minOf(field.length(), 100)) {
                        val item = field.opt(i)
                        if (item is JSONObject) { Text("${i + 1}.", style = MaterialTheme.typography.labelLarge); JsonFields(item, depth + 1) }
                        else Text(item?.toString() ?: "—")
                    }
                    if (field.length() > 100) Text("First 100 items shown. Use the web dashboard for the complete view.")
                }
            }
        } else Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(label, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            // Do not offer one-tap clipboard copies of arbitrary server diagnostic payloads.
            SelectionContainer { Text(if (field == JSONObject.NULL) "—" else field?.toString() ?: "—") }
        }
    }
}

@Composable fun WebFeature(title: String, description: String, server: String, path: String) {
    val context = LocalContext.current
    Section(title) {
        Text(description, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedButton(onClick = { openDashboard(context, server, path) }) {
            Icon(Icons.Default.OpenInBrowser, null); Spacer(Modifier.width(8.dp)); Text("Open web dashboard")
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable fun RouterContent(s: RouterState, vm: RouterViewModel, modifier: Modifier) {
    val context = LocalContext.current
    var query by rememberSaveable(s.screen) { mutableStateOf("") }
    var activeFilter by rememberSaveable(s.screen) { mutableStateOf("all") }
    var confirm by remember { mutableStateOf<Pair<String, () -> Unit>?>(null) }
    var strategyRow by remember { mutableStateOf<JSONObject?>(null) }
    var adapterCap by remember { mutableStateOf<String?>(null) }
    val listScreen = s.screen in listOf(Screen.Endpoint, Screen.Providers, Screen.Combos, Screen.Quota, Screen.Proxies, Screen.Logs)
    LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        if (s.screen == Screen.More) {
            item {
                Section("9Router on Android") {
                    Text(s.server, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("Native controls for everyday work. Browser-labelled tools open the existing frontend and may require a separate sign-in.")
                }
            }
            items(listOf(Screen.Combos, Screen.Quota, Screen.Proxies, Screen.Saver, Screen.Logs, Screen.Media, Screen.Settings)) { screen ->
                OutlinedCard(onClick = { vm.navigate(screen) }, modifier = Modifier.fillMaxWidth(), enabled = !s.busy) {
                    ListItem(headlineContent = { Text(screen.title) }, trailingContent = { Icon(Icons.Default.ChevronRight, null) })
                }
            }
            item { WebFeature("CLI tools & MCP", "Client configuration, MCP marketplace and host integrations remain in the web UI. Local-only operations must be run on the server host.", s.server, "/dashboard/cli-tools") }
            item { WebFeature("Console", "Use the existing live stream, request inspector, pause controls, filters and exports in the browser.", s.server, "/dashboard/console-log") }
            item { WebFeature("Translator", "Seven-stage protocol inspection, replay and SSE tools remain in the browser. Requires the server's translator setting.", s.server, "/dashboard/translator") }
            item { WebFeature("Skills", "Browse and copy the existing skill catalogue from your server.", s.server, "/dashboard/skills") }
        }
        if (s.screen == Screen.Media) {
            items(listOf("embedding" to "Embeddings", "image" to "Images", "video" to "Video", "tts" to "Text to speech", "stt" to "Speech to text", "web" to "Web fetch & search")) { (kind, label) ->
                WebFeature(label, "Provider setup, playground and media-specific combos use the existing web frontend in this version.", s.server, "/dashboard/media-providers/$kind")
            }
        }
        if (s.screen == Screen.Endpoint) item {
            Section("OpenAI-compatible endpoint") {
                Text("${s.server}/v1", style = MaterialTheme.typography.bodyLarge)
                FilledTonalButton(onClick = { copy(context, "${s.server}/v1") }) { Text("Copy endpoint") }
                Text("Tunnel and Tailscale installation must be performed on the server host. The app does not bypass local-only protection.", style = MaterialTheme.typography.bodyMedium)
                Text("API keys authorize model requests; your dashboard session is separate.", style = MaterialTheme.typography.bodyMedium)
            }
        }
        if (s.screen in listOf(Screen.Endpoint, Screen.Providers, Screen.Combos, Screen.Proxies)) item {
            Button(onClick = { vm.edit() }, enabled = !s.busy) {
                Icon(Icons.Default.Add, null); Spacer(Modifier.width(8.dp))
                Text(when(s.screen) { Screen.Endpoint -> "Create key"; Screen.Providers -> "Add API-key connection"; Screen.Combos -> "Create combo"; else -> "Add proxy pool" })
            }
        }
        if (s.screen == Screen.Providers) item {
            Text("Manage configured connections here. Test runs all connections for that provider and may contact upstream services.", style = MaterialTheme.typography.bodyMedium)
            OutlinedButton(onClick = { openDashboard(context, s.server, "/dashboard/providers") }) { Text("Provider catalogue, OAuth & custom nodes ↗") }
        }
        if (listScreen) item {
            OutlinedTextField(query, { query = it }, label = { Text("Search ${s.screen.title.lowercase()}") }, singleLine = true,
                leadingIcon = { Icon(Icons.Default.Search, null) }, modifier = Modifier.fillMaxWidth())
            if (s.screen in listOf(Screen.Providers, Screen.Proxies, Screen.Endpoint))
                Choice("Status", activeFilter, listOf("all", "active", "paused")) { activeFilter = it }
        }
        if (listScreen) {
            val filtered = s.rows.filter { row ->
                val text = listOf("name", "provider", "model", "status", "testStatus", "reqId").joinToString(" ") { row.optString(it) }
                text.contains(query, true) && (activeFilter == "all" || row.optBoolean("isActive", true) == (activeFilter == "active"))
            }
            if (filtered.isEmpty() && !s.busy) item { Section("Nothing to show") { Text(if (s.rows.isEmpty()) "No entries returned by your server. Create an entry or refresh." else "No entries match your filters.") } }
            items(filtered) { row ->
                val name = row.optString("name").ifBlank { row.optString("model").ifBlank { row.optString("provider", "Entry") } }
                Section(name) {
                    when (s.screen) {
                        Screen.Endpoint -> {
                            var reveal by remember(row.optString("id")) { mutableStateOf(false) }
                            Text(if (reveal) row.optString("key") else "••••••••••••", style = MaterialTheme.typography.bodyLarge)
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                TextButton(onClick = { reveal = !reveal }) { Text(if(reveal) "Hide key" else "Reveal key") }
                                TextButton(onClick = { copy(context, row.optString("key"), true) }) { Text("Copy key") }
                            }
                        }
                        Screen.Providers, Screen.Quota -> {
                            Text("${row.optString("provider")} · ${row.optString("authType")} · ${row.optString("testStatus", "unknown")}")
                            if (row.optString("lastError").isNotBlank()) Text(row.optString("lastError"), color = MaterialTheme.colorScheme.error)
                            if (s.screen == Screen.Quota) Button(onClick = { vm.quota(row) }, enabled = !s.busy) { Text("Check quota") }
                        }
                        Screen.Proxies -> Text("${row.optString("type", "proxy")} · ${row.optString("testStatus", "unknown")} · ${row.optInt("boundConnectionCount")} connections")
                        Screen.Combos -> {
                            Text("Kind: ${row.optString("kind").takeUnless { it.isBlank() || it == "null" } ?: "llm"}", style = MaterialTheme.typography.labelLarge)
                            (row.optJSONArray("models") ?: JSONArray()).strings().forEachIndexed { i, model -> Text("${i+1}. $model") }
                            val strategy = s.settings.optJSONObject("comboStrategies")?.optJSONObject(row.optString("name"))
                            Text("Strategy: ${strategy?.optString("fallbackStrategy") ?: "fallback"}")
                            TextButton(onClick = { strategyRow = row }, enabled = !s.busy) { Text("Routing strategy") }
                            TextButton(onClick = { copy(context, row.optString("name")) }) { Text("Copy combo name") }
                        }
                        Screen.Logs -> { JsonFields(row) }
                        else -> Unit
                    }
                    if (s.screen in listOf(Screen.Endpoint, Screen.Providers, Screen.Proxies)) ToggleRow("Active", row.optBoolean("isActive", true), !s.busy) { active ->
                        if (!active) confirm = "Pause $name? Existing clients may stop working." to { vm.toggle(row, false) }
                        else vm.toggle(row, true)
                    }
                    if (s.screen in listOf(Screen.Endpoint, Screen.Providers, Screen.Combos, Screen.Proxies)) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (s.screen != Screen.Endpoint) TextButton(onClick = { vm.edit(row) }, enabled = !s.busy) { Text("Edit") }
                        if (s.screen in listOf(Screen.Providers, Screen.Proxies)) TextButton(onClick = {
                            confirm = "Test $name? This contacts upstream services and may incur usage." to { vm.test(row) }
                        }, enabled = !s.busy) { Text("Test") }
                        TextButton(onClick = { confirm = "Delete $name? This cannot be undone." to { vm.delete(row) } }, enabled = !s.busy) { Text("Delete", color = MaterialTheme.colorScheme.error) }
                    }
                }
            }
        }
        if (s.screen == Screen.Combos) item {
            Section("Vision & audio adapters") {
                Text("Route unsupported inputs to a compatible model pool. Other capability settings are preserved when saving.")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { adapterCap = "vision" }, enabled = !s.busy) { Text("Vision") }
                    OutlinedButton(onClick = { adapterCap = "audioInput" }, enabled = !s.busy) { Text("Audio input") }
                }
            }
        }
        if (s.screen == Screen.Usage) {
            item { Choice("Period", s.period, listOf("today", "24h", "7d", "30d", "60d"), !s.busy, vm::setPeriod) }
            item { Section("Server usage statistics") { if (s.data.length() == 0) Text("Refresh to load usage.") else JsonFields(s.data) } }
            item { FilledTonalButton(onClick = { vm.navigate(Screen.Logs) }, enabled = !s.busy) { Text("Request details") } }
            item { Text("Values and breakdowns come directly from your server. Interactive charts remain in the web dashboard.", style = MaterialTheme.typography.bodyMedium) }
        }
        if (s.screen == Screen.Logs) item {
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedButton(onClick = { vm.setPage(s.page - 1) }, enabled = !s.busy && s.page > 1) { Text("Previous") }
                Text("${s.page}")
                OutlinedButton(onClick = { vm.setPage(s.page + 1) }, enabled = !s.busy && s.rows.size == 20) { Text("Next") }
            }
            Text("Conversation payloads remain redacted by the backend.", style = MaterialTheme.typography.bodyMedium)
        }
        if (s.screen == Screen.Saver) item { SaverSettings(s, vm) }
        if (s.screen == Screen.Settings) item { AppSettings(s, vm) }
    }
    confirm?.let { (message, action) -> AlertDialog(onDismissRequest = { confirm = null }, title = { Text("Confirm action") },
        text = { Text(message) }, confirmButton = { TextButton(onClick = { confirm = null; action() }) { Text("Confirm") } },
        dismissButton = { TextButton(onClick = { confirm = null }) { Text("Cancel") } }) }
    strategyRow?.let { row ->
        val current = s.settings.optJSONObject("comboStrategies")?.optJSONObject(row.optString("name"))
        var strategy by remember(row) { mutableStateOf(current?.optString("fallbackStrategy") ?: "fallback") }
        var judge by remember(row) { mutableStateOf(current?.optString("judgeModel") ?: "") }
        val kind = row.optString("kind")
        AlertDialog(onDismissRequest = { strategyRow = null }, title = { Text("Routing strategy") }, text = {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Choice("Mode", strategy, if (kind in listOf("", "null", "llm")) listOf("fallback", "round-robin", "fusion") else listOf("fallback", "round-robin")) { strategy = it }
                if (strategy == "fusion") {
                    Text("Fusion bills every panel model plus a judge per request.")
                    OutlinedTextField(judge, { judge = it }, label = { Text("Judge model (blank = automatic)") })
                }
            }
        }, confirmButton = { TextButton(onClick = { vm.strategy(row, strategy, judge.trim()); strategyRow = null }, enabled = !s.busy) { Text("Save") } },
            dismissButton = { TextButton(onClick = { strategyRow = null }) { Text("Cancel") } })
    }
    adapterCap?.let { cap -> AdapterDialog(cap, s, { adapterCap = null }) { models, enabled, round ->
        vm.adapter(cap, models, enabled, round); adapterCap = null
    } }
}

@Composable private fun AdapterDialog(cap: String, s: RouterState, close: () -> Unit, save: (List<String>, Boolean, Boolean) -> Unit) {
    val raw = s.settings.optJSONObject("capacityAdapter")?.opt(cap)
    val current = raw as? JSONObject
    val legacy = if (raw is JSONArray) (0 until raw.length()).map { raw.optJSONObject(it)?.optString("model") ?: raw.optString(it) } else emptyList()
    var models by remember { mutableStateOf((current?.optJSONArray("models")?.strings() ?: legacy).joinToString("\n")) }
    var enabled by remember { mutableStateOf(current?.optBoolean("enabled", true) ?: true) }
    var round by remember { mutableStateOf(current?.optBoolean("roundRobin") ?: false) }
    AlertDialog(onDismissRequest = close, title = { Text("$cap adapter") }, text = {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            ToggleRow("Enabled", enabled) { enabled = it }
            ToggleRow("Round robin", round) { round = it }
            OutlinedTextField(models, { models = it }, label = { Text("Models in priority order, one per line") }, minLines = 4)
        }
    }, confirmButton = { TextButton(onClick = { save(models.lines().map(String::trim).filter(String::isNotBlank), enabled, round) }, enabled = !s.busy) { Text("Save") } },
        dismissButton = { TextButton(onClick = close) { Text("Cancel") } })
}

@Composable private fun SaverSettings(s: RouterState, vm: RouterViewModel) {
    val settings = s.settings
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Section("Token saver") {
            listOf("rtkEnabled" to "Compress tool output (RTK)", "headroomEnabled" to "Compress context (Headroom)",
                "cavemanEnabled" to "Compress output (Caveman)", "ponytailEnabled" to "Minimal code (Ponytail)").forEach { (key, label) ->
                ToggleRow(label, settings.optBoolean(key, key == "rtkEnabled"), !s.busy) { vm.patchSettings(json(key to it)) }
            }
            Text("Headroom must already be installed and running on your server. Installation and process controls are host-side.")
        }
        WebFeature("Advanced compression settings", "Configure compression levels, proxy URL, timeouts and optional extras in the web dashboard.", s.server, "/dashboard/token-saver")
    }
}

@Composable private fun AppSettings(s: RouterState, vm: RouterViewModel) {
    var current by remember { mutableStateOf("") }
    var new by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Section("Appearance") {
            Choice("Theme", s.theme, listOf("system", "light", "dark")) { vm.appearance(theme = it) }
            ToggleRow("Use device colors (Android 12+)", s.dynamic) { vm.appearance(dynamic = it) }
        }
        Section("Routing") {
            Choice("Account strategy", s.settings.optString("fallbackStrategy", "fill-first"), listOf("fill-first", "round-robin"), !s.busy) {
                vm.patchSettings(json("fallbackStrategy" to it))
            }
            Choice("Default combo strategy", s.settings.optString("comboStrategy", "fallback"), listOf("fallback", "round-robin"), !s.busy) {
                vm.patchSettings(json("comboStrategy" to it))
            }
            ToggleRow("Record request details", s.settings.optBoolean("enableObservability"), !s.busy) {
                vm.patchSettings(json("enableObservability" to it))
            }
        }
        Section("Change password") {
            OutlinedTextField(current, { current = it }, label = { Text("Current password") }, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
            OutlinedTextField(new, { new = it }, label = { Text("New password") }, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
            OutlinedTextField(confirm, { confirm = it }, label = { Text("Confirm password") }, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth(),
                isError = confirm.isNotEmpty() && confirm != new)
            Button(onClick = { vm.patchSettings(json("currentPassword" to current, "newPassword" to new)); current = ""; new = ""; confirm = "" }, enabled = !s.busy && new.isNotEmpty() && new == confirm) { Text("Update password") }
        }
        WebFeature("Security, network & backups", "SSO configuration, login policy, outbound proxies, sticky limits and database backup/import remain in the web dashboard. The app does not weaken authentication settings.", s.server, "/dashboard/profile")
        Section("Connection") {
            Text(s.server)
            Text("Sessions are encrypted with Android Keystore. Browser sessions are separate.")
            OutlinedButton(onClick = vm::disconnect, enabled = !s.busy) { Text("Sign out / change server") }
        }
    }
}
