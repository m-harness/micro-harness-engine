function parseCsv(value) {
	if (!value) {
		return []
	}

	return value
		.split(',')
		.map(item => item.trim())
		.filter(Boolean)
}

export function getToolRuntimeConfig() {
	const enabledPlugins = parseCsv(process.env.ENABLED_TOOL_PLUGINS)
	const disabledTools = new Set(parseCsv(process.env.DISABLED_TOOLS))

	return {
		enabledPlugins:
			enabledPlugins.length === 0 ||
			enabledPlugins.includes('*') ||
			enabledPlugins.includes('all')
				? null
				: new Set(enabledPlugins),
		disabledTools
	}
}
