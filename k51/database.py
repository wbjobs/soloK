import sqlite3
import json
import hashlib
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'midi_cache.db')

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS midi_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_hash TEXT UNIQUE,
            filename TEXT,
            analysis_data TEXT,
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

def get_file_hash(file_content):
    return hashlib.md5(file_content).hexdigest()

def cache_midi_analysis(file_content, filename, analysis_data):
    file_hash = get_file_hash(file_content)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT id FROM midi_files WHERE file_hash = ?', (file_hash,))
    existing = c.fetchone()
    if existing:
        file_id = existing[0]
        c.execute('''
            UPDATE midi_files SET filename = ?, analysis_data = ?, uploaded_at = CURRENT_TIMESTAMP
            WHERE file_hash = ?
        ''', (filename, json.dumps(analysis_data, ensure_ascii=False), file_hash))
    else:
        c.execute('''
            INSERT INTO midi_files (file_hash, filename, analysis_data)
            VALUES (?, ?, ?)
        ''', (file_hash, filename, json.dumps(analysis_data, ensure_ascii=False)))
        file_id = c.lastrowid
    conn.commit()
    conn.close()
    return file_id, file_hash

def get_cached_analysis(file_content):
    file_hash = get_file_hash(file_content)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT id, analysis_data FROM midi_files WHERE file_hash = ?', (file_hash,))
    result = c.fetchone()
    conn.close()
    if result:
        data = json.loads(result[1])
        data['id'] = result[0]
        return data
    return None

def get_all_cached_files():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT id, filename, uploaded_at FROM midi_files ORDER BY uploaded_at DESC')
    results = c.fetchall()
    conn.close()
    return [{'id': r[0], 'filename': r[1], 'uploaded_at': r[2]} for r in results]

def get_analysis_by_id(file_id):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT analysis_data FROM midi_files WHERE id = ?', (file_id,))
    result = c.fetchone()
    conn.close()
    if result:
        data = json.loads(result[0])
        data['id'] = file_id
        return data
    return None
