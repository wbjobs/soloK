export const CLASS_COLORS = {
  shipwreck: '#e74c3c',
  pipeline: '#27ae60',
  reef: '#f39c12',
  fish_school: '#3498db',
  unknown: '#95a5a6',
}

export const CLASS_NAMES_CN = {
  shipwreck: '沉船',
  pipeline: '管线',
  reef: '礁石',
  fish_school: '鱼群',
  unknown: '未知',
}

export const MISSION_STATUS = {
  pending: '待处理',
  uploaded: '已上传',
  processing: '处理中',
  processed: '已处理',
  error: '错误',
}

export const STATUS_COLORS = {
  pending: 'bg-gray-500',
  uploaded: 'bg-blue-500',
  processing: 'bg-yellow-500',
  processed: 'bg-green-500',
  error: 'bg-red-500',
}

export function getClassColor(className) {
  return CLASS_COLORS[className] || CLASS_COLORS.unknown
}

export function getClassCN(className) {
  return CLASS_NAMES_CN[className] || className
}

export function formatTimestamp(ts) {
  if (!ts) return 'N/A'
  const date = new Date(ts)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function generateWaterfallFromPings(pings, numSamples) {
  if (!pings || pings.length === 0) return null

  const numPings = Math.min(pings.length, 500)
  const canvas = document.createElement('canvas')
  canvas.width = numSamples
  canvas.height = numPings
  const ctx = canvas.getContext('2d')
  const imageData = ctx.createImageData(numSamples, numPings)

  for (let i = 0; i < numPings; i++) {
    const ping = pings[i]
    const data = ping.port_data.concat(ping.starboard_data)
    const half = numSamples / 2

    for (let j = 0; j < numSamples && j < data.length; j++) {
      const idx = (i * numSamples + j) * 4
      const val = Math.min(255, Math.max(0, data[j]))
      imageData.data[idx] = val
      imageData.data[idx + 1] = val
      imageData.data[idx + 2] = val
      imageData.data[idx + 3] = 255
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}
