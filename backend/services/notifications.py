import os
import firebase_admin
from firebase_admin import credentials, messaging
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()

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
                print(f"⚠️ Firebase certificate not found at {FIREBASE_CERT_PATH}. Notifications disabled.")
                return

            cred = credentials.Certificate(FIREBASE_CERT_PATH)
            firebase_admin.initialize_app(cred)
            NotificationService._initialized = True
            print("✅ Firebase Admin SDK initialized successfully.")
        except Exception as e:
            print(f"❌ Firebase Initialization Error: {e}")

    def send_push_notification(self, token: str, title: str, body: str, data: dict = None):
        """
        Sends an FCM Push Notification to a specific device token.
        """
        if not NotificationService._initialized:
            print("⚠️ Cannot send notification: Firebase not initialized.")
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
            print(f"📱 FCM PUSH SENT: {response}")
            return True
        except Exception as e:
            print(f"❌ FCM Push Error: {e}")
            return False

    def trigger_in_app_alert(self, patient_id: str, alert_type: str, severity: str):
        """
        Log an alert status for the dashboard. 
        In a full implementation, this could also broadcast via Supabase Realtime.
        """
        print(f"🔔 IN-APP ALERT: {patient_id} | {alert_type.upper()} | {severity}")
        return True
