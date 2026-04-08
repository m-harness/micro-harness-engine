import fs from 'node:fs'

export const deleteFileTool = {
	name: 'delete_file',
	description: 'Delete a file or directory under the project root, or at an allowlisted external path. This always requires approval.',
	riskLevel: 'dangerous',
	input_schema: {
		type: 'object',
		properties: {
			path: {
				type: 'string',
				description: 'Relative path to delete, or an absolute path under an allowlisted external directory.'
			}
		},
		required: ['path']
	},
	async execute(input = {}, context = {}) {
		const { resolveProjectPath, createApprovalResponse } = context.helpers

		if (!context.approvalGranted) {
			return createApprovalResponse('delete_file', input, 'Deletion requires human approval.')
		}

		const target = resolveProjectPath(input.path, { ...context, action: 'delete' })
		fs.rmSync(target.absolutePath, { recursive: true, force: true })
		return {
			ok: true,
			path: target.displayPath
		}
	}
}
