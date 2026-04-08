export const createAutomationTool = {
	name: 'create_automation',
	description: 'Create a recurring automation for the current conversation.',
	riskLevel: 'safe',
	input_schema: {
		type: 'object',
		properties: {
			name: {
				type: 'string',
				description: 'Short automation name.'
			},
			instruction: {
				type: 'string',
				description: 'Instruction the automation should run with.'
			},
			interval_minutes: {
				type: 'integer',
				description: 'Recurrence interval in minutes. Must be 5 or greater.'
			}
		},
		required: ['name', 'instruction', 'interval_minutes']
	},
	async execute(input = {}, context = {}) {
		const { automationService } = context.services
		const automation = automationService.createAutomationFromTool({
			userId: context.userId,
			channelIdentityId: context.channelIdentityId,
			conversationId: context.conversationId,
			name: String(input.name || '').trim(),
			instruction: String(input.instruction || '').trim(),
			intervalMinutes: Number(input.interval_minutes)
		})

		return {
			ok: true,
			automation
		}
	}
}
