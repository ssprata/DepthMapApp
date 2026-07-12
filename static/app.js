// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const selectedFileInfo = document.getElementById('selected-file-info');
const fileNameEl = document.getElementById('file-name');
const fileSizeEl = document.getElementById('file-size');
const removeFileBtn = document.getElementById('remove-file');

const modelSelect = document.getElementById('model-select');
const blendSlider = document.getElementById('blend-slider');
const blendVal = document.getElementById('blend-val');
const minDepthSlider = document.getElementById('min-depth-slider');
const minDepthVal = document.getElementById('min-depth-val');
const maxDepthSlider = document.getElementById('max-depth-slider');
const maxDepthVal = document.getElementById('max-depth-val');
const gammaSlider = document.getElementById('gamma-slider');
const gammaVal = document.getElementById('gamma-val');
const filterSelect = document.getElementById('filter-select');
const paletteCards = document.querySelectorAll('.palette-card');
const generateBtn = document.getElementById('generate-btn');

const progressSection = document.getElementById('progress-section');
const progressTitle = document.getElementById('progress-title');
const progressSubtitle = document.getElementById('progress-subtitle');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const speedLabel = document.getElementById('speed-label');
const infoLog = document.getElementById('info-log');
const cancelBtn = document.getElementById('cancel-btn');

const idleSection = document.getElementById('idle-section');
const resultsSection = document.getElementById('results-section');
const videoSource = document.getElementById('video-source');
const videoDepth = document.getElementById('video-depth');
const downloadBtn = document.getElementById('download-btn');
const syncPlayBtn = document.getElementById('sync-play-btn');

// Preview Tabs
const tabSplit = document.getElementById('tab-split');
const tab3d = document.getElementById('tab-3d');
const splitViewContainer = document.getElementById('split-view-container');
const threeViewContainer = document.getElementById('three-view-container');
const extrusionSlider = document.getElementById('extrusion-slider');
const extrusionVal = document.getElementById('extrusion-val');
const wireframeToggle = document.getElementById('wireframe-toggle');
const autoRotateToggle = document.getElementById('auto-rotate-toggle');

// Interactive Editor Elements
const editorSection = document.getElementById('editor-section');
const editorVideo = document.getElementById('editor-video');
const editorCanvas = document.getElementById('editor-canvas');
const brushWhiteBtn = document.getElementById('brush-white-btn');
const brushBlackBtn = document.getElementById('brush-black-btn');
const brushEraserBtn = document.getElementById('brush-eraser-btn');
const brushSizeSlider = document.getElementById('brush-size-slider');
const brushSizeVal = document.getElementById('brush-size-val');
const editorOpacitySlider = document.getElementById('editor-opacity-slider');
const editorOpacityVal = document.getElementById('editor-opacity-val');
const editorClearFrameBtn = document.getElementById('editor-clear-frame-btn');
const editorClearAllBtn = document.getElementById('editor-clear-all-btn');
const timelineKeyframesCount = document.getElementById('timeline-keyframes-count');
const timelineMarkersList = document.getElementById('timeline-markers-list');
const editorGenerateBtn = document.getElementById('editor-generate-btn');
const resultsEditBtn = document.getElementById('results-edit-btn');

// App State
let selectedFile = null;
let pollInterval = null;
let currentUploadedFilename = '';

function updateSidebarButton() {
    if (!generateBtn) return;
    const btnText = generateBtn.querySelector('span');
    if (!btnText) return;
    
    if (!selectedFile) {
        generateBtn.disabled = true;
        btnText.textContent = "Generate Depth Map";
    } else if (!currentUploadedFilename) {
        generateBtn.disabled = false;
        btnText.textContent = "Upload & Open Editor";
    } else if (!resultsSection.classList.contains('hidden')) {
        generateBtn.disabled = false;
        btnText.textContent = "Back to Editor";
    } else if (!editorSection.classList.contains('hidden')) {
        generateBtn.disabled = false;
        btnText.textContent = "Start Depth Estimation";
    }
}

// Editor Drawing State
let videoWidth = 0;
let videoHeight = 0;
let videoFps = 30;
let videoTotalFrames = 0;
let frameEdits = {}; // frameIdx -> DataURL
let currentDrawingMode = 'white'; // white, black, eraser
let brushSize = 20;
let opacity = 0.5;
let isDrawing = false;
let ctx = null;
let lastX = 0;
let lastY = 0;

// Three.js State
let threeScene, threeCamera, threeRenderer, threeMesh, threeControls, threeAnimFrameId;
let threeColorTexture, threeDepthTexture;
let isThreeInitialized = false;

// Drag and drop event listeners
['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    }, false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
    }, false);
});

dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
        handleFileSelect(files[0]);
    }
});

dropZone.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
    }
});

function handleFileSelect(file) {
    if (!file.type.startsWith('video/')) {
        alert('Please select a valid video file.');
        return;
    }
    selectedFile = file;
    fileNameEl.textContent = file.name;
    
    // Format file size
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    fileSizeEl.textContent = `${sizeMB} MB`;
    
    // UI toggle
    selectedFileInfo.classList.remove('hidden');
    dropZone.classList.add('hidden');
    generateBtn.disabled = false;
    
    // Reset uploaded filename since it is a new file selection
    currentUploadedFilename = '';
    
    // Hide previous panels
    resultsSection.classList.add('hidden');
    idleSection.classList.add('hidden');
    editorSection.classList.add('hidden');
    cleanupThreeJS();
    
    // Auto-trigger upload and editor
    progressSection.classList.remove('hidden');
    generateBtn.disabled = true;
    uploadAndStartProcessing();
    
    updateSidebarButton();
}

removeFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetUpload();
});

function resetUpload() {
    selectedFile = null;
    fileInput.value = '';
    selectedFileInfo.classList.add('hidden');
    dropZone.classList.remove('hidden');
    generateBtn.disabled = true;
    resultsSection.classList.add('hidden');
    progressSection.classList.add('hidden');
    editorSection.classList.add('hidden'); // Hide editor
    videoSource.src = '';
    videoDepth.src = '';
    idleSection.classList.remove('hidden');
    cleanupThreeJS();
    frameEdits = {}; // Clear edits
    currentUploadedFilename = '';
    updateSidebarButton();
}

// Colormap selection
paletteCards.forEach(card => {
    card.addEventListener('click', () => {
        paletteCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const radio = card.querySelector('input[type="radio"]');
        radio.checked = true;
    });
});

// Blend slider change
blendSlider.addEventListener('input', (e) => {
    blendVal.textContent = parseFloat(e.target.value).toFixed(2);
});

// Advanced sliders changes
minDepthSlider.addEventListener('input', (e) => {
    minDepthVal.textContent = parseFloat(e.target.value).toFixed(2);
});

maxDepthSlider.addEventListener('input', (e) => {
    maxDepthVal.textContent = parseFloat(e.target.value).toFixed(2);
});

gammaSlider.addEventListener('input', (e) => {
    gammaVal.textContent = parseFloat(e.target.value).toFixed(2);
});

// Upload and Process Logic
generateBtn.addEventListener('click', () => {
    if (!selectedFile) return;
    
    if (!currentUploadedFilename) {
        cleanupThreeJS();
        
        // Hide results and idle state if showing
        resultsSection.classList.add('hidden');
        idleSection.classList.add('hidden');
        
        // Show progress panel
        progressSection.classList.remove('hidden');
        generateBtn.disabled = true;
        
        uploadAndStartProcessing();
    } else if (!resultsSection.classList.contains('hidden')) {
        // Go back to editor
        resultsSection.classList.add('hidden');
        editorSection.classList.remove('hidden');
        cleanupThreeJS();
        updateSidebarButton();
    } else {
        // Editor is already visible, start estimation
        startEstimationWorkflow();
    }
});

function appendLog(message) {
    infoLog.textContent = message + '\n';
    infoLog.scrollTop = infoLog.scrollHeight;
}

function uploadAndStartProcessing() {
    progressTitle.textContent = "Uploading video file...";
    progressSubtitle.textContent = "Sending footage to the depth maps server";
    progressFill.style.width = '0%';
    progressText.textContent = '0.0%';
    speedLabel.classList.add('hidden');
    appendLog("Uploading video file: " + selectedFile.name);

    const formData = new FormData();
    formData.append("file", selectedFile);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload", true);

    // Track upload progress
    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            progressFill.style.width = percentComplete + '%';
            progressText.textContent = percentComplete.toFixed(1) + '%';
        }
    };

    xhr.onload = () => {
        if (xhr.status === 200) {
            const response = JSON.parse(xhr.responseText);
            currentUploadedFilename = response.filename;
            appendLog("Upload complete. Saved as " + currentUploadedFilename);
            
            // Hide upload progress and show interactive editor
            progressSection.classList.add('hidden');
            generateBtn.disabled = false;
            loadInteractiveEditor(currentUploadedFilename);
        } else {
            handleProcessingError("Upload failed: " + xhr.statusText);
        }
    };

    xhr.onerror = () => {
        handleProcessingError("Upload failed due to connection error.");
    };

    xhr.send(formData);
}

function triggerDepthEstimation(filename) {
    progressTitle.textContent = "Triggering engine...";
    progressSubtitle.textContent = "Allocating model environment";
    progressFill.style.width = '0%';
    progressText.textContent = '0.0%';
    appendLog("Requesting depth estimation processing...");

    const modelVal = modelSelect.value;
    const colormapVal = document.querySelector('input[name="colormap"]:checked').value;
    const blendValStr = blendSlider.value;
    const minDepthValStr = minDepthSlider.value;
    const maxDepthValStr = maxDepthSlider.value;
    const gammaValStr = gammaSlider.value;
    const filterValStr = filterSelect.value;

    const formData = new FormData();
    formData.append("filename", filename);
    formData.append("model", modelVal);
    formData.append("colormap", colormapVal);
    formData.append("blend", blendValStr);
    formData.append("min_depth", minDepthValStr);
    formData.append("max_depth", maxDepthValStr);
    formData.append("gamma", gammaValStr);
    formData.append("filter_type", filterValStr);
    
    // Send list of manual overrides
    formData.append("edits", JSON.stringify(frameEdits));

    fetch("/api/process", {
        method: "POST",
        body: formData
    })
    .then(async res => {
        const data = await res.json();
        if (res.ok) {
            appendLog("Estimation started. Output video file will be: " + data.output_filename);
            startStatusPolling(data.output_filename);
        } else {
            throw new Error(data.detail || "Server failed to initiate processing.");
        }
    })
    .catch(err => {
        handleProcessingError(err.message);
    });
}

function startStatusPolling(outputFilename) {
    if (pollInterval) clearInterval(pollInterval);
    
    pollInterval = setInterval(() => {
        fetch("/api/status")
        .then(res => res.json())
        .then(state => {
            updateProgressUI(state, outputFilename);
        })
        .catch(err => {
            appendLog("Error fetching engine status: " + err.message);
        });
    }, 500);
}

function updateProgressUI(state, outputFilename) {
    const status = state.status;
    const progress = state.progress;
    
    progressFill.style.width = progress + '%';
    progressText.textContent = progress.toFixed(1) + '%';

    if (status === "downloading") {
        progressTitle.textContent = "Downloading AI weights...";
        progressSubtitle.textContent = `Fetching Deep Learning weights from HuggingFace`;
        speedLabel.classList.remove('hidden');
        speedLabel.textContent = `Speed: ${state.download_speed || '--'}`;
        appendLog(`[DOWNLOADING] Downloading model checkpoint: ${progress}% (${state.download_speed || ''})`);
    } 
    else if (status === "loading") {
        progressTitle.textContent = "Initializing Model...";
        progressSubtitle.textContent = "Configuring execution graph for ONNX Runtime";
        speedLabel.classList.add('hidden');
        appendLog(`[LOADING] Creating execution session with hardware accelerator fallback...`);
    } 
    else if (status === "processing") {
        progressTitle.textContent = "Running Depth Inference...";
        progressSubtitle.textContent = `Processing Frame ${state.current_frame} of ${state.total_frames}`;
        speedLabel.classList.add('hidden');
        appendLog(`[PROCESSING] Frames completed: ${state.current_frame}/${state.total_frames} (${progress}%)`);
    }
    else if (status === "done") {
        clearInterval(pollInterval);
        progressSection.classList.add('hidden');
        generateBtn.disabled = false;
        appendLog(`[SUCCESS] Depth video generated successfully!`);
        showResults(currentUploadedFilename, outputFilename);
    }
    else if (status === "error") {
        clearInterval(pollInterval);
        handleProcessingError(state.error_message);
    }
    else if (status === "cancelled") {
        clearInterval(pollInterval);
        progressSection.classList.add('hidden');
        generateBtn.disabled = false;
        appendLog(`[CANCELLED] Depth map processing cancelled by user.`);
    }
}

function handleProcessingError(errorMsg) {
    progressTitle.textContent = "Processing Failed";
    progressSubtitle.textContent = "An error occurred during depth extraction";
    progressFill.style.width = '0%';
    progressText.textContent = 'ERROR';
    speedLabel.classList.add('hidden');
    appendLog(`[ERROR] ${errorMsg}`);
    
    // Keep cancel button working as a reset
    cancelBtn.textContent = "Dismiss Error";
    cancelBtn.onclick = () => {
        progressSection.classList.add('hidden');
        generateBtn.disabled = false;
        cancelBtn.textContent = "Cancel Processing";
        cancelBtn.onclick = handleCancelClick;
        idleSection.classList.remove('hidden');
        updateSidebarButton();
    };
}

// Cancel Action
const handleCancelClick = () => {
    appendLog("Cancelling depth processing...");
    fetch("/api/cancel", { method: "POST" })
    .then(() => {
        clearInterval(pollInterval);
        progressSection.classList.add('hidden');
        generateBtn.disabled = false;
        if (currentUploadedFilename) {
            editorSection.classList.remove('hidden');
        } else {
            idleSection.classList.remove('hidden');
        }
        appendLog("Cancelled.");
        updateSidebarButton();
    });
};
cancelBtn.onclick = handleCancelClick;

// Displaying and Syncing Results
function showResults(origFilename, outputFilename) {
    resultsSection.classList.remove('hidden');
    
    // Default to split view
    tabSplit.classList.add('active');
    tab3d.classList.remove('active');
    splitViewContainer.classList.remove('hidden');
    threeViewContainer.classList.add('hidden');
    
    cleanupThreeJS();
    
    // Set video sources pointing to range-supporting static endpoints
    videoSource.src = `/api/videos/upload/${origFilename}`;
    videoDepth.src = `/api/videos/output/${outputFilename}`;
    downloadBtn.href = `/api/videos/output/${outputFilename}`;
    
    // Load videos
    videoSource.load();
    videoDepth.load();
    updateSidebarButton();
}

// Player Synchronization Logic (Configured once globally at load time)
let activeVideo = null;

function registerSyncListeners(master, slave) {
    master.addEventListener('play', () => {
        if (activeVideo === null || activeVideo === master) {
            activeVideo = master;
            slave.play().catch(e => console.log("Sync play block: ", e));
        }
    });
    
    master.addEventListener('pause', () => {
        if (activeVideo === null || activeVideo === master) {
            activeVideo = master;
            slave.pause();
            activeVideo = null;
        }
    });
    
    master.addEventListener('seeking', () => {
        if (activeVideo === null || activeVideo === master) {
            activeVideo = master;
            slave.currentTime = master.currentTime;
        }
    });
    
    master.addEventListener('seeked', () => {
        if (activeVideo === master) {
            activeVideo = null;
        }
    });
}

// Bind synchronization events once
registerSyncListeners(videoSource, videoDepth);
registerSyncListeners(videoDepth, videoSource);

// Sync locked play/pause action
syncPlayBtn.onclick = () => {
    if (videoSource.paused) {
        videoSource.play().catch(e => console.log("Play source failed: ", e));
        videoDepth.play().catch(e => console.log("Play depth failed: ", e));
    } else {
        videoSource.pause();
        videoDepth.pause();
    }
};

// --- Three.js 3D Displacement Visualizer ---

// Tab selectors
tabSplit.addEventListener('click', () => {
    tabSplit.classList.add('active');
    tab3d.classList.remove('active');
    splitViewContainer.classList.remove('hidden');
    threeViewContainer.classList.add('hidden');
});

tab3d.addEventListener('click', () => {
    tabSplit.classList.remove('active');
    tab3d.classList.add('active');
    splitViewContainer.classList.add('hidden');
    threeViewContainer.classList.remove('hidden');
    
    if (!isThreeInitialized) {
        setTimeout(initThreeJS, 50);
    }
});

// Displacement intensity slider
extrusionSlider.addEventListener('input', (e) => {
    extrusionVal.textContent = parseFloat(e.target.value).toFixed(2);
    if (threeMesh && threeMesh.material) {
        threeMesh.material.displacementScale = parseFloat(e.target.value);
    }
});

// Wireframe toggle
wireframeToggle.addEventListener('change', (e) => {
    if (threeMesh && threeMesh.material) {
        threeMesh.material.wireframe = e.target.checked;
    }
});

function initThreeJS() {
    const parent = document.getElementById('3d-canvas-parent');
    if (!parent) return;
    
    parent.innerHTML = '';
    
    const width = parent.clientWidth || 700;
    const height = (width * 9) / 16;
    
    // 1. Create Scene
    threeScene = new THREE.Scene();
    threeScene.background = new THREE.Color(0x0a0a0f);
    
    // 2. Create Camera
    threeCamera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
    threeCamera.position.set(0, 0, 14);
    
    // 3. Create Renderer
    threeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    threeRenderer.setSize(width, height);
    threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    parent.appendChild(threeRenderer.domElement);
    
    // 4. Create Controls
    threeControls = new THREE.OrbitControls(threeCamera, threeRenderer.domElement);
    threeControls.enableDamping = true;
    threeControls.dampingFactor = 0.05;
    threeControls.maxDistance = 25;
    threeControls.minDistance = 3;
    
    // 5. Video Textures
    threeColorTexture = new THREE.VideoTexture(videoSource);
    threeColorTexture.minFilter = THREE.LinearFilter;
    threeColorTexture.magFilter = THREE.LinearFilter;
    
    threeDepthTexture = new THREE.VideoTexture(videoDepth);
    threeDepthTexture.minFilter = THREE.LinearFilter;
    threeDepthTexture.magFilter = THREE.LinearFilter;
    
    // 6. 3D Displacement Mesh
    // 256x256 segmentation grid for fluid details
    const geometry = new THREE.PlaneGeometry(16, 9, 256, 256);
    
    const material = new THREE.MeshStandardMaterial({
        map: threeColorTexture,
        displacementMap: threeDepthTexture,
        displacementScale: parseFloat(extrusionSlider.value),
        displacementBias: -0.05,
        roughness: 0.5,
        metalness: 0.1,
        wireframe: wireframeToggle.checked,
        side: THREE.DoubleSide
    });
    
    threeMesh = new THREE.Mesh(geometry, material);
    threeScene.add(threeMesh);
    
    // 7. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    threeScene.add(ambientLight);
    
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight1.position.set(5, 5, 10);
    threeScene.add(dirLight1);
    
    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.2);
    dirLight2.position.set(-5, 5, 5);
    threeScene.add(dirLight2);
    
    isThreeInitialized = true;
    window.addEventListener('resize', onThreeResize);
    
    animateThree();
}

function onThreeResize() {
    if (!isThreeInitialized || !threeRenderer) return;
    const parent = document.getElementById('3d-canvas-parent');
    const width = parent.clientWidth;
    const height = (width * 9) / 16;
    
    threeCamera.aspect = 16 / 9;
    threeCamera.updateProjectionMatrix();
    threeRenderer.setSize(width, height);
}

function animateThree() {
    threeAnimFrameId = requestAnimationFrame(animateThree);
    
    if (threeControls) {
        if (autoRotateToggle.checked) {
            // Smoothly rotate target mesh back and forth over time
            threeMesh.rotation.y = Math.sin(Date.now() * 0.0004) * 0.25;
            threeMesh.rotation.x = Math.sin(Date.now() * 0.0002) * 0.08;
        } else {
            threeMesh.rotation.y = 0;
            threeMesh.rotation.x = 0;
        }
        threeControls.update();
    }
    
    if (threeRenderer && threeScene && threeCamera) {
        threeRenderer.render(threeScene, threeCamera);
    }
}

function cleanupThreeJS() {
    if (threeAnimFrameId) {
        cancelAnimationFrame(threeAnimFrameId);
        threeAnimFrameId = null;
    }
    window.removeEventListener('resize', onThreeResize);
    if (threeRenderer) {
        try {
            const parent = document.getElementById('3d-canvas-parent');
            if (parent) parent.innerHTML = '';
        } catch (e) {}
        threeRenderer.dispose();
        threeRenderer = null;
    }
    if (threeColorTexture) {
        threeColorTexture.dispose();
        threeColorTexture = null;
    }
    if (threeDepthTexture) {
        threeDepthTexture.dispose();
        threeDepthTexture = null;
    }
    threeScene = null;
    threeCamera = null;
    threeMesh = null;
    threeControls = null;
    isThreeInitialized = false;
}

// --- Interactive Video Editor Logic ---

function loadInteractiveEditor(filename) {
    progressSection.classList.add('hidden');
    idleSection.classList.add('hidden');
    resultsSection.classList.add('hidden');
    
    appendLog("Fetching video metadata...");
    fetch(`/api/video-info?filename=${encodeURIComponent(filename)}`)
        .then(res => res.json())
        .then(info => {
            videoWidth = info.width;
            videoHeight = info.height;
            videoFps = info.fps || 30;
            videoTotalFrames = info.total_frames;
            
            appendLog(`Video dimensions: ${videoWidth}x${videoHeight} | FPS: ${videoFps} | Total Frames: ${videoTotalFrames}`);
            
            // Set source for editor video
            editorVideo.src = `/api/videos/upload/${filename}`;
            editorVideo.load();
            
            editorSection.classList.remove('hidden');
            
            frameEdits = {};
            updateTimelineUI();
            updateSidebarButton();
        })
        .catch(err => {
            appendLog("Error fetching video details: " + err.message);
            handleProcessingError("Failed to initialize video information.");
        });
}

// Set up Canvas coordinate scaling and sizing on video metadata loaded
editorVideo.addEventListener('loadedmetadata', () => {
    editorCanvas.width = videoWidth;
    editorCanvas.height = videoHeight;
    ctx = editorCanvas.getContext('2d');
    
    ctx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
});

// Canvas Drawing Coords helper
function getCanvasCoords(e) {
    const rect = editorCanvas.getBoundingClientRect();
    const scaleX = editorCanvas.width / rect.width;
    const scaleY = editorCanvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

// Mouse Drawing listeners
editorCanvas.addEventListener('mousedown', (e) => {
    if (!editorVideo.paused) {
        editorVideo.pause();
    }
    isDrawing = true;
    const coords = getCanvasCoords(e);
    lastX = coords.x;
    lastY = coords.y;
});

editorCanvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const coords = getCanvasCoords(e);
    
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    if (currentDrawingMode === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
    } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = currentDrawingMode === 'white' ? '#ffffff' : '#000000';
    }
    
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    
    lastX = coords.x;
    lastY = coords.y;
});

editorCanvas.addEventListener('mouseup', () => {
    if (isDrawing) {
        isDrawing = false;
        saveCurrentFrameEdit();
    }
});

editorCanvas.addEventListener('mouseleave', () => {
    if (isDrawing) {
        isDrawing = false;
        saveCurrentFrameEdit();
    }
});

// Touch support drawing listeners
editorCanvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
        if (!editorVideo.paused) {
            editorVideo.pause();
        }
        isDrawing = true;
        const coords = getCanvasCoords(e.touches[0]);
        lastX = coords.x;
        lastY = coords.y;
        e.preventDefault();
    }
}, { passive: false });

editorCanvas.addEventListener('touchmove', (e) => {
    if (isDrawing && e.touches.length === 1) {
        const coords = getCanvasCoords(e.touches[0]);
        ctx.lineWidth = brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        if (currentDrawingMode === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = currentDrawingMode === 'white' ? '#ffffff' : '#000000';
        }
        
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(coords.x, coords.y);
        ctx.stroke();
        
        lastX = coords.x;
        lastY = coords.y;
        e.preventDefault();
    }
}, { passive: false });

editorCanvas.addEventListener('touchend', (e) => {
    if (isDrawing) {
        isDrawing = false;
        saveCurrentFrameEdit();
        e.preventDefault();
    }
}, { passive: false });

// Save & Load Canvas overlays
function saveCurrentFrameEdit() {
    const frameIdx = Math.round(editorVideo.currentTime * videoFps);
    if (isCanvasBlank()) {
        delete frameEdits[frameIdx];
    } else {
        frameEdits[frameIdx] = editorCanvas.toDataURL('image/png');
    }
    updateTimelineUI();
}

function loadFrameEdit(frameIdx) {
    if (!ctx) return;
    ctx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
    if (frameEdits[frameIdx]) {
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0);
        };
        img.src = frameEdits[frameIdx];
    }
}

function isCanvasBlank() {
    if (!ctx) return true;
    const imgData = ctx.getImageData(0, 0, editorCanvas.width, editorCanvas.height);
    const data = imgData.data;
    for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) return false; // has visible alpha
    }
    return true;
}

// Load frame overlay when video position changes
editorVideo.addEventListener('timeupdate', () => {
    const frameIdx = Math.round(editorVideo.currentTime * videoFps);
    loadFrameEdit(frameIdx);
});

// Update keyframe list below video
function updateTimelineUI() {
    const keys = Object.keys(frameEdits).map(Number).sort((a, b) => a - b);
    timelineKeyframesCount.textContent = `${keys.length} frame${keys.length === 1 ? '' : 's'} edited`;
    
    timelineMarkersList.innerHTML = '';
    if (keys.length === 0) {
        const span = document.createElement('span');
        span.className = 'help-text';
        span.style.color = 'var(--text-dim)';
        span.textContent = 'Pause the video and paint to create overlay keyframes.';
        timelineMarkersList.appendChild(span);
        return;
    }
    
    keys.forEach(frameIdx => {
        const btn = document.createElement('button');
        btn.className = 'timeline-marker-item';
        btn.type = 'button';
        btn.textContent = `Frame ${frameIdx}`;
        btn.onclick = () => {
            editorVideo.currentTime = frameIdx / videoFps;
        };
        timelineMarkersList.appendChild(btn);
    });
}

// Setup Brush control listeners
brushWhiteBtn.addEventListener('click', () => setBrushMode('white'));
brushBlackBtn.addEventListener('click', () => setBrushMode('black'));
brushEraserBtn.addEventListener('click', () => setBrushMode('eraser'));

function setBrushMode(mode) {
    currentDrawingMode = mode;
    brushWhiteBtn.classList.toggle('active', mode === 'white');
    brushBlackBtn.classList.toggle('active', mode === 'black');
    brushEraserBtn.classList.toggle('active', mode === 'eraser');
}

brushSizeSlider.addEventListener('input', (e) => {
    brushSize = parseInt(e.target.value);
    brushSizeVal.textContent = `${brushSize}px`;
});

editorOpacitySlider.addEventListener('input', (e) => {
    opacity = parseFloat(e.target.value);
    editorOpacityVal.textContent = opacity.toFixed(2);
    editorCanvas.style.opacity = opacity;
});
// Set initial opacity style
editorCanvas.style.opacity = opacity;

editorClearFrameBtn.addEventListener('click', () => {
    const frameIdx = Math.round(editorVideo.currentTime * videoFps);
    ctx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
    delete frameEdits[frameIdx];
    updateTimelineUI();
});

editorClearAllBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to clear all masks?")) {
        frameEdits = {};
        if (ctx) ctx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
        updateTimelineUI();
    }
});

// Process video from editor trigger
function startEstimationWorkflow() {
    if (!currentUploadedFilename) return;
    cleanupThreeJS();
    
    // Stop editor video playing if any
    editorVideo.pause();
    
    // Hide editor and results
    editorSection.classList.add('hidden');
    resultsSection.classList.add('hidden');
    idleSection.classList.add('hidden');
    
    // Show progress panel
    progressSection.classList.remove('hidden');
    generateBtn.disabled = true;
    
    // Start estimation
    triggerDepthEstimation(currentUploadedFilename);
    updateSidebarButton();
}

editorGenerateBtn.addEventListener('click', startEstimationWorkflow);

resultsEditBtn.addEventListener('click', () => {
    resultsSection.classList.add('hidden');
    editorSection.classList.remove('hidden');
    cleanupThreeJS();
    updateSidebarButton();
});
