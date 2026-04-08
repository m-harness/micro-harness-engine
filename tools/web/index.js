import { webFetchTool } from './webFetch.js'
import { webSearchTool } from './webSearch.js'

export const plugin = {
	name: 'web',
	description: 'Web information retrieval tools.',
	tools: [webFetchTool, webSearchTool]
}
