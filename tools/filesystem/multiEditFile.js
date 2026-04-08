import fs from 'node:fs'

export const multiEditFileTool = {
	name: 'multi_edit_file',
	description: 'Apply multiple sequential string replacements to a single file atomically. All edits must succeed or none are applied.',
	riskLevel: 'safe',
	input_schema: {
		type: 'object',
		properties: {
			path: {
				type: 'string',
				description: 'Relative file path under the project root, or an absolute path under an allowlisted external directory.'
			},
			edits: {
				type: 'array',
				description: 'Array of replacements to apply in order.',
				items: {
					type: 'object',
					properties: {
						old_string: {
							type: 'string',
							description: 'The exact text to find and replace.'
						},
						new_string: {
							type: 'string',
							description: 'The replacement text.'
						}
					},
					required: ['old_string', 'new_string']
				}
			}
		},
		required: ['path', 'edits']
	},
	async execute(input = {}, context = {}) {
		const { resolveProjectPath, getTextPreview } = context.helpers
		const target = resolveProjectPath(input.path, { ...context, action: 'write' })

		const edits = input.edits
		if (!Array.isArray(edits) || edits.length === 0) {
			return { ok: false, error: 'edits array must contain at least one edit.' }
		}

		let content = fs.readFileSync(target.absolutePath, 'utf8')

		for (let i = 0; i < edits.length; i++) {
			const edit = edits[i]
			const oldString = String(edit.old_string)
			const newString = String(edit.new_string)
			const occurrences = content.split(oldString).length - 1

			if (occurrences === 0) {
				return {
					ok: false,
					error: `Edit #${i + 1}: old_string not found in the file.`,
					failedEditIndex: i
				}
			}

			if (occurrences > 1) {
				return {
					ok: false,
					error: `Edit #${i + 1}: old_string is ambiguous (found ${occurrences} occurrences). Provide more surrounding context.`,
					failedEditIndex: i
				}
			}

			content = content.replace(oldString, newString)
		}

		fs.writeFileSync(target.absolutePath, content, 'utf8')

		return {
			ok: true,
			path: target.displayPath,
			editCount: edits.length,
			preview: getTextPreview(content)
		}
	}
}
