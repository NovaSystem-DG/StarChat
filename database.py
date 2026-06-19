import os
import libsql_experimental as libsql

TURSO_URL   = os.getenv("TURSO_DATABASE_URL")
TURSO_TOKEN = os.getenv("TURSO_AUTH_TOKEN")

class DBWrapper:
    """Wrapper para que funcione el 'with get_db() as db:' igual que antes"""
    def __init__(self, conn):
        self._conn = conn

    def execute(self, sql, params=()):
        cur = self._conn.execute(sql, params)
        return RowWrapper(cur, self._conn)

    def executescript(self, sql):
        # Turso no tiene executescript, ejecutamos statement por statement
        for stmt in sql.split(';'):
            stmt = stmt.strip()
            if stmt:
                self._conn.execute(stmt)

    def commit(self):
        self._conn.commit()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self._conn.commit()


class RowWrapper:
    """Wrapper para que las filas soporten dict() y acceso por nombre"""
    def __init__(self, cursor, conn):
        self._cur = cursor
        self._conn = conn
        self._description = cursor.description if hasattr(cursor, 'description') else None

    @property
    def lastrowid(self):
        return self._cur.lastrowid

    @property
    def description(self):
        return self._description

    def fetchone(self):
        row = self._cur.fetchone()
        if row is None:
            return None
        return DictRow(row, self._description)

    def fetchall(self):
        rows = self._cur.fetchall()
        return [DictRow(r, self._description) for r in rows]


class DictRow:
    """Fila que soporta acceso por nombre (row['campo']) y dict(row)"""
    def __init__(self, row, description):
        self._row  = row
        self._keys = [d[0] for d in description] if description else []
        self._data = dict(zip(self._keys, row)) if self._keys else {}

    def __getitem__(self, key):
        if isinstance(key, int):
            return self._row[key]
        return self._data[key]

    def get(self, key, default=None):
        return self._data.get(key, default)

    def keys(self):
        return self._keys

    def __iter__(self):
        return iter(self._data)

    def items(self):
        return self._data.items()

    def __contains__(self, key):
        return key in self._data


def get_db():
    conn = libsql.connect(
        database=TURSO_URL,
        auth_token=TURSO_TOKEN,
    )
    return DBWrapper(conn)


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
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id         INTEGER NOT NULL,
                nombre          TEXT NOT NULL,
                descripcion     TEXT DEFAULT '',
                personalidad    TEXT DEFAULT '',
                historia        TEXT DEFAULT '',
                greeting        TEXT DEFAULT '',
                examples        TEXT DEFAULT '',
                system_override TEXT DEFAULT '',
                avatar          TEXT DEFAULT '',
                temperature     REAL DEFAULT 0.92,
                max_tokens      INTEGER DEFAULT 600,
                favorito        INTEGER DEFAULT 0,
                created_at      INTEGER DEFAULT (strftime('%s','now'))
            );

            CREATE TABLE IF NOT EXISTS ocs (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id      INTEGER NOT NULL,
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
                user_id      INTEGER NOT NULL,
                character_id INTEGER NOT NULL,
                title        TEXT DEFAULT 'Nueva conversación',
                created_at   INTEGER DEFAULT (strftime('%s','now')),
                last_updated INTEGER DEFAULT (strftime('%s','now'))
            );

            CREATE TABLE IF NOT EXISTS messages (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id    INTEGER NOT NULL,
                role       TEXT NOT NULL,
                content    TEXT NOT NULL,
                created_at INTEGER DEFAULT (strftime('%s','now'))
            )
        """)