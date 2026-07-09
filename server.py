import os
import shutil
import threading
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

import json

from depth_processor import processor

app = FastAPI(title="Video Depth Map Generator API")

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
OUTPUT_DIR = os.path.join(BASE_DIR, "outputs")
STATIC_DIR = os.path.join(BASE_DIR, "static")

# Ensure folders exist
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)

# Mount static files
app.mount("/ui", StaticFiles(directory=STATIC_DIR, html=True), name="static")
app.mount("/videos/upload", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/videos/output", StaticFiles(directory=OUTPUT_DIR), name="outputs")

@app.get("/")
def read_root():
    return RedirectResponse(url="/ui/")


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    # Standardize filename and force .mp4 extension
    filename = file.filename.replace(" ", "_")
    base_name, _ = os.path.splitext(filename)
    filename = f"{base_name}.mp4"
    dest_path = os.path.join(UPLOAD_DIR, filename)
    
    temp_path = dest_path + ".tmp"
    
    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Transcode to a web-compatible H.264 MP4 using FFmpeg
        import subprocess
        cmd = [
            'ffmpeg', '-y',
            '-i', temp_path,
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-preset', 'fast',
            '-crf', '23',
            '-c:a', 'aac',
            '-map', '0:v:0',
            '-map', '0:a?',
            dest_path
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        # Clean up temp file
        if os.path.exists(temp_path):
            os.remove(temp_path)
            
        return {"filename": filename, "path": dest_path}
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=500, detail=f"Failed to upload/transcode file: {str(e)}")

@app.get("/api/video-info")
def get_video_info(filename: str):
    input_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(input_path):
        raise HTTPException(status_code=404, detail="Uploaded file not found.")
    
    import cv2
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise HTTPException(status_code=400, detail="Could not open video file.")
        
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0
    cap.release()
    
    return {
        "width": width,
        "height": height,
        "fps": fps,
        "total_frames": total_frames,
        "duration": duration
    }

def run_in_background(input_path, output_path, model, colormap, blend, min_depth, max_depth, gamma, filter_type, edits=None):
    processor.process_video(
        input_path, 
        output_path, 
        model_key=model, 
        colormap_key=colormap, 
        blend=blend,
        min_depth=min_depth,
        max_depth=max_depth,
        gamma=gamma,
        filter_type=filter_type,
        edits=edits
    )

@app.post("/api/process")
async def start_process(
    filename: str = Form(...),
    model: str = Form("small"),
    colormap: str = Form("grayscale"),
    blend: float = Form(0.6),
    min_depth: float = Form(0.0),
    max_depth: float = Form(1.0),
    gamma: float = Form(1.0),
    filter_type: str = Form("median"),
    edits: str = Form(None)
):
    input_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(input_path):
        raise HTTPException(status_code=404, detail="Uploaded file not found.")
    
    # Check if processor is currently busy
    current_state = processor.get_state()
    if current_state["status"] in ["downloading", "processing", "loading"]:
        return JSONResponse(
            status_code=400,
            content={"detail": f"Server is busy: {current_state['status']}"}
        )
        
    base_name, _ = os.path.splitext(filename)
    output_filename = f"depth_{colormap}_{base_name}.mp4"
    output_path = os.path.join(OUTPUT_DIR, output_filename)
    
    # Parse edits if provided
    parsed_edits = None
    if edits:
        try:
            parsed_edits = json.loads(edits)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid edits format: {str(e)}")
    
    # Run processing in a background thread so FastAPI remains responsive
    thread = threading.Thread(
        target=run_in_background,
        args=(input_path, output_path, model, colormap, blend, min_depth, max_depth, gamma, filter_type, parsed_edits),
        daemon=True
    )
    thread.start()
    
    return {"status": "started", "output_filename": output_filename}

@app.get("/api/status")
def get_status():
    return processor.get_state()

@app.post("/api/cancel")
def cancel_process():
    processor.cancel()
    return {"status": "cancel_requested"}

@app.get("/api/videos/upload/{filename}")
def get_uploaded_video(filename: str):
    file_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path)

@app.get("/api/videos/output/{filename}")
def get_output_video(filename: str):
    file_path = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path)

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
