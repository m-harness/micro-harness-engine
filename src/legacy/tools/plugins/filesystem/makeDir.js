import fs from 'node:fs'
import { resolveToolPath } from '../../../access/service.js'

export const makeDirTool = {
	name: 'make_dir',
	riskLevel: 'safe',
	description: 'Create a directory inside the current project.',
	input_schema: {
		type: 'object',
		properties: {
			path: {
				type: 'string',
				description: 'Relative path inside the current project.'
			}
		},
		required: ['path']
	},
	execute(input, context = {}) {
		const target = resolveToolPath(input.path, {
			action: 'write',
			sessionToken: context.sessionToken
		})
		fs.mkdirSync(target.absolutePath, { recursive: true })

		return {
			ok: true,
			path: input.path,
			scope: target.scope
		}
	}
}
