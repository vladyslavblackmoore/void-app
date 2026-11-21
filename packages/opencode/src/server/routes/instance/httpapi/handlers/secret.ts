import { Effect } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { SecretStore } from "@opencode-ai/core/secret/store"
import { RootHttpApi } from "../api"
import { SecretInput } from "../groups/secret"

export const secretHandlers = HttpApiBuilder.group(RootHttpApi, "secret", (handlers) =>
  Effect.gen(function* () {
    const secrets = yield* SecretStore.Service

    const list = Effect.fn("SecretHttpApi.list")(function* () {
      return yield* secrets.list().pipe(Effect.orDie)
    })

    const set = Effect.fn("SecretHttpApi.set")(function* (ctx: {
      params: { name: string }
      payload: typeof SecretInput.Type
    }) {
      yield* secrets
        .set(ctx.params.name, ctx.payload.value)
        .pipe(
          Effect.catchTags({
            SecretInvalidNameError: () => Effect.fail(new HttpApiError.BadRequest({})),
            SecretKeyError: Effect.die,
            SecretStoreError: Effect.die,
          }),
        )
      return true
    })

    const remove = Effect.fn("SecretHttpApi.remove")(function* (ctx: { params: { name: string } }) {
      return yield* secrets.delete(ctx.params.name).pipe(
        Effect.catchTags({
          SecretInvalidNameError: () => Effect.fail(new HttpApiError.BadRequest({})),
          SecretStoreError: Effect.die,
        }),
      )
    })

    return handlers.handle("list", list).handle("set", set).handle("remove", remove)
  }),
)
