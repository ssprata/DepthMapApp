import os
import shutil
import threading
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

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
    # Standardize filename
    filename = file.filename.replace(" ", "_")
    dest_path = os.path.join(UPLOAD_DIR, filename)
    
    try:
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return {"filename": filename, "path": dest_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")

def run_in_background(input_path, output_path, model, colormap):
    processor.process_video(input_path, output_path, model_key=model, colormap_key=colormap)

@app.post("/api/process")
async def start_process(
    filename: str = Form(...),
    model: str = Form("small"),
    colormap: str = Form("grayscale")
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
        
    output_filename = f"depth_{colormap}_{filename}"
    output_path = os.path.join(OUTPUT_DIR, output_filename)
    
    # Run processing in a background thread so FastAPI remains responsive
    thread = threading.Thread(
        target=run_in_background,
        args=(input_path, output_path, model, colormap),
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
