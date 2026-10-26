"""Users, password hashing, sessions and the login gate in front of every /api route.

There is no public sign-up: accounts are created by an admin. Until the admin panel
exists, use the command line (from the backend folder):

    .venv/bin/python -m app.auth add someone@example.com "password" [--role admin]
    .venv/bin/python -m app.auth list
    .venv/bin/python -m app.auth passwd someone@example.com "new password"
    .venv/bin/python -m app.auth delete someone@example.com

On first start an initial admin account is created so the dashboard is usable at once.

Forgotten password: /forgot emails a one-time link (30 min) to /?reset=<token>; the
page sets a new password without the old one — the link itself proves who it is.
Signed-in users change their password with the current one (/change-password).
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import logging
import secrets
import sqlite3
import threading
import time
from collections import deque
from datetime import datetime, timezone
from http.cookies import SimpleCookie

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response
from pydantic import BaseModel, Field
from starlette.responses import JSONResponse

from . import mailer
from .config import DATA_DIR, settings

log = logging.getLogger("camon")

DB_PATH = DATA_DIR / "camon.db"
SESSION_COOKIE = "camon_session"
SESSION_TTL = 7 * 24 * 3600
SEED_ADMIN = ("admin@gmail.com", "123456")
PUBLIC_PATHS = {"/api/auth/login", "/api/auth/forgot", "/api/auth/reset", "/api/auth/reset/check"}
ROLES = ("admin", "user")
RESET_TTL = 30 * 60
MIN_PASSWORD = 8

# scrypt: memory-hard, in the standard library, no extra dependency
_SCRYPT = {"n": 2**14, "r": 8, "p": 1, "dklen": 32}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **_SCRYPT)
    b64 = lambda b: base64.b64encode(b).decode()  # noqa: E731
    return f"scrypt${_SCRYPT['n']}${_SCRYPT['r']}${_SCRYPT['p']}${b64(salt)}${b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, n, r, p, salt, digest = stored.split("$")
        expected = base64.b64decode(digest)
        actual = hashlib.scrypt(
            password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p), dklen=len(expected)
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


_DUMMY_HASH = hash_password(secrets.token_hex(8))  # equalises timing for unknown emails


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class UserStore:
    """SQLite-backed users and sessions. Thread-safe: endpoints run in a thread pool."""

    def __init__(self, path=DB_PATH):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        with self._lock, self._db:
            self._db.execute("PRAGMA foreign_keys = ON")
            self._db.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    password_hash TEXT NOT NULL,
                    role          TEXT NOT NULL CHECK (role IN ('admin', 'user')),
                    created_at    TEXT NOT NULL,
                    updated_at    TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY,
                    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    expires_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS password_resets (
                    token_hash TEXT PRIMARY KEY,
                    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    expires_at REAL NOT NULL
                );
                """
            )

    # --- users -----------------------------------------------------------------------

    @staticmethod
    def public(row: sqlite3.Row | None) -> dict | None:
        if row is None:
            return None
        return {k: row[k] for k in ("id", "email", "role", "created_at", "updated_at")}

    def count(self) -> int:
        with self._lock:
            return self._db.execute("SELECT COUNT(*) FROM users").fetchone()[0]

    def list(self) -> list[dict]:
        with self._lock:
            rows = self._db.execute("SELECT * FROM users ORDER BY id").fetchall()
        return [self.public(r) for r in rows]

    def create(self, email: str, password: str, role: str = "user") -> dict:
        if role not in ROLES:
            raise ValueError(f"role must be one of {ROLES}")
        now = _now_iso()
        with self._lock, self._db:
            cur = self._db.execute(
                "INSERT INTO users (email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (email.strip().lower(), hash_password(password), role, now, now),
            )
            row = self._db.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
        return self.public(row)

    def set_password(self, email: str, password: str) -> bool:
        with self._lock, self._db:
            cur = self._db.execute(
                "UPDATE users SET password_hash = ?, updated_at = ? WHERE email = ?",
                (hash_password(password), _now_iso(), email.strip()),
            )
            user = self._db.execute("SELECT id FROM users WHERE email = ?", (email.strip(),)).fetchone()
            if user:  # a new password signs the user out everywhere
                self._db.execute("DELETE FROM sessions WHERE user_id = ?", (user["id"],))
        return cur.rowcount > 0

    def delete(self, email: str) -> bool:
        with self._lock, self._db:
            return self._db.execute("DELETE FROM users WHERE email = ?", (email.strip(),)).rowcount > 0

    def authenticate(self, email: str, password: str) -> dict | None:
        with self._lock:
            row = self._db.execute("SELECT * FROM users WHERE email = ?", (email.strip(),)).fetchone()
        if row is None:
            verify_password(password, _DUMMY_HASH)
            return None
        return self.public(row) if verify_password(password, row["password_hash"]) else None

    # --- sessions --------------------------------------------------------------------

    def open_session(self, user_id: int) -> str:
        token = secrets.token_urlsafe(32)
        now = time.time()
        with self._lock, self._db:
            self._db.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
            self._db.execute(
                "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                (_token_hash(token), user_id, now + SESSION_TTL),
            )
        return token

    def close_session(self, token: str) -> None:
        with self._lock, self._db:
            self._db.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))

    def user_for_token(self, token: str) -> dict | None:
        with self._lock:
            row = self._db.execute(
                "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
                (_token_hash(token), time.time()),
            ).fetchone()
        return self.public(row)

    # --- password reset & change --------------------------------------------------------

    def open_reset(self, email: str) -> tuple[dict, str] | None:
        """One-time reset token for an existing account; older tokens are revoked."""
        now = time.time()
        with self._lock, self._db:
            row = self._db.execute("SELECT * FROM users WHERE email = ?", (email.strip(),)).fetchone()
            if row is None:
                return None
            token = secrets.token_urlsafe(32)
            self._db.execute("DELETE FROM password_resets WHERE user_id = ? OR expires_at < ?", (row["id"], now))
            self._db.execute(
                "INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                (_token_hash(token), row["id"], now + RESET_TTL),
            )
        return self.public(row), token

    def user_for_reset(self, token: str) -> dict | None:
        with self._lock:
            row = self._db.execute(
                "SELECT u.* FROM password_resets r JOIN users u ON u.id = r.user_id"
                " WHERE r.token_hash = ? AND r.expires_at > ?",
                (_token_hash(token), time.time()),
            ).fetchone()
        return self.public(row)

    def complete_reset(self, token: str, new_password: str) -> bool:
        user = self.user_for_reset(token)
        if user is None:
            return False
        self._replace_password(user["id"], new_password)
        return True

    def change_password(self, user_id: int, current: str, new: str, keep_token: str | None) -> bool:
        with self._lock:
            row = self._db.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,)).fetchone()
        if row is None or not verify_password(current, row["password_hash"]):
            return False
        self._replace_password(user_id, new, keep_token)
        return True

    def _replace_password(self, user_id: int, new_password: str, keep_token: str | None = None) -> None:
        """New password; every other session and every reset link of the user stops working."""
        keep = _token_hash(keep_token) if keep_token else ""
        with self._lock, self._db:
            self._db.execute(
                "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
                (hash_password(new_password), _now_iso(), user_id),
            )
            self._db.execute("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?", (user_id, keep))
            self._db.execute("DELETE FROM password_resets WHERE user_id = ?", (user_id,))

    def seed_admin(self) -> None:
        if self.count() == 0:
            email, password = SEED_ADMIN
            self.create(email, password, "admin")
            log.warning("Created initial admin %s — change its password before real use", email)


users = UserStore()


def _cookie(scope, name: str) -> str | None:
    for key, value in scope.get("headers", []):
        if key == b"cookie":
            jar = SimpleCookie()
            jar.load(value.decode("latin-1"))
            if name in jar:
                return jar[name].value
    return None


class AuthGate:
    """ASGI middleware: every /api request and WebSocket needs a valid session cookie,
    except the login endpoint. Cookies also reach <img> MJPEG streams and WebSockets,
    which cannot send an Authorization header."""

    def __init__(self, app, store: UserStore):
        self.app = app
        self.store = store

    async def __call__(self, scope, receive, send):
        path = scope.get("path", "")
        if scope["type"] in ("http", "websocket") and path.startswith("/api/") and path not in PUBLIC_PATHS:
            token = _cookie(scope, SESSION_COOKIE)
            user = self.store.user_for_token(token) if token else None
            if user is None:
                if scope["type"] == "http":
                    await JSONResponse({"detail": "Not authenticated"}, status_code=401)(scope, receive, send)
                else:
                    await receive()  # websocket.connect
                    await send({"type": "websocket.close", "code": 4401})
                return
            scope.setdefault("state", {})["user"] = user
        await self.app(scope, receive, send)


# --- login rate limit ----------------------------------------------------------------

_failures: dict[str, deque[float]] = {}
_reset_requests: dict[str, deque[float]] = {}
MAX_FAILURES, WINDOW = 10, 300.0
MAX_RESET_REQUESTS, RESET_WINDOW = 5, 900.0


def _check_rate(ip: str, log_: dict[str, deque[float]] = _failures, limit: int = MAX_FAILURES, window: float = WINDOW) -> None:
    attempts = log_.get(ip)
    now = time.monotonic()
    while attempts and now - attempts[0] > window:
        attempts.popleft()
    if attempts and len(attempts) >= limit:
        raise HTTPException(429, "Too many attempts, try again in a few minutes")


# --- routes ----------------------------------------------------------------------------

router = APIRouter(prefix="/api/auth")


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=1, max_length=200)


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response):
    ip = request.client.host if request.client else "?"
    _check_rate(ip)
    user = users.authenticate(body.email, body.password)
    if user is None:
        _failures.setdefault(ip, deque()).append(time.monotonic())
        raise HTTPException(401, "Invalid email or password")
    _failures.pop(ip, None)
    response.set_cookie(
        SESSION_COOKIE,
        users.open_session(user["id"]),
        max_age=SESSION_TTL,
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https",
        path="/",
    )
    return user


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        users.close_session(token)
    response.delete_cookie(SESSION_COOKIE, path="/")


@router.get("/me")
def me(request: Request):
    return request.state.user


class ForgotIn(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    lang: str = "en"


@router.post("/forgot", status_code=202)
def forgot(body: ForgotIn, request: Request, background: BackgroundTasks):
    """Always answers the same way and at once (the email goes out in the background),
    so nobody can probe which emails have accounts."""
    ip = request.client.host if request.client else "?"
    _check_rate(ip, _reset_requests, MAX_RESET_REQUESTS, RESET_WINDOW)
    _reset_requests.setdefault(ip, deque()).append(time.monotonic())
    opened = users.open_reset(body.email)
    if opened:
        user, token = opened
        link = f"{_public_base(request)}/?reset={token}"
        background.add_task(mailer.send_password_reset, user["email"], link, body.lang, RESET_TTL // 60)
    return {"ok": True}


def _public_base(request: Request) -> str:
    # The configured address wins. Otherwise (local testing) the page the user is on;
    # a forged Origin can't steal a token then, because the link only goes to the log.
    if settings.public_url:
        return settings.public_url.rstrip("/")
    origin = request.headers.get("origin")
    if origin and not mailer.configured():
        return origin.rstrip("/")
    return f"http://localhost:{settings.port}"


@router.get("/reset/check")
def reset_check(token: str):
    user = users.user_for_reset(token)
    if user is None:
        raise HTTPException(410, "This link is invalid or has expired")
    return {"email": user["email"]}


class ResetIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    new_password: str = Field(min_length=MIN_PASSWORD, max_length=200)


@router.post("/reset", status_code=204)
def reset(body: ResetIn):
    if not users.complete_reset(body.token, body.new_password):
        raise HTTPException(410, "This link is invalid or has expired")


class ChangeIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=MIN_PASSWORD, max_length=200)


@router.post("/change-password", status_code=204)
def change_password(body: ChangeIn, request: Request):
    ip = request.client.host if request.client else "?"
    _check_rate(ip)
    token = request.cookies.get(SESSION_COOKIE)
    if not users.change_password(request.state.user["id"], body.current_password, body.new_password, token):
        _failures.setdefault(ip, deque()).append(time.monotonic())
        raise HTTPException(403, "The current password is wrong")


# --- command line ------------------------------------------------------------------------


def _cli() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.auth", description="Manage CamOn user accounts")
    sub = parser.add_subparsers(dest="cmd", required=True)
    add = sub.add_parser("add", help="create a user")
    add.add_argument("email")
    add.add_argument("password")
    add.add_argument("--role", choices=ROLES, default="user")
    sub.add_parser("list", help="list users")
    pw = sub.add_parser("passwd", help="set a new password")
    pw.add_argument("email")
    pw.add_argument("password")
    rm = sub.add_parser("delete", help="delete a user")
    rm.add_argument("email")
    args = parser.parse_args()

    if args.cmd == "add":
        try:
            print(users.create(args.email, args.password, args.role))
        except sqlite3.IntegrityError:
            raise SystemExit(f"{args.email} already exists")
    elif args.cmd == "list":
        for u in users.list():
            print(f"{u['id']:>3}  {u['role']:<5}  {u['email']:<32}  created {u['created_at']}  updated {u['updated_at']}")
    elif args.cmd == "passwd":
        print("updated" if users.set_password(args.email, args.password) else "no such user")
    elif args.cmd == "delete":
        print("deleted" if users.delete(args.email) else "no such user")


if __name__ == "__main__":
    _cli()
