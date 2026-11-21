import { describe, expect, test } from "bun:test"
import { isSecretName, secretErrorMessage, secretUpdatedAt } from "./secrets-behavior"

describe("settings v2 secrets", () => {
  test("accepts names that match the store pattern", () => {
    for (const name of ["token", "a", "0abc", "tracker/token", "a.b-c_d", "a/b/c", "x1/y2.z"]) {
      expect(isSecretName(name)).toBe(true)
    }
  })

  test("rejects names outside the store pattern", () => {
    for (const name of ["", "Token", "-a", ".a", "_a", "a/", "/a", "a//b", "a/-b", "a b", "a\nb", "tracker/Token"]) {
      expect(isSecretName(name)).toBe(false)
    }
  })

  test("reads a message from thrown request errors", () => {
    expect(secretErrorMessage(new Error("boom"), "fallback")).toBe("boom")
    expect(secretErrorMessage({ _tag: "InvalidRequestError", message: "bad name" }, "fallback")).toBe("bad name")
    expect(secretErrorMessage({ _tag: "BadRequest" }, "fallback")).toBe("fallback")
    expect(secretErrorMessage("nope", "fallback")).toBe("fallback")
    expect(secretErrorMessage(undefined, "fallback")).toBe("fallback")
  })

  test("accepts only finite update times", () => {
    expect(secretUpdatedAt(1_700_000_000_000)?.getTime()).toBe(1_700_000_000_000)
    expect(secretUpdatedAt("NaN")).toBeUndefined()
    expect(secretUpdatedAt("Infinity")).toBeUndefined()
    expect(secretUpdatedAt(Number.NaN)).toBeUndefined()
  })
})
