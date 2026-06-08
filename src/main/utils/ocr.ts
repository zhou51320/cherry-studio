import { loggerService } from '@logger'
import { isWin7 } from '@main/core/platform'
import type { ImageFileMetadata } from '@types'
import { readFile } from 'fs/promises'

const logger = loggerService.withContext('OcrImageUtils')

const preprocessImage = async (buffer: Buffer): Promise<Buffer> => {
  if (isWin7) {
    logger.warn('Skipping sharp OCR image preprocessing on Windows 7')
    return buffer
  }

  // Delayed loading: The Sharp module is only loaded when the OCR functionality is actually needed, not at app startup
  const sharp = (await import('sharp')).default
  return sharp(buffer)
    .grayscale() // 转为灰度
    .normalize()
    .sharpen()
    .png({ quality: 100 })
    .toBuffer()
}

/**
 * 加载并预处理OCR图像
 * @param file - 图像文件元数据
 * @returns 预处理后的图像Buffer
 * @throws {Error} 当文件不存在或无法读取时抛出错误；当图像预处理失败时抛出错误
 *
 * 预处理步骤:
 * 1. 读取图像文件
 * 2. 转换为灰度图
 * 3. 后续可扩展其他预处理步骤
 */
export const loadOcrImage = async (file: ImageFileMetadata): Promise<Buffer> => {
  const buffer = await readFile(file.path)
  return preprocessImage(buffer)
}
