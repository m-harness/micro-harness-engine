import dotenv from 'dotenv'
import { anthropicProvider } from './anthropic.js'
import { geminiProvider } from './gemini.js'
import { openAiProvider } from './openai.js'

dotenv.config()

const providerRegistry = new Map([
	['anthropic', anthropicProvider],
	['claude', anthropicProvider],
	['openai', openAiProvider],
	['gemini', geminiProvider],
	['google', geminiProvider]
])

export function getProvider(providerName) {
	const normalizedName = String(providerName || process.env.LLM_PROVIDER || 'anthropic')
		.trim()
		.toLowerCase()

	const provider = providerRegistry.get(normalizedName)

	if (!provider) {
		throw new Error(`Unknown LLM provider: ${providerName}. Available providers: anthropic, openai, gemini.`)
	}

	return provider
}

export function getActiveProvider() {
	return getProvider(process.env.LLM_PROVIDER || 'anthropic')
}

export function getProviderSummary(providerName = null) {
	const provider = providerName ? getProvider(providerName) : getActiveProvider()

	return {
		name: provider.name,
		displayName: provider.displayName,
		model: provider.getModel(),
		capabilities: provider.capabilities || {}
	}
}

export function listAvailableProviders() {
	return Array.from(new Set(
		Array.from(providerRegistry.values()).map(provider => provider.name)
	))
}

export function setProviderClientForTesting(providerName, client) {
	const provider = getProvider(providerName)

	if (typeof provider.setClientForTesting !== 'function') {
		throw new Error(`Provider ${provider.name} does not support test client injection.`)
	}

	provider.setClientForTesting(client)
}

export function resetProviderClientForTesting(providerName) {
	const provider = getProvider(providerName)

	if (typeof provider.resetClientForTesting === 'function') {
		provider.resetClientForTesting()
	}
}
