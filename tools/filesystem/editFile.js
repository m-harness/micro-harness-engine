import fs from 'node:fs'

export const editFileTool = {
	name: 'edit_file',
	description: 'Replace a specific string in a file. The old_string must uniquely identify the text to replace (unless replace_all is true).',
	riskLevel: 'safe',
	input_schema: {
		type: 'object',
		properties: {
			path: {
				type: 'string',
				description: 'Relative file path under the project root, or an absolute path under an allowlisted external directory.'
			},
			old_string: {
				type: 'string',
				description: 'The exact text to find and replace.'
			},
			new_string: {
				type: 'string',
				description: 'The replacement text.'
			},
			replace_all: {
				type: 'boolean',
				description: 'Replace all occurrences instead of requiring a unique match.',
				default: false
			}
		},
		required: ['path', 'old_string', 'new_string']
	},
	async execute(input = {}, context = {}) {
		const { resolveProjectPath, getTextPreview } = context.helpers
		const target = resolveProjectPath(input.path, { ...context, action: 'write' })

		const content = fs.readFileSync(target.absolutePath, 'utf8')
		const oldString = String(input.old_string)
		const newString = String(input.new_string)
		const replaceAll = Boolean(input.replace_all)

		const occurrences = content.split(oldString).length - 1

		if (occurrences === 0) {
			return { ok: false, error: 'old_string not found in the file.' }
		}

		if (!replaceAll && occurrences > 1) {
			return {
				ok: false,
				error: `old_string is ambiguous (found ${occurrences} occurrences). Provide more surrounding context or use replace_all.`
			}
		}

		const updated = replaceAll
			? content.split(oldString).join(newString)
			: content.replace(oldString, newString)

		fs.writeFileSync(target.absolutePath, updated, 'utf8')

		return {
			ok: true,
			path: target.displayPath,
			replacements: replaceAll ? occurrences : 1,
			preview: getTextPreview(updated)
		}
	}
}
