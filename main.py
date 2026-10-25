"""QLabs demo server. Runs with the Python standard library."""

import base64
import json
import os
import re
import sqlite3
import subprocess
import tempfile
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
DB = Path(os.environ.get("QLABS_DB", ROOT / "data" / "qlabs.sqlite3"))
TRACKS = {"compensation": "Компенсации", "lottery": "Розыгрыши", "casino": "Казино", "pyramid": "Пирамиды"}
RULES = [
    ("advance", 3, r"(?:оплат|заплат|внес|перевед|скин|пополн).{0,65}(?:страхов|комисс|пошлин|приз|компенсац|выплат)|(?:страхов|комисс|пошлин).{0,65}(?:оплат|заплат|перевед)"),
    ("secret", 3, r"\b(?:cvv|cvc|смс.код|sms.код|код из смс|код подтверждения|иин|пин.код)\b"),
    ("profit", 2, r"(?:доход|прибыл|заработ|выигр|удво|процент|дивиденд|пассивн)"),
    ("impersonation", 2, r"\b(?:енпф|нацбанк|полици|служба безопасности банка|госорган)\b"),
    ("urgency", 1, r"(?:срочн|только сегодня|последн.{0,12}мест|прямо сейчас|до вечера)"),
    ("referral", 1, r"(?:пригласи|приведи|реферал|за каждого друга)"),
    ("proof", 1, r"(?:скриншот.{0,20}выплат|отзыв.{0,20}выплат|доказательств.{0,20}выплат)"),
]
RULE_NAMES = {"advance": "Предоплата за выплату или приз", "secret": "Запрос секретных данных", "private_payment": "Реквизиты для перевода", "profit": "Обещание дохода или выигрыша", "impersonation": "Представляется организацией", "urgency": "Давление и срочность", "referral": "Приглашение новых участников", "proof": "Доказательства выплат", "link": "Ссылка на внешний сайт"}
CARD_RE = re.compile(r"(?<!\d)(?:\d[ -]?){15,18}\d(?!\d)")
PHONE_RE = re.compile(r"(?<!\d)(?:\+7|8)[\s()\-]*\d{3}[\s()\-]*\d{3}[\s()\-]*\d{2}[\s()\-]*\d{2}(?!\d)")
URL_RE = re.compile(r"https?://[^\s<>\"']+", re.I)


def connect():
    DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("CREATE TABLE IF NOT EXISTS chats (id INTEGER PRIMARY KEY, title TEXT NOT NULL, track TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL)")
    conn.execute("CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, chat_id INTEGER NOT NULL REFERENCES chats(id), role TEXT NOT NULL, text TEXT NOT NULL, image_name TEXT, created_at TEXT NOT NULL)")
    conn.commit()
    return conn


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def add_chat(conn, title, track):
    cur = conn.execute("INSERT INTO chats(title,track,created_at) VALUES(?,?,?)", (title, track, now()))
    conn.commit()
    return cur.lastrowid


def add_message(conn, chat_id, role, text, image_name=None):
    conn.execute("INSERT INTO messages(chat_id,role,text,image_name,created_at) VALUES(?,?,?,?,?)", (chat_id, role, text, image_name, now()))
    conn.commit()


def extract(text):
    found = []
    for kind, regex in (("card", CARD_RE), ("phone", PHONE_RE), ("url", URL_RE)):
        for match in regex.finditer(text):
            value = match.group().rstrip(".,;!? ") if kind == "url" else re.sub(r"\D", "", match.group())
            if kind == "card" and not (16 <= len(value) <= 19):
                continue
            if kind == "phone" and len(value) == 11:
                value = "+7" + value[1:]
            if value and not any(item["type"] == kind and item["value"] == value for item in found):
                found.append({"type": kind, "value": value, "valid_luhn": luhn(value) if kind == "card" else None})
    return found


def luhn(value):
    digits = [int(char) for char in value if char.isdigit()]
    return sum((n * 2 - 9 if n * 2 > 9 else n * 2) if i % 2 else n for i, n in enumerate(reversed(digits))) % 10 == 0


def analyze(messages):
    incoming = [m for m in messages if m["role"] == "scammer"]
    text = "\n".join(m["text"] for m in incoming)
    requisites = extract(text)
    signals = []
    for key, points, pattern in RULES:
        match = re.search(pattern, text, re.I)
        if match:
            signals.append({"key": key, "label": RULE_NAMES[key], "points": points, "quote": match.group()[:100]})
    if any(r["type"] in ("card", "phone") for r in requisites) and re.search(r"(?:перев|оплат|карт|каспи|kaspi|кошел|счет|счёт|номер для)", text, re.I):
        signals.append({"key": "private_payment", "label": RULE_NAMES["private_payment"], "points": 3, "quote": "Реквизиты в контексте перевода"})
    if any(r["type"] == "url" for r in requisites):
        signals.append({"key": "link", "label": RULE_NAMES["link"], "points": 2, "quote": "Ссылка в сообщении"})
    score = sum(s["points"] for s in signals)
    return {"score": score, "risk": "high" if score >= 6 else "medium" if score >= 3 else "low", "signals": signals, "requisites": requisites}


def apa_reply(messages):
    incoming = [m["text"].lower() for m in messages if m["role"] == "scammer"]
    text = " ".join(incoming)
    if re.search(r"(?:cvv|cvc|код из смс|смс.код|иин|пин.код)", text):
        return "Ой такие коды я не называю. Спасибо вам, до свидания"
    if not re.search(r"(?:деньг|выплат|оплат|перевод|карт|каспи|kaspi|компенсац|приз|доход|енпф|инвест|заработ|пополн|казино|розыгрыш|страхов)", text):
        return "Кажется вы ошиблись номером. Всего доброго"
    requisites = extract(text)
    cards = [r for r in requisites if r["type"] == "card"]
    if cards and len(incoming) >= 2:
        return "Рахмет, записала. У меня Kaspi что то не проходит, можно другой номер или карту?"
    if cards:
        return "Ой хорошо. А это точно номер для перевода? Внук поможет мне разобраться"
    if re.search(r"(?:оплат|перевед|пополн|страхов|комисс|взнос)", text):
        return "Да я хочу попробовать, айналайын. Куда мне перевести? Напишите номер карты или Kaspi покрупнее"
    return "Ой как интересно, расскажите пожалуйста что мне надо сделать?"


def state(conn):
    chats = []
    for chat in conn.execute("SELECT * FROM chats ORDER BY id DESC"):
        messages = [dict(m) for m in conn.execute("SELECT * FROM messages WHERE chat_id=? ORDER BY id", (chat["id"],))]
        chats.append({**dict(chat), "track_name": TRACKS[chat["track"]], "messages": messages, "analysis": analyze(messages)})
    return {"chats": chats, "rule_names": RULE_NAMES}


def seed(conn):
    if conn.execute("SELECT COUNT(*) FROM chats").fetchone()[0]:
        return
    chat_id = add_chat(conn, "Инвестиционный клуб", "pyramid")
    add_message(conn, chat_id, "scammer", "Пассивный доход: вложите 5000 ₸ и получите 10000 через неделю. Переводите на карту 4111 1111 1111 1111. Пригласи двух друзей!")
    add_message(conn, chat_id, "apa", "Ой интересно, а как это работает? Внук мне поможет")


class Handler(BaseHTTPRequestHandler):
    def respond(self, code, body):
        payload = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/state":
            with connect() as conn:
                self.respond(200, state(conn))
            return
        files = {"/": "index.html", "/app.js": "app.js", "/simple.css": "simple.css"}
        if path not in files:
            self.send_error(404)
            return
        content = (ROOT / files[path]).read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8" if path == "/" else "application/javascript; charset=utf-8" if path.endswith("js") else "text/css; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 8_000_000:
                return self.respond(413, {"error": "Файл слишком большой (максимум 5 МБ)"})
            body = json.loads(self.rfile.read(length))
            path = urlparse(self.path).path
            with connect() as conn:
                if path == "/api/chats":
                    track = body.get("track", "compensation")
                    if track not in TRACKS:
                        return self.respond(400, {"error": "Неизвестный сценарий"})
                    chat_id = add_chat(conn, str(body.get("title") or TRACKS[track])[:80], track)
                    return self.respond(200, {"id": chat_id, **state(conn)})
                match = re.fullmatch(r"/api/chats/(\d+)/(messages|status)", path)
                if not match:
                    return self.respond(404, {"error": "Не найдено"})
                chat_id, action = int(match.group(1)), match.group(2)
                chat = conn.execute("SELECT * FROM chats WHERE id=?", (chat_id,)).fetchone()
                if not chat:
                    return self.respond(404, {"error": "Чат не найден"})
                if action == "status":
                    status = body.get("status")
                    if status not in ("new", "sent", "operator", "false_positive"):
                        return self.respond(400, {"error": "Неверный статус"})
                    if status == "sent" and analyze([dict(m) for m in conn.execute("SELECT * FROM messages WHERE chat_id=?", (chat_id,))])["risk"] != "high":
                        return self.respond(400, {"error": "Передача доступна только для высокого риска"})
                    conn.execute("UPDATE chats SET status=? WHERE id=?", (status, chat_id))
                    conn.commit()
                else:
                    message = str(body.get("text") or "").strip()[:4000]
                    image_name = None
                    if body.get("image"):
                        raw = base64.b64decode(body["image"], validate=True)
                        if len(raw) > 5_000_000:
                            return self.respond(413, {"error": "Максимальный размер изображения — 5 МБ"})
                        image_name = str(body.get("image_name") or "Изображение")[:80]
                        with tempfile.NamedTemporaryFile(suffix=".png") as tmp:
                            tmp.write(raw)
                            tmp.flush()
                            tessdata = ROOT / "data" / "tessdata"
                            ocr_env = os.environ.copy()
                            languages = "eng"
                            if all((tessdata / f"{lang}.traineddata").exists() for lang in ("eng", "rus", "kaz")):
                                ocr_env["TESSDATA_PREFIX"] = str(tessdata)
                                languages = "rus+kaz+eng"
                            result = subprocess.run(["tesseract", tmp.name, "stdout", "-l", languages], capture_output=True, text=True, timeout=15, env=ocr_env)
                            if result.returncode:
                                return self.respond(422, {"error": "Не удалось распознать изображение"})
                            message += ("\n" if message else "") + "[Текст изображения] " + result.stdout.strip()
                    if not message:
                        return self.respond(400, {"error": "Введите сообщение или добавьте изображение"})
                    add_message(conn, chat_id, "scammer", message, image_name)
                    messages = [dict(m) for m in conn.execute("SELECT * FROM messages WHERE chat_id=? ORDER BY id", (chat_id,))]
                    add_message(conn, chat_id, "apa", apa_reply(messages))
                return self.respond(200, state(conn))
        except (ValueError, KeyError, json.JSONDecodeError, base64.binascii.Error):
            self.respond(400, {"error": "Неверный запрос"})
        except subprocess.TimeoutExpired:
            self.respond(504, {"error": "Распознавание заняло слишком много времени"})


if __name__ == "__main__":
    with connect() as database:
        seed(database)
    port = int(os.environ.get("PORT", "8000"))
    print(f"QLabs listening on http://127.0.0.1:{port}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
