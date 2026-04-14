export const createAutomationTool = {
	name: 'create_automation',
	description: 'Create a recurring or scheduled automation for the current conversation. Supports cron (cron expression) or once (one-time at a specific date/time).',
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
			schedule_kind: {
				type: 'string',
				enum: ['cron', 'once'],
				description: 'Schedule type. Defaults to "cron" if omitted.'
			},
			cron_expression: {
				type: 'string',
				description: 'Cron expression with 5 fields (minute hour day month weekday). Required when schedule_kind is "cron". Example: "0 9 * * *" for every day at 9:00.'
			},
			scheduled_at: {
				type: 'string',
				description: 'ISO 8601 date/time for one-time execution. Must be in the future. Required when schedule_kind is "once".'
			}
		},
		required: ['name', 'instruction']
	},
	async execute(input = {}, context = {}) {
		const { automationService } = context.services
		const automation = automationService.createAutomationFromTool({
			userId: context.userId,
			channelIdentityId: context.channelIdentityId,
			conversationId: context.conversationId,
			name: String(input.name || '').trim(),
			instruction: String(input.instruction || '').trim(),
			scheduleKind: input.schedule_kind || undefined,
			cronExpression: input.cron_expression || undefined,
			scheduledAt: input.scheduled_at || undefined
		})

		return {
			ok: true,
			automation
		}
	}
}
