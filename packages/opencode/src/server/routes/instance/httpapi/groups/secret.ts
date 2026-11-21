import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { SecretStore } from "@opencode-ai/core/secret/store"
import { described } from "./metadata"

const SecretParams = Schema.Struct({
  name: SecretStore.Name.annotate({ description: "Secret name, for example tracker/token" }),
})

export const SecretInput = Schema.Struct({
  value: Schema.String.annotate({ description: "Secret value. It is stored encrypted and no route returns it." }),
}).annotate({ identifier: "SecretInput" })

export const SecretEntry = Schema.Struct({
  name: Schema.String.annotate({ description: "Secret name" }),
  updated: Schema.Number.annotate({ description: "Last update time in milliseconds since the epoch" }),
}).annotate({ identifier: "SecretEntry" })

export const SecretPaths = {
  list: "/secret",
  secret: "/secret/:name",
} as const

export const SecretApi = HttpApi.make("secret").add(
  HttpApiGroup.make("secret")
    .add(
      HttpApiEndpoint.get("list", SecretPaths.list, {
        success: described(Schema.Array(SecretEntry), "Secret names and update times"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "secret.list",
          summary: "List secrets",
          description: "List the names and update times of stored secrets. Values are never returned.",
        }),
      ),
      HttpApiEndpoint.put("set", SecretPaths.secret, {
        params: SecretParams,
        payload: SecretInput,
        success: described(Schema.Boolean, "Secret stored"),
        error: HttpApiError.BadRequest,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "secret.set",
          summary: "Set secret",
          description: "Store or replace a secret value in the encrypted secret store.",
        }),
      ),
      HttpApiEndpoint.delete("remove", SecretPaths.secret, {
        params: SecretParams,
        success: described(Schema.Boolean, "Whether the secret existed and was removed"),
        error: HttpApiError.BadRequest,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "secret.remove",
          summary: "Remove secret",
          description: "Remove a secret from the encrypted secret store.",
        }),
      ),
    )
    .annotateMerge(OpenApi.annotations({ title: "secret", description: "Write-only secret store routes." })),
)
