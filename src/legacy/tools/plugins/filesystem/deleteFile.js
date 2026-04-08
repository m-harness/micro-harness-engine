import fs from 'node:fs'
import { resolveToolPath } from '../../../access/service.js'

export const deleteFileTool = {
	name: 'delete_file',
	riskLevel: 'dangerous',
	description: 'Delete a file or directory inside the current project. Use only when the user explicitly asked for deletion.',
	input_schema: {
		type: 'object',
		properties: {
			path: {
				type: 'string',
				description: 'Path to delete inside the current project.'
			},
			confirm: {
				type: 'string',
				description: 'Must be exactly DELETE before this tool can run.'
			}
		},
		required: ['path', 'confirm']
	},
	execute(input, context = {}) {
		const target = resolveToolPath(input.path, {
			action: 'delete',
			sessionToken: context.sessionToken
		})

		if (!fs.existsSync(target.absolutePath)) {
			return {
				ok: false,
				path: input.path,
				error: 'Target does not exist.'
			}
		}

		fs.rmSync(target.absolutePath, { recursive: true, force: true })

		return {
			ok: true,
			path: input.path,
			scope: target.scope
		}
	}
}
