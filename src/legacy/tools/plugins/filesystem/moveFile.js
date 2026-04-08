import fs from 'node:fs'
import path from 'node:path'
import { resolveToolPath } from '../../../access/service.js'

export const moveFileTool = {
	name: 'move_file',
	riskLevel: 'safe',
	description: 'Move or rename a file or directory inside the current project.',
	input_schema: {
		type: 'object',
		properties: {
			from: {
				type: 'string',
				description: 'Source path inside the current project.'
			},
			to: {
				type: 'string',
				description: 'Destination path inside the current project.'
			}
		},
		required: ['from', 'to']
	},
	execute(input, context = {}) {
		const fromPath = resolveToolPath(input.from, {
			action: 'move',
			sessionToken: context.sessionToken
		})
		const toPath = resolveToolPath(input.to, {
			action: 'write',
			sessionToken: context.sessionToken
		})

		fs.mkdirSync(path.dirname(toPath.absolutePath), { recursive: true })
		fs.renameSync(fromPath.absolutePath, toPath.absolutePath)

		return {
			ok: true,
			from: input.from,
			to: input.to,
			scope: toPath.scope
		}
	}
}
