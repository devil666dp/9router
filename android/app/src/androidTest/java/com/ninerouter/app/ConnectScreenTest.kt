package com.ninerouter.app

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test

class ConnectScreenTest {
    @get:Rule val compose = createComposeRule()
    @Test fun connectionFormShowsLabelsAndDisablesBlankSubmission() {
        compose.setContent { RouterTheme(dynamic = false) { ConnectScreen(RouterState()) { _, _ -> } } }
        compose.onNodeWithText("Server URL").assertIsDisplayed()
        compose.onNodeWithText("Dashboard password").assertIsDisplayed()
        compose.onNodeWithText("Connect", useUnmergedTree = true).assertIsNotEnabled()
    }
    @Test fun serverErrorsAreVisible() {
        compose.setContent { RouterTheme(dynamic = false) { ConnectScreen(RouterState(error = "Invalid password")) { _, _ -> } } }
        compose.onNodeWithText("Invalid password").assertIsDisplayed()
    }
}
