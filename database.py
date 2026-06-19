import sqlite3, os, json

DB_PATH = os.getenv("DB_PATH", "starchat.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def init_db():
    with get_db() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            nombre   TEXT DEFAULT '',
            avatar   TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS characters (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            nombre         TEXT NOT NULL,
            descripcion    TEXT DEFAULT '',
            personalidad   TEXT DEFAULT '',
            historia       TEXT DEFAULT '',
            greeting       TEXT DEFAULT '',
            examples       TEXT DEFAULT '',
            system_override TEXT DEFAULT '',
            avatar         TEXT DEFAULT '',
            temperature    REAL DEFAULT 0.92,
            max_tokens     INTEGER DEFAULT 600,
            favorito       INTEGER DEFAULT 0,
            created_at     INTEGER DEFAULT (strftime('%s','now'))
        );

        CREATE TABLE IF NOT EXISTS ocs (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            nombre       TEXT NOT NULL,
            rol          TEXT DEFAULT '',
            apariencia   TEXT DEFAULT '',
            personalidad TEXT DEFAULT '',
            historia     TEXT DEFAULT '',
            avatar       TEXT DEFAULT '',
            created_at   INTEGER DEFAULT (strftime('%s','now'))
        );

        CREATE TABLE IF NOT EXISTS chats (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
            title        TEXT DEFAULT 'Nueva conversación',
            created_at   INTEGER DEFAULT (strftime('%s','now')),
            last_updated INTEGER DEFAULT (strftime('%s','now'))
        );

        CREATE TABLE IF NOT EXISTS messages (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id    INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
            role       TEXT NOT NULL CHECK(role IN ('user','assistant')),
            content    TEXT NOT NULL,
            created_at INTEGER DEFAULT (strftime('%s','now'))
        );
        """)