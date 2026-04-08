English | [日本語](../ja/admin-guide.md)

# Admin Guide

A complete guide to all features of the admin console (`/admin`).

---

## Access

```
http://localhost:4310/admin
```

### Login

- **Login Name**: `root` (or any user with the admin role)
- **Password**: The value of the `ADMIN_RUNTIME_PASSWORD` environment variable

### Authentication Characteristics

| Item | Details |
|---|---|
| Session storage | In-memory (not persisted to the database) |
| Expiration | 12 hours by default (no extension) |
| Server restart | Sessions are lost (re-login required) |
| CSRF | Always required (for all mutating operations) |

---

## Overview

View a summary of the system on the dashboard.

| Item | Description |
|---|---|
| Users | Total number of registered users |
| Pending approvals | Number of approval requests in pending status |
| Automations | Number of registered scheduled tasks |
| Tool Policies | Number of created Tool Policies |
| File Policies | Number of created File Policies |
| Tool catalog | Total number of available tools |
| Protection rules | Number of active protection rules |

---

## Users

### Creating Users

| Field | Constraints |
|---|---|
| Login Name | `[a-z0-9][a-z0-9-_]{1,31}`, must be unique |
| Display Name | Any string |
| Password | 12 characters minimum |
| Role | `user` / `admin` |

### User Management

| Action | Description |
|---|---|
| Edit | Modify loginName, displayName, role, and status |
| Change password | Set a new password |
| Deactivate | Change status to `inactive` (login disabled) |
| Activate | Restore status to `active` |
| Delete | Permanently delete a user (related data is cascade-deleted) |
| Assign policies | Select Tool Policies and File Policies |

### root User

`root` is a special user automatically created by the system:

- Cannot be deleted
- Cannot be deactivated
- Password cannot be changed (managed via environment variable)
- `authSource: system`
- `System All Tools` policy is pre-assigned

---

## Tool Policies

### List View

Displays each policy's name, description, number of permitted tools, and tool details (name and risk level).

### Creating

1. Enter a policy name and description
2. Select the tools to permit from the list of registered tools
3. MCP tools can also be selected on the same screen

### Editing

- Change the name and description
- Add or remove permitted tools
- **System policies cannot be edited**

### Deleting

- If users are currently assigned to the policy, specify an alternative policy
- Affected users are automatically migrated to the alternative policy
- **System policies cannot be deleted**

---

## File Policies

### List View

Displays each policy's name, description, and root list (scope, rootPath, pathType).

### Creating

1. Enter a policy name and description
2. Add roots

### Adding Roots

| Field | Options | Description |
|---|---|---|
| Scope | `workspace` / `absolute` | The base reference for the path |
| Root Path | String | The path to grant access to |
| Path Type | `dir` / `file` | Entire directory or a single file |

Roots with the `absolute` scope require the path to actually exist. You can verify this using the **Probe** feature before adding.

### Probe

A feature to check the state of a path beforehand:

- The resolved absolute path for the entered path
- Whether it exists
- Whether it is within the workspace
- Whether it is a directory or a file

### Deleting Roots

Individual roots can be deleted. Roots belonging to system policies cannot be deleted.

---

## Approvals

### List View

Displays all approval requests in pending status.

| Display Item | Description |
|---|---|
| Tool name | The tool for which approval was requested |
| Reason | The reason approval is required |
| Requester | The user who requested the operation |
| Request date/time | When the request was made |

### Actions

- **Approve**: Approve the operation and resume tool execution
- **Deny**: Reject the operation and return the denial result to the LLM

Approvals by an administrator are recorded as `decided_by_user_id: null`, `decision_note: 'admin-console'`.

---

## Automations

### List View

Displays Automations for all users.

| Display Item | Description |
|---|---|
| Name | Name of the Automation |
| Owner | The user who created it |
| Instruction | The content to execute |
| Interval | Execution interval (in minutes) |
| Status | active / paused / deleted |
| Next run | Next scheduled execution date/time |
| Last run | Last execution date/time |

### Actions

| Action | Description |
|---|---|
| Pause | Pause the Automation (without owner confirmation) |
| Delete | Delete the Automation (without owner confirmation) |

Administrator actions bypass ownership checks (intended for emergency operations).

---

## Tools

A catalog listing of registered tools.

| Display Item | Description |
|---|---|
| Name | Tool name |
| Description | Tool description |
| Risk level | `safe` / `dangerous` |
| Plugin name | The owning plugin or `mcp` |

MCP tools are displayed in the `servername__toolname` format.

---

## Skills

Management of custom skills. Skills are stored as Markdown files in the `skills/` directory.

### Creating

| Field | Constraints | Description |
|---|---|---|
| Name | `[a-z0-9_]`, max 64 characters | Skill identifier |
| Description | Required | Description displayed to the LLM |
| Prompt | Required | Prompt passed to the LLM when the skill is executed |

### Editing

The description and prompt can be updated.

### Deleting

Deletes the skill file.

### How It Works

1. The LLM invokes a skill through the `use_skill` tool
2. The skill's prompt is returned to the LLM
3. The LLM acts according to that prompt

---

## MCP Servers

Management of connections to external MCP servers.

### List View

| Display Item | Description |
|---|---|
| Server name | The configured name |
| Configuration | command/url (env and headers are masked) |
| Status | `ready` / `connecting` / `disconnected` / `failed` |
| Tool count | Number of tools provided |
| Last error | The most recent error message |

### Adding

For stdio:
```json
{
  "command": "npx",
  "args": ["-y", "server-package"],
  "env": { "API_KEY": "xxx" }
}
```

For HTTP:
```json
{
  "url": "https://mcp.example.com/sse",
  "headers": { "Authorization": "Bearer xxx" }
}
```

### Actions

| Action | Description |
|---|---|
| Edit | Modify configuration (triggers a reconnection) |
| Delete | Disconnect and remove the server configuration |
| Reconnect | Reconnect to a disconnected server |

---

## Protection Rules

A listing of path protection rules.

### Display Contents

| Item | Description |
|---|---|
| Pattern | Matching pattern (`.env`, `security`, `**/*.key`, etc.) |
| Type | `exact` / `dirname` / `glob` |
| Scope | `system` / `workspace` |
| Effect | `deny` |
| Priority | Numeric value (lower values take higher precedence) |
| Enabled/Disabled | Can be toggled |

### Actions

| Action | Description |
|---|---|
| Add | Create a new protection rule |
| Enable/Disable toggle | Temporarily disable a rule |
| Delete | Delete a rule (operations on `system` scope rules are restricted from the admin console) |
| Inspect | Test which rules match a specific path |

### Inspect

Enter a path to see which protection rules it matches. Use this to debug rule configurations.
