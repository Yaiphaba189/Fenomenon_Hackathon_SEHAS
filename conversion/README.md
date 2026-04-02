# Model Conversion to TFLite

This folder contains the script to convert the trained Keras LSTM model (`.h5`) to TensorFlow Lite (`.tflite`) format for mobile deployment.

## Usage

Run the conversion script using `uv`:

```bash
uv run python convert_to_tflite.py
```

The converted model will be saved to `../ml/models/lstm_model.tflite`.

## Important Note for Mobile Deployment

The converted LSTM model uses **Select TensorFlow Ops** (Flex delegate). When integrating this `.tflite` model into a Flutter, Android, or iOS app, you must enable the Flex delegate.

### Flutter (tflite_flutter)
In your `pubspec.yaml`, ensure you use a version that supports Flex. You might need to add specific native configurations.

### Android
Add the following dependency to your `build.gradle`:
```gradle
dependencies {
    implementation 'org.tensorflow:tensorflow-lite-select-tf-ops:2.16.1'
}
```

### iOS
Add the following to your `Podfile`:
```ruby
pod 'TensorFlowLiteSelectTfOps', '~> 2.16.1'
```
