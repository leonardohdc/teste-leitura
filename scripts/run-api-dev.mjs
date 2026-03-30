import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const backend = join(root, 'backend')
const win = process.platform === 'win32'
const venvPy = win
  ? join(backend, '.venv', 'Scripts', 'python.exe')
  : join(backend, '.venv', 'bin', 'python')

let cmd = 'python'
if (existsSync(venvPy)) {
  cmd = venvPy
} else if (!win) {
  cmd = 'python3'
}

const args = ['-m', 'uvicorn', 'app.main:app', '--reload', '--host', '127.0.0.1', '--port', '8000']
const useShell = cmd === 'python' || cmd === 'python3'

const proc = spawn(cmd, args, {
  cwd: backend,
  stdio: 'inherit',
  shell: useShell,
})

proc.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
