import { execFile } from "node:child_process"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import type { MacConfiguration } from "electron-builder"

type MacSign = Extract<NonNullable<MacConfiguration["sign"]>, (...args: never[]) => unknown>
type SignOptions = Parameters<MacSign>[0]

export type VoidSigning = { keychain: string; name: string; hash: string }

const execFileAsync = promisify(execFile)
const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "void-signing.sh")

export function parseSigning(output: string): VoidSigning {
  const values = new Map(
    output.split("\n").flatMap((line) => {
      const index = line.indexOf("=")
      return index > 0 ? [[line.slice(0, index).trim(), line.slice(index + 1).trim()] as const] : []
    }),
  )
  const keychain = values.get("VOID_SIGNING_KEYCHAIN")
  const name = values.get("VOID_SIGNING_NAME")
  const hash = values.get("VOID_SIGNING_HASH")
  if (!keychain || !name || !hash || !/^[0-9A-F]{40}$/i.test(hash)) {
    throw new Error("void signing script returned no usable identity")
  }
  return { keychain, name, hash }
}

function loadSignAsync(): (options: SignOptions) => Promise<void> {
  const fromPackage = createRequire(import.meta.url)
  const fromBuilder = createRequire(fromPackage.resolve("electron-builder"))
  const fromLib = createRequire(fromBuilder.resolve("app-builder-lib"))
  return fromLib("@electron/osx-sign").signAsync
}

export function voidSignOptions(options: SignOptions, signing: VoidSigning): SignOptions {
  return {
    ...options,
    identity: signing.hash,
    identityValidation: false,
    keychain: signing.keychain,
    optionsForFile: (file) => ({ ...options.optionsForFile?.(file), timestamp: "none" }),
  }
}

export const signWithVoidIdentity: MacSign = async (options) => {
  const { stdout } = await execFileAsync("bash", [script])
  await loadSignAsync()(voidSignOptions(options, parseSigning(stdout)))
}

export function voidMacSigning(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): Pick<MacConfiguration, "identity" | "sign"> {
  if (platform !== "darwin" || env.VOID_SIGNING === "off") return {}
  return { identity: "-", sign: signWithVoidIdentity }
}
