import { existsSync, copyFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
if (!existsSync('.dev.vars')) copyFileSync('.dev.vars.example', '.dev.vars')
for (const args of [['wrangler', 'types'], ['wrangler', 'd1', 'migrations', 'apply', 'frame-library', '--local']]) {
  const result = spawnSync('npx', args, { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status || 1)
}
