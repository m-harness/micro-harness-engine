import fs from 'node:fs'
import path from 'node:path'

export const writeFileTool = {
	name: 'write_file',
	description: 'Write a UTF-8 text file under the project root, or to an allowlisted external path.',
	riskLevel: 'safe',
	input_schema: {
		type: 'object',
		properties: {
			path: {
				type: 'string',
				description: 'Relative file path under the project root, or an absolute path under an allowlisted external directory.'
			},
			content: {
				type: 'string',
				description: 'Full file contents.'
			}
		},
		required: ['path', 'content']
	},
	async execute(input = {}, context = {}) {
		const { resolveProjectPath, getTextPreview } = context.helpers
		const target = resolveProjectPath(input.path, { ...context, action: 'write' })
		fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true })
		fs.writeFileSync(target.absolutePath, String(input.content || ''), 'utf8')

		return {
			ok: true,
			path: target.displayPath,
			bytes: Buffer.byteLength(String(input.content || ''), 'utf8'),
			preview: getTextPreview(input.content)
		}
	}
}
