"""
=============================================================
  SEHAS — Smart Emergency Health Alert System
  ml/train_model.py — LSTM Model Training
=============================================================
  Usage:
    uv run python ml/train_model.py
=============================================================
"""

import os
import numpy as np
import tensorflow as tf
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import classification_report
import joblib
import matplotlib.pyplot as plt

# ─────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────
DATASET_PATH   = os.path.join("Dataset", "UCI HAR Dataset")
MODELS_DIR     = os.path.join("ml", "models")
MODEL_PATH     = os.path.join(MODELS_DIR, "lstm_model.keras")
SCALER_PATH    = os.path.join(MODELS_DIR, "scaler.pkl")
HISTORY_PATH   = os.path.join(MODELS_DIR, "training_history.png")

SEQ_LENGTH  = 20
EPOCHS      = 15
BATCH_SIZE  = 32

# UCI HAR activity labels that map to FALL / EMERGENCY
FALL_LABELS = {3, 6}   # 3=WALKING_DOWNSTAIRS, 6=LAYING


# ─────────────────────────────────────────────────
# 1. LOAD INERTIAL SIGNALS
# ─────────────────────────────────────────────────
def load_signals(split: str):
    path = os.path.join(DATASET_PATH, split, "Inertial Signals")
    acc_x = np.loadtxt(os.path.join(path, f"body_acc_x_{split}.txt"))
    acc_y = np.loadtxt(os.path.join(path, f"body_acc_y_{split}.txt"))
    acc_z = np.loadtxt(os.path.join(path, f"body_acc_z_{split}.txt"))
    acc_magnitude = np.sqrt(acc_x**2 + acc_y**2 + acc_z**2)
    return acc_magnitude


def load_labels(split: str) -> np.ndarray:
    path = os.path.join(DATASET_PATH, split, f"y_{split}.txt")
    return np.loadtxt(path, dtype=int)


# ─────────────────────────────────────────────────
# 2. SIMULATE HEART RATE (Camera PPG)
# ─────────────────────────────────────────────────
def simulate_heart_rate(labels: np.ndarray) -> np.ndarray:
    np.random.seed(42)
    hr = np.zeros(len(labels))
    for i, label in enumerate(labels):
        if label in [1, 2, 3]:    hr[i] = np.random.uniform(70, 120)
        elif label in [4, 5]:     hr[i] = np.random.uniform(60, 80)
        elif label == 6:           hr[i] = np.random.uniform(45, 70)
    return hr


# ─────────────────────────────────────────────────
# 3. FEATURE ENGINEERING
# ─────────────────────────────────────────────────
def build_features(acc_magnitude: np.ndarray, heart_rate: np.ndarray) -> np.ndarray:
    """Returns (n_windows, 3): [acc_mean, acc_std, heart_rate]"""
    acc_mean = acc_magnitude.mean(axis=1)
    acc_std  = acc_magnitude.std(axis=1)
    return np.column_stack([acc_mean, acc_std, heart_rate])


def binarize_labels(labels: np.ndarray) -> np.ndarray:
    return np.where(np.isin(labels, list(FALL_LABELS)), 1, 0)


def create_sequences(features: np.ndarray, labels: np.ndarray, seq_len: int):
    X, y = [], []
    for i in range(len(features) - seq_len):
        X.append(features[i : i + seq_len])
        y.append(labels[i + seq_len])
    return np.array(X), np.array(y)


# ─────────────────────────────────────────────────
# 4. LSTM MODEL
# ─────────────────────────────────────────────────
def build_model(input_shape: tuple) -> tf.keras.Model:
    model = tf.keras.Sequential([
        tf.keras.layers.LSTM(64, return_sequences=True, input_shape=input_shape),
        tf.keras.layers.Dropout(0.2),
        tf.keras.layers.LSTM(32),
        tf.keras.layers.Dropout(0.2),
        tf.keras.layers.Dense(16, activation="relu"),
        tf.keras.layers.Dense(1,  activation="sigmoid"),
    ], name="SEHAS_LSTM")

    model.compile(
        optimizer="adam",
        loss="binary_crossentropy",
        metrics=["accuracy"],
    )
    model.summary()
    return model


# ─────────────────────────────────────────────────
# 5. PLOT & SAVE HISTORY
# ─────────────────────────────────────────────────
def save_plot(history):
    fig, axes = plt.subplots(1, 2, figsize=(12, 4))
    axes[0].plot(history.history["accuracy"],     label="Train")
    axes[0].plot(history.history["val_accuracy"], label="Val")
    axes[0].set_title("Accuracy"); axes[0].legend()
    axes[1].plot(history.history["loss"],     label="Train")
    axes[1].plot(history.history["val_loss"], label="Val")
    axes[1].set_title("Loss"); axes[1].legend()
    plt.tight_layout()
    plt.savefig(HISTORY_PATH, dpi=150)
    print(f"📈 Training chart saved → {HISTORY_PATH}")


# ─────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────
def main():
    os.makedirs(MODELS_DIR, exist_ok=True)

    print("\n" + "="*55)
    print("  SEHAS — LSTM Training Pipeline")
    print("="*55)

    # Load ────────────────────────────────────────
    print("\n[1/6] Loading UCI HAR dataset...")
    acc_train = load_signals("train"); labels_train_raw = load_labels("train")
    acc_test  = load_signals("test");  labels_test_raw  = load_labels("test")

    # Simulate HR ─────────────────────────────────
    print("[2/6] Simulating Heart Rate (Camera PPG)...")
    hr_train = simulate_heart_rate(labels_train_raw)
    hr_test  = simulate_heart_rate(labels_test_raw)

    # Features ────────────────────────────────────
    print("[3/6] Building features [acc_mean, acc_std, heart_rate]...")
    X_train_raw = build_features(acc_train, hr_train)
    X_test_raw  = build_features(acc_test,  hr_test)

    # Normalize ───────────────────────────────────
    print("[4/6] Normalizing with MinMaxScaler...")
    scaler         = MinMaxScaler()
    X_train_scaled = scaler.fit_transform(X_train_raw)
    X_test_scaled  = scaler.transform(X_test_raw)
    joblib.dump(scaler, SCALER_PATH)
    print(f"     Scaler saved → {SCALER_PATH}")

    # Sequences ───────────────────────────────────
    print(f"[5/6] Creating LSTM sequences (seq_length={SEQ_LENGTH})...")
    y_train = binarize_labels(labels_train_raw)
    y_test  = binarize_labels(labels_test_raw)
    X_seq_train, y_seq_train = create_sequences(X_train_scaled, y_train, SEQ_LENGTH)
    X_seq_test,  y_seq_test  = create_sequences(X_test_scaled,  y_test,  SEQ_LENGTH)
    print(f"     Train: {X_seq_train.shape} | Test: {X_seq_test.shape}")

    # Train ───────────────────────────────────────
    print("[6/6] Training LSTM model...")
    model = build_model(input_shape=(SEQ_LENGTH, 3))
    history = model.fit(
        X_seq_train, y_seq_train,
        epochs=EPOCHS, batch_size=BATCH_SIZE, validation_split=0.2,
        callbacks=[tf.keras.callbacks.EarlyStopping(monitor="val_loss", patience=3, restore_best_weights=True)],
    )

    # Evaluate ────────────────────────────────────
    print("\n" + "─"*55)
    loss, acc = model.evaluate(X_seq_test, y_seq_test, verbose=0)
    print(f"   Test Accuracy : {acc*100:.2f}%  |  Loss: {loss:.4f}")
    y_pred = (model.predict(X_seq_test, verbose=0) > 0.5).astype(int).flatten()
    print(classification_report(y_seq_test, y_pred, target_names=["Normal", "Emergency"]))

    # Save model ──────────────────────────────────
    model.save(MODEL_PATH)
    print(f"✅ Model saved → {MODEL_PATH}")
    save_plot(history)
    print("="*55 + "\n")


if __name__ == "__main__":
    main()
