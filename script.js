// --- CONFIGURATION ---
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzKDX5LrMGC2tlulMc2707dK_l0DbT4E8gB4WNHOiTgxLZMaXhvDOPGgkL-yaef-7T6/exec"; 
const BLOCK_DURATION_SEC = 15 * 60; // 15 minutes per session
const BREAK_DURATION_SEC = 120;     // 2 minute mandatory break
const MAX_BLOCKS = 3;               
// Đã xóa PAY_PER_CORRECT vì giờ tính tiền linh động theo câu

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
let correctCount = 0; 
let globalCorrectCount = 0; // Đếm tổng số câu đúng xuyên suốt 3 session để tính tiền
let totalEarningsGlobal = 0; 
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
    // Hiển thị trực tiếp tổng tiền đang có
    document.getElementById('current-earnings').innerText = totalEarningsGlobal.toLocaleString(); 
}

// --- EXPERIMENT FLOW ---
function startExperiment() {
    assignedCode = document.getElementById('user-code-input').value.trim();
    if (!CODE_LOGIC[assignedCode]) return alert("Please enter a valid code (1-6).");

    currentSessionConfig = CODE_LOGIC[assignedCode];
    participantId = `P_Code${assignedCode}_${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    
    totalEarningsGlobal = 0; 
    globalCorrectCount = 0; // Reset bộ đếm tổng số câu đúng
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
    correctCount = 0; 
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
    const val = parseInt(document.getElementById('user-answer').value);
    if (isNaN(val)) return;
    
    const isCorrect = (val === currentTargetCount);
    const duration = (Date.now() - matrixStartTime) / 1000;
    attemptGlobalCounter++;

    detailedLog.push({
        participant_id: participantId,
        attempt_id: attemptGlobalCounter,
        block_number: currentBlock,
        condition: assignedCondition,
        task_type: activeTask.id,
        user_guess: val,
        actual_answer: currentTargetCount,
        is_correct: isCorrect,
        time_spent_seconds: duration.toFixed(3),
        tab_switches_count: matrixTabSwitches,
        switch_history: matrixSwitchHistory.join(" | "),
        timestamp: new Date().toISOString()
    });

    if (isCorrect) { 
        correctCount++; // Đếm cho session này (vẫn giữ để tham khảo)
        globalCorrectCount++; // Đếm tổng cho toàn bộ experiment
        
        // TÍNH TIỀN THEO CÔNG THỨC MỚI
        let currentPay = 27 * (42 - globalCorrectCount);
        
        // Chặn không cho tiền rớt xuống số âm nếu người ta ráng cày qua câu 42
        if (currentPay < 0) {
            currentPay = 0;
        }

        totalEarningsGlobal += currentPay; // Cộng thẳng vào tổng tiền toàn cục
        updateCorrectUI(); 
        
        alert(`Correct! You earned ${currentPay} VND for this answer.`); 
    } else {
        alert(`Incorrect. The actual correct answer was ${currentTargetCount}.`);
    }
    generateMatrix();
}

function startTimer(sec) {
    let endTime = Date.now() + (sec * 1000); 
    
    clearInterval(timerInterval);
    timerInterval = setInterval(() => { 
        let left = Math.round((endTime - Date.now()) / 1000); 
        
        if (left <= 0) { 
            clearInterval(timerInterval);
            endBlock('time_out'); 
        }
    }, 1000);
}

function stopEarly() { 
    if (confirm("Are you sure you want to try the next session?")) {
        endBlock('manual'); 
    }
}

function endBlock(reason) {
    clearInterval(timerInterval);
    
    const duration = (Date.now() - matrixStartTime) / 1000;
    attemptGlobalCounter++;
    detailedLog.push({
        participant_id: participantId,
        attempt_id: attemptGlobalCounter,
        block_number: currentBlock,
        condition: assignedCondition, 
        task_type: activeTask.id,
        user_guess: "ABANDONED",
        actual_answer: currentTargetCount,
        is_correct: "FALSE",
        time_spent_seconds: duration.toFixed(3),
        tab_switches_count: matrixTabSwitches,
        switch_history: matrixSwitchHistory.join(" | "),
        timestamp: new Date().toISOString()
    });

    // ĐÃ XÓA DÒNG CỘNG TIỀN Ở ĐÂY VÌ ĐÃ CỘNG TRỰC TIẾP Ở TRÊN HÀM CHECK ANSWER RỒI

    let finalBlockDur = (Date.now() - blockStartTime) / 1000;

    detailedLog.forEach(row => {
        if (row.block_number === currentBlock) {
            row.block_total_duration = finalBlockDur.toFixed(2);
        }
    });

    if (reason === 'time_out') alert("Time is up for this session!");

    showScreen('screen-post-block');
}

function submitPostBlockSurvey() {
    let earnSatVal = document.getElementById('block-earnings-satisfaction').value;
    let interestVal = document.getElementById('block-interest').value;

    let earnSat = parseInt(earnSatVal);
    let interest = parseInt(interestVal);

    if (isNaN(earnSat) || earnSat < 1 || earnSat > 7 || 
        isNaN(interest) || interest < 1 || interest > 7) {
        alert("Please enter a valid number between 1 and 7 for both questions.");
        return; 
    }

    detailedLog.forEach(row => {
        if (row.block_number === currentBlock) {
            row.earnings_satisfaction = earnSat;
            row.task_interest = interest;
        }
    });

    document.getElementById('block-earnings-satisfaction').value = "";
    document.getElementById('block-interest').value = "";

    if (currentBlock < MAX_BLOCKS) { 
        startBreak(); 
    } else { 
        showScreen('screen-exit-survey'); 
    }
}

function startBreak() {
    showScreen('screen-break');
    
    let durationSec = BREAK_DURATION_SEC;
    let endTime = Date.now() + (durationSec * 1000); 
    
    const btn = document.getElementById('end-break-btn');
    const display = document.getElementById('break-timer-display');
    
    btn.disabled = true;
    btn.style.opacity = "0.5";
    btn.innerText = "Wait for timer...";

    let mInit = Math.floor(durationSec / 60).toString().padStart(2, '0');
    let sInit = (durationSec % 60).toString().padStart(2, '0');
    display.innerText = `${mInit}:${sInit}`;

    clearInterval(breakTimerInterval);
    
    breakTimerInterval = setInterval(() => {
        let left = Math.round((endTime - Date.now()) / 1000);

        if (left <= 0) { 
            left = 0; 
            clearInterval(breakTimerInterval); 
            btn.disabled = false; 
            btn.style.opacity = "1"; 
            btn.innerText = "Continue to Next Session"; 
            btn.style.cursor = "pointer";
        }
        
        let m = Math.floor(left / 60).toString().padStart(2, '0');
        let s = (left % 60).toString().padStart(2, '0');
        display.innerText = `${m}:${s}`;
    }, 500); 
}

function endBreak() { 
    currentBlock++;
    handleSessionTransition(); 
}

function submitExitSurvey() {
    let compVal = document.getElementById('survey-competitiveness').value;
    let comp = parseInt(compVal);
    let rememberedEarnings = document.getElementById('survey-remembered-earnings').value;

    if (isNaN(comp) || comp < 1 || comp > 7) {
        alert("Please enter a valid number between 1 and 7 for the Competitiveness question.");
        return; 
    }
    if (rememberedEarnings.trim() === "") {
        alert("Please estimate how much the previous participant earned.");
        return; 
    }

    const surveyData = {
        competitiveness: comp,
        remembered_earnings: rememberedEarnings,
        age: document.getElementById('survey-age').value || "N/A",
        gender: document.getElementById('survey-gender').value || "N/A",
        major: document.getElementById('survey-major').value || "N/A",
        year_study: document.getElementById('survey-year').value || "N/A"
    };

    detailedLog.forEach(row => { 
        Object.assign(row, surveyData); 
        row.grand_total_earnings = totalEarningsGlobal; 
    });

    showScreen('screen-end');
    document.getElementById('final-total-earnings').innerText = totalEarningsGlobal.toLocaleString();
}

function saveDataToCloud() {
    isExperimentFinished = true; 
    
    const saveBtn = document.getElementById('save-data-btn');
    saveBtn.innerText = "Saving, please wait...";
    saveBtn.disabled = true;

    fetch(GOOGLE_SCRIPT_URL, { 
        method: "POST", 
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, 
        body: JSON.stringify(detailedLog) 
    })
    .then(() => { 
        saveBtn.style.display = "none";
        document.getElementById('save-status-msg').style.display = "block";
        document.getElementById('earnings-display-area').style.display = "block";
    })
    .catch(err => {
        console.error(err);
        alert("Error saving to cloud. Please contact the researcher.");
        saveBtn.innerText = "Error - Try Again";
        saveBtn.disabled = false;
        isExperimentFinished = false; 
    });
}

window.addEventListener("beforeunload", function (e) {
    if (!isExperimentFinished && participantId !== "") {
        e.preventDefault();
        e.returnValue = "Wait! Your experiment data is not saved yet. Are you sure you want to leave?";
    }
});
