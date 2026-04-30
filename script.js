let QAM_MODE = 16;
let NUM_SECTORS = 16;
let TARGET_SYMBOL = 6;
let GRID_SCALE = 30;
let BASE_NOISE = 12;
let K_AM = 0.00003; // Distortion strength
let K_PM = 0.000015; // Rotation strength

// DOM Elements
const elements = {
    txGrid: document.getElementById('tx-grid'),
    txValue: document.getElementById('tx-value'),
    tradBoundaries: document.getElementById('traditional-boundaries'),
    neuralBoundaries: document.getElementById('neural-boundaries'),
    heatmapLayer: document.getElementById('heatmap-layer'),
    idealPoints: document.getElementById('ideal-points'),
    labels: document.getElementById('labels'),
    darts: document.getElementById('darts'),
    btnThrow: document.getElementById('btn-throw'),
    btnThrow10: document.getElementById('btn-throw-10'),
    modeToggle: document.getElementById('mode-toggle'),
    modeLabel: document.getElementById('mode-label'),
    rxValue: document.getElementById('rx-value'),
    resultBox: document.getElementById('result-box'),
    resultMessage: document.getElementById('result-message'),
    statsBox: document.getElementById('stats-box'),
    statTrad: document.getElementById('stat-trad'),
    statNeural: document.getElementById('stat-neural')
};

// State
let isNeuralMode = false;
let currentDart = null;

// Math & QAM Logic
function getIdealSVGPos(symbol) {
    const N = Math.sqrt(NUM_SECTORS);
    const row = Math.floor((symbol - 1) / N);
    const col = (symbol - 1) % N;
    return {
        x: (col * 2 - (N - 1)) * GRID_SCALE,
        y: (row * 2 - (N - 1)) * GRID_SCALE
    };
}

// Power Amplifier (PA) Non-linear Distortion Model
function applyPADistortion(x, y) {
    const r = Math.sqrt(x*x + y*y);
    const theta = Math.atan2(y, x);
    
    // AM-AM Compression
    // 使用有理函數模型 r / (1 + k_am * r^2) 確保在我們的大範圍半徑 (r<180) 內保持單調遞增，
    // 不會因為三次方的過度削頂而讓外圍機率雲產生反轉或消失的 Bug。
    // k_am = 0.00003 剛好會把最外圍的點 (r=127) 擠壓到 x,y 接近 60 的邊界上，導致傳統模型極易誤判！
    // AM-AM Compression
    const r_dist = r / (1 + K_AM * r * r); 
    
    // AM-PM Phase Rotation
    const theta_dist = theta + K_PM * r * r;
    
    return {
        x: r_dist * Math.cos(theta_dist),
        y: r_dist * Math.sin(theta_dist)
    };
}

// Distance
function getDistance(x1, y1, x2, y2) {
    return Math.sqrt((x1 - x2)**2 + (y1 - y2)**2);
}

// Traditional hard decision based on perfect Euclidean grid
function traditionalDecode(x, y) {
    let minD = Infinity;
    let closestSymbol = 1;
    for (let i = 1; i <= NUM_SECTORS; i++) {
        const ideal = getIdealSVGPos(i);
        const d = getDistance(x, y, ideal.x, ideal.y);
        if (d < minD) {
            minD = d;
            closestSymbol = i;
        }
    }
    return closestSymbol;
}

// Inverse of the PA Distortion (Equalizer / Neural Receiver's learned mapping)
function removePADistortion(x, y) {
    const r_dist = Math.sqrt(x*x + y*y);
    const theta_dist = Math.atan2(y, x);
    
    if (r_dist === 0) return {x: 0, y: 0};

    const discriminant = 1 - 4 * K_AM * r_dist * r_dist;
    
    let r = 0;
    if (discriminant < 0) {
        // If noise pushes the point beyond the mathematically invertible domain, cap it
        r = 1 / Math.sqrt(K_AM);
    } else {
        r = (1 - Math.sqrt(discriminant)) / (2 * K_AM * r_dist);
    }
    
    const theta = theta_dist - K_PM * r * r;
    
    return {
        x: r * Math.cos(theta),
        y: r * Math.sin(theta)
    };
}

function neuralDecode(x, y) {
    // The Neural Receiver equalizes the signal by mapping it back through the learned inverse distortion
    const equalized = removePADistortion(x, y);
    
    // Simulating Neural Network imperfection (residual error)
    // Even the best AI has a tiny bit of "model mismatch" or estimation noise.
    // We scale this error by the radius to show that corners are harder even for AI.
    const r = Math.sqrt(equalized.x**2 + equalized.y**2);
    const residualMagnitude = GRID_SCALE * 0.30 * (r / 150); // Up to 30% of grid size at edges
    const residualX = (Math.random() - 0.5) * residualMagnitude;
    const residualY = (Math.random() - 0.5) * residualMagnitude;
    
    // Then it evaluates it against the perfect traditional grid
    return traditionalDecode(equalized.x + residualX, equalized.y + residualY);
}

// Initialization
function initUI() {
    // Generate Tx Grid
    elements.txGrid.innerHTML = '';
    for (let i = 1; i <= NUM_SECTORS; i++) {
        const btn = document.createElement('button');
        btn.className = `tx-btn ${i === TARGET_SYMBOL ? 'active' : ''}`;
        btn.textContent = i;
        btn.onclick = () => setTargetSymbol(i);
        elements.txGrid.appendChild(btn);
    }
}

function setTargetSymbol(symbol) {
    TARGET_SYMBOL = symbol;
    elements.txValue.textContent = symbol;
    
    // Update Tx Grid UI
    Array.from(elements.txGrid.children).forEach((btn, index) => {
        btn.className = `tx-btn ${index + 1 === TARGET_SYMBOL ? 'active' : ''}`;
    });

    // Re-draw board to highlight new target
    drawBoard();
    
    // Re-draw distributions if Neural Mode is on
    if (isNeuralMode) drawDistributions();
    elements.darts.innerHTML = '';
    elements.heatmapLayer.innerHTML = '';
    elements.rxValue.textContent = '-';
    elements.resultMessage.innerHTML = '點擊上方按鈕開始發射訊號！';
    elements.resultBox.className = 'status-box result-box';
    elements.statsBox.style.display = 'none';
}

function drawBoard() {
    elements.idealPoints.innerHTML = '';
    elements.labels.innerHTML = '';
    elements.tradBoundaries.innerHTML = '';
    elements.neuralBoundaries.innerHTML = '';

    // 1. Draw Ideal Points and Labels
    for (let i = 1; i <= NUM_SECTORS; i++) {
        const pos = getIdealSVGPos(i);
        
        // Dot
        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("cx", pos.x);
        dot.setAttribute("cy", pos.y);
        dot.setAttribute("r", i === TARGET_SYMBOL ? "6" : "3");
        dot.setAttribute("class", `ideal-dot ${i === TARGET_SYMBOL ? 'target' : ''}`);
        elements.idealPoints.appendChild(dot);

        // Label
        if (NUM_SECTORS <= 64 || i === TARGET_SYMBOL) {
            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", pos.x);
            text.setAttribute("y", pos.y - (NUM_SECTORS > 64 ? 8 : 12));
            text.setAttribute("class", `sector-label ${i === TARGET_SYMBOL ? 'target-label' : ''}`);
            if (NUM_SECTORS > 64) text.setAttribute("style", "font-size: 6px;");
            text.textContent = i;
            elements.labels.appendChild(text);
        }
    }

    // 2. Draw Traditional Boundaries (Straight grid lines)
    const N = Math.sqrt(NUM_SECTORS);
    const lines = [];
    for (let i = 1; i < N; i++) {
        lines.push((i * 2 - N) * GRID_SCALE);
    }
    
    lines.forEach(val => {
        // Vertical lines
        const vLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        vLine.setAttribute("x1", val);
        vLine.setAttribute("y1", "-120");
        vLine.setAttribute("x2", val);
        vLine.setAttribute("y2", "120");
        vLine.setAttribute("class", "boundary-line");
        elements.tradBoundaries.appendChild(vLine);

        // Horizontal lines
        const hLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        hLine.setAttribute("x1", "-120");
        hLine.setAttribute("y1", val);
        hLine.setAttribute("x2", "120");
        hLine.setAttribute("y2", val);
        hLine.setAttribute("class", "boundary-line");
        elements.tradBoundaries.appendChild(hLine);
    });

    // 3. Draw Neural Boundaries (Warped grid lines)
    // We generate a path by passing a straight line through the distortion function
    const steps = 20;
    lines.forEach(val => {
        // Vertical warped
        let vPath = "";
        for(let i=0; i<=steps; i++) {
            const y = -120 + (240 / steps) * i;
            const dist = applyPADistortion(val, y);
            vPath += (i === 0 ? "M " : "L ") + `${dist.x} ${dist.y} `;
        }
        const vNode = document.createElementNS("http://www.w3.org/2000/svg", "path");
        vNode.setAttribute("d", vPath);
        vNode.setAttribute("class", "neural-boundary");
        elements.neuralBoundaries.appendChild(vNode);

        // Horizontal warped
        let hPath = "";
        for(let i=0; i<=steps; i++) {
            const x = -120 + (240 / steps) * i;
            const dist = applyPADistortion(x, val);
            hPath += (i === 0 ? "M " : "L ") + `${dist.x} ${dist.y} `;
        }
        const hNode = document.createElementNS("http://www.w3.org/2000/svg", "path");
        hNode.setAttribute("d", hPath);
        hNode.setAttribute("class", "neural-boundary");
        elements.neuralBoundaries.appendChild(hNode);
    });
}

function drawDistributions() {
    elements.heatmapLayer.innerHTML = '';
    
    const colors = ['#66fcf1', '#ff007f', '#b026ff', '#8892b0']; // Cyan, Pink, Purple, Soft Blue

    // Draw learned expected signal areas (Probability Clouds)
    // For 256-QAM, we only draw a subset + target to avoid performance lag
    for (let i = 1; i <= NUM_SECTORS; i++) {
        if (NUM_SECTORS > 64 && i % 4 !== 0 && i !== TARGET_SYMBOL) continue;
        
        const ideal = getIdealSVGPos(i);
        const distCenter = applyPADistortion(ideal.x, ideal.y);
        
        // Assign a color (using quadrant logic or simple modulo)
        const row = Math.floor((i - 1) / 4);
        const col = (i - 1) % 4;
        let colorIndex = (row % 2) * 2 + (col % 2); // Creates a checkerboard/mixed color pattern
        const color = colors[colorIndex];

        // Generate distorted path representing the probability cloud shape
        let pathData = "";
        const pointsCount = 16;
        const baseNoiseSpread = QAM_MODE === 16 ? 22 : 7; // Base tolerance

        for (let p = 0; p < pointsCount; p++) {
            const angle = (p / pointsCount) * Math.PI * 2;
            const px = ideal.x + Math.cos(angle) * baseNoiseSpread;
            const py = ideal.y + Math.sin(angle) * baseNoiseSpread;
            
            // Pass the noise boundary through the PA distortion function
            // This causes outer clouds to naturally squash and deform!
            const distP = applyPADistortion(px, py);
            
            pathData += (p === 0 ? "M " : "L ") + `${distP.x} ${distP.y} `;
        }
        pathData += "Z";
        
        const cloud = document.createElementNS("http://www.w3.org/2000/svg", "path");
        cloud.setAttribute("d", pathData);
        cloud.setAttribute("class", `distribution-cloud ${i === TARGET_SYMBOL ? 'target' : ''}`);
        cloud.style.fill = color;
        
        // We set transform origin to the center of the cloud for CSS animations
        cloud.style.transformOrigin = `${distCenter.x}px ${distCenter.y}px`;
        
        elements.heatmapLayer.appendChild(cloud);
    }
}

// Interactions
function throwDart() {
    elements.btnThrow.disabled = true;
    elements.btnThrow10.disabled = true;
    elements.darts.innerHTML = '';
    elements.heatmapLayer.innerHTML = '';
    elements.statsBox.style.display = 'none';
    
    const results = simulateDartThrow();

    // Decode after animation
    setTimeout(() => {
        updateDecoding(results.tradResult, results.neuralResult);
        elements.btnThrow.disabled = false;
        elements.btnThrow10.disabled = false;
    }, 500);
}

function simulateDartThrow() {
    const ideal = getIdealSVGPos(TARGET_SYMBOL);
    const distortedTx = applyPADistortion(ideal.x, ideal.y);

    // Add Channel Noise (AWGN)
    // Scale noise based on GRID_SCALE so it's always visually meaningful
    const noiseSpread = GRID_SCALE * 1.5; 
    const noiseX = (Math.random() - 0.5) * noiseSpread;
    const noiseY = (Math.random() - 0.5) * noiseSpread;

    const rxPos = {
        x: distortedTx.x + noiseX,
        y: distortedTx.y + noiseY
    };

    currentDart = rxPos;

    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    
    const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    ring.setAttribute("cx", rxPos.x);
    ring.setAttribute("cy", rxPos.y);
    ring.setAttribute("class", "dart-ring");
    
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", rxPos.x);
    dot.setAttribute("cy", rxPos.y);
    dot.setAttribute("r", "4");
    dot.setAttribute("class", "dart");
    
    group.appendChild(ring);
    group.appendChild(dot);
    elements.darts.appendChild(group);

    if (isNeuralMode) {
        drawDistributions();
    }

    return {
        tradResult: traditionalDecode(rxPos.x, rxPos.y),
        neuralResult: neuralDecode(rxPos.x, rxPos.y)
    };
}

async function throwBatch(count) {
    elements.btnThrow.disabled = true;
    elements.btnThrow10.disabled = true;
    elements.darts.innerHTML = '';
    elements.statsBox.style.display = 'block';
    
    let tradCorrect = 0;
    let neuralCorrect = 0;
    
    for(let i=1; i<=count; i++) {
        // Short delay for animation effect
        await new Promise(r => setTimeout(r, 150));
        
        const results = simulateDartThrow();
        if (results.tradResult === TARGET_SYMBOL) tradCorrect++;
        if (results.neuralResult === TARGET_SYMBOL) neuralCorrect++;
        
        updateDecoding(results.tradResult, results.neuralResult, true); // true = bypass timeout class changes for batch
        
        elements.statTrad.textContent = `${Math.round((tradCorrect / i) * 100)}%`;
        elements.statNeural.textContent = `${Math.round((neuralCorrect / i) * 100)}%`;
    }
    
    // Batch done
    elements.resultBox.className = 'status-box result-box success';
    elements.resultMessage.innerHTML = `<span class="success-text">✅ 10 連發測試完成！</span> 請查看下方正確率統計。`;
    
    elements.btnThrow.disabled = false;
    elements.btnThrow10.disabled = false;
}

function updateDecoding(tradResult, neuralResult, isBatch = false) {
    if (!currentDart) return;

    if (tradResult === undefined) tradResult = traditionalDecode(currentDart.x, currentDart.y);
    if (neuralResult === undefined) neuralResult = neuralDecode(currentDart.x, currentDart.y);

    const activeResult = isNeuralMode ? neuralResult : tradResult;
    
    // Update UI
    elements.rxValue.textContent = activeResult;
    
    elements.resultBox.className = 'status-box result-box';
    elements.resultMessage.innerHTML = '';

    const dartDots = elements.darts.querySelectorAll('.dart');
    const lastDartDot = dartDots.length > 0 ? dartDots[dartDots.length - 1] : null;
    
    if (lastDartDot) lastDartDot.className.baseVal = "dart";

    if (isBatch) {
        // 連發模式下不顯示長篇解釋，避免文字閃爍太快
        elements.resultMessage.innerHTML = `<span style="color: #8892b0;">🚀 快速連發測試進行中... (即時判定: <strong>${activeResult}</strong>)</span>`;
    } else {
        if (activeResult === TARGET_SYMBOL) {
            if (isNeuralMode && tradResult !== TARGET_SYMBOL) {
                elements.resultBox.classList.add('neural-success');
                elements.resultMessage.innerHTML = `<span class="neural-text">✨ AI 神救援！</span> 傳統模型太死板，被硬體失真騙去，誤判成了 <strong>${tradResult}</strong>。<br>但 AI 看穿了變形的機率雲，硬是把它拉回來，正確解碼為 <strong>${TARGET_SYMBOL}</strong>！`;
                if (lastDartDot) lastDartDot.className.baseVal = "dart neural-corrected";
            } else {
                elements.resultBox.classList.add('success');
                elements.resultMessage.innerHTML = `<span class="success-text">🎯 穩穩命中！</span> 訊號雖然有點歪，但還在射程範圍內。傳統模型跟 AI 都順利解碼為 <strong>${TARGET_SYMBOL}</strong>。`;
            }
        } else {
            elements.resultBox.classList.add('error');
            elements.resultMessage.innerHTML = `<span class="error-text">💥 雜訊太暴力了...</span> 這次干擾強到連 AI 都扛不住，直接被帶偏，錯認成了 <strong>${activeResult}</strong>。<br><span style="font-size:0.9em; opacity:0.8;">(這種硬傷只能靠後續的糾錯碼 FEC 來救場了)</span>`;
        }
    }
}

// Events
document.querySelectorAll('input[name="qam-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        QAM_MODE = parseInt(e.target.value);
        NUM_SECTORS = QAM_MODE;
        
        // Adaptive Scaling & Distortion
        if (QAM_MODE === 16) {
            GRID_SCALE = 30;
            TARGET_SYMBOL = 6;
            BASE_NOISE = 12;
            K_AM = 0.00003;
            K_PM = 0.000015;
            elements.txGrid.className = 'tx-grid';
        } else if (QAM_MODE === 64) {
            GRID_SCALE = 15;
            TARGET_SYMBOL = 28;
            BASE_NOISE = 6;
            K_AM = 0.00002; // Slightly more linear for higher order
            K_PM = 0.00001;
            elements.txGrid.className = 'tx-grid qam-64';
        } else if (QAM_MODE === 256) {
            GRID_SCALE = 7.5;
            TARGET_SYMBOL = 120;
            BASE_NOISE = 3.5; // More noise for 256
            K_AM = 0.00001; // Stronger distortion
            K_PM = 0.000005;
            elements.txGrid.className = 'tx-grid qam-256';
        }
        
        document.getElementById('qam-title').textContent = `${QAM_MODE}-QAM Receiver`;
        
        // Reset state
        currentDart = null;
        elements.darts.innerHTML = '';
        elements.heatmapLayer.innerHTML = '';
        elements.rxValue.textContent = '-';
        elements.resultMessage.innerHTML = '點擊上方按鈕開始發射訊號！';
        elements.resultBox.className = 'status-box result-box';
        elements.statsBox.style.display = 'none';
        
        initUI();
        setTargetSymbol(TARGET_SYMBOL);
    });
});

elements.btnThrow.addEventListener('click', throwDart);
elements.btnThrow10.addEventListener('click', () => throwBatch(10));

elements.modeToggle.addEventListener('change', (e) => {
    isNeuralMode = e.target.checked;
    
    if (isNeuralMode) {
        elements.modeLabel.textContent = "Neural Receiver";
        elements.modeLabel.className = "mode-label neural";
        elements.neuralBoundaries.style.opacity = "1";
        elements.tradBoundaries.style.opacity = "0.2";
        elements.heatmapLayer.style.opacity = "1";
        
        drawDistributions();
    } else {
        elements.modeLabel.textContent = "Traditional Model";
        elements.modeLabel.className = "mode-label traditional";
        elements.neuralBoundaries.style.opacity = "0";
        elements.tradBoundaries.style.opacity = "1";
        elements.heatmapLayer.style.opacity = "0";
        
        if (currentDart) {
            const tradResult = traditionalDecode(currentDart.x, currentDart.y);
            const neuralResult = neuralDecode(currentDart.x, currentDart.y);
            updateDecoding(tradResult, neuralResult);
        }
    }
});

// Visitor Counter Logic
async function initVisitorCount() {
    console.log('Initializing visitor counter...');
    const visitorSpan = document.getElementById('visitor-count');
    if (!visitorSpan) return;

    try {
        // Use a more robust hits service if CountAPI is flaky
        const response = await fetch('https://api.countapi.xyz/hit/ran-neural-receiver-demo/visits');
        const data = await response.json();
        
        if (data && data.value) {
            console.log('Visitor count updated:', data.value);
            visitorSpan.textContent = `Access Log: ${data.value.toLocaleString()} Units`;
        } else {
            throw new Error('No data from API');
        }
    } catch (err) {
        console.error('Visitor counter error:', err);
        // Fallback text that still looks like part of the system
        visitorSpan.textContent = 'System Status: Active';
    }
}

// Start
initUI();
drawBoard();
initVisitorCount();
