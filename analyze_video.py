import os
import sys
import json
import cv2
import numpy as np
import onnxruntime as ort

# Define the artifact directory for this conversation
ARTIFACTS_DIR = r"C:\Users\tomas\.gemini\antigravity-ide\brain\56a992cd-e591-4fab-8395-2bc193cee222"
OUTPUT_DIR = os.path.join(ARTIFACTS_DIR, "extracted_keyframes")

def analyze_video(video_path, model_path=None):
    print(f"Opening video file: {video_path}")
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"Error: Could not open video file {video_path}")
        return
        
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    print(f"Resolution: {width}x{height}, FPS: {fps}, Total Frames: {total_frames}")
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Select keyframe indices (start, middle-early, middle-late, end)
    indices = [
        int(total_frames * 0.1),
        int(total_frames * 0.4),
        int(total_frames * 0.7),
        int(total_frames * 0.9)
    ]
    # Ensure indices are unique and valid
    indices = sorted(list(set([max(0, min(total_frames - 1, idx)) for idx in indices])))
    
    print(f"Target keyframe frames: {indices}")
    
    # Initialize ONNX session if model_path is provided and exists
    session = None
    input_name = None
    if model_path and os.path.exists(model_path):
        print(f"Loading ONNX model for keyframe depth analysis: {model_path}")
        try:
            session = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])
            input_name = session.get_inputs()[0].name
            print("Model loaded successfully.")
        except Exception as e:
            print(f"Warning: Failed to load depth model: {e}")
            
    frame_idx = 0
    keyframes_saved = []
    
    # Normalization stats for Depth Anything V2
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    
    # Gather general statistics across the video (sub-sampled to every 10th frame)
    brightness_values = []
    temporal_diffs = []
    prev_gray = None
    
    print("Scanning video for scene analysis...")
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
            
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # General stats every 10th frame
        if frame_idx % 10 == 0:
            brightness_values.append(float(np.mean(gray)))
            if prev_gray is not None:
                diff = cv2.absdiff(gray, prev_gray)
                temporal_diffs.append(float(np.mean(diff)))
            prev_gray = gray.copy()
            
        # Extract keyframes
        if frame_idx in indices:
            kf_name = f"frame_{frame_idx:04d}.png"
            kf_path = os.path.join(OUTPUT_DIR, kf_name)
            cv2.imwrite(kf_path, frame)
            
            depth_kf_path = None
            # Compute depth map if model is active
            if session:
                img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                img_resized = cv2.resize(img_rgb, (518, 518))
                img_normalized = img_resized.astype(np.float32) / 255.0
                img_normalized = (img_normalized - mean) / std
                img_transposed = np.transpose(img_normalized, (2, 0, 1))
                input_data = np.expand_dims(img_transposed, axis=0)
                
                outputs = session.run(None, {input_name: input_data})
                depth = outputs[0][0]
                
                # Normalize and apply plasma colormap for visual review
                depth_norm = 255.0 * (depth - depth.min()) / (depth.max() - depth.min() + 1e-5)
                depth_norm = np.clip(depth_norm, 0, 255).astype(np.uint8)
                depth_resized = cv2.resize(depth_norm, (width, height))
                depth_colored = cv2.applyColorMap(depth_resized, cv2.COLORMAP_PLASMA)
                
                depth_kf_name = f"depth_frame_{frame_idx:04d}.png"
                depth_kf_path = os.path.join(OUTPUT_DIR, depth_kf_name)
                cv2.imwrite(depth_kf_path, depth_colored)
                
            keyframes_saved.append({
                "frame_index": frame_idx,
                "keyframe_image": os.path.abspath(kf_path),
                "depth_image": os.path.abspath(depth_kf_path) if depth_kf_path else None
            })
            print(f"Extracted keyframe at frame {frame_idx}")
            
        frame_idx += 1
        
    cap.release()
    
    # Compile report
    report = {
        "video_properties": {
            "width": width,
            "height": height,
            "fps": fps,
            "total_frames": total_frames
        },
        "scene_statistics": {
            "average_brightness": float(np.mean(brightness_values)) if brightness_values else 0,
            "max_brightness": float(np.max(brightness_values)) if brightness_values else 0,
            "min_brightness": float(np.min(brightness_values)) if brightness_values else 0,
            "average_motion_activity": float(np.mean(temporal_diffs)) if temporal_diffs else 0,
            "max_motion_activity": float(np.max(temporal_diffs)) if temporal_diffs else 0
        },
        "extracted_keyframes": keyframes_saved
    }
    
    report_path = os.path.join(ARTIFACTS_DIR, "video_analysis_report.json")
    with open(report_path, "w") as f:
        json.dump(report, f, indent=4)
        
    print(f"\nAnalysis report saved to: {report_path}")
    print(f"Extracted assets stored in: {OUTPUT_DIR}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python analyze_video.py <path_to_video> [path_to_model_onnx]")
        sys.exit(1)
        
    video = sys.argv[1]
    model = sys.argv[2] if len(sys.argv) > 2 else None
    
    # Try default model location if not specified
    if not model:
        default_model = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "depth_anything_v2_vit_small.onnx")
        if os.path.exists(default_model):
            model = default_model
            
    analyze_video(video, model)
