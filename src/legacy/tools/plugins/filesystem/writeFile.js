import fs from 'node:fs'
import path from 'node:path'
import { resolveToolPath } from '../../../access/service.js'
import {
	getTextPreview
} from '../../projectRoot.js'

export const writeFileTool = {
	name: 'write_file',
	riskLevel: 'safe',
	description: 'Write a text file inside the current project. Existing files will be overwritten.',
	input_schema: {
		type: 'object',
		properties: {
			path: {
				type: 'string',
				description: 'Relative path inside the current project.'
			},
			content: {
				type: 'string',
				description: 'Full file contents to write.'
			}
		},
		required: ['path', 'content']
	},
	execute(input, context = {}) {
		const target = resolveToolPath(input.path, {
			action: 'write',
			sessionToken: context.sessionToken
		})
		fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true })
		fs.writeFileSync(target.absolutePath, input.content, 'utf8')

		return {
			ok: true,
			path: input.path,
			scope: target.scope,
			bytes: Buffer.byteLength(input.content, 'utf8'),
			preview: getTextPreview(input.content)
		}
	}
}
