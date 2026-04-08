import fs from 'node:fs'

export const listFilesTool = {
	name: 'list_files',
	description: 'List files and directories under the project root, or inside an allowlisted external directory.',
	riskLevel: 'safe',
	input_schema: {
		type: 'object',
		properties: {
			path: {
				type: 'string',
				description: 'Relative path under the project root, or an absolute path under an allowlisted external directory.',
				default: '.'
			}
		},
		required: []
	},
	async execute(input = {}, context = {}) {
		const { resolveProjectPath, filterDiscoverableEntries } = context.helpers
		const target = resolveProjectPath(input.path || '.', { ...context, action: 'discover' })
		const rawEntries = fs.readdirSync(target.absolutePath, { withFileTypes: true }).map(entry => ({
			name: entry.name,
			type: entry.isDirectory() ? 'dir' : 'file'
		}))
		const { entries, hiddenCount } = filterDiscoverableEntries(target.displayPath, rawEntries)

		return {
			ok: true,
			path: target.displayPath,
			entries,
			hiddenCount
		}
	}
}
