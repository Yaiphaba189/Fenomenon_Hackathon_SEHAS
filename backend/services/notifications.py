import os
import logging
import json
from urllib import parse, request
import firebase_admin
from firebase_admin import credentials, messaging
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()
logger = logging.getLogger(__name__)

# Path to the firebase-auth.json file
FIREBASE_CERT_PATH = os.getenv("FIREBASE_CERT_PATH", str(Path(__file__).parent / "firebase-auth.json"))
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
TWILIO_SMS_FROM = os.getenv("TWILIO_SMS_FROM", "").strip()
TWILIO_WHATSAPP_FROM = os.getenv("TWILIO_WHATSAPP_FROM", "").strip()

class NotificationService:
    _initialized = False

    def __init__(self):
        if not NotificationService._initialized:
            self._initialize_firebase()

    def _initialize_firebase(self):
        """
        Initialize Firebase Admin SDK using the service account certificate.
        """
        try:
            if not os.path.exists(FIREBASE_CERT_PATH):
                logger.warning(
                    "Firebase certificate not found at %s. Notifications disabled.",
                    FIREBASE_CERT_PATH,
                )
                return

            cred = credentials.Certificate(FIREBASE_CERT_PATH)
            if not firebase_admin._apps:
                firebase_admin.initialize_app(cred)
            NotificationService._initialized = True
            logger.info("Firebase Admin SDK initialized successfully.")
        except Exception:
            logger.exception("Firebase initialization error")

    def send_push_notification(self, token: str, title: str, body: str, data: dict = None):
        """
        Sends an FCM Push Notification to a specific device token.
        """
        if not NotificationService._initialized:
            logger.warning("Cannot send notification: Firebase not initialized.")
            return False
            
        try:
            message = messaging.Message(
                notification=messaging.Notification(
                    title=title,
                    body=body,
                ),
                data=data,
                token=token,
            )
            response = messaging.send(message)
            logger.info("FCM push sent: %s", response)
            return True
        except Exception:
            logger.exception("FCM push error")
            return False

    def _twilio_request(self, from_value: str, to_value: str, body: str):
        if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN or not from_value:
            logger.info("Twilio is not configured for from=%s", from_value)
            return False, "twilio_not_configured"

        endpoint = (
            f"https://api.twilio.com/2010-04-01/Accounts/"
            f"{TWILIO_ACCOUNT_SID}/Messages.json"
        )
        payload = parse.urlencode(
            {
                "From": from_value,
                "To": to_value,
                "Body": body,
            }
        ).encode()
        http_request = request.Request(endpoint, data=payload, method="POST")
        auth = f"{TWILIO_ACCOUNT_SID}:{TWILIO_AUTH_TOKEN}".encode()
        encoded_auth = __import__("base64").b64encode(auth).decode()
        http_request.add_header("Authorization", f"Basic {encoded_auth}")
        http_request.add_header("Content-Type", "application/x-www-form-urlencoded")

        try:
            with request.urlopen(http_request, timeout=10) as response:
                body_text = response.read().decode()
                parsed = json.loads(body_text)
                return True, parsed.get("sid", body_text)
        except Exception as exc:
            logger.exception("Twilio request failed")
            return False, str(exc)

    def send_sms_notification(self, phone_number: str, body: str):
        return self._twilio_request(TWILIO_SMS_FROM, phone_number, body)

    def send_whatsapp_notification(self, phone_number: str, body: str):
        formatted_to = phone_number if phone_number.startswith("whatsapp:") else f"whatsapp:{phone_number}"
        from_value = TWILIO_WHATSAPP_FROM
        if from_value and not from_value.startswith("whatsapp:"):
            from_value = f"whatsapp:{from_value}"
        return self._twilio_request(from_value, formatted_to, body)

    def trigger_in_app_alert(self, patient_id: str, alert_type: str, severity: str):
        """
        Log an alert status for the dashboard. 
        In a full implementation, this could also broadcast via Supabase Realtime.
        """
        logger.info("In-app alert: %s | %s | %s", patient_id, alert_type.upper(), severity)
        return True

    @property
    def is_ready(self) -> bool:
        return NotificationService._initialized
