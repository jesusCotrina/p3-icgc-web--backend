import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from '../config/env';

const execAsync = promisify(exec);

export type DiskInfo = {
  path: string;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usedPercent: number;
  /** Cómo se obtuvo el dato: útil para depurar diferencias entre SO */
  source: 'statfs' | 'powershell' | 'df' | 'unavailable';
};

export type SystemStats = {
  os: {
    platform: NodeJS.Platform;
    isWindows: boolean;
    isLinux: boolean;
    type: string;
    release: string;
    arch: string;
    hostname: string;
    prettyName: string;
    uptimeSec: number;
  };
  cpu: {
    cores: number;
    model: string;
    speedMhz: number;
    /** % de uso agregado, medido muestreando os.cpus() dos veces */
    usagePercent: number;
    /** loadavg solo es significativo en Linux/macOS; en Windows es null */
    loadAvg: [number, number, number] | null;
  };
  memory: {
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
    usedPercent: number;
  };
  disk: DiskInfo;
  runtime: {
    node: string;
    pid: number;
    processUptimeSec: number;
    processMemoryBytes: number;
  };
};

const isWindows = process.platform === 'win32';
const isLinux = process.platform === 'linux';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ───────────────────────────── CPU ─────────────────────────────

type CpuSnapshot = { idle: number; total: number };

function cpuSnapshot(): CpuSnapshot {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    for (const key of Object.keys(cpu.times) as (keyof typeof cpu.times)[]) {
      total += cpu.times[key];
    }
    idle += cpu.times.idle;
  }
  return { idle, total };
}

/**
 * Uso de CPU en %, muestreando dos veces con 150 ms de diferencia.
 * os.cpus() se comporta igual en Windows y en Linux, así que aquí no hace
 * falta bifurcar por sistema operativo.
 */
async function getCpuUsagePercent(sampleMs = 150): Promise<number> {
  const start = cpuSnapshot();
  await new Promise((resolve) => setTimeout(resolve, sampleMs));
  const end = cpuSnapshot();

  const idleDelta = end.idle - start.idle;
  const totalDelta = end.total - start.total;
  if (totalDelta <= 0) return 0;

  return round2(100 - (idleDelta / totalDelta) * 100);
}

// ───────────────────────────── Disco ─────────────────────────────

/**
 * Ruta a medir. Si DISK_PATH no está definido usamos la raíz del volumen
 * donde viven los uploads: en Windows "C:\", en Linux "/".
 */
function resolveDiskPath(): string {
  if (env.DISK_PATH && env.DISK_PATH.trim()) return env.DISK_PATH.trim();
  if (isWindows) return path.parse(env.uploadDir).root || 'C:\\';
  return '/';
}

function buildDisk(
  target: string,
  totalBytes: number,
  freeBytes: number,
  source: DiskInfo['source'],
): DiskInfo {
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  return {
    path: target,
    totalBytes,
    freeBytes,
    usedBytes,
    usedPercent: totalBytes > 0 ? round2((usedBytes / totalBytes) * 100) : 0,
    source,
  };
}

/** Vía preferida: fs.statfs es nativo y multiplataforma (Node >= 18.15). */
async function diskViaStatfs(target: string): Promise<DiskInfo | null> {
  if (typeof fs.statfs !== 'function') return null;

  try {
    const st = await fs.statfs(target);
    const blockSize = Number(st.bsize);
    const totalBytes = Number(st.blocks) * blockSize;
    // bavail = bloques disponibles para usuarios sin privilegios (el dato honesto)
    const freeBytes = Number(st.bavail) * blockSize;
    if (!Number.isFinite(totalBytes) || totalBytes <= 0) return null;
    return buildDisk(target, totalBytes, freeBytes, 'statfs');
  } catch {
    return null;
  }
}

/** Fallback Windows: CIM/WMI a través de PowerShell. */
async function diskViaPowerShell(target: string): Promise<DiskInfo | null> {
  try {
    // "C:\" -> "C:"  (Win32_LogicalDisk identifica las unidades sin barra final)
    const drive = (path.parse(path.resolve(target)).root || 'C:\\').replace(/\\+$/, '');

    const script = [
      `$d = Get-CimInstance Win32_LogicalDisk -Filter ('DeviceID=''' + '${drive}' + '''')`,
      '$d | Select-Object Size,FreeSpace | ConvertTo-Json -Compress',
    ].join('; ');

    const { stdout } = await execAsync(
      `powershell -NoProfile -NonInteractive -Command "${script}"`,
      { timeout: 10_000, windowsHide: true },
    );

    const parsed = JSON.parse(stdout.trim()) as { Size: number | string; FreeSpace: number | string };
    const totalBytes = Number(parsed.Size);
    const freeBytes = Number(parsed.FreeSpace);
    if (!Number.isFinite(totalBytes) || totalBytes <= 0) return null;
    return buildDisk(target, totalBytes, freeBytes, 'powershell');
  } catch {
    return null;
  }
}

/** Fallback Linux/macOS: df -kP (formato POSIX, estable entre distribuciones). */
async function diskViaDf(target: string): Promise<DiskInfo | null> {
  try {
    const { stdout } = await execAsync(`df -kP "${target}"`, { timeout: 10_000 });
    const lines = stdout.trim().split('\n');
    const row = lines[lines.length - 1];
    if (!row) return null;

    // Filesystem  1024-blocks  Used  Available  Capacity  Mounted-on
    const cols = row.trim().split(/\s+/);
    const totalKb = Number(cols[1]);
    const availKb = Number(cols[3]);
    if (!Number.isFinite(totalKb) || totalKb <= 0) return null;

    return buildDisk(target, totalKb * 1024, availKb * 1024, 'df');
  } catch {
    return null;
  }
}

/**
 * Espacio en disco. Detecta el sistema operativo y elige la estrategia:
 *   1. fs.statfs  → nativo, funciona en Windows y Linux (Node >= 18.15)
 *   2. win32      → PowerShell + Win32_LogicalDisk
 *   3. linux/mac  → df -kP
 */
export async function getDiskInfo(): Promise<DiskInfo> {
  const target = resolveDiskPath();

  const viaStatfs = await diskViaStatfs(target);
  if (viaStatfs) return viaStatfs;

  const fallback = isWindows ? await diskViaPowerShell(target) : await diskViaDf(target);
  if (fallback) return fallback;

  return {
    path: target,
    totalBytes: 0,
    freeBytes: 0,
    usedBytes: 0,
    usedPercent: 0,
    source: 'unavailable',
  };
}

// ───────────────────────────── Nombre del SO ─────────────────────────────

let cachedPrettyName: string | null = null;

/** En Linux leemos /etc/os-release ("Ubuntu 24.04 LTS"); si no, os.version(). */
async function getPrettyOsName(): Promise<string> {
  if (cachedPrettyName) return cachedPrettyName;

  if (isLinux) {
    try {
      const content = await fs.readFile('/etc/os-release', 'utf8');
      const match = content.match(/^PRETTY_NAME="?(.+?)"?$/m);
      if (match?.[1]) {
        cachedPrettyName = match[1];
        return cachedPrettyName;
      }
    } catch {
      // contenedor mínimo sin /etc/os-release: seguimos al genérico
    }
  }

  try {
    cachedPrettyName = `${os.version()} (${os.arch()})`;
  } catch {
    cachedPrettyName = `${os.type()} ${os.release()}`;
  }
  return cachedPrettyName;
}

// ───────────────────────── Peso de la carpeta de uploads ─────────────────────────

/** Suma recursiva de lo que ocupan los archivos subidos. */
export async function getUploadsSize(dir = env.uploadDir): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await getUploadsSize(full);
    } else if (entry.isFile()) {
      try {
        const st = await fs.stat(full);
        total += st.size;
      } catch {
        // archivo borrado entre readdir y stat: lo ignoramos
      }
    }
  }
  return total;
}

// ───────────────────────────── Agregado ─────────────────────────────

export async function getSystemStats(): Promise<SystemStats> {
  const [usagePercent, disk, prettyName] = await Promise.all([
    getCpuUsagePercent(),
    getDiskInfo(),
    getPrettyOsName(),
  ]);

  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  return {
    os: {
      platform: process.platform,
      isWindows,
      isLinux,
      type: os.type(),
      release: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
      prettyName,
      uptimeSec: Math.round(os.uptime()),
    },
    cpu: {
      cores: cpus.length,
      model: cpus[0]?.model.trim() ?? 'Desconocido',
      speedMhz: cpus[0]?.speed ?? 0,
      usagePercent,
      // En Windows os.loadavg() siempre devuelve [0,0,0]: null para no mentir.
      loadAvg: isWindows ? null : (os.loadavg().map(round2) as [number, number, number]),
    },
    memory: {
      totalBytes: totalMem,
      freeBytes: freeMem,
      usedBytes: usedMem,
      usedPercent: round2((usedMem / totalMem) * 100),
    },
    disk,
    runtime: {
      node: process.version,
      pid: process.pid,
      processUptimeSec: Math.round(process.uptime()),
      processMemoryBytes: process.memoryUsage().rss,
    },
  };
}
