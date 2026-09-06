package com.ninerouter.app

fun validateComboName(name: String) = name.matches(Regex("^[a-zA-Z0-9_.-]+$"))
fun orderedModels(text: String) = text.lines().map(String::trim).filter(String::isNotBlank)
