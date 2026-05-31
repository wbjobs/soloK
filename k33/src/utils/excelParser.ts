import * as XLSX from 'xlsx';
import { ShipSchedule } from '../types';
import { generateId } from './math';

export const parseShipSchedule = async (file: File): Promise<ShipSchedule[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);
        
        const schedules: ShipSchedule[] = jsonData.map((row: any, index: number) => {
          const shipName = row['船名'] || row['shipName'] || row['Ship Name'] || `船舶-${index + 1}`;
          const arrivalTime = parseTime(row['到港时间'] || row['arrivalTime'] || row['Arrival Time'] || 0);
          const departureTime = parseTime(row['离港时间'] || row['departureTime'] || row['Departure Time'] || 3600);
          const containerCount = parseInt(row['集装箱数'] || row['containerCount'] || row['Container Count'] || 100);
          const quayCraneId = row['岸桥ID'] || row['quayCraneId'] || row['Quay Crane'] || `qc-${index % 4 + 1}`;
          
          const containers: string[] = [];
          for (let i = 0; i < containerCount; i++) {
            containers.push(`CNT-${shipName}-${i.toString().padStart(4, '0')}`);
          }
          
          return {
            id: generateId('ship-'),
            shipName,
            arrivalTime,
            departureTime,
            containerCount,
            quayCraneId,
            containers,
          };
        });
        
        resolve(schedules);
      } catch (error) {
        reject(new Error('Excel文件解析失败: ' + (error as Error).message));
      }
    };
    
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  });
};

const parseTime = (value: any): number => {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    if (value.includes(':')) {
      const parts = value.split(':');
      if (parts.length === 3) {
        return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
      } else if (parts.length === 2) {
        return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60;
      }
    }
    const num = parseFloat(value);
    if (!isNaN(num)) return num;
  }
  return 0;
};

export const exportShipScheduleTemplate = (): void => {
  const wb = XLSX.utils.book_new();
  const data = [
    ['船名', '到港时间', '离港时间', '集装箱数', '岸桥ID'],
    ['中远之星', 0, 7200, 200, 'qc-1'],
    ['海丝号', 3600, 10800, 150, 'qc-2'],
    ['丝路之舟', 7200, 14400, 180, 'qc-3'],
    ['远洋先锋', 10800, 18000, 160, 'qc-4'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, '船舶计划');
  XLSX.writeFile(wb, '船舶靠泊计划模板.xlsx');
};
