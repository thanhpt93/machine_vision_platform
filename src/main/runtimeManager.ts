import { app } from 'electron';
import { ChildProcess, spawn, execFileSync } from 'child_process';
import fs from 'fs';
import fsPromises from 'fs/promises';
import http from 'http';
import path from 'path';
import { DeploymentMode } from '../shared/editionConfig';

export interface RuntimeManagerState {
  status: 'stopped' | 'starting' | 'running' | 'external' | 'failed';
  ownedByApp: boolean;
  pid: number | null;
  baseUrl: string;
  dataDir: string;
  logFilePath: string;
  pythonExecutable: string | null;
  runtimeRoot: string;
  lastError: string | null;
}

const DEFAULT_RUNTIME_PORT = 8000;
const DEFAULT_RUNTIME_HOST = '127.0.0.1';
const HEALTH_POLL_INTERVAL_MS = 350;
const STARTUP_TIMEOUT_MS = 18000;

function formatTimestamp(): string {
  return new Date().toISOString();
}

async function copyDirectoryRecursive(srcDir: string, destDir: string): Promise<void> {
  if (!fs.existsSync(srcDir)) return;
  await fsPromises.mkdir(destDir, { recursive: true });
  const entries = await fsPromises.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryRecursive(srcPath, destPath);
    } else if (entry.isFile() && !fs.existsSync(destPath)) {
      await fsPromises.copyFile(srcPath, destPath);
    }
  }
}

export class RuntimeProcessManager {
  private childProcess: ChildProcess | null = null;
  private ownedByApp = false;
  private status: RuntimeManagerState['status'] = 'stopped';
  private lastError: string | null = null;
  private pythonExecutable: string | null = null;
  private isShuttingDown = false;
  private readonly host = DEFAULT_RUNTIME_HOST;
  private readonly port = DEFAULT_RUNTIME_PORT;
  private readonly deploymentMode: DeploymentMode;

  constructor(deploymentMode: DeploymentMode) {
    this.deploymentMode = deploymentMode;
  }

  public getBaseUrl(): string {
    return `http://${this.host}:${this.port}`;
  }

  /**
   * Resolves the writable user-data directory for mutable runtime state
   * (releases, inspections, sample_images, logs).
   * Installed applications never write to Program Files.
   */
  public getWritableDataDir(): string {
    if (process.env.MVP_RUNTIME_DATA_DIR && process.env.MVP_RUNTIME_DATA_DIR.trim()) {
      return path.resolve(process.env.MVP_RUNTIME_DATA_DIR.trim());
    }
    if (app.isPackaged || this.deploymentMode === 'production') {
      return path.join(app.getPath('userData'), 'runtime_data');
    }
    return path.join(this.getBundledRuntimeRoot(), 'data');
  }

  public getLogsDir(): string {
    return path.join(app.getPath('userData'), 'logs');
  }

  public getRuntimeLogPath(): string {
    return path.join(this.getLogsDir(), 'runtime.log');
  }

  public getMainLogPath(): string {
    return path.join(this.getLogsDir(), 'main.log');
  }

  /**
   * Resolves the absolute directory containing `vision_runtime/`.
   * Works both in packaged builds (`process.resourcesPath/python_runtime`)
   * and in local development (`<repo>/python_runtime`).
   */
  public getBundledRuntimeRoot(): string {
    if (app.isPackaged) {
      const packagedCandidate = path.join(process.resourcesPath, 'python_runtime');
      if (fs.existsSync(packagedCandidate)) {
        return packagedCandidate;
      }
    }
    // Fallback to repo root relative to dist/main/runtimeManager.js -> ../../python_runtime
    return path.resolve(__dirname, '..', '..', 'python_runtime');
  }

  public getBundledSampleImagesDir(): string {
    if (app.isPackaged) {
      const packagedSamples = path.join(process.resourcesPath, 'sample_images');
      if (fs.existsSync(packagedSamples)) {
        return packagedSamples;
      }
    }
    return path.resolve(__dirname, '..', '..', 'sample_images');
  }

  /**
   * Locates a usable Python interpreter or packaged runtime executable on Windows.
   */
  public resolvePythonExecutable(): string | null {
    const candidates: string[] = [];

    if (process.env.NOVA_PYTHON_PATH && process.env.NOVA_PYTHON_PATH.trim()) {
      candidates.push(process.env.NOVA_PYTHON_PATH.trim());
    }

    if (app.isPackaged) {
      candidates.push(
        path.join(process.resourcesPath, 'python_env', 'python.exe'),
        path.join(process.resourcesPath, 'python_runtime', '.venv', 'Scripts', 'python.exe')
      );
    }

    const repoRoot = path.resolve(__dirname, '..', '..');
    candidates.push(
      path.join(repoRoot, 'python_runtime', '.venv', 'Scripts', 'python.exe'),
      path.join(repoRoot, '.venv', 'Scripts', 'python.exe'),
      'C:\\Users\\admin\\miniconda3\\envs\\api\\python.exe'
    );

    if (process.env.CONDA_PREFIX) {
      candidates.push(path.join(process.env.CONDA_PREFIX, 'python.exe'));
    }

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return candidate;
        }
      } catch {
        // continue checking next candidate
      }
    }

    // Fallback to system PATH python.exe if available
    try {
      const out = execFileSync('where.exe', ['python.exe'], {
        encoding: 'utf-8',
        timeout: 2500,
        windowsHide: true,
      });
      const firstLine = out
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l.length > 0 && !l.includes('WindowsApps'));
      if (firstLine && fs.existsSync(firstLine)) {
        return firstLine;
      }
    } catch {
      // ignore if where.exe fails
    }

    return null;
  }

  public logMainEvent(message: string): void {
    try {
      const logDir = this.getLogsDir();
      fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(
        this.getMainLogPath(),
        `[${formatTimestamp()}] [${this.deploymentMode.toUpperCase()}] ${message}\n`,
        'utf-8'
      );
    } catch {
      // Never crash Main if logging fails
    }
  }

  private logRuntimeOutput(chunk: string): void {
    try {
      const logDir = this.getLogsDir();
      fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(this.getRuntimeLogPath(), chunk, 'utf-8');
    } catch {
      // Ignore file logging error
    }
  }

  /**
   * Seeds writable userData directory with initial bundled releases and sample_images
   * on first launch so Production Edition works immediately out of the box.
   */
  public async ensureUserDataInitialized(): Promise<void> {
    const dataDir = this.getWritableDataDir();
    const releasesDir = path.join(dataDir, 'releases');
    const inspectionsDir = path.join(dataDir, 'inspections');
    const sampleImagesTargetDir = path.join(dataDir, 'sample_images');

    await fsPromises.mkdir(releasesDir, { recursive: true });
    await fsPromises.mkdir(inspectionsDir, { recursive: true });
    await fsPromises.mkdir(this.getLogsDir(), { recursive: true });

    // Seed initial released pipelines if userData/runtime_data/releases has none yet
    const bundledDataReleases = path.join(this.getBundledRuntimeRoot(), 'data', 'releases');
    if (
      path.resolve(bundledDataReleases) !== path.resolve(releasesDir) &&
      fs.existsSync(bundledDataReleases)
    ) {
      const existingEntries = await fsPromises.readdir(releasesDir).catch(() => []);
      if (existingEntries.length === 0) {
        await copyDirectoryRecursive(bundledDataReleases, releasesDir);
        this.logMainEvent(`Seeded initial released pipelines into ${releasesDir}`);
      }
    }

    // Seed sample_images into writable dataDir so relative paths 'sample_images/...' always resolve
    const bundledSamples = this.getBundledSampleImagesDir();
    if (
      fs.existsSync(bundledSamples) &&
      path.resolve(bundledSamples) !== path.resolve(sampleImagesTargetDir)
    ) {
      await copyDirectoryRecursive(bundledSamples, sampleImagesTargetDir);
    }
  }

  /**
   * Probes `GET http://127.0.0.1:8000/health` to check if the FastAPI Runtime is responsive.
   */
  public checkHealth(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(
        {
          hostname: this.host,
          port: this.port,
          path: '/health',
          timeout: 1500,
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk) => {
            raw += chunk;
          });
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                const parsed = JSON.parse(raw);
                resolve(parsed?.status === 'healthy');
                return;
              } catch {
                resolve(false);
                return;
              }
            }
            resolve(false);
          });
        }
      );

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  public getState(): RuntimeManagerState {
    return {
      status: this.status,
      ownedByApp: this.ownedByApp,
      pid: this.childProcess?.pid ?? null,
      baseUrl: this.getBaseUrl(),
      dataDir: this.getWritableDataDir(),
      logFilePath: this.getRuntimeLogPath(),
      pythonExecutable: this.pythonExecutable,
      runtimeRoot: this.getBundledRuntimeRoot(),
      lastError: this.lastError,
    };
  }

  /**
   * Ensures the Python FastAPI Runtime is running.
   * - If already reachable at 127.0.0.1:8000/health, adopts it as 'external' without spawning a duplicate.
   * - Otherwise spawns uvicorn from the resolved Python interpreter with absolute paths and waits for readiness.
   */
  public async ensureStarted(): Promise<RuntimeManagerState> {
    if (process.env.TEST_EXIT === 'true') {
      return this.getState();
    }

    await this.ensureUserDataInitialized();

    const alreadyHealthy = await this.checkHealth();
    if (alreadyHealthy) {
      if (!this.ownedByApp) {
        this.status = 'external';
        this.lastError = null;
        this.logMainEvent(
          `Detected existing healthy Python Runtime on ${this.getBaseUrl()} (not owned by this instance).`
        );
      } else {
        this.status = 'running';
      }
      return this.getState();
    }

    if (this.status === 'starting' && this.childProcess) {
      return this.getState();
    }

    const runtimeRoot = this.getBundledRuntimeRoot();
    if (!fs.existsSync(path.join(runtimeRoot, 'vision_runtime', 'main.py'))) {
      this.status = 'failed';
      this.lastError = `Python Runtime package not found at '${runtimeRoot}'.`;
      this.logMainEvent(`ERROR: ${this.lastError}`);
      return this.getState();
    }

    const pythonExe = this.resolvePythonExecutable();
    this.pythonExecutable = pythonExe;
    if (!pythonExe) {
      this.status = 'failed';
      this.lastError =
        'Could not locate a valid Python interpreter (python.exe) to start the Vision Runtime.';
      this.logMainEvent(`ERROR: ${this.lastError}`);
      return this.getState();
    }

    const writableDataDir = this.getWritableDataDir();
    this.status = 'starting';
    this.lastError = null;
    this.isShuttingDown = false;

    this.logMainEvent(
      `Starting Python FastAPI Runtime using '${pythonExe}' (cwd='${runtimeRoot}', dataDir='${writableDataDir}')`
    );

    try {
      const childEnv: NodeJS.ProcessEnv = {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONPATH: runtimeRoot,
        MVP_RUNTIME_DATA_DIR: writableDataDir,
        NOVA_DEPLOYMENT_MODE: this.deploymentMode,
      };

      const child = spawn(
        pythonExe,
        [
          '-m',
          'uvicorn',
          'vision_runtime.main:app',
          '--host',
          this.host,
          '--port',
          String(this.port),
        ],
        {
          cwd: runtimeRoot,
          env: childEnv,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );

      this.childProcess = child;
      this.ownedByApp = true;

      child.stdout?.on('data', (data: Buffer) => {
        this.logRuntimeOutput(data.toString('utf-8'));
      });

      child.stderr?.on('data', (data: Buffer) => {
        this.logRuntimeOutput(data.toString('utf-8'));
      });

      child.on('error', (err) => {
        this.status = 'failed';
        this.lastError = `Failed to spawn Python Runtime process: ${err.message}`;
        this.logMainEvent(`ERROR: ${this.lastError}`);
      });

      child.on('exit', (code, signal) => {
        this.childProcess = null;
        this.ownedByApp = false;
        if (!this.isShuttingDown) {
          this.status = 'failed';
          this.lastError = `Python Runtime process exited unexpectedly (code=${code}, signal=${signal}). See ${this.getRuntimeLogPath()}.`;
          this.logMainEvent(`WARN: ${this.lastError}`);
        } else {
          this.status = 'stopped';
          this.logMainEvent(`Python Runtime stopped cleanly (code=${code}).`);
        }
      });

      // Poll /health until ready or timeout
      const deadline = Date.now() + STARTUP_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const currentStatus = this.getState().status;
        if (currentStatus === 'failed' || !this.childProcess) {
          break;
        }
        const healthy = await this.checkHealth();
        if (healthy) {
          this.status = 'running';
          this.lastError = null;
          this.logMainEvent(
            `Python FastAPI Runtime ready on ${this.getBaseUrl()} (PID=${this.childProcess?.pid})`
          );
          return this.getState();
        }
        await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
      }

      if (this.getState().status !== 'running') {
        this.status = 'failed';
        if (!this.lastError) {
          this.lastError = `Timed out waiting for Python Runtime /health on ${this.getBaseUrl()}. Check ${this.getRuntimeLogPath()}.`;
        }
        this.logMainEvent(`ERROR: ${this.lastError}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.status = 'failed';
      this.lastError = `Exception while starting Python Runtime: ${msg}`;
      this.logMainEvent(`ERROR: ${this.lastError}`);
    }

    return this.getState();
  }

  /**
   * Stops the Runtime process if and only if this Electron instance spawned and owns it.
   */
  public async stopOwnedRuntime(): Promise<void> {
    if (!this.ownedByApp || !this.childProcess) {
      return;
    }

    this.isShuttingDown = true;
    const pid = this.childProcess.pid;
    this.logMainEvent(`Stopping owned Python Runtime process (PID=${pid})...`);

    try {
      if (process.platform === 'win32' && pid) {
        try {
          execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
            windowsHide: true,
            timeout: 4000,
          });
        } catch {
          this.childProcess.kill();
        }
      } else {
        this.childProcess.kill('SIGTERM');
      }
    } catch {
      // Ignore if already exited
    } finally {
      this.childProcess = null;
      this.ownedByApp = false;
      this.status = 'stopped';
    }
  }

  public async restartRuntime(): Promise<RuntimeManagerState> {
    this.logMainEvent('User requested Python Runtime restart...');
    if (this.ownedByApp && this.childProcess) {
      await this.stopOwnedRuntime();
    }
    return this.ensureStarted();
  }
}
