import os
import logging
import firebase_admin
from firebase_admin import credentials, messaging
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()
logger = logging.getLogger(__name__)

# Path to the firebase-auth.json file
FIREBASE_CERT_PATH = os.getenv("FIREBASE_CERT_PATH", str(Path(__file__).parent / "firebase-auth.json"))

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
