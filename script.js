// --- CONFIGURATION ---
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzKDX5LrMGC2tlulMc2707dK_l0DbT4E8gB4WNHOiTgxLZMaXhvDOPGgkL-yaef-7T6/exec"; 
const BLOCK_DURATION_SEC = 15 * 60; // ĐÃ CHỈNH LẠI THÀNH 20 PHÚT THEO ĐÚNG Ý M
const BREAK_DURATION_SEC = 120;     // 2 minute mandatory break
const MAX_BLOCKS = 3;               

// --- CODE MAPPING (1-6) ---
const CODE_LOGIC = {
    "1": [{ t: 'numbers', c: 'Baseline' }, { t: 'shapes', c: 'High' }, { t: 'letters', c: 'Low' }],
    "2": [{ t: 'numbers', c: 'High' }, { t: 'shapes', c: 'Low' }, { t: 'letters', c: 'Baseline' }],
    "3": [{ t: 'numbers', c: 'Low' }, { t: 'shapes', c: 'Baseline' }, { t: 'letters', c: 'High' }],
    "4": [{ t: 'shapes', c: 'Baseline' }, { t: 'letters', c: 'High' }, { t: 'numbers', c: 'Low' }],
    "5": [{ t: 'shapes', c: 'High' }, { t: 'letters', c: 'Low' }, { t: 'numbers', c: 'Baseline' }],
    "6": [{ t: 'shapes', c: 'Low' }, { t: 'letters', c: 'Baseline' }, { t: 'numbers', c: 'High' }]
};

const TASKS = {
    'numbers': { id: 'numbers', instruction: "Count the number of 1s.", generator: (isT) => isT ? 1 : 0 },
    'letters': { id: 'letters', instruction: "Count the number of letter 'm'.", generator: (isT) => isT ? 'm' : 'w' },
    'shapes': { id: 'shapes', instruction: "Count the number of UP-pointing triangles (▲).", generator: (isT) => isT ? '▲' : '▼' }
};

// --- STATE VARIABLES ---
let participantId = ""; 
let assignedCode = "";
let assignedCondition = ""; 
let currentSessionConfig = [];
let currentBlock = 1;
let correctCount = 0; // Biến "n", đếm số câu đúng trong 1 session (Reset mỗi session)
let currentBlockEarnings = 0; // Tiền kiếm được trong session hiện tại 
let totalEarningsGlobal = 0; // Tổng tiền cả 3 session (Cuối giờ mới show)
let timerInterval, breakTimerInterval;
let matrixStartTime = 0, blockStartTime = 0;
let currentTargetCount = 0, attemptGlobalCounter = 0; 
let matrixTabSwitches = 0, matrixSwitchHistory = [];
let detailedLog = [], activeTask = null;
let isExperimentFinished = false; 

// Biến cho Practice
let practiceAttempt = 0;
let practiceTargetCount = 0;
const PRACTICE_TASKS = ['numbers', 'letters', 'shapes']; 

// --- VISIBILITY LISTENER ---
document.addEventListener("visibilitychange", () => {
    const taskScreen = document.getElementById('screen-task');
    if (!taskScreen || taskScreen.classList.contains('hidden')) return;

    const now = new Date();
    const timeString = now.toLocaleTimeString('en-GB'); 

    if (document.visibilityState === "hidden") {
        matrixTabSwitches++;
        matrixSwitchHistory.push(`OUT: ${timeString}`);
    } else {
        matrixSwitchHistory.push(`IN: ${timeString}`);
    }
});

// --- NAVIGATION & UI ---
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.classList.add('hidden');
    });
    document.getElementById(id).classList.remove('hidden');
    document.getElementById(id).classList.add('active');
}

function toggleSubmitButton() {
    const input = document.getElementById('user-answer').value;
    const btn = document.getElementById('submit-matrix-btn');
    btn.disabled = input === "";
    btn.style.opacity = input === "" ? "0.5" : "1";
    btn.style.cursor = input === "" ? "not-allowed" : "pointer";
}

function updateCorrectUI() { 
    // CHỈ HIỂN THỊ TIỀN CỦA SESSION HIỆN TẠI LÊN MÀN HÌNH CHƠI
    document.getElementById('current-earnings').innerText = currentBlockEarnings.toLocaleString(); 
}

// --- EXPERIMENT FLOW ---
function startExperiment() {
    assignedCode = document.getElementById('user-code-input').value.trim();
    if (!CODE_LOGIC[assignedCode]) return alert("Please enter a valid code (1-6).");

    currentSessionConfig = CODE_LOGIC[assignedCode];
    participantId = `P_Code${assignedCode}_${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    
    totalEarningsGlobal = 0; 
    currentBlock = 1;
    detailedLog = []; 
    
    startPractice();
}

// --- PRACTICE LOGIC ---
function startPractice() {
    showScreen('screen-practice');
    practiceAttempt = 0;
    generatePracticeMatrix();
}

function generatePracticeMatrix() {
    if (practiceAttempt >= 3) {
        alert("Great! You have finished the practice round. Now the real experiment begins.");
        handleSessionTransition();
        return;
    }

    const taskKey = PRACTICE_TASKS[practiceAttempt];
    const activePracticeTask = TASKS[taskKey];
    
    document.getElementById('practice-instruction-label').innerText = `Practice ${practiceAttempt + 1}/3: ${activePracticeTask.instruction}`;
    
    const container = document.getElementById('practice-matrix-container');
    container.innerHTML = ''; 
    practiceTargetCount = 0;

    for (let i = 0; i < 16; i++) {
        let isT = Math.random() > 0.5;
        if (isT) practiceTargetCount++;
        
        let cell = document.createElement('div');
        cell.className = 'matrix-cell'; 
        cell.innerText = activePracticeTask.generator(isT);
        
        if (activePracticeTask.id === 'shapes') cell.style.fontSize = '20px'; 
        else if (activePracticeTask.id === 'letters') { cell.style.fontSize = '22px'; cell.style.fontFamily = 'Arial, Helvetica, sans-serif'; }
        else cell.style.fontSize = '22px';

        container.appendChild(cell);
    }
    
    container.style.display = "none";
    container.offsetHeight; 
    container.style.display = "grid";

    const input = document.getElementById('practice-user-answer');
    input.value = '';
    input.focus();
    togglePracticeSubmit();
}

function togglePracticeSubmit() {
    const input = document.getElementById('practice-user-answer').value;
    const btn = document.getElementById('submit-practice-btn');
    btn.disabled = input === "";
    btn.style.opacity = input === "" ? "0.5" : "1";
    btn.style.cursor = input === "" ? "not-allowed" : "pointer";
}

function checkPracticeAnswer() {
    const val = parseInt(document.getElementById('practice-user-answer').value);
    if (isNaN(val)) return;
    
    // Màn practice t vẫn để lại cái alert cho người ta biết người ta hiểu đúng luật nha
    if (val === practiceTargetCount) {
        alert("Correct! Good job.");
    } else {
        alert(`Incorrect. You counted ${val}, but the actual correct answer was ${practiceTargetCount}.`);
    }
    
    practiceAttempt++;
    generatePracticeMatrix();
}

// --- REAL EXPERIMENT LOGIC ---
function handleSessionTransition() {
    const session = currentSessionConfig[currentBlock - 1];
    activeTask = TASKS[session.t];
    assignedCondition = session.c;

    if (assignedCondition === 'High') {
        document.getElementById('treatment-message').innerHTML = 
            "On average, previous participants at Fulbright earned <strong>20,460 VND</strong> from this task.";
        showScreen('screen-treatment');
    } else if (assignedCondition === 'Low') {
        document.getElementById('treatment-message').innerHTML = 
            "On average, previous participants at Fulbright earned <strong>14,260 VND</strong> from this task.";
        showScreen('screen-treatment');
    } else {
        setupBlockIntro();
    }
}

function setupBlockIntro() {
    document.getElementById('block-title').innerText = `SESSION ${currentBlock} of 3`;
    showScreen('screen-block-intro');
}

function startBlock() {
    showScreen('screen-task');
    
    // RESET LẠI BỘ ĐẾM VÀ TIỀN LÚC BẮT ĐẦU MỘT SESSION MỚI
    correctCount = 0; 
    currentBlockEarnings = 0; 
    
    document.getElementById('block-progress').innerText = `${currentBlock}/3`;
    document.getElementById('task-instruction-label').innerText = activeTask.instruction;
    updateCorrectUI();
    generateMatrix(); 
    blockStartTime = Date.now(); 
    startTimer(BLOCK_DURATION_SEC);
}

function generateMatrix() {
    const container = document.getElementById('matrix-container');
    container.innerHTML = ''; currentTargetCount = 0; matrixTabSwitches = 0; matrixSwitchHistory = [];

    // 1. Chốt số lượng đáp án đúng (random từ 30 đến 45)
    currentTargetCount = Math.floor(Math.random() * (45 - 30 + 1)) + 30;

    // 2. Tạo mảng chứa ĐÚNG số lượng target và chim mồi
    let cellTypes = Array(64).fill(false);
    for (let i = 0; i < currentTargetCount; i++) {
        cellTypes[i] = true;
    }

    // 3. Xào bài (Shuffle) thuật toán Fisher-Yates để rải ngẫu nhiên vị trí
    for (let i = cellTypes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cellTypes[i], cellTypes[j]] = [cellTypes[j], cellTypes[i]];
    }

    // 4. Đổ ra màn hình
    for (let i = 0; i < 64; i++) {
        let isT = cellTypes[i];
        let cell = document.createElement('div');
        cell.className = 'matrix-cell';
        cell.innerText = activeTask.generator(isT);
        
        if (activeTask.id === 'shapes') cell.style.fontSize = '20px'; 
        else if (activeTask.id === 'letters') { cell.style.fontSize = '22px'; cell.style.fontFamily = 'Arial, Helvetica, sans-serif'; }
        else cell.style.fontSize = '22px';

        container.appendChild(cell);
    }
    
    container.style.display = "none";
    container.offsetHeight; 
    container.style.display = "grid";

    matrixStartTime = Date.now();
    const input = document.getElementById('user-answer');
    input.value = '';
    input.focus();
    toggleSubmitButton();
}

function checkAnswer() {
    const val = parseInt(document.getElementById('user-answer').
