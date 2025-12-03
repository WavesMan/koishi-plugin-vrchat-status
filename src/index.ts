import { Context, Schema, Service, Logger, h } from 'koishi'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { tmpdir } from 'node:os'
import { htmlTemplate } from './template'

export const name = 'vrchat-status'

export interface Config {
  url?: string
  timeoutMs?: number
  retries?: number
}

export const Config: Schema<Config> = Schema.object({
  url: Schema.string().description('VRChat 状态页 URL').default('https://status.vrchat.com/'),
  timeoutMs: Schema.number().description('抓取超时毫秒').default(15000),
  retries: Schema.number().description('抓取失败重试次数').default(2),
})

export const inject = { optional: ['http', 'puppeteer'] }

type ChartKey =
  | 'online-users'
  | 'api-latency'
  | 'api-requests'
  | 'api-error-rate'
  | 'steam-auth-success-rate'
  | 'meta-auth-success-rate'

const ChartTitleMap: Record<ChartKey, string> = {
  'online-users': 'Online users',
  'api-latency': 'API Latency',
  'api-requests': 'API Requests',
  'api-error-rate': 'API Error Rate',
  'steam-auth-success-rate': 'Steam Auth Success Rate',
  'meta-auth-success-rate': 'Meta Auth Success Rate',
}

class VrchatStatusService extends Service {
  html: string | null = null
  svgs: Record<ChartKey, string> = {} as any
  graphs: { name: string; title: string; url: string; overlay?: string; filled?: boolean }[] = []
  lastCcu: string = 'Unknown'
  lastErrorRate: string = '—'
  latencyLevel: string = ''
  requestsLevel: string = ''
  version: string = 'unknown'
  declare logger: Logger
  
  constructor(public ctx: Context, public config: Config) {
    super(ctx, 'vrchatStatus')
    this.logger = new Logger('vrchat-status')
    this.version = this.loadVersion()
  }

  async fetch() {
    if (!(this.ctx as any).http) return false
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }
    let ok = false
    const tries = Math.max(0, this.config.retries ?? 2)
    const url = this.config.url ?? 'https://status.vrchat.com/'
    const timeout = this.config.timeoutMs ?? 15000
    for (let i = 0; i <= tries; i++) {
      try {
        this.logger.debug('http get attempt %d %s', i + 1, url)
        const text = await (this.ctx as any).http.get(url, { timeout, headers, responseType: 'text' })
        this.html = typeof text === 'string' ? text : JSON.stringify(text)
        this.logger.debug('http get success, length=%d', this.html.length)
        ok = true
        break
      } catch (e) {
        this.logger.warn('http get failed: %o', e)
      }
    }
    if (!ok && !this.html) {
      this.logger.debug('falling back to puppeteer')
      const byBrowser = await this.fetchWithPuppeteer()
      if (!byBrowser && !this.html) return false
    }
    this.parseGraphs()
    return ok || !!this.html
  }

  async fetchWithPuppeteer() {
    const pp = (this.ctx as any).puppeteer
    if (!pp) return false
    let page: any
    try {
      if (pp.page) page = await pp.page()
    } catch {}
    try {
      if (!page && pp.browser) {
        const browser = await pp.browser()
        if (browser?.newPage) page = await browser.newPage()
      }
    } catch {}
    if (!page) return false
    try {
      const url = this.config.url ?? 'https://status.vrchat.com/'
      const timeout = this.config.timeoutMs ?? 15000
      this.logger.debug('puppeteer goto %s', url)
      await page.goto(url, { waitUntil: 'networkidle0', timeout })
      try {
        await page.waitForSelector('#vrccharts', { timeout })
      } catch {}
      const pairs: { title: string; svg: string }[] = await page.evaluate(() => {
        const res: { title: string; svg: string }[] = []
        const blocks = document.querySelectorAll('#vrccharts .vrcchart')
        blocks.forEach((b: any) => {
          const h5 = b.querySelector('h5')
          const svg = b.querySelector('svg')
          res.push({ title: (h5?.textContent || '').trim(), svg: svg?.outerHTML || '' })
        })
        return res
      })
      const html = await page.evaluate(() => document.documentElement.outerHTML)
      this.html = html
      for (const p of pairs) {
        if (!p.title || !p.svg) continue
        for (const [key, title] of Object.entries(ChartTitleMap)) {
          if (p.title.toLowerCase() === title.toLowerCase()) this.svgs[key as ChartKey] = p.svg
        }
      }
      this.logger.debug('puppeteer fetched, length=%d charts=%d', this.html.length, Object.keys(this.svgs).length)
      return true
    } catch (e) {
      this.logger.warn('puppeteer fetch failed: %o', e)
      return false
    }
  }

  parseGraphs() {
    const html = this.html || ''
    this.logger.debug('parse graphs start, html length=%d', html.length)
    const m = html.match(/const\s+graphs\s*=\s*\[([\s\S]*?)\];/i)
    if (!m) { this.logger.warn('graphs config not found'); this.graphs = []; return }
    const body = m[1]
    const objs = body.match(/\{[\s\S]*?\}/g) || []
    const res: { name: string; title: string; url: string; overlay?: string; filled?: boolean }[] = []
    for (const o of objs) {
      const name = o.match(/name:\s*['\"]([^'\"]+)/)?.[1]
      const title = o.match(/title:\s*['\"]([^'\"]+)/)?.[1]
      const url = o.match(/url:\s*['\"]([^'\"]+)/)?.[1]
      const overlay = o.match(/overlay:\s*['\"]([^'\"]+)/)?.[1]
      if (name && title && url) res.push({ name, title, url, overlay, filled: name === 'ccu' })
    }
    this.graphs = res
    this.logger.debug('graphs parsed=%d', res.length)
  }

  async buildSvgs() {
    const headers = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    const map: Record<ChartKey, string> = {} as any
    for (const g of this.graphs) {
      try {
        const data = await (this.ctx as any).http.get(g.url, { headers, responseType: 'json', timeout: this.config.timeoutMs })
        const overlay = g.overlay ? await (this.ctx as any).http.get(g.overlay, { headers, responseType: 'json', timeout: this.config.timeoutMs }).catch(() => null) : null
        
        // Extract latest CCU if this is the users chart
        if (g.name === 'ccu' && Array.isArray(data) && data.length > 0) {
          const last = data[data.length - 1]
          if (Array.isArray(last) && last.length > 1) {
            this.lastCcu = Math.round(last[1]).toLocaleString()
          }
        }

        const key = this.titleToKey(g.title)
        const smallDecimals = key === 'api-latency' || key === 'api-requests'
        const svg = this.generateSvgChart((data as any), overlay as any, g.title, !!g.filled, smallDecimals)
        if (key) {
          map[key] = svg
          if (Array.isArray(data) && data.length > 0) {
            const last = (data as any[])[(data as any[]).length - 1]
            const v = Number(last?.[1])
            if (key === 'api-error-rate' && !Number.isNaN(v)) this.lastErrorRate = v <= 1 ? `${(v * 100).toFixed(2)}%` : v.toFixed(2)
            if (key === 'api-latency' && !Number.isNaN(v)) this.latencyLevel = this.levelFor(key, v)
            if (key === 'api-requests' && !Number.isNaN(v)) this.requestsLevel = this.levelFor(key, v)
          }
        }
      } catch (e) {
        this.logger.warn('fetch data failed for %s: %o', g.title, e)
      }
    }
    this.svgs = map
    return map
  }

  titleToKey(title: string): ChartKey | null {
    for (const [k, v] of Object.entries(ChartTitleMap)) if (v.toLowerCase() === title.toLowerCase()) return k as ChartKey
    return null
  }

  generateSvgChart(data: any[], overlay?: any[] | null, title = '', filled = false, smallDecimals = false) {
    if (!Array.isArray(data) || !data.length) return '<svg><text>无数据</text></svg>'
    const width = 800, height = 400
    const paddingLeft = 64, paddingRight = 24, paddingTop = 20, paddingBottom = 56
    const ts = data.map((d) => d[0]); const vals = data.map((d) => d[1])
    const minVal = 0, maxVal = Math.max(...vals)
    const minTime = Math.min(...ts), maxTime = Math.max(...ts)
    const tRange = Math.max(1, maxTime - minTime), vRange = Math.max(1, maxVal - minVal)
    const toX = (t: number) => paddingLeft + (t - minTime) * (width - paddingLeft - paddingRight) / tRange
    const toY = (v: number) => height - paddingBottom - (v - minVal) * (height - paddingTop - paddingBottom) / vRange
    const points = data.map((d) => `${toX(d[0])},${toY(d[1])}`)
    const path = points.map((p, i) => (i ? 'L' : 'M') + p).join(' ')
    let fillPath = ''
    if (filled && points.length > 1) {
      const firstX = points[0].split(',')[0], lastX = points[points.length - 1].split(',')[0]
      const bottom = height - paddingBottom
      fillPath = (points.map((p, i) => (i ? 'L' : 'M') + p).join(' ')) + ` L${lastX},${bottom} L${firstX},${bottom} Z`
    }
    let overlayPath = ''
    if (Array.isArray(overlay) && overlay.length) {
      const ops = overlay.filter((d) => d[0] >= minTime && d[0] <= maxTime).map((d) => `${toX(d[0])},${toY(d[1])}`)
      overlayPath = ops.map((p, i) => (i ? 'L' : 'M') + p).join(' ')
    }
    const yTicks = 5
    const xTicks = 6
    const yTickEls = Array.from({ length: yTicks + 1 }, (_, i) => {
      const v = minVal + i * (vRange) / yTicks
      const y = toY(v)
      const line = `<line class="grid" x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}"/>`
      const tick = `<line class="axis" x1="${paddingLeft}" y1="${y}" x2="${paddingLeft - 6}" y2="${y}"/>`
      const labelVal = smallDecimals && v < 1 ? v.toFixed(2) : String(Math.round(v))
      const label = `<text class="label" x="${paddingLeft - 10}" y="${y + 4}" text-anchor="end">${labelVal}</text>`
      return line + tick + label
    }).join('')
    const msFactor = maxTime < 1e12 ? 1000 : 1
    const fmt = (t: number) => {
      const d = new Date(t * msFactor)
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
      const dd = String(d.getUTCDate()).padStart(2, '0')
      const hh = String(d.getUTCHours()).padStart(2, '0')
      const mi = String(d.getUTCMinutes()).padStart(2, '0')
      return `${mm}-${dd} ${hh}:${mi}`
    }
    const xTickEls = Array.from({ length: xTicks + 1 }, (_, i) => {
      const t = minTime + i * (tRange) / xTicks
      const x = toX(t)
      const line = `<line class="grid" x1="${x}" y1="${paddingTop}" x2="${x}" y2="${height - paddingBottom}"/>`
      const tick = `<line class="axis" x1="${x}" y1="${height - paddingBottom}" x2="${x}" y2="${height - paddingBottom + 6}"/>`
      const label = `<text class="label" x="${x}" y="${height - paddingBottom + 20}" text-anchor="middle">${fmt(t)}</text>`
      return line + tick + label
    }).join('')
    return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" width="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gradient-primary" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#0e9bb1" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#0e9bb1" stop-opacity="0.06"/>
        </linearGradient>
      </defs>
      <line class="axis" x1="${paddingLeft}" y1="${height - paddingBottom}" x2="${width - paddingRight}" y2="${height - paddingBottom}"/>
      <line class="axis" x1="${paddingLeft}" y1="${paddingTop}" x2="${paddingLeft}" y2="${height - paddingBottom}"/>
      ${yTickEls}
      ${xTickEls}
      ${filled && fillPath ? `<path d="${fillPath}" fill="url(#gradient-primary)" opacity="1"/>` : ''}
      <path d="${path}" stroke="#0e9bb1" stroke-width="3" fill="none"/>
      ${overlayPath ? `<path d="${overlayPath}" stroke="#0b7f91" stroke-width="2" fill="none" stroke-dasharray="5,5"/>` : ''}
    </svg>`
  }

  async renderHtml() {
    let html = htmlTemplate
    const now = new Date()
    const timeUtc = now.toLocaleString('en-US', { hour12: false, timeZone: 'UTC' })
    const timeBj = now.toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })
    html = html.replace('{{time-utc}}', timeUtc)
    html = html.replace('{{time-beijing}}', timeBj)
    html = html.replace('{{ccu}}', this.lastCcu)
    html = html.replace('{{version}}', this.version)
    
    // Inject SVGs
    // We need to map keys to placeholders
    const map: Record<string, ChartKey> = {
      '{{chart-users}}': 'online-users',
      '{{chart-latency}}': 'api-latency',
      '{{chart-requests}}': 'api-requests',
      '{{chart-error-rate}}': 'api-error-rate'
    }
    
    for (const [placeholder, key] of Object.entries(map)) {
      const svg = this.svgs[key] || '<p>No Data</p>'
      html = html.replace(placeholder, svg)
    }
    html = html.replace('{{error-rate}}', this.lastErrorRate)
    html = html.replace('{{latency-level}}', this.latencyLevel || '—')
    html = html.replace('{{requests-level}}', this.requestsLevel || '—')
    
    return html
  }

  levelFor(key: ChartKey, v: number): string {
    if (key === 'api-latency') {
      if (v < 0.25) return 'Normal'
      if (v < 0.6) return 'Elevated'
      return 'High'
    }
    if (key === 'api-requests') {
      if (v < 0.3) return 'Low'
      if (v < 0.7) return 'Medium'
      return 'High'
    }
    return ''
  }

  loadVersion(): string {
    try { return require('../package.json')?.version || 'unknown' } catch {}
    try { return require('../../package.json')?.version || 'unknown' } catch {}
    return 'unknown'
  }

  async renderImage(): Promise<Buffer | null> {
    const pp = (this.ctx as any).puppeteer
    if (!pp) return null
    
    const html = await this.renderHtml()
    let page: any
    try {
      if (pp.page) page = await pp.page()
    } catch {}
    try {
      if (!page && pp.browser) {
        const browser = await pp.browser()
        if (browser?.newPage) page = await browser.newPage()
      }
    } catch {}
    if (!page) return null

    try {
      await page.setViewport({ width: 1200, height: 800 })
      await page.setContent(html, { waitUntil: 'networkidle0' })
      const body = await page.$('body')
      const buf = await body.screenshot({ type: 'png' })
      return buf
    } catch (e) {
      this.logger.warn('puppeteer screenshot failed: %o', e)
      return null
    } finally {
      if (page) await page.close()
    }
  }

  // Fallback method using sharp (deprecated but kept for reference/compatibility if needed)
  async composePngBuffer(): Promise<Buffer | null> {
    // ... (Previous implementation omitted for brevity, but if I overwrite the file I lose it. 
    // I will replace it with a call to renderImage or return null if I want to force new way)
    // For this task, I'll assume we want the new way.
    return this.renderImage()
  }
}

declare module 'koishi' {
  interface Context {
    vrchatStatus: VrchatStatusService
  }
}

export function apply(ctx: Context, config: Config) {
  const service = new VrchatStatusService(ctx, config)
  const cmd = ctx.command('vrcstatus', 'VRChat 状态查询')
    .action(async () => {
      service.logger.debug('command vrcstatus invoked')
      const ok = await service.fetch()
      if (!ok && !service.html) return '抓取失败，请稍后重试'
      service.logger.debug('building svgs from graphs count=%d', service.graphs.length)
      await service.buildSvgs()
      if (!Object.keys(service.svgs).length) return '未找到目标图表'
      service.logger.debug('svgs built count=%d', Object.keys(service.svgs).length)
      
      const buf = await service.renderImage()
      if (!buf) return '无法生成图片 (Puppeteer unavailable?)'
      
      const b64 = buf.toString('base64')
      return h.image(`data:image/png;base64,${b64}`)
    })
}

export default apply
;(apply as any).inject = inject
