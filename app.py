from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import os, time, hashlib
from dotenv import load_dotenv
from functools import wraps
from groq import Groq
from database import init_db, get_db

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "starchat-secret-xk9")

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

init_db()

# ── AUTH HELPERS ──────────────────────────────────────────

def hash_pwd(pwd):
    return hashlib.sha256(pwd.encode()).hexdigest()

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("user_id"):
            if request.path.startswith("/api") or request.method == "POST":
                return jsonify({"error": "Unauthorized"}), 401
            return redirect(url_for("login_page"))
        return f(*args, **kwargs)
    return decorated

def current_user_id():
    return session["user_id"]

# ── AUTH ROUTES ───────────────────────────────────────────

@app.route("/login")
def login_page():
    if session.get("user_id"):
        return redirect(url_for("index"))
    return render_template("login.html")

@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.json or {}
    username = data.get("username", "").lower().strip()
    password = hash_pwd(data.get("password", ""))

    with get_db() as db:
        user = db.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()

        if not user:
            admin_user = os.getenv("ADMIN_USER", "admin")
            admin_pwd  = hash_pwd(os.getenv("ADMIN_PASS", "starchat2024"))
            if username == admin_user and password == admin_pwd:
                db.execute("INSERT INTO users (username, password) VALUES (?,?)", (username, password))
                db.commit()
                user = db.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
            else:
                return jsonify({"error": "Usuario o contraseña incorrectos"}), 401

        if user["password"] != password:
            return jsonify({"error": "Usuario o contraseña incorrectos"}), 401

        session["user_id"]  = user["id"]
        session["username"] = user["username"]
        return jsonify({"status": "ok", "username": user["username"]})

@app.route("/api/logout", methods=["POST"])
def api_logout():
    session.clear()
    return jsonify({"status": "ok"})

@app.route("/api/register", methods=["POST"])
def api_register():
    if os.getenv("ALLOW_REGISTER", "false").lower() != "true":
        return jsonify({"error": "Registro deshabilitado"}), 403
    data = request.json or {}
    username = data.get("username", "").lower().strip()
    password = data.get("password", "")
    if not username or not password or len(password) < 6:
        return jsonify({"error": "Datos inválidos"}), 400
    with get_db() as db:
        try:
            db.execute("INSERT INTO users (username, password) VALUES (?,?)", (username, hash_pwd(password)))
            db.commit()
            user = db.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
            session["user_id"]  = user["id"]
            session["username"] = user["username"]
            return jsonify({"status": "ok"})
        except Exception:
            return jsonify({"error": "Ese usuario ya existe"}), 409

# ── MAIN PAGE ─────────────────────────────────────────────

@app.route("/")
@login_required
def index():
    return render_template("index.html")

# ── PERFIL ────────────────────────────────────────────────

@app.route("/api/perfil", methods=["GET", "POST"])
@login_required
def api_perfil():
    uid = current_user_id()
    with get_db() as db:
        if request.method == "POST":
            d = request.json or {}
            db.execute("UPDATE users SET nombre=?, avatar=? WHERE id=?",
                       (d.get("nombre",""), d.get("avatar",""), uid))
            db.commit()
            return jsonify({"status": "ok"})
        user = db.execute("SELECT username, nombre, avatar FROM users WHERE id=?", (uid,)).fetchone()
        return jsonify(dict(user))

# ── PERSONAJES ────────────────────────────────────────────

@app.route("/api/personajes", methods=["GET", "POST"])
@login_required
def api_personajes():
    uid = current_user_id()
    with get_db() as db:
        if request.method == "POST":
            d = request.json or {}
            cid = d.get("id")
            if cid:
                db.execute("""
                    UPDATE characters SET
                        nombre=?, descripcion=?, personalidad=?, historia=?,
                        greeting=?, examples=?, system_override=?, avatar=?,
                        temperature=?, max_tokens=?
                    WHERE id=? AND user_id=?
                """, (
                    d.get("nombre",""), d.get("descripcion",""),
                    d.get("personalidad",""), d.get("historia",""),
                    d.get("greeting",""), d.get("examples",""),
                    d.get("systemOverride",""), d.get("avatar",""),
                    d.get("temperature", 0.92), d.get("maxTokens", 600),
                    cid, uid
                ))
                db.commit()
                return jsonify({"status": "ok", "id": cid})
            else:
                cur = db.execute("""
                    INSERT INTO characters
                        (user_id, nombre, descripcion, personalidad, historia,
                         greeting, examples, system_override, avatar, temperature, max_tokens)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?)
                """, (
                    uid,
                    d.get("nombre",""), d.get("descripcion",""),
                    d.get("personalidad",""), d.get("historia",""),
                    d.get("greeting",""), d.get("examples",""),
                    d.get("systemOverride",""), d.get("avatar",""),
                    d.get("temperature", 0.92), d.get("maxTokens", 600)
                ))
                db.commit()
                return jsonify({"status": "ok", "id": cur.lastrowid})

        rows = db.execute(
            "SELECT * FROM characters WHERE user_id=? ORDER BY favorito DESC, created_at DESC", (uid,)
        ).fetchall()
        return jsonify([dict(r) for r in rows])

@app.route("/api/personajes/<int:pid>", methods=["DELETE"])
@login_required
def api_del_personaje(pid):
    uid = current_user_id()
    with get_db() as db:
        db.execute("DELETE FROM characters WHERE id=? AND user_id=?", (pid, uid))
        db.commit()
    return jsonify({"status": "ok"})

@app.route("/api/personajes/<int:pid>/favorito", methods=["POST"])
@login_required
def toggle_favorito(pid):
    uid = current_user_id()
    with get_db() as db:
        char = db.execute("SELECT favorito FROM characters WHERE id=? AND user_id=?", (pid, uid)).fetchone()
        if char:
            db.execute("UPDATE characters SET favorito=? WHERE id=? AND user_id=?",
                       (0 if char["favorito"] else 1, pid, uid))
            db.commit()
    return jsonify({"status": "ok"})

# ── OCS ───────────────────────────────────────────────────

@app.route("/api/ocs", methods=["GET", "POST"])
@login_required
def api_ocs():
    uid = current_user_id()
    with get_db() as db:
        if request.method == "POST":
            d = request.json or {}
            oid = d.get("id")
            if oid:
                db.execute("""
                    UPDATE ocs SET nombre=?, rol=?, apariencia=?, personalidad=?, historia=?, avatar=?
                    WHERE id=? AND user_id=?
                """, (
                    d.get("nombre",""), d.get("rol",""), d.get("apariencia",""),
                    d.get("personalidad",""), d.get("historia",""), d.get("avatar",""),
                    oid, uid
                ))
                db.commit()
                return jsonify({"status": "ok", "id": oid})
            else:
                cur = db.execute("""
                    INSERT INTO ocs (user_id, nombre, rol, apariencia, personalidad, historia, avatar)
                    VALUES (?,?,?,?,?,?,?)
                """, (uid, d.get("nombre",""), d.get("rol",""), d.get("apariencia",""),
                      d.get("personalidad",""), d.get("historia",""), d.get("avatar","")))
                db.commit()
                return jsonify({"status": "ok", "id": cur.lastrowid})
        rows = db.execute("SELECT * FROM ocs WHERE user_id=? ORDER BY created_at DESC", (uid,)).fetchall()
        return jsonify([dict(r) for r in rows])

@app.route("/api/ocs/<int:oid>", methods=["DELETE"])
@login_required
def api_del_oc(oid):
    uid = current_user_id()
    with get_db() as db:
        db.execute("DELETE FROM ocs WHERE id=? AND user_id=?", (oid, uid))
        db.commit()
    return jsonify({"status": "ok"})

# ── CHATS ─────────────────────────────────────────────────

@app.route("/api/chats/<int:char_id>", methods=["GET"])
@login_required
def get_chats(char_id):
    uid = current_user_id()
    with get_db() as db:
        rows = db.execute("""
            SELECT c.id, c.title, c.created_at, c.last_updated,
                   (SELECT content FROM messages WHERE chat_id=c.id ORDER BY id DESC LIMIT 1) as last_message,
                   (SELECT COUNT(*) FROM messages WHERE chat_id=c.id) as message_count
            FROM chats c
            WHERE c.user_id=? AND c.character_id=?
            ORDER BY c.last_updated DESC
        """, (uid, char_id)).fetchall()
        return jsonify([dict(r) for r in rows])

@app.route("/api/chats/<int:char_id>/new", methods=["POST"])
@login_required
def new_chat(char_id):
    uid = current_user_id()
    title = (request.json or {}).get("title", "Nueva conversación")
    with get_db() as db:
        cur = db.execute("INSERT INTO chats (user_id, character_id, title) VALUES (?,?,?)", (uid, char_id, title))
        db.commit()
        return jsonify({"status": "ok", "id": cur.lastrowid})

@app.route("/api/chat/<int:chat_id>/messages", methods=["GET"])
@login_required
def get_messages(chat_id):
    uid = current_user_id()
    with get_db() as db:
        chat = db.execute("SELECT * FROM chats WHERE id=? AND user_id=?", (chat_id, uid)).fetchone()
        if not chat:
            return jsonify({"error": "Not found"}), 404
        msgs = db.execute(
            "SELECT id, role, content, created_at FROM messages WHERE chat_id=? ORDER BY id ASC", (chat_id,)
        ).fetchall()
        return jsonify({"chat": dict(chat), "messages": [dict(m) for m in msgs]})

@app.route("/api/chat/<int:chat_id>/title", methods=["POST"])
@login_required
def update_title(chat_id):
    uid = current_user_id()
    title = (request.json or {}).get("title", "")
    with get_db() as db:
        db.execute("UPDATE chats SET title=? WHERE id=? AND user_id=?", (title, chat_id, uid))
        db.commit()
    return jsonify({"status": "ok"})

@app.route("/api/chat/<int:chat_id>", methods=["DELETE"])
@login_required
def delete_chat(chat_id):
    uid = current_user_id()
    with get_db() as db:
        db.execute("DELETE FROM chats WHERE id=? AND user_id=?", (chat_id, uid))
        db.commit()
    return jsonify({"status": "ok"})

@app.route("/api/chat/<int:chat_id>/clear", methods=["POST"])
@login_required
def clear_chat(chat_id):
    uid = current_user_id()
    with get_db() as db:
        chat = db.execute("SELECT id FROM chats WHERE id=? AND user_id=?", (chat_id, uid)).fetchone()
        if not chat:
            return jsonify({"error": "Not found"}), 404
        db.execute("DELETE FROM messages WHERE chat_id=?", (chat_id,))
        db.execute("UPDATE chats SET last_updated=strftime('%s','now') WHERE id=?", (chat_id,))
        db.commit()
    return jsonify({"status": "ok"})

@app.route("/api/chat/<int:chat_id>/message/<int:msg_id>", methods=["DELETE"])
@login_required
def delete_message(chat_id, msg_id):
    uid = current_user_id()
    with get_db() as db:
        chat = db.execute("SELECT id FROM chats WHERE id=? AND user_id=?", (chat_id, uid)).fetchone()
        if not chat:
            return jsonify({"error": "Not found"}), 404
        db.execute("DELETE FROM messages WHERE id=? AND chat_id=?", (msg_id, chat_id))
        db.commit()
    return jsonify({"status": "ok"})

@app.route("/api/chat/<int:chat_id>/message/<int:msg_id>", methods=["PUT"])
@login_required
def edit_message(chat_id, msg_id):
    uid = current_user_id()
    content = (request.json or {}).get("content", "")
    with get_db() as db:
        chat = db.execute("SELECT id FROM chats WHERE id=? AND user_id=?", (chat_id, uid)).fetchone()
        if not chat:
            return jsonify({"error": "Not found"}), 404
        db.execute("UPDATE messages SET content=? WHERE id=? AND chat_id=?", (content, msg_id, chat_id))
        db.commit()
    return jsonify({"status": "ok"})

@app.route("/api/chat/<int:chat_id>/rewind/<int:msg_id>", methods=["POST"])
@login_required
def rewind_to(chat_id, msg_id):
    uid = current_user_id()
    with get_db() as db:
        chat = db.execute("SELECT id FROM chats WHERE id=? AND user_id=?", (chat_id, uid)).fetchone()
        if not chat:
            return jsonify({"error": "Not found"}), 404
        db.execute("DELETE FROM messages WHERE chat_id=? AND id > ?", (chat_id, msg_id))
        db.commit()
    return jsonify({"status": "ok"})

# ── CHAT / AI ─────────────────────────────────────────────

@app.route("/api/chat/<int:chat_id>/send", methods=["POST"])
@login_required
def send_message(chat_id):
    uid = current_user_id()
    data = request.json or {}
    user_content = data.get("content", "").strip()
    oc_id = data.get("oc_id")

    if not user_content:
        return jsonify({"error": "Empty message"}), 400

    with get_db() as db:
        chat = db.execute("SELECT * FROM chats WHERE id=? AND user_id=?", (chat_id, uid)).fetchone()
        if not chat:
            return jsonify({"error": "Chat not found"}), 404

        char = db.execute("SELECT * FROM characters WHERE id=?", (chat["character_id"],)).fetchone()

        oc = None
        if oc_id:
            oc = db.execute("SELECT * FROM ocs WHERE id=? AND user_id=?", (oc_id, uid)).fetchone()

        perfil = db.execute("SELECT nombre FROM users WHERE id=?", (uid,)).fetchone()
        nombre_usuario = (oc["nombre"] if oc else None) or perfil["nombre"] or "Tú"

        is_continue  = user_content == '*continúa*'
        skip_user_save = data.get("_skip_user_save", False) or is_continue

        # Guardar mensaje del usuario (excepto si es rewind o continuación)
        if not skip_user_save:
            db.execute("INSERT INTO messages (chat_id, role, content) VALUES (?,?,?)",
                       (chat_id, "user", user_content))

        # Historial (últimos 24 mensajes para contexto)
        history = db.execute(
            "SELECT role, content FROM messages WHERE chat_id=? ORDER BY id DESC LIMIT 24", (chat_id,)
        ).fetchall()
        history = list(reversed(history))
        db.commit()

    # System prompt
    system_prompt = build_system_prompt(char, oc, nombre_usuario)

    char_dict   = dict(char) if char else {}
    greeting    = char_dict.get("greeting", "").strip()
    temperature = float(char_dict.get("temperature", 0.92)) if char_dict else 0.92
    max_tokens  = int(char_dict.get("max_tokens", 600)) if char_dict else 600

    # Construir mensajes para Groq
    groq_messages = [{"role": "system", "content": system_prompt}]

    # El greeting va como primer turno del asistente
    if greeting:
        groq_messages.append({"role": "assistant", "content": greeting})

    # Historial (todos menos el último que es el que acabamos de guardar)
    for msg in history[:-1]:
        role = "assistant" if msg["role"] == "assistant" else "user"
        groq_messages.append({"role": role, "content": msg["content"]})

    # Mensaje actual del usuario
    groq_messages.append({"role": "user", "content": user_content})

    try:
        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=groq_messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        reply = completion.choices[0].message.content

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

    # Guardar respuesta del asistente
    with get_db() as db:
        db.execute("INSERT INTO messages (chat_id, role, content) VALUES (?,?,?)",
                   (chat_id, "assistant", reply))
        db.execute("UPDATE chats SET last_updated=strftime('%s','now') WHERE id=?", (chat_id,))

        # Auto-título tras el primer intercambio
        msg_count = db.execute(
            "SELECT COUNT(*) as c FROM messages WHERE chat_id=?", (chat_id,)
        ).fetchone()["c"]
        if msg_count <= 3:
            db.execute("UPDATE chats SET title=? WHERE id=?", (user_content[:40].strip(), chat_id))

        msg_id = db.execute(
            "SELECT id FROM messages WHERE chat_id=? ORDER BY id DESC LIMIT 1", (chat_id,)
        ).fetchone()["id"]
        db.commit()

    return jsonify({"response": reply, "msg_id": msg_id})


# ── SYSTEM PROMPT ─────────────────────────────────────────

def build_system_prompt(char, oc, nombre_usuario):
    if not char:
        return "You are a helpful assistant."

    char = dict(char)
    nombre       = char.get("nombre", "Unknown")
    descripcion  = char.get("descripcion", "").strip()
    personalidad = char.get("personalidad", "").strip()
    historia     = char.get("historia", "").strip()
    examples     = char.get("examples", "").strip()
    override     = char.get("system_override", "").strip()

    if override:
        return override

    oc_block = ""
    if oc:
        oc = dict(oc)
        partes = []
        if oc.get("rol"):          partes.append(f"Role: {oc['rol']}")
        if oc.get("apariencia"):   partes.append(f"Appearance: {oc['apariencia']}")
        if oc.get("personalidad"): partes.append(f"Personality: {oc['personalidad']}")
        if oc.get("historia"):     partes.append(f"Backstory: {oc['historia']}")
        if partes:
            oc_block = f"\n\n[About {nombre_usuario}]\n" + "\n".join(partes)

    examples_block = (
        f"\n\n[Dialogue examples — calibrate your tone and style from these]\n{examples}"
        if examples else ""
    )

    char_info_parts = []
    if descripcion:  char_info_parts.append(f"Description: {descripcion}")
    if personalidad: char_info_parts.append(f"Personality: {personalidad}")
    if historia:     char_info_parts.append(f"Backstory / Lore: {historia}")

    char_info = "\n".join(char_info_parts) if char_info_parts else \
        f"You are {nombre}. Invent a vivid, consistent personality and maintain it throughout."

    prompt = f"""You are a masterful collaborative fiction writer. You write the entire world — every character, every reaction, every heartbeat of the scene — except for {nombre_usuario}, who belongs to the reader.

[Character: {nombre}]
{char_info}{oc_block}{examples_block}

[Universe]
You know this universe completely — its characters, history, relationships, lore, and tone. Other canon characters appear when the story calls for them, portrayed with full accuracy. Dick Grayson sounds like Dick Grayson. Jason Todd sounds like Jason Todd. You never flatten them.

[How to write]
Write like the best fanfiction you've ever read. Not a summary. Not a report. A scene — with texture, subtext, and momentum.

- Immerse. Drop the reader into the moment. What does the room smell like? What's the tension in someone's jaw? What isn't being said?
- Voice. Every character has a distinct voice. Damian is clipped and formal. Steph is chaotic and warm. Tim is precise with a dry edge. Never blend them.
- Humor lands when it's earned. Let it breathe. A single well-placed line beats three forced jokes.
- Emotion is shown, never announced. "His throat tightened" not "He felt sad."
- Vary your rhythm. Short lines hit hard. Then a longer sentence rolls in and carries the weight of everything that came before it. Then silence. Then something moves.
- Secondary characters react. They exist. They have opinions. Use them.
- End at a moment that makes the reader need to respond — not a cliffhanger every time, just the right pause.

[Format]
- *Italics* for action, narration, internal atmosphere: *She doesn't look up from her book.*
- **Name:** for dialogue: **{nombre}:** "You really think that's going to work?"
- (Parentheses) from {nombre_usuario} = out-of-character instruction. Follow it silently. Never acknowledge it in the story.
- Never write {nombre_usuario}'s words, actions, or thoughts. They belong to the reader.
- Match {nombre_usuario}'s language — if they write in Spanish, you write in Spanish.
- 2 to 5 paragraphs. Enough to breathe. Not so much it suffocates.

[Rules]
- Never break character. Never hint at being an AI.
- Never repeat sentence structures back to back.
- Never contradict what already happened.
- Never write {nombre_usuario}'s lines — not even to quote them back.
- If {nombre_usuario} writes '*continúa*' or sends an empty message, advance the story yourself. Move time. Shift the scene. Make something happen. Don't wait.

The scene is already happening. {nombre_usuario} is in it. Write what comes next."""

    return prompt


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)