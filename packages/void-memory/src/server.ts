import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { Store } from "./store"
import { taskStatuses } from "./types"

export const instructions = [
  "Graph memory shared by the agents of one space. Nothing is extracted for you: you supply the structure.",
  "Use recall before answering from memory and open to read full nodes. Use remember for durable facts, decisions and entities, not for chat history.",
  "Node kinds: entity, fact, decision, result, project, agent, session, doc. Edge types: about, relates_to, part_of, decided_in, supersedes, depends_on, parent_of, assigned_to, produced, derived_from.",
  "Give every fact a short specific title and put the detail in the body. Reuse a title with the same kind to update a node instead of duplicating it.",
  "To replace a fact or decision write the new node with a supersedes edge to the old one. forget invalidates a node, nothing is deleted; recall with history=true shows invalidated nodes.",
  "Task board: task_create (title, brief, project, deps), task_claim before starting work, task_update with notes, task_result when finished, task_list (ready=true for unblocked open tasks), board_changes with the last cursor to see what changed.",
  "Pinned means props.pinned = true on a live node that is not a task; pinned nodes stay in the recall block at the start of every session.",
  "Pass your agent name in agent so scope agent:<name> nodes stay yours; shared is the default scope.",
].join("\n")

const nodeKinds = ["entity", "fact", "decision", "result", "project", "agent", "session", "doc"] as const
const edgeTypes = [
  "about",
  "relates_to",
  "part_of",
  "decided_in",
  "supersedes",
  "depends_on",
  "parent_of",
  "assigned_to",
  "produced",
  "derived_from",
] as const

const props = z.record(z.string(), z.unknown())
const scope = z.string().regex(/^(shared|agent:.+)$/)

const nodeSchema = z.object({
  ref: z.string().optional().describe("local alias usable as an edge endpoint inside this batch"),
  id: z.string().optional().describe("explicit id; upserts that node"),
  kind: z.enum(nodeKinds),
  title: z.string().optional(),
  body: z.string().optional(),
  project: z.string().optional(),
  scope: scope.optional(),
  props: props.optional(),
})

const edgeSchema = z.object({
  src: z.string(),
  dst: z.string(),
  type: z.enum(edgeTypes),
  props: props.optional(),
})

export interface ServerOptions {
  readonly agent?: string
  readonly session?: string
}

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] })

const failure = (error: unknown) => ({
  isError: true as const,
  content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }],
})

const guard = <A>(run: (args: A) => unknown) => (args: A) => {
  try {
    return text(run(args))
  } catch (error) {
    return failure(error)
  }
}

export const createServer = (store: Store, options: ServerOptions = {}) => {
  const server = new McpServer({ name: "memory", version: "0.1.0" }, { instructions })
  const who = (agent: string | undefined) => agent ?? options.agent

  server.registerTool(
    "remember",
    {
      description:
        "Write a batch of nodes and edges in one transaction. Nodes upsert by id or by (kind, title). A supersedes edge invalidates its target.",
      inputSchema: {
        nodes: z.array(nodeSchema).optional(),
        edges: z.array(edgeSchema).optional(),
        agent: z.string().optional(),
        session: z.string().optional(),
      },
    },
    guard((args) =>
      store.remember(
        { nodes: args.nodes, edges: args.edges },
        { agent: who(args.agent), session: args.session ?? options.session },
      ),
    ),
  )

  server.registerTool(
    "recall",
    {
      description:
        "Search memory by text. Returns matching nodes with snippets plus neighbours up to hops (0 to 2) and the edges between them.",
      inputSchema: {
        query: z.string().optional(),
        kinds: z.array(z.string()).optional(),
        project: z.string().optional(),
        hops: z.number().int().min(0).max(2).optional(),
        limit: z.number().int().min(1).max(50).optional(),
        history: z.boolean().optional().describe("include invalidated nodes and edges"),
        agent: z.string().optional(),
      },
    },
    guard((args) => store.recall({ ...args, agent: who(args.agent) })),
  )

  server.registerTool(
    "open",
    {
      description: "Read full nodes by id with their edges and neighbours.",
      inputSchema: {
        ids: z.array(z.string()).min(1),
        history: z.boolean().optional(),
        agent: z.string().optional(),
      },
    },
    guard((args) => store.open({ ids: args.ids, history: args.history, agent: who(args.agent) })),
  )

  server.registerTool(
    "link",
    {
      description: "Add an edge between two existing nodes. A supersedes edge invalidates its target.",
      inputSchema: edgeSchema.shape,
    },
    guard((args) => store.link(args)),
  )

  server.registerTool(
    "forget",
    {
      description: "Invalidate nodes, optionally pointing to the node that replaces them. Nothing is deleted.",
      inputSchema: { ids: z.array(z.string()).min(1), superseded_by: z.string().optional() },
    },
    guard((args) => store.forget(args)),
  )

  const actor = (agent: string | undefined, session?: string) => ({ agent: who(agent), session: session ?? options.session })
  const status = z.enum(taskStatuses)

  server.registerTool(
    "task_create",
    {
      description: "Create an open task on the board. deps are task ids that must be done before it is ready.",
      inputSchema: {
        id: z.string().optional(),
        title: z.string(),
        brief: z.string().optional(),
        project: z.string().optional(),
        deps: z.array(z.string()).optional(),
        agent: z.string().optional(),
        session: z.string().optional(),
      },
    },
    guard((args) => store.task.create(args, actor(args.agent, args.session))),
  )

  server.registerTool(
    "task_claim",
    {
      description: "Claim an open task atomically. Returns claimed=false when another agent won or the task is not open.",
      inputSchema: { id: z.string(), agent: z.string().optional(), session: z.string().optional() },
    },
    guard((args) => store.task.claim(args.id, actor(args.agent, args.session))),
  )

  server.registerTool(
    "task_update",
    {
      description: "Change a task status and add a note. Finished tasks (done, cancelled) cannot be updated.",
      inputSchema: {
        id: z.string(),
        status: status.optional(),
        note: z.string().optional(),
        agent: z.string().optional(),
        session: z.string().optional(),
      },
    },
    guard((args) => store.task.update(args, actor(args.agent, args.session))),
  )

  server.registerTool(
    "task_result",
    {
      description: "Store the outcome as a result node linked to the task and close the task (done, or failed).",
      inputSchema: {
        id: z.string(),
        result: z.string(),
        outcome: z.enum(["done", "failed"]).optional(),
        title: z.string().optional(),
        agent: z.string().optional(),
        session: z.string().optional(),
      },
    },
    guard((args) => store.task.result(args, actor(args.agent, args.session))),
  )

  server.registerTool(
    "task_list",
    {
      description: "List tasks. ready=true returns open tasks whose dependencies are all done.",
      inputSchema: {
        status: status.optional(),
        project: z.string().optional(),
        claimed_by: z.string().optional(),
        ready: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    guard((args) => store.task.list(args)),
  )

  server.registerTool(
    "board_changes",
    {
      description: "Task events after a cursor (sequence number), oldest first. Pass the returned cursor next time.",
      inputSchema: {
        after: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(200).optional(),
        project: z.string().optional(),
      },
    },
    guard((args) => store.task.changes(args.after ?? 0, args.limit, args.project)),
  )

  return server
}
