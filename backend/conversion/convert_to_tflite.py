import tensorflow as tf
import os

# --- Configuration ---
MODEL_DIR = "../ml/models"
H5_MODEL_NAME = "lstm_model.h5"
TFLITE_MODEL_NAME = "lstm_model.tflite"

def convert_h5_to_tflite():
    h5_path = os.path.join(MODEL_DIR, H5_MODEL_NAME)
    tflite_path = os.path.join(MODEL_DIR, TFLITE_MODEL_NAME)

    if not os.path.exists(h5_path):
        print(f"Error: H5 model file not found at {h5_path}")
        return

    print("Loading H5 model...")
    model = tf.keras.models.load_model(h5_path)

    # Call the model with dummy input to fix shapes (batch_size=1, seq_len=20, features=3)
    dummy_input = tf.zeros((1, 20, 3))
    _ = model(dummy_input)

    print("Converting model to TFLite...")
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    
    # Required for LSTM models to handle certain ops correctly
    converter.target_spec.supported_ops = [
        tf.lite.OpsSet.TFLITE_BUILTINS, # Enable TensorFlow Lite ops.
        tf.lite.OpsSet.SELECT_TF_OPS    # Enable TensorFlow ops for unsupported TFLite ops.
    ]
    # This is often needed for modern LSTM models in Keras 3
    converter._experimental_lower_tensor_list_ops = False
    
    # Optional: Optimizations
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    
    # Convert and save the model
    tflite_model = converter.convert()

    with open(tflite_path, "wb") as f:
        f.write(tflite_model)

    print(f"✅ Model successfully converted and saved to: {tflite_path}")
    print(f"   H5 size      : {os.path.getsize(h5_path) / 1024:.2f} KB")
    print(f"   TFLite size  : {os.path.getsize(tflite_path) / 1024:.2f} KB")

# --- Run Conversion ---
if __name__ == "__main__":
    convert_h5_to_tflite()
