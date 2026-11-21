import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const source = readFileSync(new URL("./dialog-connect-provider.tsx", import.meta.url), "utf8")
const v2 = source.slice(source.indexOf("<DialogV2"), source.indexOf("</DialogV2>"))

describe("provider connect dialog layout", () => {
  test("the v2 header has only the close control and no back arrow", () => {
    const header = v2.slice(v2.indexOf("<DialogHeader"), v2.indexOf("</DialogHeader>"))
    expect(header).not.toContain("arrow-left")
    expect(header).not.toContain("common.goBack")
  })

  test("the credential forms end with the Cancel and Continue pair", () => {
    expect(source).toContain('import { ConnectActions } from "./connect-actions"')
    expect(source.match(/<ConnectActions/g)?.length).toBeGreaterThanOrEqual(3)
    expect(source).toContain('language.t("common.cancel")')
  })

  test("the free models copy keys stay mapped under the void theme", () => {
    expect(source).toContain('copy("provider.connect.opencodeZen.line1")')
  })
})
