import fs from 'node:fs'
import { resolveToolPath } from '../../../access/service.js'
import {
	filterProtectedEntries
} from '../../projectRoot.js'

export const listFilesTool = {
	name: 'list_files',
	riskLevel: 'safe',
	description: 'List files and directories inside the current project, or inside an allowlisted external absolute directory.',
	input_schema: {
		type: 'object',
		properties: {
			path: {
				type: 'string',
				description: 'Relative path inside the current project, or an absolute path under an allowlisted external directory.',
				default: '.'
			}
		},
		required: []
	},
	execute(input = {}, context = {}) {
		const relativePath = input.path || '.'
		const target = resolveToolPath(relativePath, {
			action: 'discover',
			sessionToken: context.sessionToken
		})
		const entries = fs.readdirSync(target.absolutePath, { withFileTypes: true }).map(entry => ({
			name: entry.name,
			type: entry.isDirectory() ? 'dir' : 'file'
		}))
		const filtered = filterProtectedEntries(target.displayPath, entries, {
			sessionToken: context.sessionToken
		})

		return {
			ok: true,
			path: input.path || '.',
			scope: target.scope,
			accessRootId: target.matchedAccessRootId,
			entries: filtered.entries,
			hiddenCount: filtered.hiddenCount
		}
	}
}
