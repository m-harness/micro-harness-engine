import { execGit } from './helpers.js'

export const gitPushTool = {
	name: 'git_push',
	description: 'Push commits to a remote repository. Requires human approval. Does not support --force (use git_dangerous for that).',
	riskLevel: 'dangerous',
	input_schema: {
		type: 'object',
		properties: {
			remote: {
				type: 'string',
				description: 'Remote name.',
				default: 'origin'
			},
			branch: {
				type: 'string',
				description: 'Branch to push. Defaults to current branch if omitted.'
			},
			set_upstream: {
				type: 'boolean',
				description: 'Use --set-upstream flag.',
				default: false
			}
		},
		required: []
	},
	async execute(input = {}, context = {}) {
		const { createApprovalResponse } = context.helpers

		if (!context.approvalGranted) {
			return createApprovalResponse('git_push', input, 'Pushing to a remote repository requires human approval.')
		}

		const remote = String(input.remote || 'origin').trim()
		const gitArgs = ['push']

		if (input.set_upstream) {
			gitArgs.push('--set-upstream')
		}

		gitArgs.push(remote)

		if (input.branch) {
			gitArgs.push(String(input.branch).trim())
		}

		const output = execGit(gitArgs, { timeout: 60_000 })

		return {
			ok: true,
			command: 'push',
			remote,
			branch: input.branch || '(current)',
			output
		}
	}
}
