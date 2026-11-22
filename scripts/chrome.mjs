// Drives a headless Chrome over the DevTools protocol, for the benchmark and screenshots: serves dist/, opens a page,
// relays its console, and answers evaluate/screenshot. `node scripts/chrome.mjs <query> [out.png] [wait ms]`.

import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

export async function open(query, { width = 1280, height = 800, jsFlags = '', raw = null, page = new URL('../dist/index.html', import.meta.url), files = {} } = {}) {
  const server = createServer((req, res) => {
    const file = files[req.url.split('?')[0]]
    res.setHeader('content-type', file === undefined ? 'text/html' : 'text/javascript')
    res.end(readFileSync(file ?? page))
  }).listen(0)
  const port = server.address().port
  const dir = mkdtempSync(join(tmpdir(), 'ow-'))
  const args = ['--headless=new', `--user-data-dir=${dir}`, '--remote-debugging-port=0', '--enable-unsafe-webgpu', '--enable-precise-memory-info', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', `--window-size=${width},${height}`, '--no-first-run', '--no-default-browser-check']
  if (jsFlags) args.push(`--js-flags=${jsFlags}`)
  const proc = spawn(CHROME, [...args, 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] })
  proc.stdout.on('data', d => raw?.push(...String(d).split('\n')))
  const ws = await new Promise(resolve => {
    proc.stderr.on('data', d => {
      const m = String(d).match(/ws:\/\/[^\s]+/)
      if (m) resolve(m[0])
    })
  })
  const version = await (await fetch(ws.replace('ws://', 'http://').replace(/\/devtools.*/, '/json/version'))).json()
  void version
  const targets = await (await fetch(ws.replace('ws://', 'http://').replace(/\/devtools.*/, '/json/list'))).json()
  const tab = targets.find(t => t.type === 'page')
  const sock = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise(r => sock.addEventListener('open', r))
  let id = 0
  const waiting = new Map()
  const logs = []
  const traceEvents = []
  let traceDone
  sock.addEventListener('message', e => {
    const m = JSON.parse(e.data)
    if (m.id !== undefined) {
      waiting.get(m.id)?.(m)
      waiting.delete(m.id)
    } else if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.args.map(a => a.value ?? a.description).join(' '))
    else if (m.method === 'Tracing.dataCollected') traceEvents.push(...m.params.value)
    else if (m.method === 'Tracing.tracingComplete') traceDone?.()
    else if (m.method === 'Log.entryAdded') logs.push(`[${m.params.entry.level}] ${m.params.entry.text}`)
    else if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION ' + JSON.stringify(m.params.exceptionDetails).slice(0, 800))
  })
  const send = (method, params = {}) =>
    new Promise(r => {
      id += 1
      waiting.set(id, r)
      sock.send(JSON.stringify({ id, method, params }))
    })
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Log.enable')
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: `http://localhost:${port}/${query}` })
  const evaluate = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value
  const shot = async file => writeFileSync(file, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'))
  const close = () => {
    sock.close()
    proc.kill()
    server.close()
  }
  /** Stops a trace started with Tracing.start and gives its events. */
  const endTrace = async () => {
    const done = new Promise(r => (traceDone = r))
    await send('Tracing.end')
    await done
    return traceEvents
  }
  return { send, evaluate, shot, logs, close, endTrace }
}

if (process.argv[1].endsWith('chrome.mjs')) {
  const [query = '', file = 'shot.png', wait = '3000'] = process.argv.slice(2)
  const c = await open(query)
  await new Promise(r => setTimeout(r, Number(wait)))
  await c.shot(file)
  console.log(c.logs.join('\n'))
  c.close()
}
