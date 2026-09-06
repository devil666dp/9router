package com.ninerouter.app

import org.junit.Assert.*
import org.junit.Test

class FriendlyTabsTest {
    @Test fun keyMasksNeverExposeShortSecrets() {
        assertEquals("••••••••••••", maskedKey("short-key"))
        val raw = "sk-12345678901234567890"
        val masked = maskedKey(raw)
        assertFalse(masked.contains(raw))
        assertTrue(masked.endsWith("7890"))
    }
    @Test fun attentionDoesNotConfusePausedAndActiveAccounts() {
        assertTrue(connectionNeedsAttention(json("isActive" to true, "lastError" to "Invalid credential")))
        assertFalse(connectionNeedsAttention(json("isActive" to false, "lastError" to "Old error")))
        assertFalse(connectionNeedsAttention(json("isActive" to true, "testStatus" to "valid")))
        assertTrue(connectionNeedsAttention(json("isActive" to true, "testStatus" to "failed")))
    }
    @Test fun catalogAndAccountsMergeWithoutDuplicatingProviderCards() {
        val catalog = listOf(json("id" to "openai", "name" to "OpenAI", "category" to "apikey", "nativeKey" to true))
        val rows = listOf(json("provider" to "openai"), json("provider" to "openai"), json("provider" to "openai-compatible-chat-one"))
        val nodes = listOf(json("id" to "openai-compatible-chat-one", "name" to "My local model", "type" to "openai-compatible"))
        val labels = providerLabels(catalog, nodes, rows)
        assertEquals(2, labels.size)
        val custom = labels.single { it.category == "custom" }
        assertEquals("My local model", custom.name)
        assertTrue(custom.nativeKey)
    }
    @Test fun customRecipesAreNotMistakenForSimpleApiKeySetup() {
        val nodes = listOf(json("id" to "custom-endpoint-one", "name" to "Recipe", "type" to "custom-endpoint"))
        assertFalse(providerLabels(emptyList(), nodes, emptyList()).single().nativeKey)
    }
}
