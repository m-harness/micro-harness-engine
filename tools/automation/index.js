import { createAutomationTool } from './createAutomation.js'
import { editAutomationTool } from './editAutomation.js'
import { listAutomationsTool } from './listAutomations.js'
import { pauseAutomationTool } from './pauseAutomation.js'
import { resumeAutomationTool } from './resumeAutomation.js'
import { deleteAutomationTool } from './deleteAutomation.js'

export const plugin = {
	name: 'automation',
	description: 'Recurring automation management tools.',
	tools: [
		createAutomationTool,
		editAutomationTool,
		listAutomationsTool,
		pauseAutomationTool,
		resumeAutomationTool,
		deleteAutomationTool
	]
}
