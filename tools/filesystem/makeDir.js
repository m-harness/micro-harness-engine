import fs from 'node:fs'

export const makeDirTool = {
	name: 'make_dir',
	description: 'Create a directory under the project root, or inside an allowlisted external directory.',
	riskLevel: 'safe',
	input_schema: {
		type: 'object',
		properties: {
			path: {
				type: 'string',
				description: 'Relative directory path under the project root, or an absolute path under an allowlisted external directory.'
			}
		},
		required: ['path']
	},
	async execute(input = {}, context = {}) {
		const { resolveProjectPath } = context.helpers
		const target = resolveProjectPath(input.path, { ...context, action: 'write' })
		fs.mkdirSync(target.absolutePath, { recursive: true })
		return {
			ok: true,
			path: target.displayPath
		}
	}
}
