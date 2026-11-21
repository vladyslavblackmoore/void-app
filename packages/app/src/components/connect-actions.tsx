import { Show } from "solid-js"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"

export function ConnectActions(props: { cancelLabel: string; continueLabel?: string; onCancel: () => void }) {
  return (
    <div class="void-connect-actions flex w-full gap-2 self-stretch" data-component="connect-actions">
      <ButtonV2 type="button" variant="outline" class="flex-1" onClick={props.onCancel}>
        {props.cancelLabel}
      </ButtonV2>
      <Show when={props.continueLabel}>
        <ButtonV2 type="submit" variant="contrast" class="flex-1" data-action="provider-connect-submit">
          {props.continueLabel}
        </ButtonV2>
      </Show>
    </div>
  )
}
