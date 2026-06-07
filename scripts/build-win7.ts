import { spawn } from 'node:child_process'

const env = {
  ...process.env,
  CHERRY_STUDIO_TARGET_PLATFORM: 'win32',
  CHERRY_STUDIO_TARGET_ARCH: 'x64',
  npm_config_platform: 'win32',
  npm_config_arch: 'x64'
}

console.log('Building Win7 desktop assets for win32/x64')

const child = spawn('pnpm', ['build'], {
  env,
  stdio: 'inherit'
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})
