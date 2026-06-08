import { loggerService } from '@logger'
import { isWin7 } from '@main/core/platform'
import type { FileInfo } from '@shared/file/types'
import { readFile } from 'fs/promises'

const logger = loggerService.withContext('FileProcessing:OcrImageUtils')

const preprocessImage = async (buffer: Buffer): Promise<Buffer> => {
  if (isWin7) {
    logger.warn('Skipping sharp OCR image preprocessing on Windows 7')
    return buffer
  }

  const sharp = (await import('sharp')).default
  return sharp(buffer).grayscale().normalize().sharpen().png({ quality: 100 }).toBuffer()
}

export const loadOcrImage = async (file: FileInfo): Promise<Buffer> => {
  const buffer = await readFile(file.path)
  return preprocessImage(buffer)
}
