'use client'

import React, { useState, useCallback, useRef } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import { VscTerminal, VscServer, VscHistory, VscSettingsGear, VscSearch, VscPlay, VscCopy, VscChevronDown, VscChevronRight, VscShield, VscWarning, VscRefresh } from 'react-icons/vsc'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'

// ── Constants ──────────────────────────────────────────────────────────────

const AGENT_ID = '699d89ae82438d9777adbe5f'

const THEME_VARS = {
  '--background': '30 20% 3%',
  '--foreground': '40 100% 50%',
  '--card': '30 18% 5%',
  '--card-foreground': '40 100% 50%',
  '--primary': '40 100% 45%',
  '--primary-foreground': '30 20% 3%',
  '--secondary': '35 25% 10%',
  '--secondary-foreground': '40 90% 55%',
  '--muted': '35 20% 12%',
  '--muted-foreground': '40 60% 35%',
  '--border': '40 50% 20%',
  '--input': '35 30% 15%',
  '--destructive': '0 100% 50%',
  '--destructive-foreground': '0 0% 100%',
  '--ring': '40 100% 45%',
  '--radius': '0rem',
  '--sidebar-background': '30 18% 4%',
  '--sidebar-foreground': '40 100% 50%',
  '--sidebar-border': '40 40% 15%',
  '--sidebar-primary': '40 100% 45%',
} as React.CSSProperties

const QUICK_COMMANDS = [
  { label: 'Processes', query: 'Show all running processes' },
  { label: 'Env Vars', query: 'Show environment variables' },
  { label: 'Disk Usage', query: 'Show disk usage' },
  { label: 'Network', query: 'Show network connections' },
  { label: 'Memory', query: 'Show memory usage' },
]

const BLOCKED_PATTERNS = ['rm', 'kill', 'shutdown', 'reboot', 'mkfs', 'dd', 'format', 'fdisk', 'wipefs', 'halt', 'poweroff']

const SAMPLE_HISTORY = [
  {
    id: 'sample-1',
    timestamp: new Date(Date.now() - 300000),
    query: 'Show all running processes',
    command: 'ps aux --sort=-%mem | head -20',
    category: 'process',
    result_type: 'table',
    result: 'USER       PID  %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\nroot         1   0.0  0.1 169324 13212 ?        Ss   08:00   0:03 /sbin/init\nwww-data  1024   2.1  3.4 524288 34560 ?        Sl   08:01   1:24 nginx: worker\npostgres  1105   1.5  5.2 389120 52480 ?        Ss   08:01   0:58 postgres\nnode      2048   4.2  8.1 892416 81920 ?        Sl   08:02   2:15 node server.js\nredis     1200   0.8  1.2 156672 12288 ?        Ssl  08:01   0:32 redis-server',
    is_safe: true,
    blocked_reason: '',
    columns: ['USER', 'PID', '%CPU', '%MEM', 'VSZ', 'RSS', 'TTY', 'STAT', 'START', 'TIME', 'COMMAND'],
    expanded: false,
  },
  {
    id: 'sample-2',
    timestamp: new Date(Date.now() - 600000),
    query: 'Show disk usage',
    command: 'df -h',
    category: 'disk',
    result_type: 'progress_bar',
    result: '/dev/sda1  50G  32G  18G  64% /\n/dev/sdb1  200G  145G  55G  73% /data\ntmpfs  8G  256M  7.8G  3% /tmp',
    is_safe: true,
    blocked_reason: '',
    columns: ['Filesystem', 'Size', 'Used', 'Avail', 'Use%', 'Mounted'],
    expanded: false,
  },
  {
    id: 'sample-3',
    timestamp: new Date(Date.now() - 900000),
    query: 'Delete all log files',
    command: 'rm -rf /var/log/*',
    category: 'blocked',
    result_type: 'blocked',
    result: '',
    is_safe: false,
    blocked_reason: 'Destructive command detected: rm -rf would permanently delete files. This operation is blocked for safety.',
    columns: [],
    expanded: false,
  },
]

const SAMPLE_RESULT = {
  query: 'Show all running processes',
  command: 'ps aux --sort=-%mem | head -20',
  is_safe: true,
  category: 'process',
  result_type: 'table',
  result: 'USER       PID  %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\nroot         1   0.0  0.1 169324 13212 ?        Ss   08:00   0:03 /sbin/init\nwww-data  1024   2.1  3.4 524288 34560 ?        Sl   08:01   1:24 nginx: worker\npostgres  1105   1.5  5.2 389120 52480 ?        Ss   08:01   0:58 postgres\nnode      2048   4.2  8.1 892416 81920 ?        Sl   08:02   2:15 node server.js\nredis     1200   0.8  1.2 156672 12288 ?        Ssl  08:01   0:32 redis-server',
  blocked_reason: '',
  columns: ['USER', 'PID', '%CPU', '%MEM', 'VSZ', 'RSS', 'TTY', 'STAT', 'START', 'TIME', 'COMMAND'],
}

// ── Types ──────────────────────────────────────────────────────────────────

interface MonitorResult {
  query: string
  command: string
  is_safe: boolean
  category: string
  result_type: string
  result: string
  blocked_reason: string
  columns: string[]
}

interface HistoryEntry extends MonitorResult {
  id: string
  timestamp: Date
  expanded: boolean
}

interface Settings {
  apiEndpoint: string
  blockDestructive: boolean
  defaultTableView: boolean
  pageSize: number
}

// ── ErrorBoundary ──────────────────────────────────────────────────────────

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center" style={{ background: 'hsl(30, 20%, 3%)', color: 'hsl(40, 100%, 50%)' }}>
          <div className="text-center p-8 max-w-md font-mono">
            <h2 className="text-xl font-semibold mb-2">SYSTEM ERROR</h2>
            <p className="mb-4 text-sm opacity-70">{this.state.error}</p>
            <button onClick={() => this.setState({ hasError: false, error: '' })} className="px-4 py-2 text-sm" style={{ background: 'hsl(40, 100%, 45%)', color: 'hsl(30, 20%, 3%)' }}>
              RETRY
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Helper: Copy to Clipboard ──────────────────────────────────────────────

function useCopyClipboard() {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const copy = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }, [])
  return { copiedId, copy }
}

// ── Sidebar ────────────────────────────────────────────────────────────────

function Sidebar({ activeScreen, setActiveScreen, isConnected }: {
  activeScreen: string
  setActiveScreen: (s: 'dashboard' | 'history' | 'settings') => void
  isConnected: boolean
}) {
  const navItems = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: VscTerminal },
    { id: 'history' as const, label: 'History', icon: VscHistory },
    { id: 'settings' as const, label: 'Settings', icon: VscSettingsGear },
  ]

  return (
    <div className="w-[220px] min-h-screen flex flex-col font-mono tracking-wider" style={{ background: 'hsl(30, 18%, 4%)', borderRight: '1px solid hsl(40, 40%, 15%)' }}>
      <div className="p-5 pb-3" style={{ borderBottom: '1px solid hsl(40, 40%, 15%)' }}>
        <div className="flex items-center gap-2 mb-1">
          <VscTerminal className="w-5 h-5" style={{ color: 'hsl(40, 100%, 50%)' }} />
          <span className="text-base font-bold" style={{ color: 'hsl(40, 100%, 50%)' }}>SysMonitor AI</span>
        </div>
        <p className="text-xs pl-7" style={{ color: 'hsl(40, 60%, 35%)' }}>System Intelligence</p>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const active = activeScreen === item.id
          return (
            <button
              key={item.id}
              onClick={() => setActiveScreen(item.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 text-sm tracking-wider transition-colors duration-150',
                active ? 'font-semibold' : 'hover:opacity-90'
              )}
              style={{
                background: active ? 'hsl(40, 100%, 45%)' : 'transparent',
                color: active ? 'hsl(30, 20%, 3%)' : 'hsl(40, 60%, 35%)',
                borderRadius: 0,
              }}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="p-4" style={{ borderTop: '1px solid hsl(40, 40%, 15%)' }}>
        <div className="flex items-center gap-2 text-xs tracking-wider">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: isConnected ? 'hsl(120, 80%, 45%)' : 'hsl(0, 100%, 50%)' }} />
          <span style={{ color: 'hsl(40, 60%, 35%)' }}>{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
        <div className="mt-3 pt-3 space-y-1" style={{ borderTop: '1px solid hsl(40, 40%, 15%)' }}>
          <p className="text-xs" style={{ color: 'hsl(40, 60%, 35%)' }}>Agent Status</p>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'hsl(40, 90%, 55%)' }}>
            <VscServer className="w-3 h-3" />
            <span className="truncate">System Monitor</span>
          </div>
          <p className="text-xs pl-5 truncate" style={{ color: 'hsl(40, 50%, 25%)' }}>ID: {AGENT_ID.slice(0, 12)}...</p>
        </div>
      </div>
    </div>
  )
}

// ── Health Card ─────────────────────────────────────────────────────────────

function HealthCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="p-4 font-mono tracking-wider" style={{ background: 'hsl(30, 18%, 5%)', border: '1px solid hsl(40, 50%, 20%)' }}>
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color: 'hsl(40, 60%, 35%)' }}>{icon}</span>
        <span className="text-xs uppercase" style={{ color: 'hsl(40, 60%, 35%)' }}>{label}</span>
      </div>
      <p className="text-2xl font-bold" style={{ color: 'hsl(40, 100%, 50%)' }}>{value}</p>
    </div>
  )
}

// ── Table Renderer ──────────────────────────────────────────────────────────

function ResultTable({ resultText, columns, sortCol, sortDir, onSort }: {
  resultText: string
  columns: string[]
  sortCol: number | null
  sortDir: 'asc' | 'desc'
  onSort: (col: number) => void
}) {
  const lines = resultText.split('\n').filter((l) => l.trim())
  const hasHeaders = Array.isArray(columns) && columns.length > 0
  const headerRow = hasHeaders ? columns : []

  // Detect if data is KEY=VALUE format (e.g., env vars)
  const isKeyValue = hasHeaders && headerRow.length === 2 && lines.length > 0 && lines[0].includes('=')

  // Detect if the first line is a header line that matches our columns
  const firstLineTokens = lines.length > 0 ? lines[0].split(/\s{2,}|\t/).filter((c) => c.trim()) : []
  const firstLineIsHeader = hasHeaders && firstLineTokens.length > 0 &&
    headerRow.some((col) => firstLineTokens.some((t) => t.toUpperCase() === col.toUpperCase()))
  const dataStartIdx = firstLineIsHeader ? 1 : 0
  const dataLines = lines.slice(dataStartIdx)

  const rows = dataLines.map((line) => {
    if (isKeyValue) {
      // Skip bracketed notes like [Additional environment variables...]
      if (line.trim().startsWith('[') && line.trim().endsWith(']')) {
        return null
      }
      // Split on first = only, so PATH=/usr/bin:/sbin keeps value intact
      const eqIdx = line.indexOf('=')
      if (eqIdx > 0) {
        return [line.substring(0, eqIdx), line.substring(eqIdx + 1)]
      }
      // Lines without = in KEY=VALUE mode — skip them
      return null
    }
    // For general table data, split by 2+ spaces or tab
    const cells = line.split(/\s{2,}|\t/).filter((c) => c.trim())
    // If we couldn't split into multiple cells, try single-space splitting
    // but only if we have columns to match against
    if (cells.length <= 1 && headerRow.length > 1) {
      const spaceSplit = line.trim().split(/\s+/)
      if (spaceSplit.length >= headerRow.length) {
        // For commands like ps aux where last column may have spaces,
        // take first N-1 columns as single tokens, rest as last column
        const result = spaceSplit.slice(0, headerRow.length - 1)
        result.push(spaceSplit.slice(headerRow.length - 1).join(' '))
        return result
      }
      return spaceSplit
    }
    return cells
  }).filter((row): row is string[] => row !== null)

  const sortedRows = sortCol !== null
    ? [...rows].sort((a, b) => {
        const va = a[sortCol] ?? ''
        const vb = b[sortCol] ?? ''
        const na = parseFloat(va)
        const nb = parseFloat(vb)
        if (!isNaN(na) && !isNaN(nb)) {
          return sortDir === 'asc' ? na - nb : nb - na
        }
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      })
    : rows

  const totalRows = sortedRows.length

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono tracking-wider" style={{ color: 'hsl(40, 60%, 35%)' }}>
          {totalRows} row{totalRows !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="overflow-x-auto" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        <table className="w-full text-xs font-mono tracking-wider" style={{ borderCollapse: 'collapse' }}>
          {headerRow.length > 0 && (
            <thead className="sticky top-0 z-10">
              <tr style={{ borderBottom: '1px solid hsl(40, 50%, 20%)' }}>
                {headerRow.map((col, i) => (
                  <th
                    key={i}
                    className="px-3 py-2 text-left cursor-pointer select-none whitespace-nowrap"
                    style={{ color: 'hsl(40, 100%, 50%)', background: 'hsl(35, 25%, 10%)' }}
                    onClick={() => onSort(i)}
                  >
                    <span className="flex items-center gap-1">
                      {col}
                      {sortCol === i && (
                        <span className="text-xs">{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {sortedRows.map((row, ri) => (
              <tr key={ri} style={{ borderBottom: '1px solid hsl(40, 50%, 12%)', background: ri % 2 === 0 ? 'transparent' : 'hsl(35, 18%, 6%)' }}>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className={cn(
                      'px-3 py-1.5',
                      // First column (keys/identifiers) stays nowrap, value columns can wrap
                      ci === 0 ? 'whitespace-nowrap' : 'break-all'
                    )}
                    style={{
                      color: 'hsl(40, 90%, 55%)',
                      maxWidth: ci > 0 ? '500px' : undefined,
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sortedRows.length === 0 && (
        <p className="text-xs text-center py-4" style={{ color: 'hsl(40, 60%, 35%)' }}>No data rows parsed</p>
      )}
    </div>
  )
}

// ── Progress Bar Renderer ───────────────────────────────────────────────────

function ProgressBars({ resultText }: { resultText: string }) {
  const lines = resultText.split('\n').filter((l) => l.trim())

  const entries = lines.map((line) => {
    const percentMatch = line.match(/(\d+)%/)
    const pct = percentMatch ? parseInt(percentMatch[1], 10) : 0
    // Try to get a meaningful label: filesystem + mount, or first + last tokens
    const parts = line.split(/\s+/).filter((c) => c.trim())
    // For df -h output: /dev/sda1 50G 32G 18G 64% /
    // Use first part (device) + last part (mount point) as label
    let label = line.trim()
    if (parts.length >= 2) {
      const firstPart = parts[0]
      const lastPart = parts[parts.length - 1]
      // Skip if last part is just a percentage
      if (lastPart.match(/^\d+%$/)) {
        label = firstPart
      } else {
        label = `${firstPart} → ${lastPart}`
      }
    }
    return { name: label, percent: pct, raw: line, detail: line.trim() }
  }).filter((e) => e.percent > 0)

  return (
    <div className="space-y-3">
      {entries.map((entry, i) => (
        <div key={i} className="font-mono tracking-wider">
          <div className="flex justify-between text-xs mb-1">
            <span style={{ color: 'hsl(40, 90%, 55%)' }}>{entry.name}</span>
            <span style={{ color: entry.percent > 90 ? 'hsl(0, 100%, 50%)' : 'hsl(40, 100%, 50%)' }}>
              {entry.percent}%
            </span>
          </div>
          <div className="w-full h-3" style={{ background: 'hsl(35, 20%, 12%)' }}>
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${Math.min(entry.percent, 100)}%`,
                background: entry.percent > 90 ? 'hsl(0, 100%, 50%)' : 'hsl(40, 100%, 45%)',
              }}
            />
          </div>
          {entry.detail && (
            <p className="text-xs mt-0.5 truncate" style={{ color: 'hsl(40, 50%, 25%)' }}>{entry.detail}</p>
          )}
        </div>
      ))}
      {entries.length === 0 && (
        <p className="text-xs" style={{ color: 'hsl(40, 60%, 35%)' }}>No progress data parsed</p>
      )}
    </div>
  )
}

// ── Text Renderer ───────────────────────────────────────────────────────────

function TextResult({ resultText }: { resultText: string }) {
  const lines = resultText.split('\n')
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono tracking-wider" style={{ color: 'hsl(40, 60%, 35%)' }}>
          {lines.length} line{lines.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="overflow-x-auto font-mono text-xs tracking-wider" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        <pre className="whitespace-pre">
          {lines.map((line, i) => (
            <div key={i} className="flex hover:bg-[hsla(40,100%,50%,0.05)]">
              <span className="w-10 text-right pr-3 select-none flex-shrink-0" style={{ color: 'hsl(40, 50%, 25%)' }}>
                {i + 1}
              </span>
              <span className="break-all" style={{ color: 'hsl(40, 90%, 55%)' }}>{line}</span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  )
}

// ── Blocked Renderer ────────────────────────────────────────────────────────

function BlockedResult({ reason }: { reason: string }) {
  return (
    <div className="p-4" style={{ background: 'hsl(0, 40%, 10%)', border: '1px solid hsl(0, 60%, 30%)' }}>
      <div className="flex items-center gap-2 mb-2">
        <VscShield className="w-5 h-5" style={{ color: 'hsl(0, 100%, 50%)' }} />
        <span className="font-bold text-sm font-mono tracking-wider" style={{ color: 'hsl(0, 100%, 60%)' }}>COMMAND BLOCKED</span>
      </div>
      <div className="flex items-start gap-2 mt-3">
        <VscWarning className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'hsl(0, 100%, 50%)' }} />
        <p className="text-xs font-mono tracking-wider leading-relaxed" style={{ color: 'hsl(0, 80%, 70%)' }}>
          {reason || 'This command has been blocked for safety reasons.'}
        </p>
      </div>
    </div>
  )
}

// ── Dashboard Screen ────────────────────────────────────────────────────────

function DashboardScreen({
  query,
  setQuery,
  isLoading,
  currentResult,
  error,
  onRun,
  healthData,
  showSample,
}: {
  query: string
  setQuery: (q: string) => void
  isLoading: boolean
  currentResult: MonitorResult | null
  error: string | null
  onRun: () => void
  healthData: { cpu: string; memory: string; disk: string; uptime: string }
  showSample: boolean
}) {
  const { copiedId, copy } = useCopyClipboard()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const displayResult = showSample && !currentResult ? SAMPLE_RESULT : currentResult
  const displayHealth = showSample
    ? { cpu: '23.4 %', memory: '67.8 %', disk: '64 %', uptime: '14d 6h 32m' }
    : healthData

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onRun()
    }
  }

  const handleSort = (col: number) => {
    if (sortCol === col) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Health Cards */}
      <div className="grid grid-cols-4 gap-3 mb-4 flex-shrink-0">
        <HealthCard label="CPU Usage" value={displayHealth.cpu} icon={<VscServer className="w-4 h-4" />} />
        <HealthCard label="Memory" value={displayHealth.memory} icon={<VscServer className="w-4 h-4" />} />
        <HealthCard label="Disk Usage" value={displayHealth.disk} icon={<VscServer className="w-4 h-4" />} />
        <HealthCard label="Uptime" value={displayHealth.uptime} icon={<VscTerminal className="w-4 h-4" />} />
      </div>

      {/* Two Column Layout */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left: Query Panel */}
        <div className="w-[38%] flex flex-col flex-shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <VscTerminal className="w-4 h-4" style={{ color: 'hsl(40, 100%, 50%)' }} />
            <span className="text-sm font-bold font-mono tracking-wider" style={{ color: 'hsl(40, 100%, 50%)' }}>Query Panel</span>
          </div>
          <div className="flex-1 flex flex-col" style={{ background: 'hsl(30, 18%, 5%)', border: '1px solid hsl(40, 50%, 20%)' }}>
            <div className="p-3 flex-1 flex flex-col">
              <textarea
                ref={textareaRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me anything about your system..."
                className="w-full flex-1 min-h-[120px] resize-none p-3 text-sm font-mono tracking-wider placeholder:opacity-40 focus:outline-none"
                style={{
                  background: 'hsl(35, 30%, 8%)',
                  color: 'hsl(40, 100%, 50%)',
                  border: '1px solid hsl(40, 50%, 20%)',
                  borderRadius: 0,
                }}
              />
              <div className="mt-3 flex flex-wrap gap-1.5">
                {QUICK_COMMANDS.map((cmd) => (
                  <button
                    key={cmd.label}
                    onClick={() => setQuery(cmd.query)}
                    className="px-2.5 py-1 text-xs font-mono tracking-wider transition-colors duration-150"
                    style={{
                      background: 'hsl(35, 25%, 10%)',
                      color: 'hsl(40, 90%, 55%)',
                      border: '1px solid hsl(40, 50%, 20%)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'hsl(40, 100%, 45%)'
                      e.currentTarget.style.color = 'hsl(30, 20%, 3%)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'hsl(35, 25%, 10%)'
                      e.currentTarget.style.color = 'hsl(40, 90%, 55%)'
                    }}
                  >
                    {cmd.label}
                  </button>
                ))}
              </div>
              <button
                onClick={onRun}
                disabled={isLoading || !query.trim()}
                className="mt-3 w-full py-2.5 text-sm font-mono font-bold tracking-wider flex items-center justify-center gap-2 transition-opacity duration-150 disabled:opacity-40"
                style={{
                  background: 'hsl(40, 100%, 45%)',
                  color: 'hsl(30, 20%, 3%)',
                  borderRadius: 0,
                  border: 'none',
                }}
              >
                {isLoading ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent animate-spin" style={{ borderRadius: '50%' }} />
                    Executing...
                  </>
                ) : (
                  <>
                    <VscPlay className="w-4 h-4" />
                    RUN
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Error display */}
          {error && (
            <div className="mt-3 p-3 text-xs font-mono tracking-wider" style={{ background: 'hsl(0, 40%, 10%)', border: '1px solid hsl(0, 60%, 30%)', color: 'hsl(0, 80%, 70%)' }}>
              <div className="flex items-center gap-2">
                <VscWarning className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          )}
        </div>

        {/* Right: Output Dashboard */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-3">
            <VscServer className="w-4 h-4" style={{ color: 'hsl(40, 100%, 50%)' }} />
            <span className="text-sm font-bold font-mono tracking-wider" style={{ color: 'hsl(40, 100%, 50%)' }}>Output Dashboard</span>
          </div>
          <div className="flex-1 flex flex-col min-h-0" style={{ background: 'hsl(30, 18%, 5%)', border: '1px solid hsl(40, 50%, 20%)' }}>
            {!displayResult ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center font-mono tracking-wider">
                  <VscTerminal className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: 'hsl(40, 100%, 50%)' }} />
                  <p className="text-sm" style={{ color: 'hsl(40, 60%, 35%)' }}>Run a query to see results here</p>
                  <p className="text-xs mt-1" style={{ color: 'hsl(40, 50%, 25%)' }}>Use the query panel or quick commands to get started</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto overflow-x-hidden">
                <div className="p-4 space-y-4">
                  {/* Command Badge */}
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <p className="text-xs mb-1 font-mono tracking-wider" style={{ color: 'hsl(40, 60%, 35%)' }}>Translated Command:</p>
                      <div className="flex items-center gap-2 p-2.5" style={{ background: 'hsl(35, 30%, 8%)', border: '1px solid hsl(40, 50%, 15%)' }}>
                        <code className="flex-1 text-xs font-mono tracking-wider" style={{ color: 'hsl(40, 100%, 50%)' }}>
                          $ {displayResult.command || 'N/A'}
                        </code>
                        <button
                          onClick={() => copy(displayResult.command || '', 'cmd')}
                          className="flex-shrink-0 p-1 transition-opacity hover:opacity-70"
                          title="Copy command"
                        >
                          <VscCopy className="w-3.5 h-3.5" style={{ color: copiedId === 'cmd' ? 'hsl(120, 80%, 45%)' : 'hsl(40, 60%, 35%)' }} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Safety + Category Badges */}
                  <div className="flex items-center gap-2 font-mono tracking-wider">
                    <span
                      className="px-2 py-0.5 text-xs font-bold"
                      style={{
                        background: displayResult.is_safe ? 'hsl(120, 40%, 12%)' : 'hsl(0, 40%, 12%)',
                        color: displayResult.is_safe ? 'hsl(120, 80%, 55%)' : 'hsl(0, 100%, 60%)',
                        border: `1px solid ${displayResult.is_safe ? 'hsl(120, 40%, 25%)' : 'hsl(0, 60%, 30%)'}`,
                      }}
                    >
                      {displayResult.is_safe ? 'READ-ONLY' : 'BLOCKED'}
                    </span>
                    <span
                      className="px-2 py-0.5 text-xs uppercase"
                      style={{
                        background: 'hsl(35, 25%, 10%)',
                        color: 'hsl(40, 90%, 55%)',
                        border: '1px solid hsl(40, 50%, 20%)',
                      }}
                    >
                      {displayResult.category || 'system'}
                    </span>
                    <span
                      className="px-2 py-0.5 text-xs"
                      style={{
                        background: 'hsl(35, 25%, 10%)',
                        color: 'hsl(40, 60%, 35%)',
                        border: '1px solid hsl(40, 50%, 20%)',
                      }}
                    >
                      {displayResult.result_type || 'text'}
                    </span>
                  </div>

                  {/* Query echo */}
                  <div className="text-xs font-mono tracking-wider" style={{ color: 'hsl(40, 60%, 35%)' }}>
                    Query: &quot;{displayResult.query || ''}&quot;
                  </div>

                  {/* Result Content */}
                  <div>
                    {displayResult.result_type === 'blocked' ? (
                      <BlockedResult reason={displayResult.blocked_reason} />
                    ) : displayResult.result_type === 'table' ? (
                      <ResultTable
                        resultText={displayResult.result || ''}
                        columns={Array.isArray(displayResult.columns) ? displayResult.columns : []}
                        sortCol={sortCol}
                        sortDir={sortDir}
                        onSort={handleSort}
                      />
                    ) : displayResult.result_type === 'progress_bar' ? (
                      <ProgressBars resultText={displayResult.result || ''} />
                    ) : (
                      <TextResult resultText={displayResult.result || ''} />
                    )}
                  </div>

                  {/* Copy all result */}
                  {displayResult.result && displayResult.result_type !== 'blocked' && (
                    <div className="flex justify-end pt-2" style={{ borderTop: '1px solid hsl(40, 50%, 12%)' }}>
                      <button
                        onClick={() => copy(displayResult.result, 'result')}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono tracking-wider transition-opacity hover:opacity-80"
                        style={{ background: 'hsl(35, 25%, 10%)', color: 'hsl(40, 90%, 55%)', border: '1px solid hsl(40, 50%, 20%)' }}
                      >
                        <VscCopy className="w-3 h-3" />
                        {copiedId === 'result' ? 'Copied!' : 'Copy Result'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── History Screen ──────────────────────────────────────────────────────────

function HistoryScreen({
  history,
  setHistory,
  onRerun,
  showSample,
}: {
  history: HistoryEntry[]
  setHistory: React.Dispatch<React.SetStateAction<HistoryEntry[]>>
  onRerun: (query: string) => void
  showSample: boolean
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState<'all' | 'success' | 'error' | 'blocked'>('all')
  const { copiedId, copy } = useCopyClipboard()

  const displayHistory = showSample && history.length === 0 ? SAMPLE_HISTORY : history

  const filtered = displayHistory.filter((entry) => {
    const matchesSearch = !searchTerm || entry.query.toLowerCase().includes(searchTerm.toLowerCase()) || entry.command.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter =
      filter === 'all' ||
      (filter === 'success' && entry.is_safe && entry.result_type !== 'blocked') ||
      (filter === 'error' && !entry.is_safe && entry.result_type !== 'blocked') ||
      (filter === 'blocked' && entry.result_type === 'blocked')
    return matchesSearch && matchesFilter
  })

  const toggleExpand = (id: string) => {
    if (showSample && history.length === 0) return
    setHistory((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, expanded: !entry.expanded } : entry))
    )
  }

  const formatTime = (date: Date) => {
    try {
      return new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    } catch {
      return '--:--:--'
    }
  }

  const filterButtons = [
    { id: 'all' as const, label: 'All' },
    { id: 'success' as const, label: 'Success' },
    { id: 'error' as const, label: 'Error' },
    { id: 'blocked' as const, label: 'Blocked' },
  ]

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-4 flex-shrink-0">
        <VscHistory className="w-5 h-5" style={{ color: 'hsl(40, 100%, 50%)' }} />
        <span className="text-lg font-bold font-mono tracking-wider" style={{ color: 'hsl(40, 100%, 50%)' }}>Command History</span>
        <span className="text-xs font-mono ml-2" style={{ color: 'hsl(40, 60%, 35%)' }}>({filtered.length} entries)</span>
      </div>

      {/* Search + Filters */}
      <div className="flex gap-3 mb-4 flex-shrink-0">
        <div className="flex-1 flex items-center gap-2 px-3" style={{ background: 'hsl(35, 30%, 8%)', border: '1px solid hsl(40, 50%, 20%)' }}>
          <VscSearch className="w-4 h-4 flex-shrink-0" style={{ color: 'hsl(40, 60%, 35%)' }} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search commands..."
            className="flex-1 py-2 bg-transparent text-sm font-mono tracking-wider focus:outline-none placeholder:opacity-40"
            style={{ color: 'hsl(40, 100%, 50%)' }}
          />
        </div>
        <div className="flex gap-1">
          {filterButtons.map((fb) => (
            <button
              key={fb.id}
              onClick={() => setFilter(fb.id)}
              className="px-3 py-2 text-xs font-mono tracking-wider transition-colors"
              style={{
                background: filter === fb.id ? 'hsl(40, 100%, 45%)' : 'hsl(35, 25%, 10%)',
                color: filter === fb.id ? 'hsl(30, 20%, 3%)' : 'hsl(40, 90%, 55%)',
                border: '1px solid hsl(40, 50%, 20%)',
              }}
            >
              {fb.label}
            </button>
          ))}
        </div>
      </div>

      {/* History List */}
      <ScrollArea className="flex-1">
        <div className="space-y-2 pr-2">
          {filtered.length === 0 ? (
            <div className="text-center py-12 font-mono tracking-wider">
              <VscHistory className="w-10 h-10 mx-auto mb-3 opacity-20" style={{ color: 'hsl(40, 100%, 50%)' }} />
              <p className="text-sm" style={{ color: 'hsl(40, 60%, 35%)' }}>
                {searchTerm || filter !== 'all' ? 'No matching entries found' : 'No command history yet'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'hsl(40, 50%, 25%)' }}>Run queries from the Dashboard to build history</p>
            </div>
          ) : (
            filtered.map((entry) => (
              <div key={entry.id} style={{ background: 'hsl(30, 18%, 5%)', border: '1px solid hsl(40, 50%, 20%)' }}>
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                  onClick={() => toggleExpand(entry.id)}
                >
                  {entry.expanded ? (
                    <VscChevronDown className="w-3 h-3 flex-shrink-0" style={{ color: 'hsl(40, 60%, 35%)' }} />
                  ) : (
                    <VscChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: 'hsl(40, 60%, 35%)' }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-mono tracking-wider truncate" style={{ color: 'hsl(40, 100%, 50%)' }}>
                        {entry.query}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono tracking-wider">
                      <span style={{ color: 'hsl(40, 50%, 25%)' }}>{formatTime(entry.timestamp)}</span>
                      <code style={{ color: 'hsl(40, 60%, 35%)' }}>$ {entry.command}</code>
                    </div>
                  </div>
                  <span
                    className="px-2 py-0.5 text-xs font-mono tracking-wider font-bold flex-shrink-0"
                    style={{
                      background: entry.result_type === 'blocked' ? 'hsl(0, 40%, 12%)' : entry.is_safe ? 'hsl(120, 40%, 12%)' : 'hsl(40, 30%, 12%)',
                      color: entry.result_type === 'blocked' ? 'hsl(0, 100%, 60%)' : entry.is_safe ? 'hsl(120, 80%, 55%)' : 'hsl(40, 90%, 55%)',
                      border: `1px solid ${entry.result_type === 'blocked' ? 'hsl(0, 60%, 30%)' : entry.is_safe ? 'hsl(120, 40%, 25%)' : 'hsl(40, 50%, 20%)'}`,
                    }}
                  >
                    {entry.result_type === 'blocked' ? 'BLOCKED' : entry.is_safe ? 'OK' : 'WARN'}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onRerun(entry.query)
                    }}
                    className="flex-shrink-0 p-1.5 transition-opacity hover:opacity-70"
                    style={{ background: 'hsl(35, 25%, 10%)', border: '1px solid hsl(40, 50%, 20%)' }}
                    title="Re-run this query"
                  >
                    <VscRefresh className="w-3.5 h-3.5" style={{ color: 'hsl(40, 90%, 55%)' }} />
                  </button>
                </div>
                {entry.expanded && (
                  <div className="px-4 pb-3" style={{ borderTop: '1px solid hsl(40, 50%, 12%)' }}>
                    <div className="pt-3">
                      {entry.result_type === 'blocked' ? (
                        <BlockedResult reason={entry.blocked_reason} />
                      ) : (
                        <div className="relative">
                          <pre className="text-xs font-mono tracking-wider p-3 overflow-x-auto" style={{ background: 'hsl(35, 30%, 6%)', color: 'hsl(40, 90%, 55%)' }}>
                            {entry.result || 'No output'}
                          </pre>
                          <button
                            onClick={() => copy(entry.result, `hist-${entry.id}`)}
                            className="absolute top-2 right-2 p-1"
                            title="Copy"
                          >
                            <VscCopy className="w-3 h-3" style={{ color: copiedId === `hist-${entry.id}` ? 'hsl(120, 80%, 45%)' : 'hsl(40, 60%, 35%)' }} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// ── Settings Screen ─────────────────────────────────────────────────────────

function SettingsScreen({
  settings,
  setSettings,
}: {
  settings: Settings
  setSettings: React.Dispatch<React.SetStateAction<Settings>>
}) {
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')

  const handleTest = () => {
    setTestStatus('testing')
    setTimeout(() => {
      setTestStatus('success')
      setTimeout(() => setTestStatus('idle'), 3000)
    }, 1500)
  }

  return (
    <div className="flex-1">
      <div className="flex items-center gap-2 mb-6">
        <VscSettingsGear className="w-5 h-5" style={{ color: 'hsl(40, 100%, 50%)' }} />
        <span className="text-lg font-bold font-mono tracking-wider" style={{ color: 'hsl(40, 100%, 50%)' }}>Settings</span>
      </div>

      <div className="space-y-6 max-w-2xl">
        {/* System Connection */}
        <div style={{ background: 'hsl(30, 18%, 5%)', border: '1px solid hsl(40, 50%, 20%)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid hsl(40, 50%, 15%)' }}>
            <h3 className="text-sm font-bold font-mono tracking-wider" style={{ color: 'hsl(40, 100%, 50%)' }}>System Connection</h3>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-xs font-mono tracking-wider mb-1.5" style={{ color: 'hsl(40, 60%, 35%)' }}>API Endpoint</label>
              <input
                type="text"
                value={settings.apiEndpoint}
                onChange={(e) => setSettings((prev) => ({ ...prev, apiEndpoint: e.target.value }))}
                className="w-full px-3 py-2 text-sm font-mono tracking-wider focus:outline-none"
                style={{ background: 'hsl(35, 30%, 8%)', color: 'hsl(40, 100%, 50%)', border: '1px solid hsl(40, 50%, 20%)', borderRadius: 0 }}
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleTest}
                disabled={testStatus === 'testing'}
                className="px-4 py-2 text-xs font-mono font-bold tracking-wider transition-opacity disabled:opacity-50"
                style={{ background: 'hsl(40, 100%, 45%)', color: 'hsl(30, 20%, 3%)', borderRadius: 0, border: 'none' }}
              >
                {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
              </button>
              {testStatus === 'success' && (
                <span className="text-xs font-mono tracking-wider" style={{ color: 'hsl(120, 80%, 45%)' }}>Connection successful</span>
              )}
              {testStatus === 'error' && (
                <span className="text-xs font-mono tracking-wider" style={{ color: 'hsl(0, 100%, 50%)' }}>Connection failed</span>
              )}
            </div>
          </div>
        </div>

        {/* Safety Rules */}
        <div style={{ background: 'hsl(30, 18%, 5%)', border: '1px solid hsl(40, 50%, 20%)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid hsl(40, 50%, 15%)' }}>
            <h3 className="text-sm font-bold font-mono tracking-wider" style={{ color: 'hsl(40, 100%, 50%)' }}>Safety Rules</h3>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-mono tracking-wider" style={{ color: 'hsl(40, 90%, 55%)' }}>Block Destructive Commands</p>
                <p className="text-xs font-mono tracking-wider mt-0.5" style={{ color: 'hsl(40, 60%, 35%)' }}>Prevent execution of dangerous system commands</p>
              </div>
              <Switch
                checked={settings.blockDestructive}
                onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, blockDestructive: checked }))}
              />
            </div>
            <div>
              <p className="text-xs font-mono tracking-wider mb-2" style={{ color: 'hsl(40, 60%, 35%)' }}>Blocked Patterns:</p>
              <div className="flex flex-wrap gap-1.5">
                {BLOCKED_PATTERNS.map((pat) => (
                  <span
                    key={pat}
                    className="px-2 py-0.5 text-xs font-mono tracking-wider"
                    style={{ background: 'hsl(0, 30%, 12%)', color: 'hsl(0, 80%, 60%)', border: '1px solid hsl(0, 40%, 20%)' }}
                  >
                    {pat}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Display Preferences */}
        <div style={{ background: 'hsl(30, 18%, 5%)', border: '1px solid hsl(40, 50%, 20%)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid hsl(40, 50%, 15%)' }}>
            <h3 className="text-sm font-bold font-mono tracking-wider" style={{ color: 'hsl(40, 100%, 50%)' }}>Display Preferences</h3>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-mono tracking-wider" style={{ color: 'hsl(40, 90%, 55%)' }}>Default to Table View</p>
                <p className="text-xs font-mono tracking-wider mt-0.5" style={{ color: 'hsl(40, 60%, 35%)' }}>Show tabular data in table format by default</p>
              </div>
              <Switch
                checked={settings.defaultTableView}
                onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, defaultTableView: checked }))}
              />
            </div>
            <div>
              <label className="block text-xs font-mono tracking-wider mb-1.5" style={{ color: 'hsl(40, 60%, 35%)' }}>Result Pagination Size</label>
              <select
                value={settings.pageSize}
                onChange={(e) => setSettings((prev) => ({ ...prev, pageSize: parseInt(e.target.value, 10) }))}
                className="px-3 py-2 text-sm font-mono tracking-wider focus:outline-none cursor-pointer"
                style={{ background: 'hsl(35, 30%, 8%)', color: 'hsl(40, 100%, 50%)', border: '1px solid hsl(40, 50%, 20%)', borderRadius: 0 }}
              >
                <option value={25}>25 rows</option>
                <option value={50}>50 rows</option>
                <option value={100}>100 rows</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function Page() {
  const [activeScreen, setActiveScreen] = useState<'dashboard' | 'history' | 'settings'>('dashboard')
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [currentResult, setCurrentResult] = useState<MonitorResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [settings, setSettings] = useState<Settings>({
    apiEndpoint: 'http://localhost:8080/api/execute',
    blockDestructive: true,
    defaultTableView: true,
    pageSize: 50,
  })
  const [healthData, setHealthData] = useState({ cpu: '-- %', memory: '-- %', disk: '-- %', uptime: '--' })
  const [isConnected, setIsConnected] = useState(true)
  const [showSample, setShowSample] = useState(false)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)

  const handleRunQuery = useCallback(async (queryOverride?: string) => {
    const q = queryOverride ?? query
    if (!q.trim() || isLoading) return

    setIsLoading(true)
    setError(null)
    setCurrentResult(null)
    setActiveAgentId(AGENT_ID)
    setActiveScreen('dashboard')
    if (queryOverride) setQuery(queryOverride)

    try {
      const result = await callAIAgent(q, AGENT_ID)

      if (result.success) {
        // ── Deep extraction: try multiple paths to find structured agent data ──
        let parsed: Record<string, any> = {}

        // Path 1: Try raw_response first — it often contains the real structured JSON
        // raw_response can be: '{"response":"{...escaped json...}","module_outputs":{}}'
        if (result.raw_response) {
          try {
            let rawOuter = typeof result.raw_response === 'string'
              ? JSON.parse(result.raw_response)
              : result.raw_response
            // rawOuter.response may itself be a JSON string
            let innerResponse = rawOuter?.response ?? rawOuter
            if (typeof innerResponse === 'string') {
              try { innerResponse = JSON.parse(innerResponse) } catch {}
            }
            // If innerResponse has our expected fields, use it
            if (innerResponse && typeof innerResponse === 'object' && (innerResponse.command || innerResponse.category || innerResponse.result_type)) {
              parsed = innerResponse
            }
          } catch {
            // raw_response was not valid JSON, continue to other paths
          }
        }

        // Path 2: If raw_response didn't yield structured data, try result.response.result
        if (!parsed.command && !parsed.category) {
          let fromResult = result?.response?.result
          if (typeof fromResult === 'string') {
            try { fromResult = JSON.parse(fromResult) } catch {}
          }
          if (fromResult && typeof fromResult === 'object') {
            // Check if it has structured fields directly or nested inside text
            if (fromResult.command || fromResult.category || fromResult.result_type) {
              parsed = fromResult
            } else if (typeof fromResult.text === 'string') {
              // text might be JSON-encoded structured response
              try {
                const textParsed = JSON.parse(fromResult.text)
                if (textParsed && typeof textParsed === 'object' && (textParsed.command || textParsed.category)) {
                  parsed = textParsed
                }
              } catch {
                // text is plain text output — use it as the result body
                parsed = {
                  query: q,
                  command: '',
                  is_safe: true,
                  category: 'system',
                  result_type: 'text',
                  result: fromResult.text,
                  blocked_reason: '',
                  columns: [],
                }
              }
            }
          }
        }

        // Path 3: If result.response.message holds the data
        if (!parsed.command && !parsed.result && result?.response?.message) {
          let msg = result.response.message
          if (typeof msg === 'string') {
            try {
              const msgParsed = JSON.parse(msg)
              if (msgParsed && typeof msgParsed === 'object' && (msgParsed.command || msgParsed.category)) {
                parsed = msgParsed
              }
            } catch {
              // message is plain text — use as result
              if (!parsed.result) {
                parsed = {
                  ...parsed,
                  result: msg,
                  result_type: parsed.result_type || 'text',
                }
              }
            }
          }
        }

        // Final fallback: if we still have nothing, use response.message or text as raw output
        if (!parsed.result && !parsed.command) {
          const fallbackText = result?.response?.message || result?.response?.result?.text || ''
          parsed = {
            query: q,
            command: 'N/A — could not parse agent response',
            is_safe: true,
            category: 'system',
            result_type: 'text',
            result: typeof fallbackText === 'string' ? fallbackText : JSON.stringify(fallbackText, null, 2),
            blocked_reason: '',
            columns: [],
          }
        }

        const monitorResult: MonitorResult = {
          query: parsed?.query || q,
          command: parsed?.command || '',
          is_safe: parsed?.is_safe !== false,
          category: parsed?.category || 'system',
          result_type: parsed?.result_type || 'text',
          result: parsed?.result || '',
          blocked_reason: parsed?.blocked_reason || '',
          columns: Array.isArray(parsed?.columns) ? parsed.columns : [],
        }

        setCurrentResult(monitorResult)

        setHistory((prev) => [
          {
            id: Date.now().toString(),
            timestamp: new Date(),
            query: monitorResult.query,
            command: monitorResult.command,
            category: monitorResult.category,
            result_type: monitorResult.result_type,
            result: monitorResult.result,
            is_safe: monitorResult.is_safe,
            blocked_reason: monitorResult.blocked_reason,
            columns: monitorResult.columns,
            expanded: false,
          },
          ...prev,
        ])
        setIsConnected(true)
      } else {
        setError(result?.error || 'Failed to get response from agent')
        setIsConnected(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setIsConnected(false)
    } finally {
      setIsLoading(false)
      setActiveAgentId(null)
    }
  }, [query, isLoading])

  const handleRerun = useCallback((rerunQuery: string) => {
    setQuery(rerunQuery)
    handleRunQuery(rerunQuery)
  }, [handleRunQuery])

  return (
    <ErrorBoundary>
      <div style={THEME_VARS} className="min-h-screen font-mono" >
        <div className="flex min-h-screen" style={{ background: 'hsl(30, 20%, 3%)', color: 'hsl(40, 100%, 50%)' }}>
          {/* Sidebar */}
          <Sidebar activeScreen={activeScreen} setActiveScreen={setActiveScreen} isConnected={isConnected} />

          {/* Main Content */}
          <div className="flex-1 flex flex-col min-h-screen min-w-0">
            {/* Top Bar */}
            <div className="flex items-center justify-between px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid hsl(40, 50%, 20%)' }}>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono tracking-wider uppercase" style={{ color: 'hsl(40, 60%, 35%)' }}>
                  {activeScreen === 'dashboard' ? 'System Dashboard' : activeScreen === 'history' ? 'Command History' : 'Configuration'}
                </span>
                {activeAgentId && (
                  <span className="flex items-center gap-1.5 text-xs font-mono tracking-wider" style={{ color: 'hsl(40, 90%, 55%)' }}>
                    <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'hsl(40, 100%, 50%)' }} />
                    Agent Active
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-mono tracking-wider cursor-pointer" style={{ color: 'hsl(40, 60%, 35%)' }}>
                  <span>Sample Data</span>
                  <Switch checked={showSample} onCheckedChange={setShowSample} />
                </label>
              </div>
            </div>

            {/* Screen Content */}
            <div className="flex-1 p-6 flex flex-col min-h-0 overflow-y-auto">
              {activeScreen === 'dashboard' && (
                <DashboardScreen
                  query={query}
                  setQuery={setQuery}
                  isLoading={isLoading}
                  currentResult={currentResult}
                  error={error}
                  onRun={() => handleRunQuery()}
                  healthData={healthData}
                  showSample={showSample}
                />
              )}
              {activeScreen === 'history' && (
                <HistoryScreen
                  history={history}
                  setHistory={setHistory}
                  onRerun={handleRerun}
                  showSample={showSample}
                />
              )}
              {activeScreen === 'settings' && (
                <SettingsScreen settings={settings} setSettings={setSettings} />
              )}
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}
