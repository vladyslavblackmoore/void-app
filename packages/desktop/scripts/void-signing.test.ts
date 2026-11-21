import { describe, expect, test } from "bun:test"
import { parseSigning, signWithVoidIdentity, voidMacSigning, voidSignOptions } from "./void-signing"

const hash = "E12237B11BB8375835F1D9963C9B183FF7F7E12E"

describe("void signing", () => {
  test("reads the identity the signing script prints", () => {
    const output = [
      "VOID_SIGNING_KEYCHAIN=/tmp/x/void-signing.keychain-db",
      "VOID_SIGNING_NAME=VOID Local Signing",
      `VOID_SIGNING_HASH=${hash}`,
      "",
    ].join("\n")
    expect(parseSigning(output)).toEqual({
      keychain: "/tmp/x/void-signing.keychain-db",
      name: "VOID Local Signing",
      hash,
    })
  })

  test("rejects output without a full certificate hash", () => {
    expect(() =>
      parseSigning("VOID_SIGNING_KEYCHAIN=/tmp/k\nVOID_SIGNING_NAME=VOID Local Signing\nVOID_SIGNING_HASH=\n"),
    ).toThrow()
  })

  test("signs with the void certificate from its keychain and no remote timestamp", () => {
    const options = voidSignOptions(
      {
        app: "/tmp/VOID.app",
        identity: "-",
        identityValidation: true,
        platform: "darwin",
        optionsForFile: () => ({ hardenedRuntime: true, entitlements: "resources/entitlements.plist" }),
      },
      { keychain: "/tmp/k.keychain-db", name: "VOID Local Signing", hash },
    )
    expect(options).toMatchObject({
      app: "/tmp/VOID.app",
      identity: hash,
      identityValidation: false,
      keychain: "/tmp/k.keychain-db",
    })
    expect(options.optionsForFile?.("/tmp/VOID.app/Contents/MacOS/VOID")).toEqual({
      hardenedRuntime: true,
      entitlements: "resources/entitlements.plist",
      timestamp: "none",
    })
    expect(
      voidSignOptions({ app: "/tmp/VOID.app" }, { keychain: "/tmp/k", name: "n", hash }).optionsForFile?.("/x"),
    ).toEqual({ timestamp: "none" })
  })

  test("signs every mac build with the void identity", () => {
    expect(voidMacSigning("darwin", {})).toEqual({ identity: "-", sign: signWithVoidIdentity })
  })

  test("leaves other platforms and an explicit opt-out unsigned by it", () => {
    expect(voidMacSigning("linux", {})).toEqual({})
    expect(voidMacSigning("darwin", { VOID_SIGNING: "off" })).toEqual({})
  })
})
