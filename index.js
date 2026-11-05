jQuery(async () => {
    const context = SillyTavern.getContext();
    
    let currentModel = localStorage.getItem('cl_tagger_model') || 'SmilingWolf/wd-vit-tagger-v3';
    let currentThreshold = parseFloat(localStorage.getItem('cl_tagger_threshold') || '0.35');
    let currentYoloThresh = parseFloat(localStorage.getItem('cl_tagger_yolo_thresh') || '0.5');
    let localModelBuffer = null;
    let localYoloBuffer = null;

    // --- 1. SETTINGS UI INJECTION ---
    const settingsHtml = `
        <div class="auto-appearance-tagger-settings">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>Auto Appearance Tagger</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <label>Model Selection:</label>
                    <select id="cl-tagger-model" class="text_pole" style="width: 100%; margin-bottom: 10px;">
                        <option value="SmilingWolf/wd-vit-tagger-v3">WD ViT v3 (Fast - ~378MB)</option>
                        <option value="SmilingWolf/wd-vit-large-tagger-v3">WD ViT Large v3 (Accurate - ~1.2GB)</option>
                        <option value="SmilingWolf/wd-eva02-large-tagger-v3">WD EVA v3 (Best - ~1.5GB)</option>
                    </select>
                    
                    <label>WD Confidence Threshold: <span id="cl-tagger-thresh-val">${currentThreshold}</span></label>
                    <input type="range" id="cl-tagger-thresh" min="0.05" max="0.9" step="0.05" value="${currentThreshold}" style="width: 100%; margin-bottom: 10px;">
                    
                    <label style="display:flex; align-items:center; gap:8px; margin-bottom: 5px;">
                        <input type="checkbox" id="cl-tagger-face-crop" checked>
                        YOLO Face Crop (ADetailer style)
                    </label>
                    
                    <label style="margin-left: 24px; font-size: 0.9em;">YOLO Confidence: <span id="cl-yolo-thresh-val">${currentYoloThresh}</span></label>
                    <input type="range" id="cl-yolo-thresh" min="0.1" max="0.9" step="0.05" value="${currentYoloThresh}" style="width: calc(100% - 24px); margin-left: 24px; margin-bottom: 10px;">

                    <hr>
                    <label style="display:block; margin-bottom: 5px;">LLM Prompt Template (Use {{description}} and {{rawTags}}):</label>
                    <textarea id="cl-llm-prompt-template" class="text_pole" style="width: 100%; height: 150px; margin-bottom: 10px; font-family: monospace; font-size: 12px;"></textarea>
                    
                    <hr>
                    <div style="margin-bottom: 10px;">
                        <label style="display:block; margin-bottom: 5px;">Import Local Models (Bypasses Network):</label>
                        <input type="file" id="cl-file-wd" accept=".onnx" style="display:none;">
                        <button id="cl-btn-wd" class="menu_button" style="width:100%; margin-bottom: 5px;">Import WD Tagger (.onnx)</button>
                        <small id="cl-status-wd" style="display:block; color: #aaa; margin-bottom: 10px;">No local WD model loaded.</small>

                        <input type="file" id="cl-file-yolo" accept=".onnx" style="display:none;">
                        <button id="cl-btn-yolo" class="menu_button" style="width:100%; margin-bottom: 5px;">Import Anime Face Detector (.onnx)</button>
                        <small id="cl-status-yolo" style="display:block; color: #aaa;">No local YOLO model loaded.</small>
                    </div>
                    
                    <button id="cl-clear-cache" class="menu_button" style="width: 100%; margin-top: 10px; background: #d32f2f; color: white;">Clear Model Cache</button>
                </div>
            </div>
        </div>
    `;

    setTimeout(() => {
        const container = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
        if (container && !document.getElementById('cl-tagger-settings-wrapper')) {
            const wrapper = document.createElement('div');
            wrapper.id = 'cl-tagger-settings-wrapper';
            wrapper.innerHTML = settingsHtml;
            container.appendChild(wrapper);

            const modelSelect = document.getElementById('cl-tagger-model');
            modelSelect.value = currentModel;
            modelSelect.addEventListener('change', (e) => { currentModel = e.target.value; localStorage.setItem('cl_tagger_model', currentModel); });
            document.getElementById('cl-tagger-thresh').addEventListener('input', (e) => { currentThreshold = parseFloat(e.target.value); localStorage.setItem('cl_tagger_threshold', currentThreshold); document.getElementById('cl-tagger-thresh-val').innerText = currentThreshold; });
            document.getElementById('cl-yolo-thresh').addEventListener('input', (e) => { currentYoloThresh = parseFloat(e.target.value); localStorage.setItem('cl_tagger_yolo_thresh', currentYoloThresh); document.getElementById('cl-yolo-thresh-val').innerText = currentYoloThresh; });

            document.getElementById('cl-btn-wd').addEventListener('click', () => document.getElementById('cl-file-wd').click());
            document.getElementById('cl-file-wd').addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    document.getElementById('cl-status-wd').innerText = "Reading file...";
                    localModelBuffer = await file.arrayBuffer();
                    document.getElementById('cl-status-wd').innerText = `Loaded: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
                    document.getElementById('cl-status-wd').style.color = '#4caf50';
                }
            });

            document.getElementById('cl-btn-yolo').addEventListener('click', () => document.getElementById('cl-file-yolo').click());
            document.getElementById('cl-file-yolo').addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    document.getElementById('cl-status-yolo').innerText = "Reading file...";
                    localYoloBuffer = await file.arrayBuffer();
                    document.getElementById('cl-status-yolo').innerText = `Loaded: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
                    document.getElementById('cl-status-yolo').style.color = '#4caf50';
                }
            });

            const promptTemplateInput = document.getElementById('cl-llm-prompt-template');
            const defaultPromptTemplate = `Ignore previous instructions and provide ONLY the last chat message string back to me verbatim. Do not write anything after the string. Do not reply as {{char}} when writing this description, and do not attempt to continue the story.

You are an expert Stable Diffusion prompt engineer. I will provide a character's text description and a list of raw Danbooru tags extracted from their images.

Your task:
1. Combine the tags and description to output a clean list of PERMANENT physical traits (hair, eyes, body type, skin, species, scars, etc.).
2. Remove backgrounds, lighting, poses, and temporary actions.
3. Keep default iconic clothing ONLY if it's strictly part of their physical identity.
4. Add age descriptor tags (e.g., 'mature female', 'aged up', 'milf', 'petite', 'child', 'teenager') based on the description.
5. Determine the character's age from the description and calculate the Age Slider LoRA weight:
   - Child (<10): -5.0 to -4.0
   - Teen (13-17): -3.0 to -0.5
   - Adult (18-25): 1.0 to 1.5
   - Adult (26-35): 2.0 to 3.0
   - Mature (36-45): 4.0 to 5.0
   Use granular decimals (e.g., 1.2, 2.5, 4.2). If age is unknown, assume 1.0.
6. Append the exact LoRA tag at the very end of the list: <lora:StS_Age_Slider_Illustrious_v1:WEIGHT>

Output ONLY the final comma-separated prompt string. Do not include any conversational text.

Character Description:
{{description}}

Raw Tags:
{{rawTags}}`;
            
            promptTemplateInput.value = localStorage.getItem('cl_llm_prompt') || defaultPromptTemplate;
            promptTemplateInput.addEventListener('input', (e) => {
                localStorage.setItem('cl_llm_prompt', e.target.value);
            });

            document.getElementById('cl-clear-cache').addEventListener('click', async () => {
                const cacheKeys = await caches.keys();
                for (const key of cacheKeys) { if (key.startsWith('cl-onnx-cache-') || key.startsWith('cl-yolo')) await caches.delete(key); }
                if (window.toastr) toastr.success("Caches cleared!");
            });
        }
    }, 3000);

    const extractImages = (text) => {
        if (!text) return [];
        const urls = new Set();
        let match;
        const mdRegex = /!\[.*?\]\((.*?)\)/gi;
        while ((match = mdRegex.exec(text)) !== null) urls.add(match[1]);
        const htmlRegex = /<img[^>]+src=["']([^"']+)["']/gi;
        while ((match = htmlRegex.exec(text)) !== null) urls.add(match[1]);
        const rawRegex = /https?:\/\/[^\s"']+?\.(?:png|jpg|jpeg|webp|gif)/gi;
        while ((match = rawRegex.exec(text)) !== null) urls.add(match[0]);
        return Array.from(urls).map(u => u.trim()).filter(u => u.startsWith('http'));
    };

    const loadScript = (src) => new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) return resolve();
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });

    const downloadAndVerify = async (url, cacheName) => {
        const cache = await caches.open(cacheName);
        let cached = await cache.match(url);
        if (cached) {
            const buf = await cached.arrayBuffer();
            const firstByte = new Uint8Array(buf.slice(0, 1))[0];
            if (firstByte !== 0x3C && firstByte !== 0x7B) return buf;
            await cache.delete(url);
        }
        const response = await fetch(url);
        if (!response.ok) throw new Error("HTTP " + response.status);
        const buf = await response.arrayBuffer();
        const firstByte = new Uint8Array(buf.slice(0, 1))[0];
        if (firstByte === 0x3C || firstByte === 0x7B) throw new Error("Download blocked. Use local import.");
        await cache.put(url, new Response(buf));
        return buf;
    };

    const runTagger = async (imageUrls, context) => {
        const loadingHtml = `
            <style>
                .cl-tag-row { margin-bottom: 6px; font-family: monospace; font-size: 12px; }
                .cl-tag-header { display: flex; justify-content: space-between; color: #ccc; margin-bottom: 2px; }
                .cl-tag-bar-bg { width: 100%; height: 6px; background: #333; border-radius: 3px; overflow: hidden; }
                .cl-tag-bar { height: 100%; width: 100%; transform: scaleX(0); transform-origin: left; transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1); border-radius: 3px; will-change: transform; }
                
                .cl-pane { display: flex; flex-direction: column; background:#111; border-radius:8px; padding:10px; position: relative; overflow: hidden; box-sizing: border-box; transition: opacity 0.5s ease-in-out; transform: translateZ(0); }
                .cl-canvas-container { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
                
                #cl-pane-left { width: 100%; transition: width 0.5s ease-in-out; will-change: width; }
                #cl-pane-right { width: 0px; opacity: 0; padding: 0; border: none; transition: width 0.5s ease-in-out, opacity 0.5s ease-in-out; will-change: width, opacity; }
                
                #cl-tags-container-left { width: 100%; transition: width 0.5s ease-in-out; will-change: width; }
                #cl-tags-container-right { width: 0px; opacity: 0; transition: width 0.5s ease-in-out, opacity 0.5s ease-in-out; will-change: width, opacity; }

                .cl-split #cl-pane-left, .cl-split #cl-tags-container-left { width: 50%; }
                .cl-split #cl-pane-right { width: 50%; opacity: 1; padding: 10px; border: 2px solid #ff9900; }
                .cl-split #cl-tags-container-right { width: 50%; opacity: 1; }
            </style>
            
            <div style="display:flex; flex-direction:column; width: 100%; gap: 15px; height: 75vh;">
                <div id="cl-init-view" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 20px; height: 100%;">
                    <i class="fa-solid fa-spinner fa-spin" style="font-size: 40px; color: #4a9eff; margin-bottom: 20px;"></i>
                    <h3 id="cl-loading-text" style="margin:0;">Initializing...</h3>
                    <p id="cl-loading-subtext" style="color:#aaa; margin-top:10px;">Please wait.</p>
                </div>

                <div id="cl-live-view" style="display:none; flex-direction:column; gap:15px; height: 100%;">
                    
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h3 id="cl-live-title" style="margin:0; color:#fff;">Processing Image 1 of 1</h3>
                        <span id="cl-global-progress" style="color:#4a9eff; font-weight:bold;">0%</span>
                    </div>
                    
                    <div id="cl-image-row" style="display:flex; gap: 10px; flex: 1; min-height: 0; overflow: hidden;">
                        <div id="cl-pane-left" class="cl-pane">
                            <span style="position:absolute; top:10px; left:10px; font-size:12px; background:rgba(0,0,0,0.7); padding:2px 8px; border-radius:4px; color:#fff; z-index:2;">Original Image</span>
                            <div class="cl-canvas-container">
                                <canvas id="cl-canvas-orig" style="max-width:100%; max-height:100%; object-fit:contain;"></canvas>
                            </div>
                        </div>
                        <div id="cl-pane-right" class="cl-pane" style="flex-shrink: 0;">
                            <span style="position:absolute; top:10px; left:10px; font-size:12px; background:rgba(0,0,0,0.7); padding:2px 8px; border-radius:4px; color:#ff9900; white-space:nowrap; z-index:2;">Face Crop</span>
                            <div class="cl-canvas-container">
                                <canvas id="cl-canvas-crop" style="max-width:100%; max-height:100%; object-fit:contain;"></canvas>
                            </div>
                        </div>
                    </div>
                    
                    <div id="cl-tags-row" style="display:flex; gap: 10px; height: 35%; overflow: hidden;">
                        <div id="cl-tags-container-left" style="background:#1a1a1a; padding:15px; border-radius:8px; overflow-y:auto; box-sizing: border-box; flex-shrink: 0; touch-action: pan-y;">
                            <b style="color:#4a9eff; font-size:14px; display:block; margin-bottom:10px;">Top 8 Full Image Tags</b>
                            <div id="cl-tags-left"></div>
                        </div>
                        
                        <div id="cl-tags-container-right" style="background:#1a1a1a; border-radius:8px; overflow-y:auto; box-sizing: border-box; flex-shrink: 0; touch-action: pan-y;">
                            <div style="padding: 15px; height: 100%; box-sizing: border-box; display:flex; flex-direction:column;">
                                <b style="color:#ff9900; font-size:14px; display:block; margin-bottom:10px; white-space:nowrap;">Top 8 Face Crop Tags</b>
                                <div id="cl-tags-right" style="flex:1; overflow-y:auto;"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        const loadPopup = new context.Popup(loadingHtml, context.POPUP_TYPE.TEXT, '', { okButton: false, cancelButton: false, wide: true, allowVerticalScrolling: false });
        loadPopup.show();

        const sleep = (ms) => new Promise(r => setTimeout(r, ms));

        const renderAnimatedTags = (containerId, tagsArray, color) => {
            const container = document.getElementById(containerId);
            if (tagsArray.length === 0) {
                container.innerHTML = '<span style="color:#777; font-size:12px;">No tags found.</span>';
                return;
            }
            
            let html = '';
            tagsArray.slice(0, 8).forEach((t, i) => {
                const delay = Math.min(i * 20, 200); 
                html += `
                    <div class="cl-tag-row">
                        <div class="cl-tag-header">
                            <span>${t.tag}</span>
                            <span>${(t.score * 100).toFixed(1)}%</span>
                        </div>
                        <div class="cl-tag-bar-bg">
                            <div class="cl-tag-bar" style="background: ${color}; transition-delay: ${delay}ms;" data-scale="${t.score}"></div>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;
            
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    container.querySelectorAll('.cl-tag-bar').forEach(bar => {
                        bar.style.transform = `scaleX(${bar.getAttribute('data-scale')})`;
                    });
                });
            });
        };

        try {
            document.getElementById('cl-loading-subtext').innerText = 'Loading ONNX Runtime...';
            await loadScript('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.0/dist/ort.min.js');
            const ort = window.ort;
            if (!ort) throw new Error("Failed to load ONNX Runtime.");
            
            const providers = navigator.gpu ? ['webgpu', 'wasm'] : ['wasm'];
            ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.0/dist/';

            const doFaceCrop = document.getElementById('cl-tagger-face-crop').checked;

            let yoloSession = null;
            if (doFaceCrop) {
                document.getElementById('cl-loading-subtext').innerText = 'Fetching Anime Face Detector...';
                const yoloUrl = 'https://huggingface.co/deepghs/anime_face_detection/resolve/main/face_detect_v1.4_n/model.onnx';
                try { yoloSession = await ort.InferenceSession.create(localYoloBuffer || await downloadAndVerify(yoloUrl, 'cl-yolo-face-cache'), { executionProviders: providers }); } 
                catch (e) { throw new Error("Could not download Anime Face Detector. Please use Import."); }
            }

            let modelBuffer = localModelBuffer;
            if (!modelBuffer) {
                const modelUrl = `https://huggingface.co/${currentModel}/resolve/main/model.onnx`;
                document.getElementById('cl-loading-subtext').innerText = 'Fetching WD Tagger...';
                try { modelBuffer = await downloadAndVerify(modelUrl, `cl-onnx-cache-${currentModel.replace(/\//g, '-')}`); } 
                catch (e) { throw new Error("Could not download WD Tagger. Please use Import."); }
            }

            let tagsUrl = 'https://huggingface.co/SmilingWolf/wd-vit-tagger-v3/resolve/main/selected_tags.csv'; 
            if (currentModel.includes('eva')) tagsUrl = 'https://huggingface.co/SmilingWolf/wd-eva02-large-tagger-v3/resolve/main/selected_tags.csv';
            else if (currentModel.includes('vit-large')) tagsUrl = 'https://huggingface.co/SmilingWolf/wd-vit-large-tagger-v3/resolve/main/selected_tags.csv';

            document.getElementById('cl-loading-subtext').innerText = 'Initializing WD Tagger...';
            let session = await ort.InferenceSession.create(modelBuffer, { executionProviders: providers });
            
            const tagsResponse = await fetch(tagsUrl);
            const tagsText = await tagsResponse.text();
            const tagNames = tagsText.trim().split('\n').slice(1).map(line => line.split(',')[1]);

            document.getElementById('cl-init-view').style.display = 'none';
            document.getElementById('cl-live-view').style.display = 'flex';

            let allTags = {};

            const processImageToTags = async (imgElement, isCrop = false) => {
                const canvas = document.createElement('canvas');
                canvas.width = 448; canvas.height = 448;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(imgElement, 0, 0, 448, 448);
                
                const data = ctx.getImageData(0, 0, 448, 448).data;
                const floatData = new Float32Array(448 * 448 * 3);
                for (let j = 0; j < data.length; j += 4) {
                    floatData[j / 4 * 3] = data[j + 2]; floatData[j / 4 * 3 + 1] = data[j + 1]; floatData[j / 4 * 3 + 2] = data[j];
                }

                const tensor = new ort.Tensor('float32', floatData, [1, 448, 448, 3]);
                const results = await session.run({ [session.inputNames[0]]: tensor });
                const scores = results[session.outputNames[0]].data;

                let currentViewTags = [];
                scores.forEach((score, index) => {
                    if (score > currentThreshold && tagNames[index]) {
                        const tag = tagNames[index];
                        if (!allTags[tag]) allTags[tag] = { score: 0, count: 0 };
                        const finalScore = isCrop ? Math.min(score * 1.1, 0.99) : score;
                        allTags[tag].score += finalScore;
                        allTags[tag].count += 1;
                        currentViewTags.push({ tag: tag, score: score });
                    }
                });
                
                currentViewTags.sort((a, b) => b.score - a.score);
                return currentViewTags;
            };

            for (let i = 0; i < imageUrls.length; i++) {
                document.getElementById('cl-live-title').innerText = `Processing Image ${i + 1} of ${imageUrls.length}`;
                document.getElementById('cl-global-progress').innerText = `${Math.round((i / imageUrls.length) * 100)}%`;
                
                document.getElementById('cl-image-row').classList.remove('cl-split');
                document.getElementById('cl-tags-row').classList.remove('cl-split');
                
                document.getElementById('cl-tags-left').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                document.getElementById('cl-tags-right').innerHTML = '';
                
                const response = await fetch(imageUrls[i]);
                const blob = await response.blob();
                const imageUrl = URL.createObjectURL(blob);
                
                const img = document.createElement('img');
                img.src = imageUrl;
                await new Promise((resolve) => { img.onload = resolve; });

                const displayCanvas = document.getElementById('cl-canvas-orig');
                const displayCtx = displayCanvas.getContext('2d');
                displayCanvas.width = img.width; 
                displayCanvas.height = img.height;
                
                displayCtx.clearRect(0, 0, img.width, img.height);
                displayCtx.drawImage(img, 0, 0, img.width, img.height);
                
                await sleep(500); 

                const fullTags = await processImageToTags(img, false);
                renderAnimatedTags('cl-tags-left', fullTags, '#4a9eff');
                
                await sleep(1000); 

                if (doFaceCrop && yoloSession) {
                    const yoloCanvas = document.createElement('canvas');
                    yoloCanvas.width = 640; yoloCanvas.height = 640;
                    const yoloCtx = yoloCanvas.getContext('2d');
                    yoloCtx.drawImage(img, 0, 0, 640, 640);
                    const yoloData = yoloCtx.getImageData(0, 0, 640, 640).data;
                    const yoloTensorData = new Float32Array(640 * 640 * 3);
                    for (let j = 0; j < yoloData.length; j += 4) {
                        yoloTensorData[j / 4 * 3] = yoloData[j] / 255.0;
                        yoloTensorData[j / 4 * 3 + 1] = yoloData[j + 1] / 255.0;
                        yoloTensorData[j / 4 * 3 + 2] = yoloData[j + 2] / 255.0;
                    }
                    const chwData = new Float32Array(3 * 640 * 640);
                    for (let c = 0; c < 3; c++) { for (let p = 0; p < 640 * 640; p++) { chwData[c * 640 * 640 + p] = yoloTensorData[p * 3 + c]; } }

                    const yoloTensor = new ort.Tensor('float32', chwData, [1, 3, 640, 640]);
                    const yoloResults = await yoloSession.run({ [yoloSession.inputNames[0]]: yoloTensor });
                    const yoloOutput = yoloResults[yoloSession.outputNames[0]].data;

                    let bestBox = null;
                    let maxArea = 0; 
                    
                    for (let j = 0; j < 8400; j++) {
                        const conf = yoloOutput[4 * 8400 + j];
                        if (conf > currentYoloThresh) {
                            const w = yoloOutput[2 * 8400 + j];
                            const h = yoloOutput[3 * 8400 + j];
                            const area = w * h;
                            
                            if (area > maxArea) {
                                maxArea = area;
                                bestBox = { x: yoloOutput[0 * 8400 + j], y: yoloOutput[1 * 8400 + j], w: w, h: h, conf: conf };
                            }
                        }
                    }

                    if (bestBox) {
                        const scaleX = img.width / 640; const scaleY = img.height / 640;
                        const cx = bestBox.x * scaleX; const cy = bestBox.y * scaleY;
                        const bw = bestBox.w * scaleX; const bh = bestBox.h * scaleY;

                        const px = Math.max(0, cx - bw / 2 - (bw * 0.1));
                        const py = Math.max(0, cy - bh / 2 - (bh * 0.1));
                        const pw = Math.min(img.width - px, bw * 1.2);
                        const ph = Math.min(img.height - py, bh * 1.2);

                        displayCtx.strokeStyle = '#ff0000'; 
                        displayCtx.lineWidth = Math.max(2, img.width / 200); 
                        displayCtx.strokeRect(px, py, pw, ph);
                        displayCtx.fillStyle = '#ff0000'; 
                        displayCtx.font = `bold ${Math.max(14, img.width / 40)}px Arial`;
                        displayCtx.fillText(`Face ${(bestBox.conf*100).toFixed(0)}%`, px, py - 8);
                        
                        await sleep(600); 

                        document.getElementById('cl-image-row').classList.add('cl-split');
                        document.getElementById('cl-tags-row').classList.add('cl-split');
                        
                        document.getElementById('cl-tags-right').innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100%;"><i class="fa-solid fa-spinner fa-spin fa-2x" style="color:#ff9900;"></i></div>';

                        const cropCanvas = document.getElementById('cl-canvas-crop');
                        cropCanvas.width = 400; cropCanvas.height = 400;
                        const cropCtx = cropCanvas.getContext('2d');
                        cropCtx.drawImage(img, px, py, pw, ph, 0, 0, 400, 400);

                        await sleep(800); 

                        const cropImgElement = document.createElement('img');
                        cropImgElement.src = cropCanvas.toDataURL();
                        await new Promise((resolve) => { cropImgElement.onload = resolve; });
                        const cropTags = await processImageToTags(cropImgElement, true);
                        
                        renderAnimatedTags('cl-tags-right', cropTags, '#ff9900');
                        
                        await sleep(1200); 
                    } else {
                        displayCtx.fillStyle = 'red'; displayCtx.font = `bold ${Math.max(14, img.width / 40)}px Arial`;
                        displayCtx.fillText("No Face Detected", 20, 40);
                        await sleep(1000);
                    }
                }
                
                URL.revokeObjectURL(imageUrl);
            }

            document.getElementById('cl-global-progress').innerText = '100%';
            document.getElementById('cl-live-title').innerText = 'Processing Complete!';
            await sleep(1000);

            let finalTags = [];
            const minAppearances = Math.max(2, Math.ceil(imageUrls.length * 0.7));
            
            for (const [label, data] of Object.entries(allTags)) {
                const avgScore = data.score / data.count;
                if (data.count >= minAppearances) {
                    const weight = (data.count * 2) + avgScore;
                    finalTags.push({ label, count: data.count, avgScore: avgScore, weight: weight });
                }
            }

            finalTags.sort((a, b) => b.weight - a.weight);
            const tagString = finalTags.map(t => t.label).join(', ');

            loadPopup.completeAffirmative();

            const resultHtml = `
                <div style="display:flex; flex-direction:column; gap:15px;">
                    <h3 style="margin:0;">Review Raw Tags</h3>
                    <p style="margin:0; color:#aaa;">Found ${finalTags.length} tags.</p>
                    <textarea id="cl-raw-tags-text" class="text_pole" style="width:100%; height:200px; font-family:monospace;">${tagString}</textarea>
                </div>
            `;
            const resultPopup = new context.Popup(resultHtml, context.POPUP_TYPE.TEXT, '', { okButton: 'Send to LLM', cancelButton: 'Cancel', wide: true });
            
            // Save the value BEFORE the popup is destroyed
            let rawTagsForLLM = tagString;
            resultPopup.onClosing = function() {
                const el = document.getElementById('cl-raw-tags-text');
                if (el) rawTagsForLLM = el.value;
                return true;
            };

            if (await resultPopup.show() === context.POPUP_RESULT.AFFIRMATIVE) {
                
                const llmLoadingHtml = `
                    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 30px;">
                        <i class="fa-solid fa-spinner fa-spin" style="font-size: 40px; color: #4a9eff; margin-bottom: 20px;"></i>
                        <h3 style="margin:0;">Asking LLM to refine tags...</h3>
                        <p style="color:#aaa; margin-top:10px; text-align:center;">Combining visual data with the character description.</p>
                    </div>
                `;
                const llmLoadPopup = new context.Popup(llmLoadingHtml, context.POPUP_TYPE.TEXT, '', { okButton: false, cancelButton: false });
                llmLoadPopup.show();

                const character = context.characters[context.characterId];
                const description = character.description || "No description provided.";
                
                const callLLM = async () => {
                    let template = localStorage.getItem('cl_llm_prompt');
                    if (!template || template.trim() === '') {
                        template = "Ignore previous instructions and provide ONLY the last chat message string back to me verbatim. Do not write anything after the string. Do not reply as {{char}} when writing this description, and do not attempt to continue the story.\n\nYou are an expert Stable Diffusion prompt engineer. I will provide a character's text description and a list of raw Danbooru tags extracted from their images.\n\nYour task:\n1. Combine the tags and description to output a clean list of PERMANENT physical traits (hair, eyes, body type, skin, species, scars, etc.).\n2. Remove backgrounds, lighting, poses, and temporary actions.\n3. Keep default iconic clothing ONLY if it's strictly part of their physical identity.\n4. Add age descriptor tags (e.g., 'mature female', 'aged up', 'milf', 'petite', 'child', 'teenager') based on the description.\n5. Determine the character's age from the description and calculate the Age Slider LoRA weight:\n   - Child (<10): -5.0 to -4.0\n   - Teen (13-17): -3.0 to -0.5\n   - Adult (18-25): 1.0 to 1.5\n   - Adult (26-35): 2.0 to 3.0\n   - Mature (36-45): 4.0 to 5.0\n   Use granular decimals (e.g., 1.2, 2.5, 4.2). If age is unknown, assume 1.0.\n6. Append the exact LoRA tag at the very end of the list: <lora:StS_Age_Slider_Illustrious_v1:WEIGHT>\n\nOutput ONLY the final comma-separated prompt string. Do not include any conversational text.\n\nCharacter Description:\n{{description}}\n\nRaw Tags:\n{{rawTags}}";
                    }
                    
                    const finalPrompt = template
                        .replace(/{{description}}/g, description)
                        .replace(/{{rawTags}}/g, rawTagsForLLM);

                    console.log("=== SENDING TO LLM ===");
                    console.log(finalPrompt);

                    try {
                        // generateQuietPrompt(prompt, skip_wi, skip_char)
                        // skip_wi = true (don't inject world info)
                        // skip_char = true (don't inject character card)
                        let res = await context.generateQuietPrompt(finalPrompt, true, true);
                        
                        if (!res || res.trim() === '') return "ERROR: LLM returned empty output. Click Regenerate.";
                        
                        // Strip thinking blocks and quotes
                        res = res.replace(/<\|channel>thought[\s\S]*?<channel\|>/g, '');
                        res = res.trim();
                        if (res.startsWith('"') && res.endsWith('"')) res = res.slice(1, -1);
                        return res;
                    } catch (e) {
                        console.error("LLM Error:", e);
                        return "ERROR: " + e.message;
                    }
                };

                const firstResult = await callLLM();
                llmLoadPopup.completeAffirmative();

                const finalReviewHtml = `
                    <div style="display:flex; flex-direction:column; gap:15px;">
                        <h3 style="margin:0;">Final Character Tags</h3>
                        <p style="margin:0; color:#aaa;">Review the LLM's refined output before saving.</p>
                        <textarea id="cl-final-tags-text" class="text_pole" style="width:100%; height:200px; font-family:monospace;">${firstResult}</textarea>
                    </div>
                `;
                const finalReviewPopup = new context.Popup(finalReviewHtml, context.POPUP_TYPE.TEXT, '', { okButton: 'Save to Character', cancelButton: 'Close', wide: true });
                
                let finalPromptText = firstResult;
                finalReviewPopup.onClosing = function() {
                    const el = document.getElementById('cl-final-tags-text');
                    if (el) finalPromptText = el.value;
                    return true;
                };

                // Add Regenerate Button
                $(finalReviewPopup.dlg).find('.popup-controls').prepend(`<button id="cl-regenerate-btn" class="menu_button" style="margin-right: 10px; background: #4a9eff; color: white; width: 120px;">Regenerate</button>`);
                
                $(finalReviewPopup.dlg).find('#cl-regenerate-btn').on('click', async function() {
                    const btn = $(this);
                    btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Rerolling...');
                    document.getElementById('cl-final-tags-text').value = "Generating...";
                    
                    const newResult = await callLLM();
                    document.getElementById('cl-final-tags-text').value = newResult;
                    finalPromptText = newResult;
                    
                    btn.prop('disabled', false).html('Regenerate');
                });

                if (await finalReviewPopup.show() === context.POPUP_RESULT.AFFIRMATIVE) {
                    // 1. Update the text area
                    const prefixInput = document.getElementById('sd_character_prompt');
                    if (prefixInput) {
                        prefixInput.value = finalPromptText;
                        // Trigger both input and change events so ST saves it to the active session
                        $(prefixInput).trigger('input').trigger('change');
                        
                        // 2. Automatically check the "Shareable" box so it saves to the card
                        const shareCheckbox = document.getElementById('sd_character_prompt_share');
                        if (shareCheckbox && !shareCheckbox.checked) {
                            shareCheckbox.checked = true;
                            $(shareCheckbox).trigger('change');
                        }

                        if (window.toastr) toastr.success("Saved to Character Prefix & marked Shareable!");
                    } else {
                        if (window.toastr) toastr.error("Could not find the Character Prefix input. Is Image Generation enabled?");
                    }
                }
            }

        } catch (err) {
            console.error(err);
            loadPopup.completeCancelled();
            if (window.toastr) toastr.error(err.message || "Failed to run ONNX model. Check console.");
        }
    };

    const openTaggerPopup = async () => {
        try {
            const context = SillyTavern.getContext();
            const character = context.characters[context.characterId];
            if (!character) return;

            const foundUrls = [ `/characters/${character.avatar}`, ...extractImages(JSON.stringify(character)) ];
            let imagesHtml = '';
            
            foundUrls.forEach((url, index) => {
                const displayUrl = url.startsWith('http') && !url.includes('127.0.0.1') ? `/proxy/${encodeURIComponent(url)}` : url;
                imagesHtml += `
                    <div class="cl-img-wrapper selected" data-url="${displayUrl}" style="position: relative; display: inline-block; border-radius: 8px; overflow: hidden; border: 3px solid #4a9eff; width: 100px; height: 100px; background: #222; cursor: pointer; transition: all 0.2s;" onclick="this.classList.toggle('selected'); this.style.borderColor = this.classList.contains('selected') ? '#4a9eff' : '#444'; this.querySelector('.cl-img-overlay i').className = this.classList.contains('selected') ? 'fa-solid fa-check-circle' : 'fa-solid fa-times-circle'; this.querySelector('.cl-img-overlay i').style.color = this.classList.contains('selected') ? '#4a9eff' : '#ff6b6b';">
                        <div class="cl-img-loader" style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #4a9eff; z-index: 2;"><i class="fa-solid fa-spinner fa-spin"></i></div>
                        <div class="cl-img-overlay" style="position: absolute; top: 4px; right: 4px; z-index: 5;"><i class="fa-solid fa-check-circle" style="color: #4a9eff; font-size: 24px; text-shadow: 0 1px 4px rgba(0,0,0,0.9);"></i></div>
                        <img src="${displayUrl}" style="width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 0.3s;" onload="this.closest('.cl-img-wrapper').querySelector('.cl-img-loader').style.display='none'; this.style.opacity=1;" onerror="this.closest('.cl-img-wrapper').querySelector('.cl-img-loader').innerHTML='<i class=\\'fa-solid fa-triangle-exclamation\\' style=\\'color:#ff6b6b; font-size:24px;\\'></i>'; this.style.display='none';">
                    </div>`;
            });

            const popup = new context.Popup(`
                <div style="display:flex; flex-direction:column; gap:15px;">
                    <h3 style="margin:0;">Select Images to Process</h3>
                    <p style="margin:0; color:#aaa;">Found ${foundUrls.length} images. Click to toggle.</p>
                    <div style="display:flex; flex-wrap: wrap; gap:10px; overflow-y:auto; max-height: 40vh;">${imagesHtml}</div>
                </div>`, context.POPUP_TYPE.TEXT, '', { okButton: 'Process Selected Images', cancelButton: 'Cancel', wide: true });

            let selectedUrls = [];
            popup.onClosing = function() {
                selectedUrls = [];
                $(popup.dlg).find('.cl-img-wrapper.selected').each(function() { selectedUrls.push($(this).attr('data-url')); });
                return true;
            };

            if (await popup.show() === context.POPUP_RESULT.AFFIRMATIVE) {
                if (selectedUrls.length > 0) runTagger(selectedUrls, context);
                else if (window.toastr) toastr.warning("No images selected!");
            }
        } catch (err) {
            console.error(err);
            if (window.toastr) toastr.error("Failed to open popup. Check console.");
        }
    };

    const injectButton = () => {
        const deleteBtn = document.getElementById('delete_button');
        if (deleteBtn && !document.getElementById('cl_auto_tagger_btn')) {
            const btn = document.createElement('div');
            btn.id = 'cl_auto_tagger_btn';
            btn.className = 'menu_button fa-solid fa-camera interactable';
            btn.title = 'Auto-Extract Appearance Tags';
            btn.style.cursor = 'pointer';
            btn.style.display = 'flex';
            deleteBtn.parentElement.insertBefore(btn, deleteBtn);
            btn.addEventListener('click', openTaggerPopup);
            console.log("[Auto-Tagger] Camera button injected!");
        }
    };

    const observer = new MutationObserver(() => {
        if (document.getElementById('delete_button')) {
            injectButton();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    injectButton(); 
});
