import { gitInfoTool } from './gitInfo.js'
import { gitCommitTool } from './gitCommit.js'
import { gitPushTool } from './gitPush.js'
import { gitDangerousTool } from './gitDangerous.js'

export const plugin = {
	name: 'git',
	description: 'Git version control tools with 4-level access control.',
	tools: [gitInfoTool, gitCommitTool, gitPushTool, gitDangerousTool]
}
