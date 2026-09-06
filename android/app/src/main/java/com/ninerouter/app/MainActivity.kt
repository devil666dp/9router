package com.ninerouter.app

import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        // Protect API keys, settings, and diagnostics in screenshots and recents.
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        setContent {
            val vm: RouterViewModel = viewModel()
            val state by vm.state.collectAsStateWithLifecycle()
            RouterTheme(state.theme, state.dynamic) {
                if (state.connected) RouterShell(state, vm) else ConnectScreen(state, vm::connect)
            }
        }
    }
}

@Composable fun RouterTheme(theme: String = "system", dynamic: Boolean = true, content: @Composable () -> Unit) {
    val dark = theme == "dark" || (theme == "system" && isSystemInDarkTheme())
    val context = LocalContext.current
    val colors = if (dynamic && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
    } else if (dark) darkColorScheme() else lightColorScheme()
    MaterialTheme(colorScheme = colors, typography = Typography(), shapes = Shapes(), content = content)
}

@Composable fun ConnectScreen(state: RouterState, connect: (String, String) -> Unit) {
    var server by rememberSaveable { mutableStateOf(state.server) }
    // Password intentionally not saved in Bundle or preferences.
    var password by remember { mutableStateOf("") }
    val context = LocalContext.current
    Surface(Modifier.fillMaxSize()) {
        Box(Modifier.safeDrawingPadding().imePadding().padding(24.dp), contentAlignment = Alignment.Center) {
            Column(Modifier.widthIn(max = 480.dp).fillMaxWidth().verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(24.dp)) {
                Icon(Icons.Default.Hub, null, Modifier.size(56.dp), tint = MaterialTheme.colorScheme.primary)
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Your router.\nWithin reach.", style = MaterialTheme.typography.displaySmall)
                    Text("Connect to your existing 9Router server.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                OutlinedTextField(server, { server = it }, label = { Text("Server URL") },
                    placeholder = { Text("https://router.example.com") }, modifier = Modifier.fillMaxWidth(),
                    singleLine = true, enabled = !state.busy)
                OutlinedTextField(password, { password = it }, label = { Text("Dashboard password") },
                    visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth(),
                    singleLine = true, enabled = !state.busy,
                    supportingText = { Text("Not your LLM API key. Passwords are never saved.") })
                state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                state.notice?.let { Text(it) }
                Button(onClick = { connect(server, password); password = "" },
                    enabled = !state.busy && server.isNotBlank() && state.retryAfter == 0,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                    Text(if (state.busy) "Connecting…" else if (state.retryAfter > 0) "Retry in ${state.retryAfter}s" else "Connect")
                }
                if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
                Text("Use HTTPS and set a custom password on the host before connecting remotely. SSO sign-in stays in your browser; its session is not shared with this native client.",
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedButton(onClick = { openDashboard(context, server, "/login") }, enabled = server.isNotBlank()) {
                    Text("Open browser sign-in")
                }
            }
        }
    }
}

private val mainScreens = listOf(Screen.Endpoint, Screen.Providers, Screen.Usage, Screen.More)
private fun icon(screen: Screen) = when (screen) {
    Screen.Endpoint -> Icons.Default.Key
    Screen.Providers -> Icons.Default.Hub
    Screen.Usage -> Icons.Default.BarChart
    else -> Icons.Default.Apps
}
private fun shortLabel(screen: Screen) = when(screen) {
    Screen.Endpoint -> "Keys"
    else -> screen.title
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun RouterShell(state: RouterState, vm: RouterViewModel) {
    val snack = remember { SnackbarHostState() }
    val context = LocalContext.current
    LaunchedEffect(state.notice) { state.notice?.let { snack.showSnackbar(it) } }
    val selected = if (state.screen in mainScreens) state.screen else Screen.More
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val rail = maxWidth >= 600.dp
        Row(Modifier.fillMaxSize()) {
            if (rail) NavigationRail(Modifier.fillMaxHeight().safeDrawingPadding(), header = {
                Icon(Icons.Default.Hub, null, Modifier.padding(16.dp).size(32.dp))
            }) {
                mainScreens.forEach { dest -> NavigationRailItem(selected == dest,
                    { vm.navigate(dest) }, { Icon(icon(dest), null) }, label = { Text(shortLabel(dest)) }, enabled = !state.busy) }
            }
            Scaffold(modifier = Modifier.weight(1f), snackbarHost = { SnackbarHost(snack) },
                topBar = {
                    TopAppBar(title = { Text(state.screen.title) }, navigationIcon = {
                        if (state.screen !in mainScreens) IconButton(onClick = { vm.navigate(Screen.More) }, enabled = !state.busy) {
                            Icon(Icons.Default.ArrowBack, "Back to more")
                        }
                    }, actions = {
                        IconButton(onClick = vm::refresh, enabled = !state.busy) { Icon(Icons.Default.Refresh, "Refresh") }
                        IconButton(onClick = { openDashboard(context, state.server, state.screen.web) }) {
                            Icon(Icons.Default.OpenInBrowser, "Open full web dashboard")
                        }
                    })
                }, bottomBar = {
                    if (!rail) NavigationBar {
                        mainScreens.forEach { dest -> NavigationBarItem(selected == dest,
                            { vm.navigate(dest) }, { Icon(icon(dest), null) }, label = { Text(shortLabel(dest)) }, enabled = !state.busy) }
                    }
                }) { padding ->
                Column(Modifier.padding(padding).imePadding().fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
                    if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
                    state.error?.let {
                        Surface(color = MaterialTheme.colorScheme.errorContainer, modifier = Modifier.fillMaxWidth()) {
                            Text(it, Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onErrorContainer)
                        }
                    }
                    RouterContent(state, vm, Modifier.widthIn(max = 1040.dp).fillMaxWidth().weight(1f))
                }
            }
        }
    }
    if (state.formOpen) key(state.screen, state.edit?.optString("id")) {
        ResourceForm(state, vm::closeForm, vm::save)
    }
    state.detail?.let { detail ->
        AlertDialog(onDismissRequest = { vm.showDetail(null) }, title = { Text("Details") },
            text = { Column(Modifier.heightIn(max = 480.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)) { JsonFields(detail) } },
            confirmButton = { TextButton(onClick = { vm.showDetail(null) }) { Text("Done") } })
    }
}

@Preview(name = "Connect compact", widthDp = 390, heightDp = 844, showBackground = true)
@Composable private fun ConnectPreview() { RouterTheme(dynamic = false) { ConnectScreen(RouterState(), { _, _ -> }) } }
@Preview(name = "Connect dark", widthDp = 390, heightDp = 844, showBackground = true)
@Composable private fun ConnectDarkPreview() { RouterTheme("dark", false) { ConnectScreen(RouterState(), { _, _ -> }) } }
