/**
 * Reads mcp.json configuration from the project root.
 * Returns an empty Map if the file doesn't exist (MCP disabled).
 * Compatible with Claude Desktop mcp.json format.
 */

import fs from 'node:fs'
import path from 'node:path'
import { appConfig } from '../core/config.js'

function getConfigPath() {
	return path.resolve(appConfig.projectRoot, 'mcp', 'mcp.json')
}

export function loadMcpConfig() {
	const configPath = getConfigPath()

	if (!fs.existsSync(configPath)) {
		return new Map()
	}

	try {
		const raw = fs.readFileSync(configPath, 'utf8')
		const config = JSON.parse(raw)
		const servers = config.mcpServers || {}
		const result = new Map()

		for (const [name, entry] of Object.entries(servers)) {
			if (!entry.command && !entry.url) {
				console.warn(`[mcp/config] Skipping server "${name}": no command or url`)
				continue
			}
			result.set(name, entry)
		}

		if (result.size > 0) {
			console.log(`[mcp/config] Loaded ${result.size} MCP server(s) from mcp.json`)
		}

		return result
	} catch (error) {
		console.error(`[mcp/config] Failed to read mcp.json:`, error.message)
		return new Map()
	}
}

export function loadMcpConfigRaw() {
	const configPath = getConfigPath()

	if (!fs.existsSync(configPath)) {
		return {}
	}

	try {
		const raw = fs.readFileSync(configPath, 'utf8')
		const config = JSON.parse(raw)
		return config.mcpServers || {}
	} catch {
		return {}
	}
}

export function saveMcpConfig(serversMap) {
	const configPath = getConfigPath()
	const obj = {}
	for (const [name, config] of serversMap) {
		obj[name] = config
	}
	fs.writeFileSync(configPath, JSON.stringify({ mcpServers: obj }, null, 4), 'utf8')
}
