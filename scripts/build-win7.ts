import { spawn } from 'node:child_process'

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const env = {
  ...process.env,
  CHERRY_STUDIO_TARGET_PLATFORM: 'win32',
  CHERRY_STUDIO_TARGET_ARCH: 'x64',
  npm_config_platform: 'win32',
  npm_config_arch: 'x64'
}

console.log('Building Win7 desktop assets for win32/x64')

const child = spawn(pnpmCommand, ['build'], {
  env,
  stdio: 'inherit'
})

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})
