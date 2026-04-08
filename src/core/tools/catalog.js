import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { appConfig } from '../config.js'

const plugins = new Map()

function validatePlugin(plugin, dirName) {
	if (!plugin || typeof plugin !== 'object') {
		throw new Error(`Plugin "${dirName}" does not export a valid plugin object.`)
	}
	if (!plugin.name || typeof plugin.name !== 'string') {
		throw new Error(`Plugin "${dirName}" is missing a "name" string.`)
	}
	if (!Array.isArray(plugin.tools) || plugin.tools.length === 0) {
		throw new Error(`Plugin "${plugin.name}" must export a non-empty "tools" array.`)
	}
	for (const tool of plugin.tools) {
		if (!tool.name || typeof tool.name !== 'string') {
			throw new Error(`Plugin "${plugin.name}" contains a tool without a valid "name".`)
		}
		if (typeof tool.execute !== 'function') {
			throw new Error(`Plugin "${plugin.name}" tool "${tool.name}" is missing an execute function.`)
		}
	}
}

export async function loadPlugins() {
	plugins.clear()
	const toolsDir = path.resolve(appConfig.projectRoot, 'tools')

	if (!fs.existsSync(toolsDir)) {
		return
	}

	const entries = fs.readdirSync(toolsDir, { withFileTypes: true })
	const seenToolNames = new Map()

	for (const entry of entries) {
		if (!entry.isDirectory()) {
			continue
		}

		const indexPath = path.join(toolsDir, entry.name, 'index.js')
		if (!fs.existsSync(indexPath)) {
			console.warn(`[catalog] Skipping tools/${entry.name}/: no index.js`)
			continue
		}

		try {
			const moduleUrl = pathToFileURL(indexPath).href
			const mod = await import(moduleUrl)
			const plugin = mod.plugin || mod.default

			validatePlugin(plugin, entry.name)

			for (const tool of plugin.tools) {
				if (seenToolNames.has(tool.name)) {
					throw new Error(
						`Duplicate tool name "${tool.name}" in plugin "${plugin.name}" ` +
						`(already defined by "${seenToolNames.get(tool.name)}").`
					)
				}
				seenToolNames.set(tool.name, plugin.name)
			}

			plugins.set(plugin.name, plugin)
		} catch (error) {
			console.error(`[catalog] Failed to load plugin "${entry.name}":`, error.message)
		}
	}

	if (plugins.size > 0) {
		const toolCount = [...plugins.values()].reduce((sum, p) => sum + p.tools.length, 0)
		console.log(`[catalog] Loaded ${plugins.size} plugin(s) with ${toolCount} tool(s)`)
	}
}

export function getPluginEntries() {
	return [...plugins.values()]
}

export function getAllToolEntries() {
	const result = []
	for (const plugin of plugins.values()) {
		for (const tool of plugin.tools) {
			result.push({ ...tool, pluginName: plugin.name })
		}
	}
	return result
}

export function getToolEntry(toolName) {
	for (const plugin of plugins.values()) {
		const tool = plugin.tools.find(t => t.name === toolName)
		if (tool) {
			return { ...tool, pluginName: plugin.name }
		}
	}
	return null
}
