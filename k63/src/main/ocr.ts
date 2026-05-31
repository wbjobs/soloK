import Tesseract from 'tesseract.js'

let worker: Tesseract.Worker | null = null

export async function initOCR(): Promise<void> {
  worker = await Tesseract.createWorker(['chi_sim', 'eng'])
}

export async function recognizeImage(imagePath: string): Promise<string> {
  if (!worker) {
    throw new Error('OCR worker not initialized')
  }

  try {
    const result = await worker.recognize(imagePath)
    return result.data.text.trim()
  } catch (error) {
    console.error(`OCR recognition failed for ${imagePath}:`, error)
    return ''
  }
}

export async function recognizeImages(
  imagePaths: string[],
  onProgress?: (current: number, total: number, fileName: string) => void
): Promise<Map<string, string>> {
  const results = new Map<string, string>()
  const total = imagePaths.length

  for (let i = 0; i < imagePaths.length; i++) {
    const imagePath = imagePaths[i]
    const fileName = imagePath.split(/[/\\]/).pop() || ''
    
    if (onProgress) {
      onProgress(i + 1, total, fileName)
    }

    try {
      const text = await recognizeImage(imagePath)
      results.set(imagePath, text)
    } catch (error) {
      console.error(`Failed to process ${imagePath}:`, error)
      results.set(imagePath, '')
    }
  }

  return results
}

export async function terminateOCR(): Promise<void> {
  if (worker) {
    await worker.terminate()
    worker = null
  }
}
