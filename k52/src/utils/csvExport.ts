import type { BatchResult, Algorithm } from '@/types';
import { ALGORITHM_INFO } from '@/types';

export function generateCSVReport(results: BatchResult[]): string {
  const headers = [
    '序号',
    '图片名称',
    '图片尺寸',
    '算法',
    '处理时间(ms)',
    '卷积核大小',
    '低阈值',
    '高阈值',
    '强度',
    '灰度模式',
    '处理时间',
  ];

  const rows = results.map((result, index) => [
    index + 1,
    result.imageName,
    `${result.imageWidth}x${result.imageHeight}`,
    ALGORITHM_INFO[result.algorithm].name,
    result.processTimeMs.toFixed(2),
    result.parameters.kernelSize,
    result.parameters.lowThreshold,
    result.parameters.highThreshold,
    result.parameters.intensity,
    result.parameters.grayscale ? '是' : '否',
    new Date(result.timestamp).toLocaleString('zh-CN'),
  ]);

  const csvContent = [headers, ...rows]
    .map((row) =>
      row
        .map((cell) => {
          const str = String(cell);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',')
    )
    .join('\n');

  const BOM = '\uFEFF';
  return BOM + csvContent;
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function generateSummaryStats(results: BatchResult[]): {
  algorithm: Algorithm;
  avgTime: number;
  minTime: number;
  maxTime: number;
  totalTime: number;
  count: number;
}[] {
  const grouped = new Map<Algorithm, BatchResult[]>();

  for (const result of results) {
    if (!grouped.has(result.algorithm)) {
      grouped.set(result.algorithm, []);
    }
    grouped.get(result.algorithm)!.push(result);
  }

  return Array.from(grouped.entries()).map(([algorithm, items]) => {
    const times = items.map((r) => r.processTimeMs);
    return {
      algorithm,
      avgTime: times.reduce((a, b) => a + b, 0) / times.length,
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
      totalTime: times.reduce((a, b) => a + b, 0),
      count: times.length,
    };
  });
}

export function generateSummaryCSV(results: BatchResult[]): string {
  const stats = generateSummaryStats(results);

  const headers = [
    '算法',
    '处理图片数',
    '平均时间(ms)',
    '最快时间(ms)',
    '最慢时间(ms)',
    '总耗时(ms)',
  ];

  const rows = stats.map((stat) => [
    ALGORITHM_INFO[stat.algorithm].name,
    stat.count,
    stat.avgTime.toFixed(2),
    stat.minTime.toFixed(2),
    stat.maxTime.toFixed(2),
    stat.totalTime.toFixed(2),
  ]);

  const totalAll = stats.reduce((sum, s) => sum + s.totalTime, 0);
  rows.push(['合计', stats.reduce((sum, s) => sum + s.count, 0), '', '', '', totalAll.toFixed(2)]);

  const csvContent = [headers, ...rows]
    .map((row) =>
      row
        .map((cell) => {
          const str = String(cell);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',')
    )
    .join('\n');

  const BOM = '\uFEFF';
  return BOM + csvContent;
}
