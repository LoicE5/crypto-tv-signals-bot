import { $ } from 'bun'
import { mkdir } from 'node:fs/promises'

type Target = 'linux-x64' | 'linux-arm64' | 'macos-x64' | 'macos-arm64'

const BUN_TARGET: Record<Target, string> = {
    'linux-x64':   'bun-linux-x64',
    'linux-arm64': 'bun-linux-arm64',
    'macos-x64':   'bun-darwin-x64',
    'macos-arm64': 'bun-darwin-arm64',
}

const ALL_TARGETS: Target[] = ['linux-x64', 'linux-arm64', 'macos-x64', 'macos-arm64']

const requestedTarget = process.argv.at(2) as Target | undefined

if(requestedTarget !== undefined && !(requestedTarget in BUN_TARGET)) {
    console.error(`Unknown target "${requestedTarget}". Valid targets: ${ALL_TARGETS.join(', ')}`)
    process.exit(1)
}

const targets: Target[] = requestedTarget ? [requestedTarget] : ALL_TARGETS

const projectRoot = import.meta.dir.replace(/\/scripts$/, '')

await mkdir(`${projectRoot}/dist`, { recursive: true })

for(const target of targets) {
    const outfile = `${projectRoot}/dist/crypto-tv-signals-bot-${target}`
    console.info(`Building ${target} → ${outfile}`)

    // cd /tmp before building to avoid virtiofs cross-device rename on macOS dev environments
    await $`cd /tmp && bun build ${projectRoot}/src/index.ts --compile --target=${BUN_TARGET[target]} --outfile=${outfile}`
}
