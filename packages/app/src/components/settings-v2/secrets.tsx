import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { type Component, For, Show, createResource } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import { isSecretName, secretErrorMessage, secretUpdatedAt } from "./secrets-behavior"
import "./settings-v2.css"

export const SettingsSecretsV2: Component = () => {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const [store, setStore] = createStore({ name: "", value: "", busy: false, error: "" })
  const [secrets, { refetch }] = createResource(() =>
    serverSdk()
      .client.secret.list()
      .then((result) => result.data),
  )

  const name = () => store.name.trim()
  const nameInvalid = () => name().length > 0 && !isSecretName(name())
  const canSave = () => isSecretName(name()) && store.value.length > 0 && !store.busy

  const fail = (error: unknown) =>
    showToast({
      title: language.t("common.requestFailed"),
      description: secretErrorMessage(error, language.t("common.requestFailed")),
    })

  const save = async () => {
    if (!canSave()) return
    const target = name()
    const value = store.value
    setStore({ value: "", busy: true, error: "" })
    await serverSdk()
      .client.secret.set({ name: target, secretInput: { value } })
      .then(async () => {
        setStore("name", "")
        await refetch()
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("settings.secrets.saved", { name: target }),
        })
      })
      .catch((error: unknown) => setStore("error", secretErrorMessage(error, language.t("common.requestFailed"))))
    setStore("busy", false)
  }

  const remove = async (target: string) => {
    await serverSdk()
      .client.secret.remove({ name: target })
      .then(async () => {
        await refetch()
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("settings.secrets.deleted", { name: target }),
        })
      })
      .catch(fail)
  }

  return (
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">{language.t("settings.secrets.title")}</h2>
      </div>

      <div class="settings-v2-tab-body settings-v2-secrets">
        <div class="settings-v2-secrets-intro">
          <span>{language.t("settings.secrets.description")}</span>
          <span>{language.t("settings.secrets.hint")}</span>
        </div>

        <form
          class="settings-v2-secrets-form"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <div class="settings-v2-secrets-field">
            <label class="settings-v2-server-dialog-label">{language.t("settings.secrets.name")}</label>
            <TextInputV2
              type="text"
              appearance="large"
              class="!w-full self-stretch"
              value={store.name}
              placeholder={language.t("settings.secrets.name.placeholder")}
              invalid={nameInvalid() || !!store.error}
              disabled={store.busy}
              spellcheck={false}
              autocorrect="off"
              autocomplete="off"
              autocapitalize="off"
              onInput={(event) => setStore({ name: event.currentTarget.value, error: "" })}
            />
            <Show when={nameInvalid()}>
              <span class="settings-v2-server-dialog-error">{language.t("settings.secrets.name.invalid")}</span>
            </Show>
          </div>
          <div class="settings-v2-secrets-field">
            <label class="settings-v2-server-dialog-label">{language.t("settings.secrets.value")}</label>
            <TextInputV2
              type="password"
              appearance="large"
              class="!w-full self-stretch"
              value={store.value}
              placeholder={language.t("settings.secrets.value.placeholder")}
              invalid={!!store.error}
              disabled={store.busy}
              autocomplete="new-password"
              onInput={(event) => setStore({ value: event.currentTarget.value, error: "" })}
            />
            <Show when={store.error}>
              <span class="settings-v2-server-dialog-error">{store.error}</span>
            </Show>
          </div>
          <div class="settings-v2-secrets-actions">
            <ButtonV2 type="submit" variant="contrast" disabled={!canSave()}>
              {language.t("settings.secrets.save")}
            </ButtonV2>
          </div>
        </form>

        <Show
          when={!secrets.error}
          fallback={
            <div class="settings-v2-servers-status">
              <span>{language.t("settings.secrets.loadFailed")}</span>
            </div>
          }
        >
          <Show
            when={(secrets() ?? []).length > 0}
            fallback={
              <div class="settings-v2-servers-status">
                <span>
                  {secrets.loading
                    ? `${language.t("common.loading")}${language.t("common.loading.ellipsis")}`
                    : language.t("settings.secrets.empty")}
                </span>
              </div>
            }
          >
            <SettingsListV2>
              <For each={secrets()}>
                {(item) => {
                  const updated = () => secretUpdatedAt(item.updated)
                  return (
                    <div class="settings-v2-servers-row">
                      <div class="settings-v2-servers-copy">
                        <span class="settings-v2-servers-name">{item.name}</span>
                        <Show when={updated()}>
                          {(date) => (
                            <span class="settings-v2-servers-meta">
                              {language.t("settings.secrets.updated", { time: date().toLocaleString(language.intl()) })}
                            </span>
                          )}
                        </Show>
                      </div>
                      <div class="settings-v2-servers-actions">
                        <ButtonV2 type="button" variant="danger" size="small" onClick={() => void remove(item.name)}>
                          {language.t("common.delete")}
                        </ButtonV2>
                      </div>
                    </div>
                  )
                }}
              </For>
            </SettingsListV2>
          </Show>
        </Show>
      </div>
    </>
  )
}
