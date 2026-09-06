package com.ninerouter.app

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import org.json.JSONArray
import org.json.JSONObject

@Composable fun ResourceForm(s: RouterState, close: () -> Unit, save: (JSONObject) -> Unit) {
    val edit = s.edit
    var name by remember { mutableStateOf(edit?.optString("name") ?: "") }
    var provider by remember { mutableStateOf(edit?.optString("provider") ?: "") }
    var apiKey by remember { mutableStateOf("") }
    var priority by remember { mutableStateOf(edit?.optInt("priority", 1)?.toString() ?: "1") }
    var defaultModel by remember { mutableStateOf(edit?.optString("defaultModel")?.takeUnless { it == "null" } ?: "") }
    var poolId by remember { mutableStateOf(edit?.optJSONObject("providerSpecificData")?.optString("proxyPoolId") ?: "") }
    var models by remember { mutableStateOf(edit?.optJSONArray("models")?.strings()?.joinToString("\n") ?: "") }
    var kind by remember { mutableStateOf(edit?.optString("kind")?.takeUnless { it.isBlank() || it == "null" } ?: "llm") }
    var proxyUrl by remember { mutableStateOf(edit?.optString("proxyUrl") ?: "") }
    var noProxy by remember { mutableStateOf(edit?.optString("noProxy") ?: "") }
    var type by remember { mutableStateOf(edit?.optString("type") ?: "http") }
    var active by remember { mutableStateOf(edit?.optBoolean("isActive", true) ?: true) }
    var strict by remember { mutableStateOf(edit?.optBoolean("strictProxy") ?: false) }
    var localError by remember { mutableStateOf<String?>(null) }
    Dialog(onDismissRequest = { if (!s.busy) close() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.padding(16.dp).widthIn(max = 560.dp).fillMaxWidth().heightIn(max = 720.dp), shape = MaterialTheme.shapes.extraLarge) {
            Column(Modifier.imePadding().padding(24.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text(if (edit == null) "Create ${s.screen.title.lowercase()}" else "Edit ${name.ifBlank { "entry" }}", style = MaterialTheme.typography.headlineSmall)
                Field("Name", name, { name = it }, !s.busy)
                when (s.screen) {
                    Screen.Providers -> {
                        Field("Provider ID", provider, { provider = it }, edit == null && !s.busy)
                        Text("Use the exact ID from the provider catalogue. OAuth and custom-provider creation use the web dashboard.", style = MaterialTheme.typography.bodyMedium)
                        Field(if (edit == null) "API key" else "New API key (blank keeps existing)", apiKey, { apiKey = it }, !s.busy, secret = true)
                        Field("Priority", priority, { priority = it }, !s.busy)
                        Field("Default model (optional)", defaultModel, { defaultModel = it }, !s.busy)
                        Field("Proxy pool ID (optional)", poolId, { poolId = it }, !s.busy)
                    }
                    Screen.Combos -> {
                        Choice("Kind", kind, listOf("llm", "embedding", "image", "video", "tts", "stt", "webSearch", "webFetch"), edit == null && !s.busy) { kind = it }
                        OutlinedTextField(models, { models = it }, label = { Text("Models, one per line") }, minLines = 4, modifier = Modifier.fillMaxWidth(), enabled = !s.busy)
                        Text("Use exact model IDs such as provider/model. Line order is fallback priority; move lines to reorder. Empty combos are allowed by the backend.", style = MaterialTheme.typography.bodyMedium)
                    }
                    Screen.Proxies -> {
                        Choice("Type", type, listOf("http", "vercel", "cloudflare", "deno"), !s.busy) { type = it }
                        Field("Proxy or existing relay URL", proxyUrl, { proxyUrl = it }, !s.busy, secret = true)
                        Field("No proxy (comma-separated)", noProxy, { noProxy = it }, !s.busy)
                        ToggleRow("Active", active, !s.busy) { active = it }
                        ToggleRow("Strict: do not fall back to direct", strict, !s.busy) { strict = it }
                        Text("This registers an existing proxy/relay. Deploying relays and bulk import remain in the web dashboard.", style = MaterialTheme.typography.bodyMedium)
                    }
                    else -> Unit
                }
                (localError ?: s.error)?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                if (s.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(close, enabled = !s.busy, modifier = Modifier.weight(1f)) { Text("Cancel") }
                    Button(onClick = {
                        localError = null
                        when {
                            name.isBlank() -> localError = "Name is required."
                            s.screen == Screen.Combos && !validateComboName(name.trim()) -> localError = "Use letters, numbers, dots, hyphens and underscores only."
                            s.screen == Screen.Providers && (provider.isBlank() || (priority.toIntOrNull() ?: 0) < 1) -> localError = "Provider ID and a positive priority are required."
                            s.screen == Screen.Providers && edit == null && apiKey.isBlank() && provider != "ollama-local" -> localError = "An API key is required for this provider."
                            s.screen == Screen.Proxies && proxyUrl.isBlank() -> localError = "Proxy URL is required."
                        }
                        if (localError == null) {
                            val body = json("name" to name.trim())
                            when (s.screen) {
                                Screen.Providers -> {
                                    if (edit == null) body.put("provider", provider.trim())
                                    if (apiKey.isNotBlank()) body.put("apiKey", apiKey)
                                    body.put("priority", priority.toInt()).put("defaultModel", defaultModel.trim().ifBlank { null } ?: JSONObject.NULL)
                                    body.put("proxyPoolId", poolId.trim().ifBlank { null } ?: JSONObject.NULL)
                                }
                                Screen.Combos -> { body.put("models", JSONArray(orderedModels(models))); if (edit == null) body.put("kind", kind) }
                                Screen.Proxies -> body.put("proxyUrl", proxyUrl.trim()).put("noProxy", noProxy.trim()).put("type", type).put("isActive", active).put("strictProxy", strict)
                                else -> Unit
                            }
                            save(body)
                        }
                    }, enabled = !s.busy, modifier = Modifier.weight(1f)) { Text("Save") }
                }
            }
        }
    }
}

@Composable private fun Field(label: String, value: String, change: (String) -> Unit, enabled: Boolean, secret: Boolean = false) {
    OutlinedTextField(value, change, label = { Text(label) }, modifier = Modifier.fillMaxWidth(), singleLine = true,
        enabled = enabled, visualTransformation = if (secret) PasswordVisualTransformation() else VisualTransformation.None)
}
