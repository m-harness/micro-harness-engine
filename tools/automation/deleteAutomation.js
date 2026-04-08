export const deleteAutomationTool = {
	name: 'delete_automation',
	description: 'Delete one automation owned by the current user.',
	riskLevel: 'safe',
	input_schema: {
		type: 'object',
		properties: {
			automation_id: {
				type: 'string',
				description: 'Automation identifier.'
			}
		},
		required: ['automation_id']
	},
	async execute(input = {}, context = {}) {
		const { automationService } = context.services
		automationService.deleteAutomation({
			automationId: String(input.automation_id || ''),
			userId: context.userId
		})

		return {
			ok: true,
			deletedAutomationId: String(input.automation_id || '')
		}
	}
}
