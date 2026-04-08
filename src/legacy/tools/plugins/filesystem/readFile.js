import fs from 'node:fs'
import { resolveToolPath } from '../../../access/service.js'
import {
	getTextPreview
} from '../../projectRoot.js'

export const readFileTool = {
	name: 'read_file',
	riskLevel: 'safe',
	description: 'Read a text file from the current project or from an allowlisted external absolute path.',
	input_schema: {
		type: 'object',
		properties: {
			path: {
				type: 'string',
				description: 'Relative path inside the current project, or an absolute path under an allowlisted external file or directory.'
			}
		},
		required: ['path']
	},
	execute(input, context = {}) {
		const target = resolveToolPath(input.path, {
			action: 'read',
			sessionToken: context.sessionToken
		})
		const content = fs.readFileSync(target.absolutePath, 'utf8')

		return {
			ok: true,
			path: input.path,
			scope: target.scope,
			accessRootId: target.matchedAccessRootId,
			content,
			preview: getTextPreview(content)
		}
	}
}
