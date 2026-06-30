# DepthMap Maker ⚡

**DepthMap Maker** is a lightweight, high-performance local web application that converts standard 2D video footage into high-fidelity depth maps. Powered by **Depth Anything V2** running on ONNX Runtime, it handles the model downloading, frame extraction, depth estimation, color mapping, and compilation entirely on your local machine with no external cloud dependencies.

---

## 🚀 Key Features

- **Local Execution:** Your videos and data never leave your computer. Processing runs entirely locally using CPU or GPU (via ONNX Runtime).
- **Depth Anything V2 Support:** Leverages cutting-edge monocular depth estimation models:
  - `small` (vit_small.onnx) - Extremely fast, perfect for quick drafts and lower-spec hardware (~95 MB).
  - `base` (vit_base.onnx) - High fidelity, captures details with crisp boundaries (~190 MB).
  - `large` (vit_large.onnx) - Production-quality, extremely detailed depth estimation for professional workflows (~1.3 GB).
- **Temporal Smoothing:** Configurable frame-blending factor (0.1 - 1.0) to eliminate depth map flickering in videos.
- **Multiple Colormaps:** Export depth maps in your choice of colorizations:
  - `grayscale` (Raw depth map)
  - `inferno` (Cinematic)
  - `plasma` (Electric)
  - `magma` (Volcanic)
  - `viridis` (Scientific)
- **Dynamic Web Dashboard:** A responsive, sleek user interface featuring a gorgeous dark mode, ambient glows, progress feedback, download metrics, and a side-by-side video player to preview output.
- **Robust Processing State:** Start, track, or cancel rendering at any time.

---

## 🛠️ Getting Started

### Prerequisites

- **Python 3.8 or higher** installed on your system and added to your environment `PATH`.

### Quick Start (Windows)

1. Simply double-click **`run.bat`** in the project root directory.
2. The script will automatically:
   - Create a Python virtual environment (`.venv`) if one doesn't exist.
   - Install/upgrade `pip` and fetch all dependencies listed in `requirements.txt`.
   - Open your default web browser to the dashboard (`http://127.0.0.1:8000/`).
   - Start the FastAPI backend server.

---

## 🖥️ Architecture & File Structure

```text
depth-map-app/
├── run.bat              # Launcher script (checks Python, creates venv, runs server)
├── server.py            # FastAPI web server and API endpoints
├── depth_processor.py   # ONNX inference pipeline (downloads models, processes frames)
├── requirements.txt     # Python library dependencies
├── static/              # Dashboard Frontend assets
│   ├── index.html       # UI structure and layout
│   ├── style.css        # Custom UI styling (dark mode, glassmorphism, responsive)
│   └── app.js           # API integration, drag-and-drop, state updates
├── models/              # Downloaded ONNX model weights (git-ignored)
├── uploads/             # Source videos uploaded by the user (git-ignored)
└── outputs/             # Generated depth-map video outputs (git-ignored)
```

---

## 🔌 API Endpoints Summary

DepthMap Maker exposes a simple REST API for custom integrations:

- **`POST /api/upload`**: Uploads a raw video file.
- **`POST /api/process`**: Starts a background thread to process depth estimation. Expects `filename`, `model` (`small`, `base`, or `large`), `colormap` (e.g. `grayscale`, `inferno`), and `blend` (float from 0.1 to 1.0).
- **`GET /api/status`**: Returns the current processing state (idle, downloading, processing, error, etc.) and progress percentages.
- **`POST /api/cancel`**: Safely interrupts the active model execution.
