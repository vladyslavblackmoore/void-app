import { expect, test } from "bun:test"
import { forkBranch, previewVersion, selectVersion } from "./version"

const now = new Date("2026-11-21T04:52:10Z")
const base = { channel: "void/broker", pinned: "1.19.6", now }

test("an explicit version wins everywhere", () => {
  expect(selectVersion({ ...base, explicit: "9.9.9" })).toBe("9.9.9")
  expect(selectVersion({ ...base, channel: "dev", explicit: "9.9.9" })).toBe("9.9.9")
})

test("a build from a fork branch uses the pinned upstream version", () => {
  expect(selectVersion(base)).toBe("1.19.6")
  expect(selectVersion({ ...base, channel: "void/graph-memory" })).toBe("1.19.6")
})

test("other branches keep the timestamped preview version", () => {
  expect(selectVersion({ ...base, channel: "dev" })).toBe("0.0.0-dev-202611210452")
  expect(selectVersion({ ...base, channel: "voidx/y" })).toBe(previewVersion("voidx/y", now))
})

test("recognises fork branches", () => {
  expect(forkBranch("void/broker")).toBe(true)
  expect(forkBranch("void")).toBe(false)
  expect(forkBranch("latest")).toBe(false)
})
