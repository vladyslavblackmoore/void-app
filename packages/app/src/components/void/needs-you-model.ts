import type { PermissionRequest, QuestionRequest } from "@opencode-ai/sdk/v2/client"

export type NeedsYouEntry = {
  sessionID: string
  title: string
  projectName: string
  directory: string
  permission?: PermissionRequest
  question?: QuestionRequest
}

export type NeedsYouCard = {
  id: string
  kind: "permission" | "question"
  rootID: string
  sessionID: string
  directory: string
  title: string
  projectName: string
  tool: string
  detail: string
}

export function needsYouCards(entries: NeedsYouEntry[]): NeedsYouCard[] {
  return entries.flatMap((entry): NeedsYouCard[] => {
    const base = {
      rootID: entry.sessionID,
      directory: entry.directory,
      title: entry.title,
      projectName: entry.projectName,
    }
    if (entry.permission) {
      return [
        {
          ...base,
          id: entry.permission.id,
          kind: "permission",
          sessionID: entry.permission.sessionID,
          tool: entry.permission.permission,
          detail: entry.permission.patterns.join(" "),
        },
      ]
    }
    if (entry.question) {
      return [
        {
          ...base,
          id: entry.question.id,
          kind: "question",
          sessionID: entry.question.sessionID,
          tool: "question",
          detail: entry.question.questions[0]?.question ?? "",
        },
      ]
    }
    return []
  })
}
