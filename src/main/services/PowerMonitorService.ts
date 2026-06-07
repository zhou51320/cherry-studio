import { loggerService } from '@logger'
import { BaseService, Injectable, Phase, ServicePhase } from '@main/core/lifecycle'
import { isLinux, isMac, isWin } from '@main/core/platform'
import { app, BrowserWindow, powerMonitor } from 'electron'

const logger = loggerService.withContext('PowerMonitorService')

type ShutdownHandler = () => void | Promise<void>
type ElectronShutdownHandlerApi = {
  on: (event: 'shutdown', listener: () => void | Promise<void>) => void
  setWindowHandle: (handle: Buffer) => void
  releaseShutdown: () => boolean
}

// Background phase: this service is non-critical and no other service depends on it.
// powerMonitor is safe to use before app.whenReady() since Electron 26+ (see electron/electron#40888).
// Windows path requires BrowserWindow which still needs app.whenReady() — handled with explicit await.
@Injectable('PowerMonitorService')
@ServicePhase(Phase.Background)
export class PowerMonitorService extends BaseService {
  private shutdownHandlers: ShutdownHandler[] = []

  /**
   * Register a shutdown handler to be called when system shutdown is detected
   */
  public registerShutdownHandler(handler: ShutdownHandler): void {
    this.shutdownHandlers.push(handler)
    logger.info('Shutdown handler registered', { totalHandlers: this.shutdownHandlers.length })
  }

  protected async onInit(): Promise<void> {
    if (isWin) {
      // BrowserWindow cannot be created before app is ready.
      // Background phase starts before app.whenReady(), so we must await it here.
      // This await only blocks this fire-and-forget service, not the rest of bootstrap.
      await app.whenReady()
      await this.initWindowsShutdownHandler()
    } else if (isMac || isLinux) {
      // powerMonitor is available before app.whenReady() since Electron 26+
      this.initElectronPowerMonitor()
    }

    logger.info('PowerMonitorService initialized', { platform: process.platform })
  }

  protected async onStop(): Promise<void> {
    this.shutdownHandlers = []
    logger.info('PowerMonitorService stopped')
  }

  private async executeShutdownHandlers(): Promise<void> {
    logger.info('Executing shutdown handlers', { count: this.shutdownHandlers.length })
    for (const handler of this.shutdownHandlers) {
      try {
        await handler()
      } catch (error) {
        logger.error('Error executing shutdown handler', error as Error)
      }
    }
  }

  private async initWindowsShutdownHandler(): Promise<void> {
    try {
      const ElectronShutdownHandler = await this.loadWindowsShutdownHandler()
      if (!ElectronShutdownHandler) return

      const zeroMemoryWindow = new BrowserWindow({ show: false })
      ElectronShutdownHandler.setWindowHandle(zeroMemoryWindow.getNativeWindowHandle())

      ElectronShutdownHandler.on('shutdown', async () => {
        logger.info('System shutdown event detected (Windows)')
        await this.executeShutdownHandlers()
        ElectronShutdownHandler.releaseShutdown()
      })

      this.registerDisposable(() => {
        if (!zeroMemoryWindow.isDestroyed()) {
          zeroMemoryWindow.destroy()
        }
      })

      logger.info('Windows shutdown handler registered')
    } catch (error) {
      logger.error('Failed to initialize Windows shutdown handler', error as Error)
    }
  }

  private async loadWindowsShutdownHandler(): Promise<ElectronShutdownHandlerApi | null> {
    try {
      const shutdownHandlerModule = await import('@paymoapp/electron-shutdown-handler')
      const shutdownHandler = shutdownHandlerModule.default as
        | ElectronShutdownHandlerApi
        | { default: ElectronShutdownHandlerApi }
      return 'default' in shutdownHandler ? shutdownHandler.default : shutdownHandler
    } catch (error) {
      logger.warn('Windows shutdown handler native module is unavailable; shutdown hooks disabled', {
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  private initElectronPowerMonitor(): void {
    try {
      const shutdownListener = async () => {
        logger.info('System shutdown event detected', { platform: process.platform })
        await this.executeShutdownHandlers()
      }
      powerMonitor.on('shutdown', shutdownListener)
      this.registerDisposable(() => powerMonitor.removeListener('shutdown', shutdownListener))

      logger.info('Electron powerMonitor shutdown listener registered')
    } catch (error) {
      logger.error('Failed to initialize Electron powerMonitor', error as Error)
    }
  }
}
