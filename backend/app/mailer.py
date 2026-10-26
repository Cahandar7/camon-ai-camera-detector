"""Outgoing email (password resets) over plain SMTP — works with Gmail app passwords,
Brevo, Resend, SendGrid, Mailgun or a company mail server. If SMTP isn't configured
the message is written to the server log instead, so the flow can be tested locally."""

from __future__ import annotations

import html
import logging
import smtplib
import ssl
from email.message import EmailMessage

from .config import settings

log = logging.getLogger("camon")

RESET_TEXT = {
    "en": {
        "subject": "Reset your CamOn password",
        "intro": "Someone (hopefully you) asked to reset the CamOn password for {email}.",
        "button": "Set a new password",
        "expiry": "The link works once and expires in {minutes} minutes.",
        "ignore": "If it wasn't you, just ignore this email — your password stays the same.",
    },
    "az": {
        "subject": "CamOn şifrənizi yeniləyin",
        "intro": "Kimsə (ümid edirik ki, siz) {email} üçün CamOn şifrəsinin yenilənməsini istədi.",
        "button": "Yeni şifrə təyin et",
        "expiry": "Keçid yalnız bir dəfə işləyir və {minutes} dəqiqə ərzində etibarlıdır.",
        "ignore": "Bu siz deyilsinizsə, məktubu nəzərə almayın — şifrəniz dəyişməyəcək.",
    },
    "ru": {
        "subject": "Сброс пароля CamOn",
        "intro": "Кто-то (надеемся, вы) запросил сброс пароля CamOn для {email}.",
        "button": "Задать новый пароль",
        "expiry": "Ссылка одноразовая и действует {minutes} минут.",
        "ignore": "Если это были не вы, просто проигнорируйте письмо — пароль останется прежним.",
    },
    "tr": {
        "subject": "CamOn şifrenizi sıfırlayın",
        "intro": "Birisi (umarız sizsiniz) {email} için CamOn şifresinin sıfırlanmasını istedi.",
        "button": "Yeni şifre belirle",
        "expiry": "Bağlantı yalnızca bir kez çalışır ve {minutes} dakika geçerlidir.",
        "ignore": "Bu siz değilseniz bu e-postayı yok sayın — şifreniz değişmez.",
    },
}


def configured() -> bool:
    return bool(settings.smtp_host)


def send_password_reset(to: str, link: str, lang: str, minutes: int) -> None:
    t = RESET_TEXT.get(lang, RESET_TEXT["en"])
    intro = t["intro"].format(email=to)
    expiry = t["expiry"].format(minutes=minutes)
    text = f"{intro}\n\n{t['button']}: {link}\n\n{expiry}\n{t['ignore']}\n\n— CamOn"
    page = f"""\
<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:28px;color:#142033">
  <div style="font-size:22px;font-weight:800;margin-bottom:18px">Cam<span style="color:#14b8a6">On</span></div>
  <p style="font-size:15px;line-height:1.5">{html.escape(intro)}</p>
  <p style="margin:26px 0"><a href="{html.escape(link)}" style="background:#1fd1b2;color:#04140d;text-decoration:none;
     font-weight:700;padding:12px 22px;border-radius:10px;display:inline-block">{html.escape(t['button'])}</a></p>
  <p style="font-size:13px;color:#5b6474;line-height:1.5">{html.escape(expiry)}<br>{html.escape(t['ignore'])}</p>
</div>"""

    if not configured():
        log.warning("SMTP is not configured — password reset link for %s: %s", to, link)
        return

    msg = EmailMessage()
    msg["Subject"] = t["subject"]
    msg["From"] = settings.smtp_from or settings.smtp_user
    msg["To"] = to
    msg.set_content(text)
    msg.add_alternative(page, subtype="html")

    context = ssl.create_default_context()
    try:
        if settings.smtp_ssl:
            server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=context, timeout=20)
        else:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20)
            server.starttls(context=context)
        with server:
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        log.info("Password reset email sent to %s", to)
    except (OSError, smtplib.SMTPException):
        log.exception("Could not send the password reset email to %s", to)
