import { loggerService } from '@logger'
import { isLinux, isWin, isWin7 } from '@main/core/platform'
import { loadOcrImage } from '@main/utils/ocr'
import type { ImageFileMetadata, OcrResult, OcrSystemConfig, SupportedOcrFile } from '@types'
import { isImageFileMetadata } from '@types'

import { OcrBaseService } from './OcrBaseService'

const logger = loggerService.withContext('SystemOcrService')
export class SystemOcrService extends OcrBaseService {
  constructor() {
    super()
  }

  private async ocrImage(file: ImageFileMetadata, options?: OcrSystemConfig): Promise<OcrResult> {
    if (isLinux) {
      return { text: '' }
    }
    if (isWin7) {
      logger.warn('System OCR native module is disabled on Windows 7')
      throw new Error('System OCR is not supported on Windows 7')
    }
    const buffer = await loadOcrImage(file)
    const { OcrAccuracy, recognize } = await import('@napi-rs/system-ocr')
    const langs = isWin ? options?.langs : undefined
    const result = await recognize(buffer, OcrAccuracy.Accurate, langs)
    return { text: result.text }
  }

  public ocr = async (file: SupportedOcrFile, options?: OcrSystemConfig): Promise<OcrResult> => {
    if (isImageFileMetadata(file)) {
      return this.ocrImage(file, options)
    } else {
      throw new Error('Unsupported file type, currently only image files are supported')
    }
  }
}

export const systemOcrService = new SystemOcrService()
