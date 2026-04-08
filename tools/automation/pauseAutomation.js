export const pauseAutomationTool = {
	name: 'pause_automation',
	description: 'Pause one automation for the current conversation.',
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
		return {
			ok: true,
			automation: automationService.pauseAutomation({
				automationId: String(input.automation_id || ''),
				userId: context.userId
			})
		}
	}
}
