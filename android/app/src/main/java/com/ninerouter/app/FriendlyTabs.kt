package com.ninerouter.app

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.PersistableBundle
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.*
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

internal fun JSONObject.text(key: String) = optString(key).takeUnless { it == "null" }.orEmpty()
internal fun maskedKey(value: String) = if (value.length > 12) "${value.take(5)}••••••••${value.takeLast(4)}" else "••••••••••••"
internal fun connectionNeedsAttention(row: JSONObject) = row.optBoolean("isActive", true) &&
    (row.text("lastError").isNotBlank() || row.text("testStatus").lowercase() in setOf("failed", "error", "invalid", "expired"))
private fun createdLabel(value: String): String = runCatching {
    "Created " + DateTimeFormatter.ofLocalizedDate(java.time.format.FormatStyle.MEDIUM)
        .format(Instant.parse(value).atZone(ZoneId.systemDefault()))
}.getOrDefault("")
private fun copyValue(context: Context, value: String, secret: Boolean = false) {
    if (value.isBlank()) return
    val clip = ClipData.newPlainText("9Router", value)
    if (secret) clip.description.extras = PersistableBundle().apply { putBoolean("android.content.extra.IS_SENSITIVE", true) }
    context.getSystemService(ClipboardManager::class.java).setPrimaryClip(clip)
    Toast.makeText(context, if (secret) "API key copied" else "Endpoint copied", Toast.LENGTH_SHORT).show()
}

@Composable private fun Pill(label: String, warning: Boolean = false) {
    Surface(shape = MaterialTheme.shapes.small,
        color = if (warning) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.secondaryContainer,
        contentColor = if (warning) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onSecondaryContainer) {
        Text(label, Modifier.padding(horizontal = 8.dp, vertical = 4.dp), style = MaterialTheme.typography.labelMedium)
    }
}
@Composable private fun Brand(name: String) {
    Surface(Modifier.size(48.dp), shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.primaryContainer, contentColor = MaterialTheme.colorScheme.onPrimaryContainer) {
        Box(contentAlignment = Alignment.Center) { Text(name.take(2).uppercase(), style = MaterialTheme.typography.titleMedium) }
    }
}
@Composable private fun Heading(title: String, subtitle: String) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, style = MaterialTheme.typography.headlineSmall)
        Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
@OptIn(ExperimentalLayoutApi::class)
@Composable private fun Filters(value: String, values: List<String>, change: (String) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        values.forEach { FilterChip(selected = value == it, onClick = { change(it) }, label = { Text(it) }) }
    }
}

@Composable private fun SecretValue(value: String) {
    val context = LocalContext.current
    var reveal by remember(value) { mutableStateOf(false) }
    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_STOP) reveal = false }
        owner.lifecycle.addObserver(observer)
        onDispose { owner.lifecycle.removeObserver(observer) }
    }
    Surface(shape = MaterialTheme.shapes.small, color = MaterialTheme.colorScheme.surfaceContainerHighest) {
        Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(if (reveal) value else maskedKey(value), fontFamily = FontFamily.Monospace,
                modifier = Modifier.semantics { if (!reveal) contentDescription = "API key hidden" })
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = { reveal = !reveal }, enabled = value.isNotBlank()) {
                    Icon(if (reveal) Icons.Default.VisibilityOff else Icons.Default.Visibility, null)
                    Spacer(Modifier.width(8.dp)); Text(if (reveal) "Hide" else "Reveal")
                }
                FilledTonalButton(onClick = { copyValue(context, value, true) }, enabled = value.isNotBlank()) {
                    Icon(Icons.Default.ContentCopy, null); Spacer(Modifier.width(8.dp)); Text("Copy key")
                }
            }
        }
    }
}

@Composable fun FriendlyKeys(s: RouterState, vm: RouterViewModel, modifier: Modifier) {
    var creating by remember { mutableStateOf(false) }
    var created by remember { mutableStateOf<JSONObject?>(null) }
    var confirmation by remember { mutableStateOf<Pair<String, () -> Unit>?>(null) }
    var query by rememberSaveable { mutableStateOf("") }
    val context = LocalContext.current
    LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
        item {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer), shape = MaterialTheme.shapes.large) {
                Column(Modifier.fillMaxWidth().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Icon(Icons.Default.Link, null, Modifier.size(32.dp))
                    Text("Connect your apps", style = MaterialTheme.typography.headlineSmall)
                    Text("Use this address in any OpenAI-compatible app.", color = MaterialTheme.colorScheme.onPrimaryContainer)
                    Surface(color = MaterialTheme.colorScheme.surface, shape = MaterialTheme.shapes.medium) {
                        SelectionContainer { Text("${s.server}/v1", Modifier.fillMaxWidth().padding(16.dp), fontFamily = FontFamily.Monospace) }
                    }
                    Button(onClick = { copyValue(context, "${s.server}/v1") }) {
                        Icon(Icons.Default.ContentCopy, null); Spacer(Modifier.width(8.dp)); Text("Copy endpoint")
                    }
                }
            }
        }
        item {
            Section("API key protection") {
                val known = s.settings.has("requireApiKey")
                val required = s.settings.optBoolean("requireApiKey")
                Pill(if (!known) "Status unavailable" else if (required) "Key required" else "No key required", known && !required)
                Text(if (required) "Only apps with a valid key can send model requests." else "Protect model access by requiring an API key.")
                ToggleRow("Require an API key", required, known && !s.busy) { enabled ->
                    if (enabled) vm.patchSettings(json("requireApiKey" to true))
                    else confirmation = "Turn off API key protection? Anyone who can reach your model endpoint may be able to use your providers without a key." to { vm.patchSettings(json("requireApiKey" to false)) }
                }
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Heading("Your API keys", if (s.busy && s.rows.isEmpty()) "Loading your keys…" else "${s.rows.count { it.optBoolean("isActive", true) }} active · ${s.rows.size} total")
                Button(onClick = { vm.clearError(); creating = true }, enabled = !s.busy) { Icon(Icons.Default.Add, null); Spacer(Modifier.width(8.dp)); Text("Create key") }
                if (s.rows.size > 4) OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth(), label = { Text("Find a key") }, singleLine = true, leadingIcon = { Icon(Icons.Default.Search, null) })
            }
        }
        val rows = s.rows.filter { it.text("name").contains(query, true) }
        if (rows.isEmpty() && !s.busy) item {
            Section(if (s.error != null) "Keys couldn't be loaded" else if (s.rows.isEmpty()) "Give each app its own key" else "No matching keys") {
                Text(if (s.error != null) "Check your connection, then tap Refresh." else if (s.rows.isEmpty()) "Create a key named after your app, such as Cursor or My laptop. You can pause it anytime." else "Try a different name.")
            }
        }
        items(rows, key = { it.getString("id") }) { row ->
            var menu by remember { mutableStateOf(false) }
            Section(row.text("name").ifBlank { "API key" }) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Pill(if (row.optBoolean("isActive", true)) "Active" else "Paused")
                    Box {
                        IconButton(onClick = { menu = true }, enabled = !s.busy) { Icon(Icons.Default.MoreVert, "Key actions") }
                        DropdownMenu(menu, { menu = false }) {
                            val active = row.optBoolean("isActive", true)
                            DropdownMenuItem(text = { Text(if (active) "Pause key" else "Resume key") }, onClick = {
                                menu = false
                                if (active) confirmation = "Pause ${row.text("name")}? Apps using this key will stop working until you resume it." to { vm.toggle(row, false) }
                                else vm.toggle(row, true)
                            })
                            DropdownMenuItem(text = { Text("Delete key", color = MaterialTheme.colorScheme.error) }, onClick = {
                                menu = false; confirmation = "Delete ${row.text("name")}? Apps using it will lose access. This cannot be undone." to { vm.delete(row) }
                            })
                        }
                    }
                }
                SecretValue(row.text("key"))
                createdLabel(row.text("createdAt")).takeIf { it.isNotEmpty() }?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            }
        }
        item {
            var help by rememberSaveable { mutableStateOf(false) }
            OutlinedCard(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = { help = !help }) { Text(if (help) "Hide setup guide" else "How do I use a key?") }
                    if (help) {
                        Text("1. Copy the endpoint into your app’s Base URL field.\n2. Paste a 9Router key into its API key field.\n3. Choose a model or combo from your server.")
                        Text("Using another device? localhost points to that device, not your server. Use your server’s reachable address. Configure Tunnel or Tailscale on the server computer.", style = MaterialTheme.typography.bodyMedium)
                        TextButton(onClick = { openDashboard(context, s.server, "/dashboard/endpoint") }) { Text("Open endpoint settings in browser") }
                    }
                }
            }
        }
    }
    if (creating) {
        var name by remember { mutableStateOf("") }
        FriendlyDialog("Create an API key", s, { creating = false }, "Create key", name.isNotBlank(), {
            vm.saveEntry(json("name" to name.trim())) { created = it; creating = false }
        }) {
            Text("Name it after the app or device that will use it. This makes it easier to manage later.")
            FormField("Key name", name, { name = it }, !s.busy, "For example, Cursor on my laptop")
        }
    }
    created?.let { result ->
        AlertDialog(onDismissRequest = { created = null }, title = { Text("Your key is ready") },
            text = { Column(verticalArrangement = Arrangement.spacedBy(16.dp)) { Text("Copy it into your app’s API key field. Keep it private."); SecretValue(result.text("key")) } },
            confirmButton = { TextButton(onClick = { created = null }) { Text("Done") } })
    }
    ConfirmDialog(confirmation) { confirmation = null }
}

internal data class ProviderLabel(val id: String, val name: String, val category: String, val nativeKey: Boolean)
internal fun categoryName(category: String) = when (category) {
    "oauth" -> "Sign-in providers"; "freeTier" -> "Free-tier providers"; "free" -> "Free providers"
    "apikey" -> "API key providers"; "webCookie" -> "Web-session providers"; "custom" -> "Custom providers"; else -> "Other providers"
}
internal fun providerLabels(catalog: List<JSONObject>, nodes: List<JSONObject>, rows: List<JSONObject>): List<ProviderLabel> {
    val labels = catalog.map { ProviderLabel(it.getString("id"), it.getString("name"), it.text("category"), it.optBoolean("nativeKey")) }.associateBy { it.id }.toMutableMap()
    nodes.forEach { labels[it.getString("id")] = ProviderLabel(it.getString("id"), it.text("name"), "custom", it.text("type") in setOf("openai-compatible", "anthropic-compatible", "custom-embedding")) }
    rows.forEach { row ->
        val id = row.text("provider")
        if (id !in labels) labels[id] = ProviderLabel(id, id.replace('-', ' ').replaceFirstChar { it.uppercase() }, if (id.contains("compatible-") || id.startsWith("custom-")) "custom" else "other", row.text("authType") in setOf("apikey", "api_key") && !id.startsWith("custom-endpoint-"))
    }
    return labels.values.sortedBy { it.name.lowercase() }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable fun FriendlyProviders(s: RouterState, vm: RouterViewModel, modifier: Modifier) {
    val context = LocalContext.current
    val catalog = remember { runCatching { JSONObject(context.assets.open("providers.json").bufferedReader().use { it.readText() }).objects("providers") }.getOrDefault(emptyList()) }
    val labels = providerLabels(catalog, s.data.objects("nodes"), s.rows)
    var query by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf("All") }
    var selectedId by rememberSaveable { mutableStateOf<String?>(null) }
    var connectionProvider by remember { mutableStateOf<ProviderLabel?>(null) }
    var editing by remember { mutableStateOf<JSONObject?>(null) }
    var addCustom by remember { mutableStateOf(false) }
    var confirmation by remember { mutableStateOf<Pair<String, () -> Unit>?>(null) }
    val selected = labels.find { it.id == selectedId }
    BackHandler(selectedId != null) { selectedId = null }
    if (selected == null) {
        LazyVerticalGrid(columns = GridCells.Adaptive(280.dp), modifier = modifier, contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Heading("Your AI, in one place", "Choose a provider to add or manage its accounts.")
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Pill("${s.rows.map { it.text("provider") }.distinct().size} added")
                        Pill("${s.rows.count { it.optBoolean("isActive", true) }} active accounts")
                        val count = s.rows.count(::connectionNeedsAttention)
                        if (count > 0) Pill("$count need attention", true)
                    }
                    OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth(), label = { Text("Search providers or accounts") }, singleLine = true,
                        leadingIcon = { Icon(Icons.Default.Search, null) }, trailingIcon = { if (query.isNotEmpty()) IconButton(onClick = { query = "" }) { Icon(Icons.Default.Close, "Clear search") } })
                    Filters(filter, listOf("All", "Added", "Needs attention")) { filter = it }
                    OutlinedButton(onClick = { vm.clearError(); addCustom = true }, enabled = !s.busy) { Icon(Icons.Default.Add, null); Spacer(Modifier.width(8.dp)); Text("Add custom provider") }
                    if (catalog.isEmpty()) Text("The built-in catalogue is unavailable. Your saved accounts still appear below.", color = MaterialTheme.colorScheme.error)
                    s.data.text("nodesError").takeIf { it.isNotBlank() }?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                }
            }
            val visible = labels.filter { provider ->
                val accounts = s.rows.filter { it.text("provider") == provider.id }
                (provider.name.contains(query, true) || accounts.any { it.text("name").contains(query, true) }) &&
                    (filter == "All" || filter == "Added" && accounts.isNotEmpty() || filter == "Needs attention" && accounts.any(::connectionNeedsAttention))
            }
            if (visible.isEmpty()) item(span = { GridItemSpan(maxLineSpan) }) {
                Section(if (s.busy) "Loading providers…" else "No matching providers") { Text("Try another name or choose All.") }
            }
            val groups = listOf("custom", "oauth", "free", "freeTier", "apikey", "webCookie", "other")
            groups.forEach { category ->
                val entries = visible.filter { it.category == category }
                if (entries.isNotEmpty()) {
                    item(span = { GridItemSpan(maxLineSpan) }) { Text(categoryName(category), style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 8.dp)) }
                    items(entries, key = { it.id }) { provider ->
                        val accounts = s.rows.filter { it.text("provider") == provider.id }
                        ProviderTile(provider.name, accounts, !s.busy) { selectedId = provider.id }
                    }
                }
            }
            item(span = { GridItemSpan(maxLineSpan) }) {
                Text("Provider names come from this app’s bundled catalogue; accounts and status come from your server. Free-tier limits are set by each provider.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    } else {
        val accounts = s.rows.filter { it.text("provider") == selected.id }.sortedBy { it.optInt("priority", 1) }
        LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item {
                TextButton(onClick = { selectedId = null }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null); Spacer(Modifier.width(8.dp)); Text("All providers") }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Brand(selected.name); Column(Modifier.weight(1f)) { Heading(selected.name, "${accounts.size} saved accounts · ${accounts.count { it.optBoolean("isActive", true) }} active") }
                }
            }
            item {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = {
                        vm.clearError()
                        if (selected.nativeKey) { editing = null; connectionProvider = selected }
                        else openDashboard(context, s.server, "/dashboard/providers/${selected.id}")
                    }, enabled = !s.busy) { Icon(Icons.Default.Add, null); Spacer(Modifier.width(8.dp)); Text(if (selected.nativeKey) "Add account" else "Connect in browser") }
                    if (accounts.isNotEmpty()) OutlinedButton(onClick = {
                        confirmation = "Test all ${accounts.size} accounts for ${selected.name}? This contacts the provider and may use credits." to { vm.test(accounts.first()) }
                    }, enabled = !s.busy) { Text("Test accounts") }
                }
                if (!selected.nativeKey) Text("This provider needs browser sign-in or extra setup. Sign in there, then return and tap Refresh. Browser and app logins are separate.", style = MaterialTheme.typography.bodyMedium)
            }
            if (accounts.isEmpty()) item { Section("No accounts yet") { Text("Add an account to make this provider available to your apps.") } }
            items(accounts, key = { it.getString("id") }) { row ->
                var menu by remember { mutableStateOf(false) }
                Section(row.text("name").ifBlank { "Account" }) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Pill(if (row.optBoolean("isActive", true)) "Active" else "Paused")
                        Pill(if (connectionNeedsAttention(row)) "Needs attention" else when (row.text("testStatus")) { "valid", "success" -> "Last test passed"; else -> "Not verified" }, connectionNeedsAttention(row))
                    }
                    Text(when (row.text("authType")) { "apikey", "api_key" -> "Uses a provider API key"; "oauth" -> "Uses browser sign-in"; else -> "Saved on your server" }, style = MaterialTheme.typography.bodyMedium)
                    row.text("defaultModel").takeIf { it.isNotBlank() }?.let { Text("Default model: $it", style = MaterialTheme.typography.bodyMedium) }
                    if (connectionNeedsAttention(row)) {
                        var details by remember { mutableStateOf(false) }
                        Text("This account needs a check. Test the accounts or review its credentials.", color = MaterialTheme.colorScheme.error)
                        if (row.text("lastError").isNotBlank()) {
                            TextButton(onClick = { details = !details }) { Text(if (details) "Hide error details" else "Show error details") }
                            if (details) Text(row.text("lastError"), style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        TextButton(onClick = { vm.clearError(); editing = row; connectionProvider = selected }, enabled = !s.busy) { Text("Edit account") }
                        Box {
                            IconButton(onClick = { menu = true }, enabled = !s.busy) { Icon(Icons.Default.MoreVert, "Account actions") }
                            DropdownMenu(menu, { menu = false }) {
                                val active = row.optBoolean("isActive", true)
                                DropdownMenuItem(text = { Text(if (active) "Pause account" else "Resume account") }, onClick = {
                                    menu = false
                                    if (active) confirmation = "Pause ${row.text("name")}? Routing will stop using this account until you resume it." to { vm.toggle(row, false) } else vm.toggle(row, true)
                                })
                                DropdownMenuItem(text = { Text("Delete account", color = MaterialTheme.colorScheme.error) }, onClick = { menu = false; confirmation = "Delete ${row.text("name")}? You will need to connect it again to use it." to { vm.delete(row) } })
                            }
                        }
                    }
                }
            }
            item { TextButton(onClick = { openDashboard(context, s.server, "/dashboard/providers/${selected.id}") }) { Text("More provider settings in browser") } }
        }
    }
    connectionProvider?.let { provider ->
        AccountDialog(provider, editing, s, { connectionProvider = null }) { body ->
            vm.saveEntry(body, editing) { connectionProvider = null; editing = null }
        }
    }
    if (addCustom) CustomProviderDialog(s, { addCustom = false }) { body ->
        vm.createNode(body) { node -> addCustom = false; selectedId = node.getString("id") }
    }
    ConfirmDialog(confirmation) { confirmation = null }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable internal fun ProviderTile(name: String, accounts: List<JSONObject>, enabled: Boolean = true, click: () -> Unit = {}) {
    OutlinedCard(onClick = click, enabled = enabled, modifier = Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.large) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Brand(name); Text(name, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                Icon(Icons.Default.ChevronRight, null)
            }
            val active = accounts.count { it.optBoolean("isActive", true) }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Pill(if (accounts.isEmpty()) "Not added" else if (active == 0) "All paused" else "$active active · ${accounts.size} saved")
                if (accounts.any(::connectionNeedsAttention)) Pill("Needs attention", true)
            }
        }
    }
}

@Composable private fun ConfirmDialog(value: Pair<String, () -> Unit>?, close: () -> Unit) {
    value?.let { (message, action) -> AlertDialog(onDismissRequest = close, title = { Text("Are you sure?") }, text = { Text(message) },
        confirmButton = { TextButton(onClick = { close(); action() }) { Text("Confirm") } }, dismissButton = { TextButton(onClick = close) { Text("Cancel") } }) }
}

@Composable private fun FormField(label: String, value: String, change: (String) -> Unit, enabled: Boolean, hint: String = "", secret: Boolean = false, numeric: Boolean = false) {
    var reveal by remember { mutableStateOf(false) }
    OutlinedTextField(value, change, modifier = Modifier.fillMaxWidth(), label = { Text(label) }, enabled = enabled, singleLine = true,
        supportingText = if (hint.isNotEmpty()) {{ Text(hint) }} else null,
        keyboardOptions = KeyboardOptions(keyboardType = if (numeric) KeyboardType.Number else if (secret) KeyboardType.Password else KeyboardType.Text),
        visualTransformation = if (secret && !reveal) PasswordVisualTransformation() else VisualTransformation.None,
        trailingIcon = if (secret) {{ IconButton(onClick = { reveal = !reveal }) { Icon(if (reveal) Icons.Default.VisibilityOff else Icons.Default.Visibility, if (reveal) "Hide API key" else "Show API key") } }} else null)
}
@Composable private fun FriendlyDialog(title: String, s: RouterState, close: () -> Unit, action: String, valid: Boolean, save: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    AlertDialog(onDismissRequest = { if (!s.busy) close() }, title = { Text(title) },
        text = { Column(Modifier.heightIn(max = 520.dp).verticalScroll(rememberScrollState()).imePadding(), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            content()
            s.error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
            if (s.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        } },
        confirmButton = { Button(onClick = save, enabled = valid && !s.busy) { Text(if (s.busy) "Saving…" else action) } },
        dismissButton = { TextButton(onClick = close, enabled = !s.busy) { Text("Cancel") } })
}
@Composable private fun AccountDialog(provider: ProviderLabel, row: JSONObject?, s: RouterState, close: () -> Unit, save: (JSONObject) -> Unit) {
    var name by remember { mutableStateOf(row?.text("name") ?: "") }
    var apiKey by remember { mutableStateOf("") }
    var advanced by remember { mutableStateOf(false) }
    var priority by remember { mutableStateOf((row?.optInt("priority", 1) ?: 1).toString()) }
    var model by remember { mutableStateOf(row?.text("defaultModel") ?: "") }
    val keyAllowed = row == null || row.text("authType") in setOf("apikey", "api_key")
    FriendlyDialog(if (row == null) "Connect ${provider.name}" else "Edit account", s, close, if (row == null) "Connect account" else "Save changes",
        name.isNotBlank() && (row != null || apiKey.isNotBlank()) && (priority.toIntOrNull() ?: 0) > 0, {
            val body = json("name" to name.trim(), "priority" to priority.toInt(), "defaultModel" to model.trim().ifBlank { null })
            if (row == null) body.put("provider", provider.id)
            if (apiKey.isNotBlank() && keyAllowed) body.put("apiKey", apiKey.trim())
            save(body)
        }) {
        Text(if (row == null) "Give this account a name, then paste the key from ${provider.name}. Your 9Router key is different." else "Update this account without changing its provider or proxy settings.")
        FormField("Account name", name, { name = it }, !s.busy, "For example, Personal or Work")
        if (keyAllowed) FormField(if (row == null) "Provider API key" else "Replace API key (optional)", apiKey, { apiKey = it }, !s.busy,
            if (row == null) "Stored by your server, not on this device." else "Leave blank to keep the existing key.", secret = true)
        TextButton(onClick = { advanced = !advanced }) { Text(if (advanced) "Hide advanced options" else "Advanced options") }
        if (advanced) {
            FormField("Priority", priority, { priority = it }, !s.busy, "Lower numbers are tried first.", numeric = true)
            FormField("Default model (optional)", model, { model = it }, !s.busy, "Leave blank to use the model requested by your app.")
        }
    }
}
@Composable private fun CustomProviderDialog(s: RouterState, close: () -> Unit, save: (JSONObject) -> Unit) {
    var name by remember { mutableStateOf("") }
    var prefix by remember { mutableStateOf("") }
    var type by remember { mutableStateOf("OpenAI compatible") }
    var apiType by remember { mutableStateOf("Chat completions") }
    var baseUrl by remember { mutableStateOf("") }
    val validUrl = runCatching { val u = java.net.URI(baseUrl.trim()); u.scheme in listOf("https", "http") && !u.host.isNullOrBlank() && u.userInfo == null && u.query == null && u.fragment == null }.getOrDefault(false)
    FriendlyDialog("Add custom provider", s, close, "Create provider", name.isNotBlank() && validateComboName(prefix.trim()) && validUrl, {
        save(json("name" to name.trim(), "prefix" to prefix.trim(), "type" to if (type == "OpenAI compatible") "openai-compatible" else "anthropic-compatible",
            "apiType" to if (apiType == "Responses") "responses" else "chat", "baseUrl" to baseUrl.trim()))
    }) {
        Text("1. Set up the provider here.\n2. Open its card and add an account with your API key.")
        Filters(type, listOf("OpenAI compatible", "Anthropic compatible")) { type = it }
        FormField("Provider name", name, { name = it }, !s.busy, "A friendly name, such as My AI server")
        FormField("Model prefix", prefix, { prefix = it }, !s.busy, "Letters, numbers, dots, hyphens or underscores. Example: my-ai")
        if (type == "OpenAI compatible") Filters(apiType, listOf("Chat completions", "Responses")) { apiType = it }
        FormField("Base URL", baseUrl, { baseUrl = it }, !s.busy, "Include /v1 if required. Example: https://api.example.com/v1")
        Text("This address is contacted by your 9Router server, not your phone. Use HTTPS for remote providers.", style = MaterialTheme.typography.bodySmall)
        val context = LocalContext.current
        TextButton(onClick = { openDashboard(context, s.server, "/dashboard/providers") }, enabled = !s.busy) { Text("Need a custom endpoint recipe? Open browser") }
    }
}

@Preview(name = "Provider cards · compact", widthDp = 390, heightDp = 520, showBackground = true)
@Preview(name = "Provider cards · large type", widthDp = 390, heightDp = 720, fontScale = 2f, showBackground = true)
@Composable private fun ProviderCardsPreview() {
    RouterTheme(dynamic = false) { Surface { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Heading("Your AI, in one place", "Choose a provider to add or manage its accounts.")
        ProviderTile("OpenAI", listOf(json("isActive" to true)))
        ProviderTile("Claude Code", emptyList())
        ProviderTile("My AI server", listOf(json("isActive" to true, "lastError" to "Credentials expired")))
    } } }
}
