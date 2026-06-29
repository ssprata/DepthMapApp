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

// App State
let selectedFile = null;
let pollInterval = null;
let currentUploadedFilename = '';

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
    videoSource.src = '';
    videoDepth.src = '';
    idleSection.classList.remove('hidden');
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

// Upload and Process Logic
generateBtn.addEventListener('click', () => {
    if (!selectedFile) return;
    
    // Hide results and idle state if showing
    resultsSection.classList.add('hidden');
    idleSection.classList.add('hidden');
    
    // Show progress panel
    progressSection.classList.remove('hidden');
    generateBtn.disabled = true;
    
    uploadAndStartProcessing();
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
            triggerDepthEstimation(currentUploadedFilename);
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

    const formData = new FormData();
    formData.append("filename", filename);
    formData.append("model", modelVal);
    formData.append("colormap", colormapVal);
    formData.append("blend", blendValStr);

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
        idleSection.classList.remove('hidden');
        appendLog("Cancelled.");
    });
};
cancelBtn.onclick = handleCancelClick;

// Displaying and Syncing Results
function showResults(origFilename, outputFilename) {
    resultsSection.classList.remove('hidden');
    
    // Set video sources pointing to range-supporting static endpoints
    videoSource.src = `/api/videos/upload/${origFilename}`;
    videoDepth.src = `/api/videos/output/${outputFilename}`;
    downloadBtn.href = `/api/videos/output/${outputFilename}`;
    
    // Load videos
    videoSource.load();
    videoDepth.load();
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
