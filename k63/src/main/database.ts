import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import type { RenameHistory, SeriesAlias, CustomRule } from '../shared/types'

let db: Database.Database | null = null

export function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'comic-renamer.db')
  db = new Database(dbPath)
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS rename_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_name TEXT NOT NULL,
      new_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      folder_path TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_reverted BOOLEAN DEFAULT 0
    );
    
    CREATE INDEX IF NOT EXISTS idx_folder_path ON rename_history(folder_path);
    CREATE INDEX IF NOT EXISTS idx_created_at ON rename_history(created_at);

    CREATE TABLE IF NOT EXISTS series_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_name TEXT NOT NULL,
      alias_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(canonical_name, alias_name)
    );

    CREATE INDEX IF NOT EXISTS idx_alias_name ON series_aliases(alias_name);

    CREATE TABLE IF NOT EXISTS custom_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_type TEXT NOT NULL,
      pattern TEXT NOT NULL,
      replacement TEXT,
      priority INTEGER DEFAULT 0,
      enabled BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS learning_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      input_text TEXT NOT NULL,
      series_name TEXT NOT NULL,
      chapter_number INTEGER,
      chapter_title TEXT,
      corrected_by_user BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      use_count INTEGER DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_learning_series ON learning_data(series_name);
  `)
  
  initDefaultData();
  
  return db
}

function initDefaultData() {
  if (!db) return;
  
  const defaultAliases = [
    ['海贼王', 'One Piece'],
    ['海贼王', '航海王'],
    ['火影忍者', 'Naruto'],
    ['龙珠', 'Dragon Ball'],
    ['进击的巨人', 'Attack on Titan'],
    ['鬼灭之刃', 'Demon Slayer'],
    ['咒术回战', 'Jujutsu Kaisen'],
    ['电锯人', 'Chainsaw Man'],
    ['间谍过家家', 'Spy x Family'],
    ['名侦探柯南', 'Detective Conan'],
    ['名侦探柯南', 'Case Closed'],
    ['我的英雄学院', 'My Hero Academia'],
    ['全职猎人', 'Hunter x Hunter'],
    ['东京喰种', '东京食尸鬼'],
    ['钢之炼金术师', 'Fullmetal Alchemist'],
  ];
  
  const checkStmt = db.prepare('SELECT COUNT(*) as count FROM series_aliases WHERE canonical_name = ? AND alias_name = ?');
  
  const insertStmt = db.prepare('INSERT OR IGNORE INTO series_aliases (canonical_name, alias_name) VALUES (?, ?)');
  
  defaultAliases.forEach(([canonical, alias]) => {
    const result = checkStmt.get(canonical, alias) as { count: number };
    if (result.count === 0) {
      insertStmt.run(canonical, alias);
      insertStmt.run(alias, canonical);
    }
  });
}

export function getAllSeriesAliases(): SeriesAlias[] {
  if (!db) throw new Error('Database not initialized');
  
  const stmt = db.prepare(`
    SELECT id, canonical_name as canonicalName, alias_name as aliasName
    FROM series_aliases
    ORDER BY canonical_name
  `);
  
  return stmt.all() as SeriesAlias[];
}

export function addSeriesAlias(canonicalName: string, aliasName: string): number {
  if (!db) throw new Error('Database not initialized');
  
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO series_aliases (canonical_name, alias_name)
    VALUES (?, ?)
  `);
  
  insertStmt.run(canonicalName, aliasName);
  insertStmt.run(aliasName, canonicalName);
  
  const result = db.prepare('SELECT id FROM series_aliases WHERE canonical_name = ? AND alias_name = ?')
    .get(canonicalName, aliasName) as { id: number };
  return result?.id || 0;
}

export function deleteSeriesAlias(id: number): void {
  if (!db) throw new Error('Database not initialized');
  
  const alias = db.prepare('SELECT canonical_name, alias_name FROM series_aliases WHERE id = ?').get(id) as any;
  if (alias) {
    db.prepare('DELETE FROM series_aliases WHERE canonical_name = ? AND alias_name = ?').run(alias.alias_name, alias.canonical_name);
    db.prepare('DELETE FROM series_aliases WHERE id = ?').run(id);
  }
}

export function getCanonicalSeriesName(inputName: string): string {
  if (!db) return inputName;
  
  const stmt = db.prepare(`
    SELECT canonical_name as canonicalName
    FROM series_aliases
    WHERE alias_name = ?
    LIMIT 1
  `);
  
  const result = stmt.get(inputName) as { canonicalName: string } | undefined;
  return result?.canonicalName || inputName;
}

export function getAllCustomRules(): CustomRule[] {
  if (!db) throw new Error('Database not initialized');
  
  const stmt = db.prepare(`
    SELECT id, rule_type as ruleType, pattern, replacement, priority, enabled
    FROM custom_rules
    ORDER BY priority DESC, created_at DESC
  `);
  
  return stmt.all() as CustomRule[];
}

export function addCustomRule(
  ruleType: string,
  pattern: string,
  replacement?: string,
  priority: number = 0
): number {
  if (!db) throw new Error('Database not initialized');
  
  const stmt = db.prepare(`
    INSERT INTO custom_rules (rule_type, pattern, replacement, priority)
    VALUES (?, ?, ?, ?)
  `);
  
  const result = stmt.run(ruleType, pattern, replacement || null, priority);
  return Number(result.lastInsertRowid);
}

export function deleteCustomRule(id: number): void {
  if (!db) throw new Error('Database not initialized');
  
  db.prepare('DELETE FROM custom_rules WHERE id = ?').run(id);
}

export function toggleCustomRule(id: number): void {
  if (!db) throw new Error('Database not initialized');
  
  db.prepare('UPDATE custom_rules SET enabled = NOT enabled WHERE id = ?').run(id);
}

export function addLearningSample(
  inputText: string,
  seriesName: string,
  chapterNumber?: number,
  chapterTitle?: string
): number {
  if (!db) throw new Error('Database not initialized');
  
  const existing = db.prepare(`
    SELECT id, use_count as useCount
    FROM learning_data
    WHERE input_text = ? AND series_name = ?
  `).get(inputText, seriesName) as any;
  
  if (existing) {
    db.prepare(`
      UPDATE learning_data 
      SET use_count = use_count + 1
      WHERE id = ?
    `).run(existing.id);
    return existing.id;
  }
  
  const stmt = db.prepare(`
    INSERT INTO learning_data (input_text, series_name, chapter_number, chapter_title)
    VALUES (?, ?, ?, ?)
  `);
  
  const result = stmt.run(inputText, seriesName, chapterNumber || null, chapterTitle || null);
  return Number(result.lastInsertRowid);
}

export function getLearningDataBySeries(seriesName: string): Array<{ inputText: string; weight: number }> {
  if (!db) return [];
  
  const stmt = db.prepare(`
    SELECT input_text as inputText, use_count as weight
    FROM learning_data
    WHERE series_name = ?
    ORDER BY use_count DESC
    LIMIT 100
  `);
  
  return stmt.all(seriesName) as any[];
}

export function getAllLearningSeries(): string[] {
  if (!db) return [];
  
  const stmt = db.prepare(`
    SELECT DISTINCT series_name as seriesName
    FROM learning_data
    ORDER BY SUM(use_count) DESC
    LIMIT 50
  `);
  
  const rows = stmt.all() as { seriesName: string }[];
  return rows.map(r => r.seriesName);
}

export function addRenameRecord(
  originalName: string,
  newName: string,
  filePath: string,
  folderPath: string
): number {
  if (!db) throw new Error('Database not initialized')
  
  try {
    const stmt = db.prepare(`
      INSERT INTO rename_history (original_name, new_name, file_path, folder_path)
      VALUES (?, ?, ?, ?)
    `)
    
    const result = stmt.run(originalName, newName, filePath, folderPath)
    return Number(result.lastInsertRowid)
  } catch (error) {
    console.error('Failed to add rename record:', error)
    throw error
  }
}

export function batchAddRenameRecords(
  records: Array<{ originalName: string; newName: string; filePath: string; folderPath: string }>
): number[] {
  if (!db) throw new Error('Database not initialized')
  
  const ids: number[] = []
  const database = db
  
  const insertMany = database.transaction((recordList: typeof records) => {
    const stmt = database.prepare(`
      INSERT INTO rename_history (original_name, new_name, file_path, folder_path)
      VALUES (@originalName, @newName, @filePath, @folderPath)
    `)
    
    for (const record of recordList) {
      const result = stmt.run(record)
      ids.push(Number(result.lastInsertRowid))
    }
  })
  
  try {
    insertMany(records)
    return ids
  } catch (error) {
    console.error('Failed to batch add rename records:', error)
    throw error
  }
}

export function markAsReverted(id: number): void {
  if (!db) throw new Error('Database not initialized')
  
  const stmt = db.prepare(`
    UPDATE rename_history SET is_reverted = 1 WHERE id = ? AND is_reverted = 0
  `)
  
  stmt.run(id)
}

export function batchMarkAsReverted(ids: number[]): number {
  if (!db) throw new Error('Database not initialized')
  
  if (ids.length === 0) return 0
  
  const placeholders = ids.map(() => '?').join(',')
  const stmt = db.prepare(`
    UPDATE rename_history SET is_reverted = 1 
    WHERE id IN (${placeholders}) AND is_reverted = 0
  `)
  
  const result = stmt.run(...ids)
  return Number(result.changes)
}

export function getHistoryByFolder(folderPath: string, limit: number = 100): RenameHistory[] {
  if (!db) throw new Error('Database not initialized')
  
  const stmt = db.prepare(`
    SELECT 
      id,
      original_name as originalName,
      new_name as newName,
      file_path as filePath,
      folder_path as folderPath,
      created_at as createdAt,
      is_reverted as isReverted
    FROM rename_history 
    WHERE folder_path = ? 
    ORDER BY created_at DESC 
    LIMIT ?
  `)
  
  const rows = stmt.all(folderPath, limit) as any[]
  return rows.map(row => ({
    ...row,
    isReverted: Boolean(row.isReverted)
  }))
}

export function getHistoryByIds(ids: number[]): RenameHistory[] {
  if (!db) throw new Error('Database not initialized')
  
  const placeholders = ids.map(() => '?').join(',')
  const stmt = db.prepare(`
    SELECT 
      id,
      original_name as originalName,
      new_name as newName,
      file_path as filePath,
      folder_path as folderPath,
      created_at as createdAt,
      is_reverted as isReverted
    FROM rename_history 
    WHERE id IN (${placeholders})
  `)
  
  const rows = stmt.all(...ids) as any[]
  return rows.map(row => ({
    ...row,
    isReverted: Boolean(row.isReverted)
  }))
}

export function closeDatabase() {
  if (db) {
    db.close()
    db = null
  }
}
