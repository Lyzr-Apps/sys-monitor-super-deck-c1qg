import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'

// ── Whitelist of safe, read-only commands ──────────────────────────────────
const SAFE_COMMANDS: Record<string, string> = {
  // System health overview
  'health': 'echo "=== UPTIME ===" && uptime && echo "" && echo "=== MEMORY ===" && free -h && echo "" && echo "=== DISK ===" && df -h && echo "" && echo "=== LOAD ===" && cat /proc/loadavg',

  // Individual metrics
  'cpu': 'cat /proc/stat | head -1 && echo "" && cat /proc/loadavg',
  'memory': 'free -h',
  'disk': 'df -h',
  'uptime': 'uptime',
  'processes': 'ps aux --sort=-%mem | head -30',
  'processes_cpu': 'ps aux --sort=-%cpu | head -30',
  'top_memory': 'ps aux --sort=-%mem | head -15',
  'top_cpu': 'ps aux --sort=-%cpu | head -15',
  'network': 'cat /proc/net/dev',
  'hostname': 'hostname && uname -a',
  'loadavg': 'cat /proc/loadavg',
  'meminfo': 'cat /proc/meminfo',
  'cpuinfo': 'cat /proc/cpuinfo | head -30',

  // Summary for health cards
  'summary': 'echo "MEM:" && free | grep Mem && echo "DISK:" && df / | tail -1 && echo "UP:" && uptime -p 2>/dev/null || uptime && echo "LOAD:" && cat /proc/loadavg',
}

// Parse memory from free command output
function parseMemoryPercent(output: string): string {
  try {
    const memLine = output.split('\n').find(l => l.startsWith('Mem:'))
    if (!memLine) return '-- %'
    const parts = memLine.split(/\s+/)
    const total = parseInt(parts[1])
    const used = parseInt(parts[2])
    if (total > 0) return ((used / total) * 100).toFixed(1) + ' %'
  } catch {}
  return '-- %'
}

// Parse disk usage from df output
function parseDiskPercent(output: string): string {
  try {
    const lines = output.split('\n').filter(l => l.includes('/'))
    for (const line of lines) {
      if (line.includes('/ ') || line.endsWith('/')) {
        const match = line.match(/(\d+)%/)
        if (match) return match[1] + ' %'
      }
    }
  } catch {}
  return '-- %'
}

// Parse CPU usage from /proc/stat
function parseCpuPercent(statOutput: string): string {
  try {
    const line = statOutput.split('\n')[0]
    if (!line?.startsWith('cpu')) return '-- %'
    const parts = line.split(/\s+/).slice(1).map(Number)
    const idle = parts[3] || 0
    const total = parts.reduce((a, b) => a + b, 0)
    if (total > 0) return ((1 - idle / total) * 100).toFixed(1) + ' %'
  } catch {}
  return '-- %'
}

// Parse uptime
function parseUptime(output: string): string {
  try {
    // Try "uptime -p" style first: "up 2 hours, 37 minutes"
    const pMatch = output.match(/up\s+(.+)/)
    if (pMatch) {
      let up = pMatch[1].trim()
      // Clean up from traditional uptime format
      const commaIdx = up.indexOf(',')
      if (commaIdx > 0 && up.includes('user')) {
        up = up.substring(0, commaIdx).trim()
      }
      // Shorten
      up = up.replace(/\s*days?\s*/, 'd ').replace(/\s*hours?\s*/, 'h ').replace(/\s*minutes?\s*/, 'm ').replace(/,/g, '').trim()
      return up
    }
  } catch {}
  return '--'
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const cmd = searchParams.get('cmd') || 'health'

  // Only allow whitelisted commands
  if (!SAFE_COMMANDS[cmd]) {
    return NextResponse.json({
      success: false,
      error: `Unknown command: ${cmd}. Available: ${Object.keys(SAFE_COMMANDS).join(', ')}`,
    }, { status: 400 })
  }

  try {
    const output = execSync(SAFE_COMMANDS[cmd], {
      timeout: 10000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()

    // For summary, parse into structured data
    if (cmd === 'summary') {
      const memOutput = execSync('free', { encoding: 'utf-8', timeout: 5000 })
      const diskOutput = execSync('df -h', { encoding: 'utf-8', timeout: 5000 })
      const cpuOutput = execSync('cat /proc/stat | head -1', { encoding: 'utf-8', timeout: 5000 })
      const uptimeOutput = execSync('uptime', { encoding: 'utf-8', timeout: 5000 })

      return NextResponse.json({
        success: true,
        data: {
          cpu: parseCpuPercent(cpuOutput),
          memory: parseMemoryPercent(memOutput),
          disk: parseDiskPercent(diskOutput),
          uptime: parseUptime(uptimeOutput),
        },
        raw: output,
      })
    }

    return NextResponse.json({
      success: true,
      output,
      command: SAFE_COMMANDS[cmd],
    })
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message || 'Command execution failed',
      stderr: err.stderr?.toString() || '',
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // Execute a safe command from the agent's translated command
  // Only allow read-only commands through strict validation
  try {
    const body = await request.json()
    const rawCommand = body.command as string

    if (!rawCommand || typeof rawCommand !== 'string') {
      return NextResponse.json({
        success: false,
        error: 'No command provided',
      }, { status: 400 })
    }

    // ── SAFETY VALIDATION ──
    const dangerous = [
      'rm ', 'rm\t', 'rmdir', 'del ', 'shred',
      'kill ', 'killall', 'pkill',
      'shutdown', 'reboot', 'halt', 'poweroff',
      'mkfs', 'dd ', 'format',
      'chmod', 'chown',
      'mv ', 'cp ',
      'curl ', 'wget ',
      '> ', '>> ', '| rm',
      'sudo', 'su ',
      'apt ', 'yum ', 'dnf ', 'pip ',
      'npm ', 'npx ',
      'systemctl stop', 'systemctl disable',
      'iptables',
      'passwd', 'useradd', 'userdel',
      'eval ', 'exec ',
      'base64 -d',
      '$(', '`',
    ]

    const cmdLower = rawCommand.toLowerCase().trim()
    for (const d of dangerous) {
      if (cmdLower.includes(d.toLowerCase())) {
        return NextResponse.json({
          success: false,
          blocked: true,
          error: `Blocked: command contains dangerous pattern "${d.trim()}"`,
        }, { status: 403 })
      }
    }

    // Only allow known safe command prefixes
    const safeStarters = [
      'ps ', 'ps\n', 'top ', 'pgrep ',
      'free', 'vmstat',
      'df ', 'df\n', 'du ', 'lsblk',
      'netstat', 'ss ', 'ip ',
      'uname', 'uptime', 'hostname', 'whoami', 'date',
      'cat /proc/', 'head ', 'tail ', 'wc ',
      'ls ', 'ls\n', 'find ',
      'env', 'printenv', 'echo $',
      'grep ',
    ]

    const isAllowed = safeStarters.some(s => cmdLower.startsWith(s) || cmdLower === s.trim())
    if (!isAllowed) {
      return NextResponse.json({
        success: false,
        blocked: true,
        error: `Command not in safe list. Only read-only system commands are allowed.`,
      }, { status: 403 })
    }

    const output = execSync(rawCommand, {
      timeout: 15000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: '/bin/bash',
    }).trim()

    return NextResponse.json({
      success: true,
      output,
      command: rawCommand,
    })
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message || 'Command execution failed',
      stderr: err.stderr?.toString() || '',
    }, { status: 500 })
  }
}
