// Runs fontTools in Pyodide. Pyodide and fontTools download on the first export only.
import py from './export.py?raw'

const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v314.0.8/full/'

type Pyodide = {
  loadPackage(name: string): Promise<void>
  runPython(code: string): string
  FS: { writeFile(path: string, data: string): void; readdir(path: string): string[]; readFile(path: string): Uint8Array }
}

let ready: Promise<Pyodide> | null = null

async function load(): Promise<Pyodide> {
  const { loadPyodide } = await import(/* @vite-ignore */ PYODIDE + 'pyodide.mjs')
  const p: Pyodide = await loadPyodide({ indexURL: PYODIDE })
  await p.loadPackage('fonttools')
  p.runPython(py)
  return p
}

self.onmessage = async (e: MessageEvent) => {
  try {
    const t = performance.now()
    ready ??= load()
    const p = await ready
    const loadMs = performance.now() - t
    p.FS.writeFile('/in.json', JSON.stringify(e.data))
    const ms = JSON.parse(p.runPython("export_files('/in.json', '/out')"))
    const files = p.FS.readdir('/out').filter((n) => !n.startsWith('.')).map((name) => ({ name, data: p.FS.readFile(`/out/${name}`) }))
    self.postMessage({ files, ms: { load: loadMs, ...ms } })
  } catch (err) {
    self.postMessage({ error: String(err) })
  }
}
