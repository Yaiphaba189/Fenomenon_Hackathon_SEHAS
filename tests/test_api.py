import os
import unittest
from unittest.mock import patch

os.environ["DEBUG"] = "true"
os.environ["SEHAS_API_KEY"] = "test-key"

import api
from backend.ml.predict import PredictionResult


class FakePredictor:
    @staticmethod
    def _classify(score: float) -> PredictionResult:
        if score >= 0.7:
            return PredictionResult(
                score=score,
                risk_level="CRITICAL",
                alert=True,
                message="Emergency detected.",
            )
        if score >= 0.4:
            return PredictionResult(
                score=score,
                risk_level="MEDIUM",
                alert=False,
                message="Monitor closely.",
            )
        return PredictionResult(
            score=score,
            risk_level="NORMAL",
            alert=False,
            message="All vitals normal. No action required.",
        )

    def predict(
        self,
        heart_rate: float,
        acc_mean: float,
        acc_std: float,
        sequence_key: str | None = None,
    ) -> PredictionResult:
        if heart_rate < 50 or acc_std > 0.7:
            return self._classify(0.98)
        return self._classify(0.02)


class FakeNotificationService:
    def __init__(self):
        self.sent = []
        self.in_app_alerts = []
        self.sms = []
        self.whatsapp = []

    def send_push_notification(self, token: str, title: str, body: str, data=None):
        self.sent.append(
            {"token": token, "title": title, "body": body, "data": data or {}}
        )
        return True

    def trigger_in_app_alert(self, patient_id: str, alert_type: str, severity: str):
        self.in_app_alerts.append(
            {"patient_id": patient_id, "alert_type": alert_type, "severity": severity}
        )
        return True

    def send_sms_notification(self, phone_number: str, body: str):
        self.sms.append({"phone_number": phone_number, "body": body})
        return True, "sms-1"

    def send_whatsapp_notification(self, phone_number: str, body: str):
        self.whatsapp.append({"phone_number": phone_number, "body": body})
        return True, "wa-1"

    @property
    def is_ready(self) -> bool:
        return True


class ApiHardeningTests(unittest.TestCase):
    def setUp(self):
        self.patchers = [
            patch.object(api, "SEHASPredictor", FakePredictor),
            patch.object(api, "NotificationService", FakeNotificationService),
            patch.object(api.db, "ensure_database_schema", return_value=None),
            patch.object(api.db, "check_connection", return_value=True),
            patch.object(api.db, "get_due_pending_alerts", return_value=[]),
            patch.object(api.db, "get_due_dispatched_alerts", return_value=[]),
            patch.object(api.db, "save_vital_reading", return_value=True),
            patch.object(api.db, "create_alert", return_value="alert-1"),
            patch.object(api.db, "claim_alert_for_dispatch", return_value=None),
            patch.object(api.db, "claim_alert_for_escalation", return_value=None),
            patch.object(api.db, "upsert_patient", return_value=True),
            patch.object(api.db, "get_alert_history", return_value=[]),
            patch.object(api.db, "get_recent_alerts", return_value=[]),
            patch.object(api.db, "get_dashboard_summary", return_value={}),
            patch.object(api.db, "list_patients", return_value=[]),
            patch.object(api.db, "get_patient", return_value=None),
            patch.object(api.db, "get_idempotency_response", return_value=None),
            patch.object(api.db, "save_idempotency_response", return_value=True),
            patch.object(api.db, "log_notification_delivery", return_value=True),
            patch.object(api.db, "cancel_alert_if_pending", return_value=True),
            patch.object(api.db, "acknowledge_alert", return_value=True),
            patch.object(api.db, "get_alert_status", return_value=None),
        ]
        for patcher in self.patchers:
            patcher.start()

        from fastapi.testclient import TestClient

        self.client_context = TestClient(api.app)
        self.client = self.client_context.__enter__()
        self.headers = {"X-API-Key": "test-key"}

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        for patcher in reversed(self.patchers):
            patcher.stop()

    def test_management_routes_require_api_key(self):
        response = self.client.get("/alerts/patient-123")
        self.assertEqual(response.status_code, 401)

    def test_critical_predict_requires_patient_id(self):
        response = self.client.post(
            "/predict",
            headers=self.headers,
            json={"heart_rate": 38, "acc_mean": 0.5, "acc_std": 0.95},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("patient_id is required", response.json()["detail"])

    def test_predict_returns_success_when_authorized(self):
        response = self.client.post(
            "/predict",
            headers=self.headers,
            json={
                "heart_rate": 72,
                "acc_mean": 1.05,
                "acc_std": 0.1,
                "patient_id": "6b17c8b9-9ce6-4c9c-a94d-d6124c319dc7",
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["risk_level"], "NORMAL")
        self.assertFalse(payload["alert"])

    def test_dashboard_overview_returns_payload(self):
        with (
            patch.object(api.db, "get_dashboard_summary", return_value={"pending_count": 2}),
            patch.object(api.db, "get_recent_alerts", return_value=[{"id": "alert-1"}]),
            patch.object(api.db, "list_patients", return_value=[{"id": "patient-1"}]),
        ):
            response = self.client.get("/dashboard/overview", headers=self.headers)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["summary"]["pending_count"], 2)

    def test_process_due_alerts_once_dispatches_and_escalates(self):
        fake_service = FakeNotificationService()
        dispatch_record = {
            "id": "alert-1",
            "patient_id": "patient-1",
            "type": "fall",
            "severity": "critical",
            "sensor_snapshot": {
                "patient_name": "Jane",
                "device_token": "device-1",
                "gps_lat": 12.1,
                "gps_lng": 77.1,
            },
        }
        escalation_record = {
            "id": "alert-2",
            "patient_id": "patient-2",
            "type": "voice_sos",
            "severity": "critical",
            "sensor_snapshot": {
                "patient_name": "John",
                "device_token": "device-2",
            },
        }

        with (
            patch.object(api.db, "get_due_pending_alerts", return_value=[{"id": "alert-1"}]),
            patch.object(api.db, "claim_alert_for_dispatch", return_value=dispatch_record),
            patch.object(api.db, "get_due_dispatched_alerts", return_value=[{"id": "alert-2"}]),
            patch.object(api.db, "claim_alert_for_escalation", return_value=escalation_record),
            patch.object(
                api.db,
                "get_patient",
                return_value={
                    "emergency_contacts": [
                        {"name": "Caregiver", "phone": "+911234567890", "relationship": "Daughter"}
                    ]
                },
            ),
            patch.object(api, "notification_service", fake_service),
        ):
            result = api.process_due_alerts_once()

        self.assertEqual(result, {"dispatched": 1, "escalated": 1})
        self.assertEqual(len(fake_service.sent), 2)
        self.assertEqual(len(fake_service.in_app_alerts), 1)
        self.assertEqual(len(fake_service.sms), 2)
        self.assertEqual(len(fake_service.whatsapp), 2)


if __name__ == "__main__":
    unittest.main()
