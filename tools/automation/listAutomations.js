export const listAutomationsTool = {
	name: 'list_automations',
	description: 'List automations owned by the current conversation.',
	riskLevel: 'safe',
	input_schema: {
		type: 'object',
		properties: {},
		required: []
	},
	async execute(_input = {}, context = {}) {
		const { automationService } = context.services
		return {
			ok: true,
			automations: automationService.listAutomationsForConversation(context.conversationId)
		}
	}
}
