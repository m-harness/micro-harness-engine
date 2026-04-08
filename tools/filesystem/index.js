import { listFilesTool } from './listFiles.js'
import { readFileTool } from './readFile.js'
import { writeFileTool } from './writeFile.js'
import { makeDirTool } from './makeDir.js'
import { moveFileTool } from './moveFile.js'
import { deleteFileTool } from './deleteFile.js'
import { editFileTool } from './editFile.js'
import { multiEditFileTool } from './multiEditFile.js'

export const plugin = {
	name: 'filesystem',
	description: 'Project-scoped file system tools.',
	tools: [
		listFilesTool,
		readFileTool,
		writeFileTool,
		makeDirTool,
		moveFileTool,
		deleteFileTool,
		editFileTool,
		multiEditFileTool
	]
}
