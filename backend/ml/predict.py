"""
=============================================================
  SEHAS — Smart Emergency Health Alert System
  ml/predict.py — Inference Engine
=============================================================
  Standalone usage:
    uv run python ml/predict.py

  As a module (used by api.py):
    from ml.predict import SEHASPredictor
=============================================================
"""

import os
from collections import defaultdict, deque
from dataclasses import dataclass

import joblib
import numpy as np
import tensorflow as tf

MODELS_DIR  = os.path.join(os.path.dirname(__file__), "models")
SCALER_PATH = os.path.join(MODELS_DIR, "scaler.pkl")
SEQ_LENGTH  = 20

# Support both new .keras and legacy .h5 format
_keras_path = os.path.join(MODELS_DIR, "lstm_model.keras")
_h5_path    = os.path.join(MODELS_DIR, "lstm_model.h5")
MODEL_PATH  = _keras_path if os.path.exists(_keras_path) else _h5_path


# ─────────────────────────────────────────────────
# Result dataclass
# ─────────────────────────────────────────────────
@dataclass
class PredictionResult:
    score      : float
    risk_level : str   # NORMAL | MEDIUM | CRITICAL
    alert      : bool
    message    : str


# ─────────────────────────────────────────────────
# Predictor — singleton loaded once
# ─────────────────────────────────────────────────
class SEHASPredictor:
    """
    Loads the trained LSTM model and scaler once.
    Call `.predict()` with live sensor values to get a result.
    """

    def __init__(self):
        print("🔄 Loading SEHAS model...")
        self.model  = tf.keras.models.load_model(MODEL_PATH)
        self.scaler = joblib.load(SCALER_PATH)
        self.sequence_buffers: dict[str, deque[np.ndarray]] = defaultdict(
            lambda: deque(maxlen=SEQ_LENGTH)
        )
        print("✅ Predictor ready.")

    def _build_sequence(
        self,
        acc_mean: float,
        acc_std: float,
        heart_rate: float,
        sequence_key: str | None = None,
    ) -> np.ndarray:
        """
        Builds (1, SEQ_LENGTH, 3) input tensor.
        When a sequence key is provided, a rolling buffer is maintained for that key.
        """
        raw    = np.array([[acc_mean, acc_std, heart_rate]])
        scaled = self.scaler.transform(raw)[0]

        if sequence_key:
            buffer = self.sequence_buffers[sequence_key]
            buffer.append(scaled)
            seq_rows = list(buffer)
            if len(seq_rows) < SEQ_LENGTH:
                pad_row = seq_rows[0]
                seq_rows = [pad_row] * (SEQ_LENGTH - len(seq_rows)) + seq_rows
            seq = np.array(seq_rows[-SEQ_LENGTH:])
        else:
            seq = np.tile(scaled, (SEQ_LENGTH, 1))

        return seq.reshape(1, SEQ_LENGTH, 3)

    @staticmethod
    def _classify(score: float) -> PredictionResult:
        if score < 0.4:
            return PredictionResult(
                score=score, risk_level="NORMAL", alert=False,
                message="All vitals normal. No action required.",
            )
        elif score < 0.7:
            return PredictionResult(
                score=score, risk_level="MEDIUM", alert=False,
                message="Elevated risk detected. Monitor closely.",
            )
        else:
            return PredictionResult(
                score=score, risk_level="CRITICAL", alert=True,
                message="⚠️ EMERGENCY DETECTED — Alert triggered!",
            )

    def predict(
        self,
        heart_rate: float,
        acc_mean: float,
        acc_std: float,
        sequence_key: str | None = None,
    ) -> PredictionResult:
        """
        Main inference entry point.

        Args:
            heart_rate : Heart rate in BPM (Camera PPG)
            acc_mean   : Mean acceleration magnitude over sensor window
            acc_std    : Std deviation of acceleration (motion variability)

        Returns:
            PredictionResult with score, risk_level, alert, message
        """
        seq   = self._build_sequence(acc_mean, acc_std, heart_rate, sequence_key=sequence_key)
        score = float(self.model.predict(seq, verbose=0)[0][0])
        return self._classify(score)


# ─────────────────────────────────────────────────
# Standalone CLI demo
# ─────────────────────────────────────────────────
def _demo():
    predictor = SEHASPredictor()

    scenarios = [
        ("👤 Normal Walking",              78,  1.05, 0.12),
        ("🧘 Resting / Sitting",           65,  0.98, 0.03),
        ("⚠️  Running (elevated HR)",      115, 1.30, 0.40),
        ("🚨 Fall Detected",               52,  0.60, 0.85),
        ("💀 Cardiac + Fall (Critical)",   38,  0.50, 0.95),
    ]

    print("\n" + "="*70)
    print(f"{'Scenario':<40} {'Score':>6}  {'Level':<10}  Alert")
    print("─"*70)
    for name, hr, am, std in scenarios:
        result = predictor.predict(heart_rate=hr, acc_mean=am, acc_std=std)
        alert_str = "🔴 YES" if result.alert else "🟢 no"
        print(f"{name:<40} {result.score:>6.3f}  {result.risk_level:<10}  {alert_str}")
    print("="*70 + "\n")

    # Interactive
    print("─"*55)
    print("🔧 CUSTOM INPUT (Ctrl+C to quit)")
    print("─"*55)
    try:
        while True:
            hr  = float(input("\nHeart Rate (bpm)        → "))
            am  = float(input("Accel Mean Magnitude    → "))
            std = float(input("Accel Std Dev           → "))
            r   = predictor.predict(hr, am, std)
            print(f"\n  Score: {r.score:.4f}  Risk: {r.risk_level}  Alert: {r.alert}")
            print(f"  {r.message}\n")
    except KeyboardInterrupt:
        print("\n\nGoodbye! 👋")
    except ValueError:
        print("  ⚠️ Invalid input.")


if __name__ == "__main__":
    _demo()
