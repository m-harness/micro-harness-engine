import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
	getToolPolicyByName,
	replaceToolPolicyTools
} from '../db.js'
import { SYSTEM_ALL_TOOLS_POLICY_NAME } from '../policyDefaults.js'

const pluginsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'plugins')

function isPluginShape(value) {
	return Boolean(
		value &&
		typeof value === 'object' &&
		typeof value.name === 'string' &&
		typeof value.description === 'string' &&
		Array.isArray(value.tools)
	)
}

async function loadPlugins() {
	const entries = fs.readdirSync(pluginsDir, { withFileTypes: true })
	const plugins = []
	const toolNames = new Set()

	for (const entry of entries) {
		if (!entry.isDirectory()) {
			continue
		}

		const indexPath = path.join(pluginsDir, entry.name, 'index.js')
		if (!fs.existsSync(indexPath)) {
			continue
		}

		const module = await import(pathToFileURL(indexPath).href)
		const plugin = Object.values(module).find(isPluginShape)

		if (!plugin) {
			continue
		}

		for (const tool of plugin.tools) {
			if (toolNames.has(tool.name)) {
				throw new Error(`Duplicate tool name detected: ${tool.name}`)
			}
			toolNames.add(tool.name)
		}

		plugins.push({
			name: plugin.name,
			description: plugin.description,
			tools: plugin.tools.map(tool => ({
				...tool,
				pluginName: plugin.name
			}))
		})
	}

	return plugins.sort((left, right) => left.name.localeCompare(right.name))
}

const pluginCatalog = await loadPlugins()

const allTools = pluginCatalog.flatMap(plugin => plugin.tools)
const systemAllToolsPolicy = getToolPolicyByName(SYSTEM_ALL_TOOLS_POLICY_NAME)

if (systemAllToolsPolicy) {
	replaceToolPolicyTools(
		systemAllToolsPolicy.id,
		allTools.map(tool => tool.name)
	)
}

export function getToolCatalogSnapshot() {
	return pluginCatalog.map(plugin => ({
		name: plugin.name,
		description: plugin.description,
		tools: plugin.tools.map(tool => ({
			name: tool.name,
			description: tool.description,
			inputSchema: tool.input_schema,
			riskLevel: tool.riskLevel
		}))
	}))
}

export function getPluginEntries() {
	return pluginCatalog
}

export function getAllToolEntries() {
	return allTools
}

export function getToolEntry(toolName) {
	return allTools.find(tool => tool.name === toolName) || null
}
