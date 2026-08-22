// Resolve electronDist at runtime (#38673, #47917): electron-builder 26.8.x can
// re-unpack a broken Electron.app; reusing the installed dist dodges that.
// npm workspace hoisting is non-deterministic — require.resolve finds electron
// wherever it landed. Dist present → -c.electronDist=<abs>/dist; absent → let
// electron-builder fetch via @electron/get (electronVersion + ELECTRON_MIRROR).

import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

function electronDistDir() {
  try {
    return path.join(path.dirname(require.resolve("electron/package.json")), "dist")
  } catch {
    return null
  }
}

function distBinary(dist) {
  if (process.platform === "darwin") {
    return path.join(dist, "Electron.app", "Contents", "MacOS", "Electron")
  }
  if (process.platform === "win32") {
    return path.join(dist, "electron.exe")
  }
  return path.join(dist, "electron")
}

function electronBuilderCli() {
  const pkgJson = require.resolve("electron-builder/package.json")
  const bin = require(pkgJson).bin
  const rel = typeof bin === "string" ? bin : bin["electron-builder"]
  return path.join(path.dirname(pkgJson), rel)
}

const dist = electronDistDir()
const args = []
// Detect cross-arch builds: when the target arch differs from the host's,
// do NOT pin electronDist to the local (host-arch) Electron binary — that
// would package an x64 binary into an arm64 .deb (or vice versa). Instead
// let electron-builder fetch the correct arch via @electron/get.
function requestedArch() {
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--arm64' || argv[i] === '-a=arm64' || argv[i] === '--arch=arm64') return 'arm64'
    if (argv[i] === '--x64' || argv[i] === '-a=x64' || argv[i] === '--arch=x64') return 'x64'
    if (argv[i] === '--ia32' || argv[i] === '-a=ia32' || argv[i] === '--arch=ia32') return 'ia32'
  }
  return null
}
const targetArch = requestedArch()
const hostArch = process.arch
const isCrossArch = targetArch && targetArch !== hostArch
if (dist && fs.existsSync(distBinary(dist)) && !isCrossArch) {
  args.push(`-c.electronDist=${dist}`)
} else if (isCrossArch) {
  console.warn(
    `[run-electron-builder] cross-arch build (host=${hostArch}, target=${targetArch}); ` +
      `not pinning electronDist so electron-builder fetches the correct arch via @electron/get.`
  )
} else {
  console.warn(
    "[run-electron-builder] no local electron dist; electron-builder will fetch " +
      "via @electron/get (electronVersion + ELECTRON_MIRROR)."
  )
}
args.push(...process.argv.slice(2))

const result = spawnSync(process.execPath, [electronBuilderCli(), ...args], {
  stdio: "inherit",
})
if (result.error) {
  console.error(`[run-electron-builder] spawn failed: ${result.error.message}`)
  process.exit(1)
}
process.exit(result.status == null ? 1 : result.status)
