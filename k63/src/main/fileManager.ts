import fs from 'fs'
import path from 'path'
import type { ImageFile } from '../shared/types'

export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']

export function scanFolder(folderPath: string): ImageFile[] {
  const files: ImageFile[] = []
  
  if (!fs.existsSync(folderPath)) {
    return files
  }
  
  const entries = fs.readdirSync(folderPath, { withFileTypes: true })
  
  for (const entry of entries) {
    if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (IMAGE_EXTENSIONS.includes(ext)) {
        const filePath = path.join(folderPath, entry.name)
        const stats = fs.statSync(filePath)
        
        files.push({
          id: Buffer.from(filePath).toString('base64'),
          originalName: entry.name,
          filePath,
          fileSize: stats.size,
          extension: ext,
          status: 'pending',
          selected: true
        })
      }
    }
  }
  
  return files.sort((a, b) => a.originalName.localeCompare(b.originalName))
}

export function renameFile(
  filePath: string,
  newName: string
): { success: boolean; newPath?: string; error?: string } {
  try {
    const folderPath = path.dirname(filePath)
    let newPath = path.join(folderPath, newName)
    
    if (fs.existsSync(newPath) && newPath !== filePath) {
      const baseName = path.basename(newName, path.extname(newName))
      const ext = path.extname(newName)
      let counter = 1
      
      while (fs.existsSync(path.join(folderPath, `${baseName}_${counter}${ext}`))) {
        counter++
      }
      
      newPath = path.join(folderPath, `${baseName}_${counter}${ext}`)
    }
    
    if (newPath !== filePath) {
      fs.renameSync(filePath, newPath)
    }
    
    return { success: true, newPath }
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

export function revertRename(newFilePath: string, originalName: string): { success: boolean; error?: string } {
  try {
    const folderPath = path.dirname(newFilePath)
    const originalPath = path.join(folderPath, originalName)
    
    if (!fs.existsSync(newFilePath)) {
      return { success: false, error: 'File not found at new path' }
    }
    
    if (fs.existsSync(originalPath) && originalPath !== newFilePath) {
      return { success: false, error: 'Original path already occupied' }
    }
    
    if (originalPath !== newFilePath) {
      fs.renameSync(newFilePath, originalPath)
    }
    
    return { success: true }
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

export function getFileAsBase64(filePath: string): string | null {
  try {
    const data = fs.readFileSync(filePath)
    const ext = path.extname(filePath).slice(1).toLowerCase()
    const mimeType = ext === 'jpg' ? 'jpeg' : ext
    return `data:image/${mimeType};base64,${data.toString('base64')}`
  } catch (error) {
    return null
  }
}
