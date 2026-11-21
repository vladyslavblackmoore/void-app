import { describe, expect, test } from "bun:test"
import { connectCopyKey, providerLabel, providerSlug } from "./provider-branding"

describe("void provider branding", () => {
  test("upstream provider names are replaced under the void theme", () => {
    expect(providerLabel(true, "opencode", "OpenCode")).toBe("Free models")
    expect(providerLabel(true, "opencode-go", "OpenCode Go")).toBe("Go subscription")
  })

  test("other providers keep their own name under the void theme", () => {
    expect(providerLabel(true, "anthropic", "Anthropic")).toBe("Anthropic")
  })

  test("other themes keep the upstream names", () => {
    expect(providerLabel(false, "opencode", "OpenCode")).toBe("OpenCode")
    expect(providerLabel(false, "opencode-go", "OpenCode Go")).toBe("OpenCode Go")
  })

  test("provider ids are neutral under the void theme only", () => {
    expect(providerSlug(true, "opencode")).toBe("free")
    expect(providerSlug(true, "opencode-go")).toBe("go")
    expect(providerSlug(true, "openai")).toBe("openai")
    expect(providerSlug(false, "opencode")).toBe("opencode")
  })

  test("connect copy for the upstream provider maps to void keys only under the void theme", () => {
    expect(connectCopyKey(true, "opencode", "provider.connect.opencodeZen.line1")).toBe(
      "void.provider.connect.free.line1",
    )
    expect(connectCopyKey(false, "opencode", "provider.connect.opencodeZen.line1")).toBe(
      "provider.connect.opencodeZen.line1",
    )
    expect(connectCopyKey(true, "anthropic", "provider.connect.opencodeZen.line1")).toBe(
      "provider.connect.opencodeZen.line1",
    )
  })

  test("generic connect copy drops the upstream product name under the void theme", () => {
    expect(connectCopyKey(true, "anthropic", "provider.connect.apiKey.description")).toBe(
      "void.provider.connect.apiKey.description",
    )
    expect(connectCopyKey(false, "anthropic", "provider.connect.apiKey.description")).toBe(
      "provider.connect.apiKey.description",
    )
  })
})
