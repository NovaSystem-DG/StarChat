import os
import requests
import json

TURSO_URL   = os.getenv("TURSO_DATABASE_URL", "").replace("libsql://", "https://")
TURSO_TOKEN = os.getenv("TURSO_AUTH_TOKEN", "")

def _execute(statements):
    payload = {"requests": []}
    for stmt in statements:
        if isinstance(stmt, str):
            payload["requests"].append({
                "type": "execute",
                "stmt": {"sql": stmt}
            })
        else:
            sql, params = stmt
            args = []
            for p in params:
                if p is None:
                    args.append({"type": "null"})
                elif isinstance(p, bool):
                    args.append({"type": "integer", "value": "1" if p else "0"})
                elif isinstance(p, int):
                    args.append({"type": "integer", "value": str(p)})
                elif isinstance(p, float):
                    args.append({"type": "float", "value": p})
                else:
                    args.append({"type": "text", "value": str(p)})
            payload["requests"].append({
                "type": "execute",
                "stmt": {"sql": sql, "args": args}
            })
    payload["requests"].append({"type": "close"})

    r = requests.post(
        f"{TURSO_URL}/v2/pipeline",
        headers={
            "Authorization": f"Bearer {TURSO_TOKEN}",
            "Content-Type": "application/json"
        },
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        timeout=15
    )

    if not r.ok:
        raise Exception(f"Turso error {r.status_code}: {r.text[:300]}")

    return r.json().get("results", [])


class DictRow:
    def __init__(self, data):
        self._data = data

    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self._data.values())[key]
        return self._data[key]

    def get(self, key, default=None):
        return self._data.get(key, default)

    def keys(self):
        return self._data.keys()

    def __iter__(self):
        return iter(self._data)

    def items(self):
        return self._data.items()

    def __contains__(self, key):
        return key in self._data


class Cursor:
    def __init__(self, result):
        self._rows = []
        self.lastrowid = None

        if not result:
            return

        if result.get("type") == "error":
            raise Exception(f"Turso query error: {result.get('error', {}).get('message', 'unknown')}")

        response = result.get("response", {})
        inner = response.get("result", {})

        self.lastrowid = inner.get("last_insert_rowid")

        cols = [c["name"] for c in inner.get("cols", [])]
        for row in inner.get("rows", []):
            values = []
            for cell in row:
                t = cell.get("type")
                v = cell.get("value")
                if t == "null" or v is None:
                    values.append(None)
                elif t == "integer":
                    values.append(int(v))
                elif t == "float":
                    values.append(float(v))
                else:
                    values.append(v)
            self._rows.append(DictRow(dict(zip(cols, values))))

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return self._rows


class DBWrapper:
    def execute(self, sql, params=()):
        results = _execute([(sql, params)])
        return Cursor(results[0] if results else None)

    def executescript(self, sql):
        stmts = [s.strip() for s in sql.split(";") if s.strip()]
        if stmts:
            _execute(stmts)

    def commit(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass


def get_db():
    return DBWrapper()


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