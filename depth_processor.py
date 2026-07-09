import os
import sys
import time
import requests
import cv2
import numpy as np
import onnxruntime as ort
import threading

# Configuration
MODELS = {
    "small": {
        "url": "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx",
        "filename": "depth_anything_v2_vit_small.onnx"
    },
    "base": {
        "url": "https://huggingface.co/onnx-community/depth-anything-v2-base/resolve/main/onnx/model.onnx",
        "filename": "depth_anything_v2_vit_base.onnx"
    },
    "large": {
        "url": "https://huggingface.co/onnx-community/depth-anything-v2-large/resolve/main/onnx/model.onnx",
        "filename": "depth_anything_v2_vit_large.onnx"
    }
}

COLORMAPS = {
    "grayscale": None,
    "inferno": cv2.COLORMAP_INFERNO,
    "plasma": cv2.COLORMAP_PLASMA,
    "magma": cv2.COLORMAP_MAGMA,
    "viridis": cv2.COLORMAP_VIRIDIS
}

def decode_base64_mask(mask_data_url):
    if not mask_data_url:
        return None
    import base64
    if "," in mask_data_url:
        encoded = mask_data_url.split(",", 1)[1]
    else:
        encoded = mask_data_url
    try:
        img_bytes = base64.b64decode(encoded)
        nparr = np.frombuffer(img_bytes, np.uint8)
        mask_rgba = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
        return mask_rgba
    except Exception as e:
        print(f"decode_base64_mask error: {e}")
        return None

def get_warped_mask(initial_mask_crop, initial_override_crop, bbox, frame_w, frame_h):
    x_i, y_i, w_i, h_i = bbox
    
    # Clip coordinates to frame boundaries
    x_start = max(0, x_i)
    y_start = max(0, y_i)
    x_end = min(frame_w, x_i + w_i)
    y_end = min(frame_h, y_i + h_i)
    
    # Calculate crop width and height in the destination
    dest_w = x_end - x_start
    dest_h = y_end - y_start
    
    if dest_w <= 0 or dest_h <= 0 or w_i <= 0 or h_i <= 0:
        return np.zeros((frame_h, frame_w), dtype=np.uint8), np.zeros((frame_h, frame_w), dtype=bool)
        
    # Resize initial crops to the tracker's bounding box size
    resized_values = cv2.resize(initial_mask_crop, (w_i, h_i), interpolation=cv2.INTER_LINEAR)
    resized_override = cv2.resize(initial_override_crop.astype(np.uint8), (w_i, h_i), interpolation=cv2.INTER_NEAREST)
    
    # If the bounding box went partially out of frame, we crop the resized mask
    src_x_start = max(0, -x_i)
    src_y_start = max(0, -y_i)
    src_x_end = min(src_x_start + dest_w, resized_values.shape[1])
    src_y_end = min(src_y_start + dest_h, resized_values.shape[0])
    
    cropped_values = resized_values[src_y_start:src_y_end, src_x_start:src_x_end]
    cropped_override = resized_override[src_y_start:src_y_end, src_x_start:src_x_end]
    
    # Place inside full frame size masks
    active_mask = np.zeros((frame_h, frame_w), dtype=np.uint8)
    override_mask = np.zeros((frame_h, frame_w), dtype=bool)
    
    c_h, c_w = cropped_values.shape
    active_mask[y_start:y_start+c_h, x_start:x_start+c_w] = cropped_values
    override_mask[y_start:y_start+c_h, x_start:x_start+c_w] = cropped_override > 0
    
    return active_mask, override_mask

class DepthProcessor:
    def __init__(self, base_dir=None):
        self.base_dir = base_dir or os.path.dirname(os.path.abspath(__file__))
        self.models_dir = os.path.join(self.base_dir, "models")
        os.makedirs(self.models_dir, exist_ok=True)
        
        # State tracking
        self.state = {
            "status": "idle",       # idle, downloading, loading, processing, done, error
            "progress": 0.0,       # 0.0 to 100.0
            "current_frame": 0,
            "total_frames": 0,
            "error_message": "",
            "download_speed": ""
        }
        self.state_lock = threading.Lock()
        self._cancel_flag = False

    def update_state(self, **kwargs):
        with self.state_lock:
            self.state.update(kwargs)

    def get_state(self):
        with self.state_lock:
            return self.state.copy()

    def cancel(self):
        self._cancel_flag = True

    def download_model(self, model_key):
        model_info = MODELS.get(model_key)
        if not model_info:
            raise ValueError(f"Unknown model: {model_key}")
        
        dest_path = os.path.join(self.models_dir, model_info["filename"])
        if os.path.exists(dest_path) and os.path.getsize(dest_path) > 10000000:
            # Model exists and size seems reasonable (more than 10MB)
            return dest_path

        self.update_state(status="downloading", progress=0.0, error_message="")
        
        url = model_info["url"]
        temp_path = dest_path + ".tmp"
        
        try:
            response = requests.get(url, stream=True)
            response.raise_for_status()
            total_size = int(response.headers.get('content-length', 0))
            
            downloaded = 0
            start_time = time.time()
            
            with open(temp_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if self._cancel_flag:
                        self.update_state(status="idle", progress=0.0)
                        f.close()
                        if os.path.exists(temp_path):
                            os.remove(temp_path)
                        return None
                        
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        if total_size > 0:
                            percent = (downloaded / total_size) * 100
                            elapsed = time.time() - start_time
                            speed_mb = (downloaded / (1024 * 1024)) / (elapsed if elapsed > 0 else 1)
                            speed_str = f"{speed_mb:.2f} MB/s"
                            self.update_state(progress=round(percent, 1), download_speed=speed_str)
            
            os.rename(temp_path, dest_path)
            self.update_state(status="idle", progress=0.0, download_speed="")
            return dest_path
            
        except Exception as e:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            self.update_state(status="error", error_message=f"Download failed: {str(e)}")
            raise e

    def process_video(self, input_video_path, output_video_path, model_key="small", colormap_key="grayscale", blend=0.6, min_depth=0.0, max_depth=1.0, gamma=1.0, filter_type="median", edits=None):
        self._cancel_flag = False
        self.update_state(status="starting", progress=0.0, current_frame=0, total_frames=0, error_message="")
        
        try:
            # 1. Download model if needed
            model_path = self.download_model(model_key)
            if not model_path:
                return False

            self.update_state(status="loading", progress=0.0)
            
            # 2. Initialize ONNX Session
            # We want DML (DirectML) or CUDA if available, but fallback to CPU
            providers = ['DmlExecutionProvider', 'CUDAExecutionProvider', 'CPUExecutionProvider']
            try:
                session = ort.InferenceSession(model_path, providers=providers)
            except Exception as e:
                # Fallback to standard CPU if custom execution provider fails
                session = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])
            
            input_name = session.get_inputs()[0].name
            
            # 3. Open Video
            cap = cv2.VideoCapture(input_video_path)
            if not cap.isOpened():
                raise ValueError("Could not open input video.")
                
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            fps = cap.get(cv2.CAP_PROP_FPS)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            
            if total_frames <= 0:
                # Fallback estimate
                total_frames = 100
                
            self.update_state(status="processing", total_frames=total_frames, current_frame=0)
            
            # 4. Set up Video Writer
            # We write to a temporary file first using the standard mp4v codec,
            # which is universally supported by OpenCV on all platforms.
            temp_output_path = output_video_path + ".temp.mp4"
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            out = cv2.VideoWriter(temp_output_path, fourcc, fps, (width, height))
            if not out.isOpened():
                raise Exception("Failed to open OpenCV VideoWriter with mp4v codec")
            
            frame_idx = 0
            
            # Parse edits dictionary {frame_idx: mask_rgba}
            parsed_edits = {}
            if edits:
                for k, v in edits.items():
                    try:
                        f_idx = int(k)
                        mask_rgba = decode_base64_mask(v)
                        if mask_rgba is not None:
                            parsed_edits[f_idx] = mask_rgba
                    except Exception as e:
                        print(f"Error parsing edit for frame {k}: {str(e)}")
            
            # Edits tracking state
            active_tracker = None
            active_mask = None
            override_mask = None
            initial_mask_crop = None
            initial_override_crop = None
            prev_bbox = None
            
            # ImageNet normalization stats
            mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
            std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
            
            # Temporal smoothing variables
            smooth_min = None
            smooth_max = None
            prev_depth_norm = None
            
            while cap.isOpened():
                if self._cancel_flag:
                    self.update_state(status="cancelled")
                    break
                    
                ret, frame = cap.read()
                if not ret:
                    break
                
                # Check for manual edit at this frame index
                if frame_idx in parsed_edits:
                    mask_rgba = parsed_edits[frame_idx]
                    
                    if mask_rgba.shape[0] != height or mask_rgba.shape[1] != width:
                        mask_rgba = cv2.resize(mask_rgba, (width, height), interpolation=cv2.INTER_NEAREST)
                        
                    if len(mask_rgba.shape) == 2:
                        h_m, w_m = mask_rgba.shape
                        temp = np.zeros((h_m, w_m, 4), dtype=np.uint8)
                        temp[:, :, 0] = mask_rgba
                        temp[:, :, 3] = (mask_rgba > 0).astype(np.uint8) * 255
                        mask_rgba = temp
                        
                    override_mask = mask_rgba[:, :, 3] > 127
                    active_mask = mask_rgba[:, :, 0]
                    
                    y_indices, x_indices = np.where(override_mask)
                    if len(x_indices) > 0 and len(y_indices) > 0:
                        x_min, x_max = x_indices.min(), x_indices.max()
                        y_min, y_max = y_indices.min(), y_indices.max()
                        
                        x_min_clip = max(0, min(x_min, width - 1))
                        y_min_clip = max(0, min(y_min, height - 1))
                        w_clip = max(5, min(x_max - x_min + 1, width - x_min_clip))
                        h_clip = max(5, min(y_max - y_min + 1, height - y_min_clip))
                        
                        prev_bbox = (x_min_clip, y_min_clip, w_clip, h_clip)
                        initial_mask_crop = active_mask[y_min_clip:y_min_clip+h_clip, x_min_clip:x_min_clip+w_clip].copy()
                        initial_override_crop = override_mask[y_min_clip:y_min_clip+h_clip, x_min_clip:x_min_clip+w_clip].copy()
                        
                        active_tracker = cv2.TrackerMIL_create()
                        active_tracker.init(frame, prev_bbox)
                    else:
                        active_tracker = None
                        active_mask = None
                        override_mask = None
                        prev_bbox = None
                        
                elif active_tracker is not None:
                    success, bbox = active_tracker.update(frame)
                    if success:
                        x_i, y_i, w_i, h_i = [int(v) for v in bbox]
                        prev_bbox = (x_i, y_i, w_i, h_i)
                    else:
                        x_i, y_i, w_i, h_i = prev_bbox
                        
                    active_mask, override_mask = get_warped_mask(
                        initial_mask_crop,
                        initial_override_crop,
                        (x_i, y_i, w_i, h_i),
                        width,
                        height
                    )
                
                # Preprocess Frame
                # cv2 reads in BGR, model expects RGB
                img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                
                # Model input resolution is 518x518
                input_size = 518
                img_resized = cv2.resize(img_rgb, (input_size, input_size))
                
                # Normalize and prepare tensor
                img_normalized = img_resized.astype(np.float32) / 255.0
                img_normalized = (img_normalized - mean) / std
                img_transposed = np.transpose(img_normalized, (2, 0, 1)) # HWC to CHW
                input_data = np.expand_dims(img_transposed, axis=0) # Add batch size
                
                # Run Inference
                outputs = session.run(None, {input_name: input_data})
                depth = outputs[0][0] # Retrieve first item of batch [518, 518]

                # Postprocess Depth Map
                # 1. Normalize depth values using smoothed min/max bounds to prevent flashing
                current_min = depth.min()
                current_max = depth.max()
                
                if smooth_min is None:
                    smooth_min = current_min
                    smooth_max = current_max
                else:
                    alpha_range = 0.1 # Gradual dynamic range shifts
                    smooth_min = alpha_range * current_min + (1.0 - alpha_range) * smooth_min
                    smooth_max = alpha_range * current_max + (1.0 - alpha_range) * smooth_max

                if smooth_max - smooth_min > 0:
                    depth_norm = 255.0 * (depth - smooth_min) / (smooth_max - smooth_min + 1e-5)
                else:
                    depth_norm = np.zeros_like(depth)
                
                # Clip to prevent overflow and keep as float32 for high-precision blending
                depth_norm = np.clip(depth_norm, 0, 255).astype(np.float32)
                
                # Near/Far depth range clipping (values normalized between 0.0 and 1.0)
                depth_norm_01 = depth_norm / 255.0
                depth_norm_01 = np.clip(depth_norm_01, min_depth, max_depth)
                if max_depth - min_depth > 1e-5:
                    depth_norm_01 = (depth_norm_01 - min_depth) / (max_depth - min_depth)
                else:
                    depth_norm_01 = np.zeros_like(depth_norm_01)
                
                # Apply Gamma Correction
                if abs(gamma - 1.0) > 1e-5:
                    depth_norm_01 = np.power(depth_norm_01, gamma)
                
                depth_norm = depth_norm_01 * 255.0
                
                # Constant Temporal Frame Blending
                if prev_depth_norm is None:
                    prev_depth_norm = depth_norm.copy()
                else:
                    # Use the user-configured frame blending factor (alpha)
                    # Lower alpha values blend more history (less flicker, more trails).
                    # Higher alpha values blend less history (more responsive, more flicker).
                    alpha = blend
                    depth_norm = alpha * depth_norm + (1.0 - alpha) * prev_depth_norm
                    prev_depth_norm = depth_norm.copy()
                
                depth_norm_uint8 = depth_norm.astype(np.uint8)
                
                # 2. Resize back to original dimensions
                depth_resized = cv2.resize(depth_norm_uint8, (width, height))
                
                # Apply spatial filter to clean up raw prediction pixel jitter
                if filter_type == "median":
                    depth_resized = cv2.medianBlur(depth_resized, 3)
                elif filter_type == "bilateral":
                    # Bilateral filter smooths regions while preserving crisp edges
                    depth_resized = cv2.bilateralFilter(depth_resized, 5, 50, 50)
                
                # Apply manual overrides/tracking masks
                if override_mask is not None:
                    depth_resized[override_mask] = active_mask[override_mask]
                
                # 3. Apply color mapping if requested
                colormap_id = COLORMAPS.get(colormap_key)
                if colormap_id is not None:
                    depth_final = cv2.applyColorMap(depth_resized, colormap_id)
                else:
                    depth_final = cv2.cvtColor(depth_resized, cv2.COLOR_GRAY2BGR)
                
                # Write to output
                out.write(depth_final)
                
                # Update progress
                frame_idx += 1
                percent = (frame_idx / total_frames) * 100
                self.update_state(progress=round(percent, 1), current_frame=frame_idx)
                
            cap.release()
            out.release()
            
            if self._cancel_flag:
                if os.path.exists(temp_output_path):
                    os.remove(temp_output_path)
                if os.path.exists(output_video_path):
                    os.remove(output_video_path)
                return False
                
            # Transcode the temporary video to a browser-compatible web-optimized H.264 MP4 with faststart,
            # merging back original audio if present.
            import subprocess
            try:
                cmd = [
                    'ffmpeg', '-y',
                    '-i', temp_output_path,
                    '-i', input_video_path,
                    '-map', '0:v:0',
                    '-map', '1:a?',
                    '-c:v', 'libx264',
                    '-pix_fmt', 'yuv420p',
                    '-preset', 'fast',
                    '-crf', '22',
                    '-c:a', 'aac',
                    '-movflags', '+faststart',
                    output_video_path
                ]
                subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            finally:
                # Clean up temp file
                if os.path.exists(temp_output_path):
                    os.remove(temp_output_path)
                
            self.update_state(status="done", progress=100.0)
            return True
            
        except Exception as e:
            # Clean up temp file in case of error
            temp_path_local = locals().get('temp_output_path', None)
            if temp_path_local and os.path.exists(temp_path_local):
                try:
                    os.remove(temp_path_local)
                except Exception:
                    pass
            self.update_state(status="error", error_message=str(e))
            import traceback
            traceback.print_exc()
            return False

# Single global instance for easy access
processor = DepthProcessor()
