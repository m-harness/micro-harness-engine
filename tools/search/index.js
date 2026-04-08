import { globTool } from './glob.js'
import { grepTool } from './grep.js'

export const plugin = {
	name: 'search',
	description: 'File search and content search tools.',
	tools: [globTool, grepTool]
}
