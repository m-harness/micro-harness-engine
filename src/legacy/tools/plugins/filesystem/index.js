import { deleteFileTool } from './deleteFile.js'
import { listFilesTool } from './listFiles.js'
import { makeDirTool } from './makeDir.js'
import { moveFileTool } from './moveFile.js'
import { readFileTool } from './readFile.js'
import { writeFileTool } from './writeFile.js'

export const filesystemPlugin = {
	name: 'filesystem',
	description: 'Project-scoped file system tools.',
	tools: [
		listFilesTool,
		readFileTool,
		writeFileTool,
		makeDirTool,
		moveFileTool,
		deleteFileTool
	]
}
