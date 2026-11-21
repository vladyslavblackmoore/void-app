import { describe, expect, test } from "bun:test"
import {
  authorizeMode,
  canAdvance,
  flowSteps,
  initialStep,
  isPlaceholder,
  nextStep,
  prevStep,
  stepStatus,
} from "./connect-flow-model"

describe("connect flow model", () => {
  test("lists the four steps in order", () => {
    expect(flowSteps).toEqual(["authorize", "account", "access", "done"])
  })

  test("marks the account and access steps as placeholders", () => {
    expect(isPlaceholder("authorize")).toBe(false)
    expect(isPlaceholder("account")).toBe(true)
    expect(isPlaceholder("access")).toBe(true)
    expect(isPlaceholder("done")).toBe(false)
  })

  test("starts at authorize unless the connector is already connected", () => {
    expect(initialStep("needs_auth")).toBe("authorize")
    expect(initialStep("error")).toBe("authorize")
    expect(initialStep("disabled")).toBe("authorize")
    expect(initialStep("available")).toBe("authorize")
    expect(initialStep("connected")).toBe("account")
  })

  test("authorize advances only when authorized", () => {
    expect(canAdvance("authorize", { authorized: false })).toBe(false)
    expect(canAdvance("authorize", { authorized: true })).toBe(true)
    expect(nextStep("authorize", { authorized: false })).toBe("authorize")
    expect(nextStep("authorize", { authorized: true })).toBe("account")
  })

  test("account and access advance without a gate", () => {
    expect(nextStep("account", { authorized: true })).toBe("access")
    expect(nextStep("access", { authorized: true })).toBe("done")
    expect(canAdvance("account", { authorized: true })).toBe(true)
    expect(canAdvance("access", { authorized: true })).toBe(true)
  })

  test("done is terminal", () => {
    expect(canAdvance("done", { authorized: true })).toBe(false)
    expect(nextStep("done", { authorized: true })).toBe("done")
  })

  test("back moves one step and stops at authorize", () => {
    expect(prevStep("done")).toBe("access")
    expect(prevStep("access")).toBe("account")
    expect(prevStep("account")).toBe("authorize")
    expect(prevStep("authorize")).toBe("authorize")
  })

  test("reports step status by position", () => {
    expect(flowSteps.map((step) => stepStatus("authorize", step))).toEqual(["active", "todo", "todo", "todo"])
    expect(flowSteps.map((step) => stepStatus("access", step))).toEqual(["done", "done", "active", "todo"])
    expect(flowSteps.map((step) => stepStatus("done", step))).toEqual(["done", "done", "done", "active"])
  })

  test("maps a tile state to the authorize mode", () => {
    expect(authorizeMode("needs_auth")).toBe("authorize")
    expect(authorizeMode("error")).toBe("connect")
    expect(authorizeMode("disabled")).toBe("connect")
    expect(authorizeMode("connected")).toBe("ready")
    expect(authorizeMode("available")).toBe("unavailable")
  })
})
