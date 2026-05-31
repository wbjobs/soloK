let cvInstance = null
let loading = false
let loadPromise = null

export async function loadOpenCV() {
  if (cvInstance) return cvInstance
  if (loading && loadPromise) return loadPromise

  loading = true
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://docs.opencv.org/4.x/opencv.js'
    script.async = true
    script.onload = () => {
      if (window.cv) {
        cvInstance = window.cv
        loading = false
        resolve(cvInstance)
      } else {
        reject(new Error('OpenCV.js loaded but cv not found'))
      }
    }
    script.onerror = () => {
      loading = false
      reject(new Error('Failed to load OpenCV.js'))
    }
    document.body.appendChild(script)
  })

  return loadPromise
}

export function histogramEqualization(imageData) {
  if (!cvInstance || !imageData) return imageData

  const src = cvInstance.matFromImageData(imageData)
  const dst = new cvInstance.Mat()
  const gray = new cvInstance.Mat()

  cvInstance.cvtColor(src, gray, cvInstance.COLOR_RGBA2GRAY)
  cvInstance.equalizeHist(gray, dst)

  const result = new cvInstance.Mat()
  cvInstance.cvtColor(dst, result, cvInstance.COLOR_GRAY2RGBA)

  const resultData = new ImageData(
    new Uint8ClampedArray(result.data),
    result.cols,
    result.rows
  )

  src.delete()
  dst.delete()
  gray.delete()
  result.delete()

  return resultData
}

export function medianFilter(imageData, kernelSize = 3) {
  if (!cvInstance || !imageData) return imageData

  const src = cvInstance.matFromImageData(imageData)
  const dst = new cvInstance.Mat()

  const ksize = kernelSize % 2 === 0 ? kernelSize + 1 : kernelSize
  cvInstance.medianBlur(src, dst, ksize)

  const resultData = new ImageData(
    new Uint8ClampedArray(dst.data),
    dst.cols,
    dst.rows
  )

  src.delete()
  dst.delete()

  return resultData
}

export function claheEnhance(imageData, clipLimit = 2.0, tileGridSize = 8) {
  if (!cvInstance || !imageData) return imageData

  const src = cvInstance.matFromImageData(imageData)
  const dst = new cvInstance.Mat()
  const gray = new cvInstance.Mat()

  cvInstance.cvtColor(src, gray, cvInstance.COLOR_RGBA2GRAY)

  const clahe = new cvInstance.CLAHE(clipLimit, new cvInstance.Size(tileGridSize, tileGridSize))
  clahe.apply(gray, dst)
  clahe.delete()

  const result = new cvInstance.Mat()
  cvInstance.cvtColor(dst, result, cvInstance.COLOR_GRAY2RGBA)

  const resultData = new ImageData(
    new Uint8ClampedArray(result.data),
    result.cols,
    result.rows
  )

  src.delete()
  dst.delete()
  gray.delete()
  result.delete()

  return resultData
}

export function bilateralFilter(imageData, d = 9, sigmaColor = 75, sigmaSpace = 75) {
  if (!cvInstance || !imageData) return imageData

  const src = cvInstance.matFromImageData(imageData)
  const dst = new cvInstance.Mat()

  cvInstance.bilateralFilter(src, dst, d, sigmaColor, sigmaSpace)

  const resultData = new ImageData(
    new Uint8ClampedArray(dst.data),
    dst.cols,
    dst.rows
  )

  src.delete()
  dst.delete()

  return resultData
}

export function computeHistogram(imageData) {
  if (!cvInstance || !imageData) return null

  const src = cvInstance.matFromImageData(imageData)
  const gray = new cvInstance.Mat()
  cvInstance.cvtColor(src, gray, cvInstance.COLOR_RGBA2GRAY)

  const hist = new cvInstance.Mat()
  const channels = [0]
  const histSize = [256]
  const ranges = [0, 256]
  const mask = new cvInstance.Mat()

  cvInstance.calcHist([gray], channels, mask, hist, histSize, ranges)

  const histData = Array.from(hist.data32F)

  src.delete()
  gray.delete()
  hist.delete()
  mask.delete()

  return histData
}

export default {
  loadOpenCV,
  histogramEqualization,
  medianFilter,
  claheEnhance,
  bilateralFilter,
  computeHistogram,
}
