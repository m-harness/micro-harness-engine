import fs from 'node:fs'

export const readFileTool = {
	name: 'read_file',
	description: 'Read a UTF-8 text file under the project root, or from an allowlisted external path.',
	riskLevel: 'safe',
	input_schema: {
		type: 'object',
		properties: {
			path: {
				type: 'string',
				description: 'Relative file path under the project root, or an absolute path under an allowlisted external directory.'
			}
		},
		required: ['path']
	},
	async execute(input = {}, context = {}) {
		const { resolveProjectPath, getTextPreview } = context.helpers
		const target = resolveProjectPath(input.path, { ...context, action: 'read' })
		const content = fs.readFileSync(target.absolutePath, 'utf8')
		return {
			ok: true,
			path: target.displayPath,
			content,
			preview: getTextPreview(content)
		}
	}
}
