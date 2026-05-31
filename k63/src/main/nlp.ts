import { getCanonicalSeriesName, getAllCustomRules, addLearningSample } from './database'
import type { CustomRule } from '../shared/types'

export interface ParsedComicInfo {
  seriesName: string
  chapterNumber: number | null
  chapterTitle: string
  ruleApplied?: string
}

interface ClassificationResult {
  class: string
  confidence: number
}

class NaiveBayesClassifier {
  private wordCounts: Map<string, Map<string, number>> = new Map()
  private classCounts: Map<string, number> = new Map()
  private totalDocs: number = 0

  train(text: string, category: string, weight: number = 1) {
    const words = this.tokenize(text)
    
    if (!this.wordCounts.has(category)) {
      this.wordCounts.set(category, new Map())
    }
    
    const categoryWords = this.wordCounts.get(category)!
    words.forEach(word => {
      categoryWords.set(word, (categoryWords.get(word) || 0) + weight)
    })
    
    this.classCounts.set(category, (this.classCounts.get(category) || 0) + weight)
    this.totalDocs += weight
  }

  classify(text: string): ClassificationResult[] {
    const words = this.tokenize(text)
    const results: ClassificationResult[] = []
    
    for (const category of this.classCounts.keys()) {
      const classPrior = Math.log((this.classCounts.get(category) || 0) / this.totalDocs)
      let logLikelihood = 0
      
      const categoryWords = this.wordCounts.get(category)
      const totalWordsInCategory = Array.from(categoryWords?.values() || []).reduce((a, b) => a + b, 0)
      const vocabSize = this.wordCounts.size
      
      words.forEach(word => {
        const wordCount = categoryWords?.get(word) || 0
        logLikelihood += Math.log((wordCount + 1) / (totalWordsInCategory + vocabSize))
      })
      
      results.push({
        class: category,
        confidence: classPrior + logLikelihood
      })
    }
    
    return results.sort((a, b) => b.confidence - a.confidence)
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0)
  }
}

const seriesClassifier = new NaiveBayesClassifier()
const trainingData = [
  { text: '火影忍者 鸣人 佐助 木叶 卡卡西 宇智波 漩涡 九尾 忍 Naruto', series: '火影忍者' },
  { text: '海贼王 路飞 草帽 航海王 索隆 山治 娜美 罗宾 乔巴 海盗 One Piece', series: '海贼王' },
  { text: '龙珠 孙悟空 赛亚人 贝吉塔 弗利萨 悟饭 特兰克斯 龟派气功 Dragon Ball', series: '龙珠' },
  { text: '进击的巨人 艾伦 调查兵团 三笠 阿尔敏 巨人 自由之翼 Attack on Titan', series: '进击的巨人' },
  { text: '鬼灭之刃 炭治郎 祢豆子 鬼杀队 我妻善逸 伊之助 柱 呼吸法 Demon Slayer', series: '鬼灭之刃' },
  { text: '咒术回战 虎杖 五条悟 伏黑惠 钉崎 咒灵 领域展开 Jujutsu Kaisen', series: '咒术回战' },
  { text: '电锯人 电次 玛奇玛 帕瓦 早川秋 恶魔猎人 啵奇塔 Chainsaw Man', series: '电锯人' },
  { text: '间谍过家家 劳埃德 约尔 阿尼亚 黄昏 荆棘公主 邦德 福杰 Spy x Family', series: '间谍过家家' },
  { text: '灌篮高手 樱木 流川 篮球 赤木 三井 宫城 湘北 灌篮', series: '灌篮高手' },
  { text: '名侦探柯南 工藤新一 毛利兰 灰原哀 毛利小五郎 黑衣组织 Detective Conan', series: '名侦探柯南' },
  { text: '死神 黑崎一护 露琪亚 恋次 尸魂界 斩魄刀 护廷十三队 Bleach', series: '死神' },
  { text: '银魂 坂田银时 神乐 新八 万事屋 真选组 攘夷 Gintama', series: '银魂' },
  { text: '全职猎人 小杰 奇犽 酷拉皮卡 雷欧力 猎人 念能力 Hunter x Hunter', series: '全职猎人' },
  { text: '钢之炼金术师 爱德华 阿尔冯斯 炼金 等价交换 军部 Fullmetal Alchemist', series: '钢之炼金术师' },
  { text: '一拳超人 琦玉 杰诺斯 英雄协会 怪人 一拳 One Punch Man', series: '一拳超人' },
  { text: '我的英雄学院 绿谷出久 爆豪 欧尔麦特 个性 雄英 My Hero Academia', series: '我的英雄学院' },
  { text: '妖精的尾巴 纳兹 露西 哈比 魔导士 公会 Fairy Tail', series: '妖精的尾巴' },
  { text: '家庭教师 沢田纲吉 里包恩 彭格列 指环 黑手党 Reborn', series: '家庭教师' },
  { text: '东京喰种 金木研 董香 喰种 CCG 青铜树 Tokyo Ghoul', series: '东京喰种' },
  { text: '黑色四叶草 亚斯塔 尤诺 魔法书 魔法骑士 黑色暴牛 Black Clover', series: '黑色四叶草' },
]

trainingData.forEach(({ text, series }) => {
  seriesClassifier.train(text, series)
})

const ocrCorrectionMap: Array<{ pattern: RegExp; replace: string }> = [
  { pattern: /第(\d+)[语话活诰]/g, replace: '第$1话' },
  { pattern: /(\d+)\s*[语话活诰]/g, replace: '$1话' },
  { pattern: /[巻卷]/g, replace: '卷' },
  { pattern: /[葷葦華]/g, replace: '章' },
  { pattern: /[話]/g, replace: '话' },
  { pattern: /\s+/g, replace: ' ' },
]

let customRulesCache: CustomRule[] = []
let rulesCacheTimestamp = 0
const CACHE_TTL = 5000

function refreshCustomRules() {
  const now = Date.now()
  if (now - rulesCacheTimestamp > CACHE_TTL) {
    try {
      customRulesCache = getAllCustomRules()
      rulesCacheTimestamp = now
    } catch {
      customRulesCache = []
    }
  }
  return customRulesCache
}

export function correctOCRText(text: string): string {
  let result = text
  for (const correction of ocrCorrectionMap) {
    result = result.replace(correction.pattern, correction.replace)
  }
  return result.trim()
}

function applyCustomRules(text: string, ruleType: string): { matched: boolean; result: string; ruleId?: number } {
  const rules = refreshCustomRules().filter(r => r.ruleType === ruleType && r.enabled)
  
  for (const rule of rules) {
    try {
      const regex = new RegExp(rule.pattern, 'gi')
      if (regex.test(text)) {
        if (rule.replacement) {
          const result = text.replace(regex, rule.replacement)
          return { matched: true, result, ruleId: rule.id }
        }
        const match = text.match(regex)
        if (match && match[1]) {
          return { matched: true, result: match[1], ruleId: rule.id }
        }
      }
    } catch (e) {
      console.warn(`Invalid regex in rule ${rule.id}:`, rule.pattern)
    }
  }
  
  return { matched: false, result: text }
}

export function parseChapterNumber(text: string): number | null {
  const correctedText = correctOCRText(text)
  
  const customResult = applyCustomRules(correctedText, 'chapter')
  if (customResult.matched) {
    const num = parseInt(customResult.result, 10)
    if (!isNaN(num)) return num
  }
  
  const patterns = [
    /第\s*(\d+)\s*[话章节篇]/i,
    /(\d+)\s*[话章节篇]/i,
    /Chapter\s*(\d+)/i,
    /CH\.?\s*(\d+)/i,
    /Vol\.?\s*(\d+)/i,
    /^(\d+)[\-_\s]/,
    /[\-_\s](\d+)[\-_\s]/,
    /(\d{2,})/,
  ]

  for (const pattern of patterns) {
    const match = correctedText.match(pattern)
    if (match) {
      return parseInt(match[1], 10)
    }
  }
  
  return null
}

export function extractTitle(text: string, chapterNum: number | null): string {
  const customResult = applyCustomRules(text, 'title')
  if (customResult.matched) {
    return customResult.result.slice(0, 50)
  }
  
  let cleaned = text
  
  if (chapterNum !== null) {
    cleaned = cleaned.replace(new RegExp(`第?\\s*${chapterNum}\\s*[话话章节]?`, 'gi'), '')
    cleaned = cleaned.replace(new RegExp(`Chapter\\s*${chapterNum}`, 'gi'), '')
  }
  
  cleaned = cleaned
    .replace(/[^\w\u4e00-\u9fa5\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  
  const lines = cleaned.split('\n').filter(line => line.trim().length > 3)
  
  if (lines.length > 0) {
    return lines[0].trim().slice(0, 50)
  }
  
  return cleaned.slice(0, 30) || '无标题'
}

function canonicalizeSeriesName(seriesName: string): string {
  try {
    return getCanonicalSeriesName(seriesName)
  } catch {
    return seriesName
  }
}

export function predictSeriesName(text: string, existingSeries: string[] = []): string {
  const normalizedExisting = existingSeries.map(s => canonicalizeSeriesName(s))
  
  const customResult = applyCustomRules(text, 'series')
  if (customResult.matched) {
    return canonicalizeSeriesName(customResult.result)
  }
  
  if (normalizedExisting.length > 0) {
    const seriesCounts = new Map<string, number>()
    normalizedExisting.forEach(s => {
      seriesCounts.set(s, (seriesCounts.get(s) || 0) + 1)
    })
    
    const sortedSeries = Array.from(seriesCounts.entries()).sort((a, b) => b[1] - a[1])
    if (sortedSeries.length > 0 && sortedSeries[0][1] > normalizedExisting.length / 2) {
      return sortedSeries[0][0]
    }
  }
  
  const results = seriesClassifier.classify(text)
  if (results.length > 0 && results[0].confidence > -25) {
    return canonicalizeSeriesName(results[0].class)
  }
  
  const commonPrefix = findCommonPrefix(normalizedExisting)
  if (commonPrefix && commonPrefix.length > 1) {
    return canonicalizeSeriesName(commonPrefix)
  }
  
  return '未知系列'
}

function findCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return ''
  if (strings.length === 1) return strings[0]
  
  let prefix = strings[0]
  for (let i = 1; i < strings.length; i++) {
    while (strings[i].indexOf(prefix) !== 0) {
      prefix = prefix.slice(0, -1)
      if (prefix === '') return ''
    }
  }
  return prefix
}

export function parseComicInfo(
  ocrText: string,
  fileName: string,
  allFileNames: string[] = []
): ParsedComicInfo {
  const correctedOCR = correctOCRText(ocrText || '')
  const correctedFileName = correctOCRText(fileName)
  const combinedText = `${correctedFileName} ${correctedOCR}`
  
  const existingSeries = allFileNames
    .map(f => f.match(/^(.+?)[_\-\s第\d\[\]]/)?.[1])
    .filter(Boolean) as string[]
  
  let seriesName = predictSeriesNameFromFilename(correctedFileName, existingSeries)
  if (seriesName === '未知系列') {
    seriesName = predictSeriesName(combinedText, existingSeries)
  }
  
  seriesName = canonicalizeSeriesName(seriesName)
  
  const chapterNumber = parseChapterNumber(combinedText)
  const chapterTitle = extractTitle(correctedOCR || correctedFileName, chapterNumber)
  
  const customReplace = applyCustomRules(combinedText, 'replace')
  let finalSeriesName = seriesName
  if (customReplace.matched) {
    finalSeriesName = canonicalizeSeriesName(customReplace.result)
  }
  
  return {
    seriesName: finalSeriesName,
    chapterNumber,
    chapterTitle
  }
}

function predictSeriesNameFromFilename(fileName: string, existingSeries: string[]): string {
  const normalizedExisting = existingSeries.map(s => canonicalizeSeriesName(s))
  
  if (normalizedExisting.length > 0) {
    const seriesCounts = new Map<string, number>()
    normalizedExisting.forEach(s => {
      seriesCounts.set(s, (seriesCounts.get(s) || 0) + 1)
    })
    
    const sortedSeries = Array.from(seriesCounts.entries()).sort((a, b) => b[1] - a[1])
    if (sortedSeries.length > 0 && sortedSeries[0][1] > normalizedExisting.length / 2) {
      return sortedSeries[0][0]
    }
  }
  
  const folderMatch = fileName.match(/[【\[]([^【\[\]]+)[】\]]/)
  if (folderMatch) {
    return canonicalizeSeriesName(folderMatch[1])
  }
  
  const prefixMatch = fileName.match(/^(.+?)[_\-\s第\d]/)
  if (prefixMatch && prefixMatch[1].length >= 2) {
    return canonicalizeSeriesName(prefixMatch[1])
  }
  
  return '未知系列'
}

export function learnFromCorrection(
  inputText: string,
  correctSeries: string,
  correctChapter?: number,
  correctTitle?: string
): void {
  const canonicalName = canonicalizeSeriesName(correctSeries)
  
  seriesClassifier.train(inputText, canonicalName, 3)
  
  try {
    addLearningSample(inputText, canonicalName, correctChapter, correctTitle)
  } catch (e) {
    console.warn('Failed to save learning sample:', e)
  }
}

export function generateStandardFileName(
  info: ParsedComicInfo,
  extension: string
): string {
  const parts: string[] = []
  
  parts.push(`[${info.seriesName}]`)
  
  if (info.chapterNumber !== null) {
    const paddedChapter = info.chapterNumber.toString().padStart(3, '0')
    parts.push(`第${paddedChapter}话`)
  }
  
  if (info.chapterTitle) {
    parts.push(info.chapterTitle)
  }
  
  const sanitized = parts.join(' ').replace(/[<>:"/\\|?*]/g, '')
  return `${sanitized}${extension}`
}
