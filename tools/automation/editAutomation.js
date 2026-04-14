export const editAutomationTool = {
	name: 'edit_automation',
	description: 'Edit an existing automation. Can update name, instruction, and schedule configuration.',
	riskLevel: 'safe',
	input_schema: {
		type: 'object',
		properties: {
			automation_id: {
				type: 'string',
				description: 'The ID of the automation to edit.'
			},
			name: {
				type: 'string',
				description: 'New automation name.'
			},
			instruction: {
				type: 'string',
				description: 'New instruction for the automation.'
			},
			schedule_kind: {
				type: 'string',
				enum: ['cron', 'once'],
				description: 'New schedule type.'
			},
			cron_expression: {
				type: 'string',
				description: 'New cron expression (for cron schedule).'
			},
			scheduled_at: {
				type: 'string',
				description: 'New scheduled date/time in ISO 8601 (for once schedule).'
			}
		},
		required: ['automation_id']
	},
	async execute(input = {}, context = {}) {
		const { automationService } = context.services
		const automation = automationService.editAutomationAsUser({
			automationId: String(input.automation_id || '').trim(),
			userId: context.userId,
			name: input.name,
			instruction: input.instruction,
			scheduleKind: input.schedule_kind,
			cronExpression: input.cron_expression,
			scheduledAt: input.scheduled_at
		})

		return {
			ok: true,
			automation
		}
	}
}
