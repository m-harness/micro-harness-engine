import fs from 'node:fs'
import path from 'node:path'

export const moveFileTool = {
	name: 'move_file',
	description: 'Move or rename a file under the project root, or inside allowlisted external directories.',
	riskLevel: 'safe',
	input_schema: {
		type: 'object',
		properties: {
			from: {
				type: 'string',
				description: 'Relative source path, or an absolute path under an allowlisted external directory.'
			},
			to: {
				type: 'string',
				description: 'Relative destination path, or an absolute path under an allowlisted external directory.'
			}
		},
		required: ['from', 'to']
	},
	async execute(input = {}, context = {}) {
		const { resolveProjectPath } = context.helpers
		const source = resolveProjectPath(input.from, { ...context, action: 'move' })
		const destination = resolveProjectPath(input.to, { ...context, action: 'write' })
		fs.mkdirSync(path.dirname(destination.absolutePath), { recursive: true })
		fs.renameSync(source.absolutePath, destination.absolutePath)

		return {
			ok: true,
			from: source.displayPath,
			to: destination.displayPath
		}
	}
}
