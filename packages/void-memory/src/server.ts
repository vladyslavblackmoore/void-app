import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { Store } from "./store"

export const instructions = [
  "Graph memory shared by the agents of one space. Nothing is extracted for you: you supply the structure.",
  "Use recall before answering from memory and open to read full nodes. Use remember for durable facts, decisions and entities, not for chat history.",
  "Node kinds: entity, fact, decision, result, project, agent, session, doc. Edge types: about, relates_to, part_of, decided_in, supersedes, depends_on, parent_of, assigned_to, produced, derived_from.",
  "Give every fact a short specific title and put the detail in the body. Reuse a title with the same kind to update a node instead of duplicating it.",
  "To replace a fact or decision write the new node with a supersedes edge to the old one. forget invalidates a node, nothing is deleted; recall with history=true shows invalidated nodes.",
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

  return server
}
