English | [日本語](../ja/tools.md)

# Tools

Details on built-in tools and how to develop custom tool plugins.

---

## Built-in Tool List

### filesystem Plugin

A set of file operation tools scoped to the project.

| Tool | Risk | Description |
|---|---|---|
| `list_files` | safe | Returns a list of files and folders in a directory. Protected items are automatically excluded and only reported as a `hiddenCount` |
| `read_file` | safe | Reads the contents of a file. Also returns a `preview` (first 400 characters) |
| `write_file` | safe | Creates or overwrites a file. Parent directories are created automatically. Returns the byte count |
| `edit_file` | safe | Diff-based editing that replaces `old_string` with `new_string`. If `old_string` appears in multiple locations, an error is raised unless `replace_all` is specified (safety measure) |
| `multi_edit_file` | safe | Applies multiple `old_string -> new_string` pairs in a single operation |
| `make_dir` | safe | Creates directories recursively |
| `move_file` | safe | Moves or renames a file or directory. Protection checks are performed on both source and destination |
| `delete_file` | dangerous | Deletes a file or directory. **Requires approval** (`approvalRequired`). Directories can also be deleted with `recursive: true` |

### git Plugin

A set of Git operation tools with four levels of access.

| Tool | Risk | Description |
|---|---|---|
| `git_info` | safe | Retrieves information via `git status`, `git log`, `git diff`, `git branch`, etc. |
| `git_commit` | safe | Staging + commit creation |
| `git_push` | safe | Push to remote |
| `git_dangerous` | dangerous | Destructive commands such as `reset --hard`, `force push`, etc. **Requires approval** |

### search Plugin

| Tool | Risk | Description |
|---|---|---|
| `glob` | safe | Searches for files using glob patterns |
| `grep` | safe | Searches file contents using regular expressions |

### web Plugin

| Tool | Risk | Description |
|---|---|---|
| `web_fetch` | safe | Fetches content from a specified URL |
| `web_search` | safe | Web search using the Brave Search API (requires `BRAVE_SEARCH_API_KEY`) |

### automation Plugin

| Tool | Risk | Description |
|---|---|---|
| `create_automation` | safe | Creates a scheduled task (minimum interval: 5 minutes) |
| `list_automations` | safe | Lists automations for the current conversation |
| `pause_automation` | safe | Pauses an automation |
| `resume_automation` | safe | Resumes an automation |
| `delete_automation` | safe | Deletes an automation |

---

## Security During Tool Execution

All tools pass through the following multi-layer checks:

```
User request
  |
  +-- Tool Policy check <- Is it on the whitelist?
  |
  +-- File Policy check <- Is the path accessible?
  |     (file-related tools only)
  |
  +-- Protection Engine check <- Is it a protected target?
  |     +-- discover: excluded from list_files results
  |     +-- read: read denied
  |     +-- write: write denied
  |     +-- move: move denied (both source + dest)
  |     +-- delete: delete denied
  |
  +-- Approval check <- Is approval required?
  |     (tools with riskLevel: dangerous)
  |
  +-- Actual file operation
```

When a ProtectionError occurs, the tool returns the following structured result:

```json
{
  "ok": false,
  "code": "PROTECTED_PATH",
  "error": "This path is protected and cannot be accessed.",
  "userActionRequired": true,
  "message": "Ask the user to handle this manually."
}
```

The LLM receives this result and can guide the user to perform the operation manually.

---

## Plugin Development Guide

### Directory Structure

```
tools/
└── my-plugin/
    ├── index.js          # Plugin entry point (required)
    ├── myTool.js         # Tool implementation
    └── helpers.js        # Helper functions
```

### Plugin Definition (`index.js`)

```js
import { myTool } from './myTool.js'

export const plugin = {
  name: 'my-plugin',              // Plugin name (required)
  description: 'My custom tools', // Description
  tools: [myTool]                 // Tool array (required, at least one)
}
```

### Tool Definition

```js
export const myTool = {
  name: 'my_tool',                // Tool name (must be globally unique, required)
  description: 'Does something',  // Description shown to the LLM
  riskLevel: 'safe',              // 'safe' | 'dangerous'
  input_schema: {                 // JSON Schema (for the LLM to understand parameters)
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Target file path'
      }
    },
    required: ['path']
  },

  async execute(input, context) {
    // input: parameters passed by the LLM
    // context: execution context (described below)

    return {
      ok: true,
      result: 'Done'
    }
  }
}
```

### The execute context

The `context` in `execute(input, context)` contains the following:

```js
{
  // User information
  userId: 'user-uuid',
  conversationId: 'conv-uuid',
  channelIdentityId: 'ci-uuid',

  // Approval state
  approvalGranted: false,    // true = re-execution after approval

  // Policy service
  policyService: PolicyService,

  // Helper functions
  helpers: {
    resolveProjectPath(path, options),   // Path resolution + policy check
    getTextPreview(text, maxLength),     // Generate text preview
    resolveThroughExistingAncestor(path),// Symbolic link resolution
    createApprovalResponse(toolName, input, reason), // Generate approval response
    assertPathActionAllowed(path, action),           // Protection check
    filterDiscoverableEntries(basePath, entries)      // Filter protected items
  },

  // Services
  services: {
    automationService: AutomationService
  }
}
```

### File Operation Pattern

Tools that handle files use `resolveProjectPath` for path resolution and policy checks:

```js
async execute(input, context) {
  const { resolveProjectPath } = context.helpers

  // Path resolution + File Policy + Protection Engine check
  const target = resolveProjectPath(input.path, {
    ...context,
    action: 'read'  // 'read' | 'write' | 'move' | 'delete' | 'discover'
  })

  // target.absolutePath: absolute path
  // target.displayPath: relative path for display

  const content = fs.readFileSync(target.absolutePath, 'utf8')

  return {
    ok: true,
    path: target.displayPath,
    content
  }
}
```

### Tools That Require Approval

```js
async execute(input, context) {
  // First call before approval
  if (!context.approvalGranted) {
    return context.helpers.createApprovalResponse(
      'my_dangerous_tool',
      input,
      'This operation requires human approval.'
    )
  }

  // Re-execution after approval
  // ... actual processing
}
```

### Error Handling

Errors thrown within a tool are caught by the Tool Registry and returned in the following format:

```js
// ProtectionError -> structured protection result
{ ok: false, code: 'PROTECTED_PATH', ... }

// Other errors -> generic error
{ ok: false, error: 'Error message' }
```

### How Plugin Loading Works

```
On server startup:
  1. Scan all subdirectories in the tools/ directory
  2. Dynamically import index.js from each directory
  3. Retrieve export const plugin or export default
  4. Validate the plugin:
     - name must be a string
     - tools must be an array with at least one entry
     - Each tool must have a name and execute
  5. Check for duplicate tool names (across all plugins)
  6. Failed plugins are skipped (no impact on other plugins)
```

After adding a new plugin, restart the server.
