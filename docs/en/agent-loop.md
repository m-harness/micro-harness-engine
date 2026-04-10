English | [日本語](../ja/agent-loop.md)

# Agent Loop

Details on how the agent loop works, approval workflows, cancel control, automatic recovery, and scheduled execution.

---

## Loop Overview

This is the processing flow from the user's message to the assistant's final response. `processRun` consumes events returned by `async *runLoop()` via `for await`, and delivers each event to SSE listeners through `emitRunEvent`.

```mermaid
sequenceDiagram
    participant U as User
    participant SSE as SSE (Browser)
    participant APP as App Engine
    participant PS as Policy Service
    participant LLM as LLM Provider
    participant TR as Tool Registry
    participant PE as Protection Engine
    participant CH as Channel Adapter

    U->>APP: Send message
    APP->>APP: Save Message
    APP->>APP: Create Agent Run (status: queued)
    APP->>APP: processRun() starts

    loop async *runLoop()
        APP->>APP: Cancel check (checkpoint 1)
        APP->>PS: Get allowed tool definitions
        PS-->>APP: Filtered tool definitions
        APP->>LLM: async *generate(messages, tools, signal)

        loop Streaming
            LLM-->>APP: yield { type: 'text_delta', text }
            APP-->>SSE: yield delta event
        end

        LLM-->>APP: return { assistantMessage, stopReason }
        APP->>APP: Cancel check (checkpoint 2)

        alt Text response only (no tool_calls)
            APP->>APP: Save Message
            APP->>APP: Run complete (status: completed)
            APP-->>SSE: yield run.completed event
            APP->>CH: Deliver response to channel
        else Tool calls present
            loop Each tool_call
                APP-->>SSE: yield tool_call event
                APP->>APP: Cancel check (checkpoint 3)
                APP->>PS: assertToolAllowed()
                APP->>TR: execute(toolName, input)
                TR->>PE: Path protection check

                alt Approval required
                    TR-->>APP: { approvalRequired: true }
                    APP->>APP: Create Approval
                    APP->>APP: Pause Run (waiting_approval)
                    APP-->>SSE: yield approval.requested event
                    APP->>CH: Send approval request
                    Note over APP: Loop paused → Waiting for approval
                else Normal execution
                    TR-->>APP: Tool result
                    APP-->>SSE: yield tool_result event
                    APP->>APP: Record ToolCall
                end
            end
            APP->>APP: Cancel check (checkpoint 4)
            APP->>APP: Append tool results to messages
            Note over APP: Return to loop start
        end
    end
```

---

## Async Generator Architecture

### Data Flow

```
processRun(runId)
  |
  |-- AbortController creation & registration
  |-- Build loopMessages (from snapshot or DB)
  |
  +-- for await (const event of this.runLoop({...}))
       |
       |-- this.emitRunEvent(runId, event)
       |     +-- runEventListeners.get(conversationId)
       |           +-- each listener(event)  <- SSE delivery
       |
       +-- catch: classifyApiError()
             |-- retryable -> recovering -> processRun re-invoked
             +-- non-retryable -> failed
```

### Events Yielded by `runLoop`

| Event Type | Data | When |
|---|---|---|
| `run.started` | `{ runId, status: 'running', phase: 'calling_model' }` | Immediately after loop begins |
| `delta` | `{ runId, type: 'text_delta', text }` | Each streaming chunk from LLM |
| `tool_call` | `{ runId, name, input }` | Before tool execution |
| `tool_result` | `{ runId, name, output }` | After tool execution |
| `approval.requested` | `{ runId, approvalId, toolName }` | When a tool requiring approval is detected |
| `run.completed` | `{ runId, status: 'completed', finalText }` | Loop completed normally |

### Events Emitted Outside `processRun`

| Event Type | When |
|---|---|
| `run.cancelled` | `cancelRun()` / `finalizeCancelledRun()` execution |
| `run.failed` | `processRun` catch block (non-retryable error) |

---

## Run Lifecycle

```
queued -> running -> completed
                  -> failed
                  -> cancelled (at any checkpoint)
                  -> waiting_approval -> (approve/deny) -> running -> ...
                  -> recovering -> running -> ...
                                          -> failed
```

### Statuses

| Status | Description |
|---|---|
| `queued` | Waiting for execution |
| `running` | Loop in progress |
| `waiting_approval` | Waiting for human approval |
| `recovering` | Automatic recovery from error in progress |
| `completed` | Completed successfully |
| `failed` | Terminated with error |
| `cancelled` | Cancelled by user or system |

### Phases

Phases track more granular states within a Run:

| Phase | Description |
|---|---|
| `queued` | Entered the execution queue |
| `calling_model` | Calling the LLM API |
| `processing_response` | Processing the response |
| `tool_results` | Aggregating tool execution results |
| `waiting_approval` | Waiting for approval |
| `approval_resumed` | Loop resumed after approval |
| `recovering` | Recovery in progress |
| `completed` | Completed |
| `failed` | Failed |
| `cancelled` | Cancelled |

---

## Cancel Control

### Cancellation Propagation via AbortController

`processRun()` creates an `AbortController` at execution start and registers it in the `activeAbortControllers` map keyed by `runId`. The `AbortSignal` is passed to the provider's `generate()`, enabling in-flight HTTP request interruption.

```
cancelRun({ runId, actor })
  |
  |-- Update Run to cancelled (DB)
  |-- activeAbortControllers.get(runId)?.abort()
  |     +-- LLM API fetch throws AbortError
  +-- emitRunEvent('run.cancelled')
```

### Cancellable Statuses

`cancelRun()` can only cancel Runs in these statuses:
- `queued`
- `running`
- `recovering`

### 4 Checkpoints

`runLoop` calls `isRunCancelled(runId)` at each checkpoint. If cancelled, `finalizeCancelledRun()` is called and the loop exits.

| Checkpoint | Location |
|---|---|
| 1 | Top of `while` loop |
| 2 | After LLM response received |
| 3 | Before each tool call |
| 4 | After all tools complete |

Additionally, `AbortError` raised within the provider is also handled as cancellation detection.

### `finalizeCancelledRun()`

Performs post-cancellation cleanup:

1. If partial assistant text exists, appends `_(interrupted)_` suffix and saves
2. Inserts synthetic `tool_result` for incomplete tool calls (those without results)
3. Updates Run status to `cancelled`, phase to `cancelled`
4. Records a `run.cancelled` Conversation Event
5. Emits `run.cancelled` event via `emitRunEvent`

### Cancel API

```
POST /api/runs/:runId/cancel
```

- CSRF token required
- Authenticated users only (must own the Run)
- Response: `{ ok: true, data: { ok: true } }`

---

## Message Construction

### New Conversation

```
1. Load all messages from DB
2. Convert to { role, content: [{ type: 'text', text }] } format
3. Perform provider-specific normalization
4. Append extraMessages if present (e.g., automation instructions)
```

### Continuation Loop

During the loop, `loopMessages` accumulate in memory:

```
[
  { role: 'user', content: [...] },           // Past messages
  { role: 'assistant', content: [...] },       // LLM response
  { role: 'tool', content: [tool_result] },    // Tool result
  { role: 'assistant', content: [...] },       // Next LLM response
  ...
]
```

These `loopMessages` are saved in the Run's `snapshot`, allowing resumption with full context after approval waits or recovery.

---

## Tool Execution Details

### Execution Flow

```
1. Tool Policy check
   PolicyService.assertToolAllowed(userId, toolName)
   -> Tools not on the allow list return 403

2. Tool-specific preprocessing
   Example: delete_file checks approvalGranted

3. Path resolution + File Policy check
   resolveProjectPath(path, context)
   -> PolicyService.resolveFileAccess(userId, path)
   -> Verify path is within File Policy root scope

4. Protection Engine check
   assertPathActionAllowed(displayPath, action)
   -> Check against protection rules

5. Actual file operation
   fs.readFileSync, fs.writeFileSync, etc.

6. Return result
   { ok: true, path, content, ... }
```

### Tool Call Recording

Each tool call is recorded in the `run_tool_calls` table:

```
+----------+------------+-------------------+---------+
| run_id   | tool_name  | input_json        | status  |
+----------+------------+-------------------+---------+
| run-001  | read_file  | {"path":"src/.."} | success |
| run-001  | write_file | {"path":"src/.."} | success |
| run-001  | delete_file| {"path":"tmp/.."} | started |
+----------+------------+-------------------+---------+
```

Cache feature: If a tool call with the same `callId` is re-executed within the same Run (during recovery), the previous successful result is returned from the cache.

### Skill Execution

`use_skill` is a special tool that returns the prompt of a skill registered in the SkillRegistry.

```
LLM: use_skill({ skill_name: "code_review" })
-> { ok: true, skill: "code_review", instructions: "Review prompt..." }
-> The LLM acts according to these instructions
```

### MCP Tool Execution

If a tool name contains `__`, it is routed to the MCP Manager:

```
Tool name: github__search_repositories
  -> serverName: github
  -> toolName: search_repositories
  -> McpClient.callTool("search_repositories", input)
  -> Normalize and return result
```

---

## Approval Workflow

### Trigger

The approval flow is triggered when a tool returns `{ approvalRequired: true }`.

Current implementation:
- `delete_file` --- Always requires approval when `context.approvalGranted` is false

### Approval Processing Flow

```
1. Save Approval record to DB
   - Conversation ID, Run ID, tool name, input parameters, reason
   - status: pending

2. Change Run to waiting_approval
   - Save pendingTool: { callId, name, input } in snapshot

3. Notify via channel adapter
   - Web: Deliver approval.requested event via SSE
   - Slack: Block Kit buttons (Approve / Deny)
   - Discord: Component buttons (Approve / Deny)

4. Receive approval/denial
   - User: Chat screen or Slack/Discord buttons
   - Admin: Approvals section in admin panel

5. If approved:
   - Execute the tool (approvalGranted = true)
   - Append result to loopMessages
   - Set Run back to running, resume loop

6. If denied:
   - Append "Human approval was denied." as tool result
   - Set Run back to running, resume loop
   - The LLM can recognize the denial and suggest alternatives
```

---

## Automatic Recovery

### API Error Retries

Automatic retries are performed when transient errors occur during LLM API calls.

```
Retry targets (RETRYABLE_HTTP_CODES):
  - HTTP 429, 500, 502, 503, 504, 529

Network errors:
  - ETIMEDOUT, ECONNRESET, UND_ERR_CONNECT_TIMEOUT

Message patterns (RETRYABLE_ERROR_PATTERNS):
  - overloaded, rate_limit, rate limit, capacity
  - temporarily unavailable, resource_exhausted
  - quota exceeded, service unavailable, try again

Retry strategy:
  - Maximum MAX_API_RETRIES = 4 attempts
  - Exponential backoff: 500ms, 1000ms, 2000ms, 4000ms
```

### Error Classification

`classifyApiError(error)` --- Classifies API communication errors:
- Network error codes (ETIMEDOUT, ECONNRESET, UND_ERR_CONNECT_TIMEOUT) -> retryable
- HTTP status in RETRYABLE_HTTP_CODES -> retryable
- Message matches RETRYABLE_ERROR_PATTERNS -> retryable
- Otherwise -> non-retryable

`classifyToolError(error)` --- Classifies tool execution errors:
- ETIMEDOUT, EBUSY, ECONNRESET -> retryable
- Otherwise -> non-retryable

### Run-Level Recovery

Even after retries are exhausted, recovery is attempted at the Run level.

```
Run state:
  running -> recovering (retryable error)
  recovering -> running (retry succeeded)
  recovering -> failed (reached maximum of MAX_RECOVERY_ATTEMPTS = 3)
```

### Recovery After Server Restart

On server startup, `recoverInterruptedRuns()` is called to reprocess all Runs with `status: recovering`.

```
On startup:
  1. Retrieve all Runs in recovering state from DB
  2. Execute processRun() for each Run
  3. Restore loopMessages from snapshot
     -> Fully inherits the context from before the interruption
```

---

## Conversation Events

Agent actions are recorded as events.

| Event Type | Description |
|---|---|
| `conversation.created` | Conversation was created |
| `message.user` | User message |
| `message.assistant` | Assistant response |
| `run.queued` | Run was queued |
| `run.started` | Run started |
| `run.recovering` | Run is recovering |
| `run.cancelled` | Run was cancelled |
| `run.failed` | Run failed |
| `tool.result` | Tool execution result |
| `approval.requested` | Approval request |
| `approval.decided` | Approved/denied |
| `automation.created` | Automation was created |
| `automation.triggered` | Automation was triggered |

Events have auto-incrementing integer IDs and support cursor-based streaming.

---

## Provider Streaming Integration

### `async *generate()` Interface

All LLM providers implement `generate()` as an async generator. During streaming, they yield `{ type: 'text_delta', text }` and return the normalized response upon completion.

```
async *generate({ messages, systemPrompt, toolDefinitions, maxTokens, signal })
  |
  |-- yield { type: 'text_delta', text: '...' }  (repeated)
  |
  +-- return { assistantMessage, assistantText, stopReason }
```

The `signal` parameter (`AbortSignal`) enables immediate interruption of in-flight HTTP requests on cancellation.

### `wrapAsyncGenerator` Utility

`for await...of` discards the `return` value of an async generator (the `value` in `{ value, done: true }`). `wrapAsyncGenerator` is a wrapper that solves this problem.

```javascript
// Adds a .result getter to the iterator object
const genStream = provider.generate({ messages, ... })

for await (const delta of genStream) {
    // delta = { type: 'text_delta', text: '...' }
    yield { type: 'delta', runId, ...delta }
}

const result = genStream.result
// result = { assistantMessage, assistantText, stopReason }
```

### Provider-Specific Implementations

| Provider | Streaming Method | Wrapper |
|---|---|---|
| Anthropic | `@anthropic-ai/sdk` `messages.stream` | Custom iterator wrapper |
| OpenAI | `fetch` + SSE parsing (manual `data:` line parsing) | `wrapAsyncGenerator` |
| Gemini | `fetch` + SSE parsing (`streamGenerateContent?alt=sse`) | `wrapAsyncGenerator` |

---

## Automation (Scheduled Execution)

### How It Works

Automations are scheduled execution tasks that the LLM registers using tools within a chat.

```
User: "Check disk usage every morning at 9 AM"

LLM -> create_automation({
  name: "daily-disk-check",
  instruction: "Check disk usage and report",
  interval_minutes: 1440
})
```

### Execution Flow

```mermaid
sequenceDiagram
    participant SCHED as Scheduler
    participant AUTO as AutomationService
    participant APP as App Engine
    participant LLM as LLM

    loop Poll every 30 seconds
        SCHED->>AUTO: pollDueAutomations()
        AUTO->>AUTO: Search for due automations
        AUTO->>APP: onAutomationTriggered(automation)
        APP->>APP: Create Agent Run<br/>(triggerType: automation)
        APP->>APP: Add instruction to extraMessages
        APP->>LLM: Execute normal agent loop
        LLM-->>APP: Execution result
        APP->>APP: Deliver result to original conversation
    end
```

### Management

| Operation | User | Admin |
|---|---|---|
| Create | From chat (via tool) | - |
| List | Own automations | All automations |
| Pause | Own automations | Any automation |
| Resume | Own automations | - |
| Delete | Own automations | Any automation |
| Execute immediately | Own automations | - |

- Minimum interval: 5 minutes
- Default polling interval: 30 seconds (configurable via `AUTOMATION_TICK_MS`)
- Automations are owned by the user who created them and are associated with that conversation
