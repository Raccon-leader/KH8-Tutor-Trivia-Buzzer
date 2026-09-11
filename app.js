// --- Global State Variables ---
let currentQuestionsData = [];
let activeGameData = null;
let teams = []; // Holds objects: { name: "Team 1", score: 0 }
let currentClueValue = 0;

// PeerJS & Buzzer Variables
let hostPeer = null;
let roomCode = "";
let currentBuzzedTeam = null;
let connectedPeers = [];

// Default Question Set
const defaultGameData = [
    {
        category: "Math & Logic",
        clues: [
            { value: 200, question: "What is 15 x 4?", answer: "60" },
            { value: 400, question: "Square root of 144.", answer: "12" }
        ]
    },
    {
        category: "General Knowledge",
        clues: [
            { value: 200, question: "Capital of Australia?", answer: "Canberra" },
            { value: 400, question: "Largest ocean on Earth?", answer: "Pacific Ocean" }
        ]
    }
];

document.addEventListener("DOMContentLoaded", () => {
    const presetBtn = document.getElementById("preset-btn");
    const customFileInput = document.getElementById("custom-file-input");
    const nextToNamesBtn = document.getElementById("next-to-names-btn");
    const toQrScreenBtn = document.getElementById("to-qr-screen-btn");
    const startGameBtn = document.getElementById("start-game-btn");
    const showAnswerBtn = document.getElementById("show-answer-btn");
    const backToBoardBtn = document.getElementById("back-to-board-btn");
    const resetBuzzBtn = document.getElementById("reset-buzz-btn");

    // Step 1 Controls
    presetBtn.addEventListener("click", () => {
        activeGameData = defaultGameData;
        goToStep2();
    });

    customFileInput.addEventListener("change", (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                activeGameData = JSON.parse(e.target.result);
                goToStep2();
            } catch (err) {
                alert("Invalid JSON file!");
            }
        };
        reader.readAsText(file);
    });

    // Step 2 -> Step 3
    nextToNamesBtn.addEventListener("click", () => {
        const countInput = document.getElementById("team-count");
        const count = parseInt(countInput.value, 10) || 3;
        goToStep3(count);
    });

    // Step 3 -> Step 4 (QR Screen)
    if (toQrScreenBtn) {
        toQrScreenBtn.addEventListener("click", () => {
            saveTeamNamesAndInitialize();
            document.getElementById("setup-step-3").style.display = "none";
            document.getElementById("setup-step-4").style.display = "block";
            generateQRCodeScreen();
        });
    }

    // Step 4 -> Launch Game Board
    if (startGameBtn) {
        startGameBtn.addEventListener("click", () => {
            renderBoard(activeGameData);
            document.getElementById("selection-screen").style.display = "none";
            document.getElementById("game-screen").style.display = "block";
        });
    }

    // Question Controls
    showAnswerBtn.addEventListener("click", () => {
        document.getElementById("answer-text").style.display = "block";
        showAnswerBtn.style.display = "none";
        backToBoardBtn.style.display = "inline-block";
    });

    backToBoardBtn.addEventListener("click", () => {
        document.getElementById("question-screen").style.display = "none";
        document.getElementById("game-screen").style.display = "block";
    });

    if (resetBuzzBtn) {
        resetBuzzBtn.addEventListener("click", resetBuzzer);
    }
});

// --- Wizard Navigation Functions ---

function goToStep2() {
    document.getElementById("setup-step-1").style.display = "none";
    document.getElementById("setup-step-2").style.display = "block";
}

function goToStep3(count) {
    document.getElementById("setup-step-2").style.display = "none";
    
    const container = document.getElementById("team-inputs-container");
    container.innerHTML = "";

    for (let i = 0; i < count; i++) {
        const div = document.createElement("div");
        div.style.margin = "10px 0";
        div.innerHTML = `
            <label>Team ${i + 1} Name: </label>
            <input type="text" class="team-name-input" value="Team ${i + 1}">
        `;
        container.appendChild(div);
    }

    document.getElementById("setup-step-3").style.display = "block";
}

function saveTeamNamesAndInitialize() {
    teams = [];
    const nameInputs = document.querySelectorAll(".team-name-input");
    
    nameInputs.forEach((input, index) => {
        const name = input.value.trim() || `Team ${index + 1}`;
        teams.push({ name: name, score: 0 });
    });

    renderScoreboard();
}

// --- Game Logic Functions ---

function renderScoreboard() {
    const scoreboard = document.getElementById("scoreboard");
    scoreboard.innerHTML = ""; 

    teams.forEach((team, index) => {
        const teamDiv = document.createElement("div");
        teamDiv.style.margin = "0 10px";
        teamDiv.innerHTML = `
            <strong>${team.name}:</strong> 
            <span id="score-team-${index}">${team.score}</span>
        `;
        scoreboard.appendChild(teamDiv);
    });
}

function renderBoard(data) {
    const container = document.getElementById("board-container");
    container.innerHTML = ""; 
    container.style.display = "grid";
    container.style.gridTemplateColumns = `repeat(${data.length}, 1fr)`;
    container.style.gap = "10px";

    data.forEach(cat => {
        const header = document.createElement("div");
        header.style.fontWeight = "bold";
        header.innerText = cat.category;
        container.appendChild(header);
    });

    const rowCount = data[0].clues.length;
    for (let r = 0; r < rowCount; r++) {
        data.forEach(cat => {
            const clue = cat.clues[r];
            const tile = document.createElement("button");
            tile.innerText = `${clue.value}`;
            tile.style.padding = "20px";

            tile.addEventListener("click", () => {
                showQuestionScreen(cat.category, clue.question, clue.answer, clue.value);
                tile.disabled = true;
            });

            container.appendChild(tile);
        });
    }
}

function showQuestionScreen(category, question, answer, value) {
    currentClueValue = value;
    resetBuzzer();

    document.getElementById("game-screen").style.display = "none";
    document.getElementById("question-category").innerText = `${category} - ${value}`;
    document.getElementById("question-text").innerText = question;
    document.getElementById("answer-text").innerText = `Answer: ${answer}`;
    
    document.getElementById("answer-text").style.display = "none";
    document.getElementById("show-answer-btn").style.display = "inline-block";
    document.getElementById("back-to-board-btn").style.display = "none";

    renderQuestionScoreControls();
    connectedPeers.forEach(conn => {
        if (conn.open) {
            conn.send({
                type: "QUESTION_UPDATE",
                category: category,
                question: question,
                answer: answer,
                value: value
            });
        }
    });

    document.getElementById("question-screen").style.display = "block";
}

function renderQuestionScoreControls() {
    const controlsContainer = document.getElementById("question-score-controls");
    controlsContainer.innerHTML = "";

    teams.forEach((team, index) => {
        const card = document.createElement("div");
        card.style.border = "1px solid #284338";
        card.style.padding = "10px";
        card.style.borderRadius = "5px";

        card.innerHTML = `
            <div><strong>${team.name}</strong>: <span id="q-score-team-${index}">${team.score}</span></div>
            <div style="margin-top: 5px;">
                <button onclick="adjustTeamScore(${index}, true)">+ ${currentClueValue}</button>
                <button onclick="adjustTeamScore(${index}, false)">- ${currentClueValue}</button>
            </div>
        `;

        controlsContainer.appendChild(card);
    });
}

function adjustTeamScore(teamIndex, isCorrect) {
    if (isCorrect) {
        teams[teamIndex].score += currentClueValue;
    } else {
        teams[teamIndex].score -= currentClueValue;
    }

    document.getElementById(`q-score-team-${teamIndex}`).innerText = teams[teamIndex].score;
    const boardScore = document.getElementById(`score-team-${teamIndex}`);
    if (boardScore) {
        boardScore.innerText = teams[teamIndex].score;
    }
}

// --- PeerJS & QR Code Logic ---

function generateQRCodeScreen() {
    roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    const roomCodeElement = document.getElementById("setup-room-code");
    if (roomCodeElement) {
        roomCodeElement.innerText = roomCode;
    }

    const joinUrl = `${window.location.origin}${window.location.pathname.replace('index.html', '')}buzzer.html?code=${roomCode}`;

    const qrContainer = document.getElementById("qrcode");
    if (qrContainer) {
        qrContainer.innerHTML = "";
        new QRCode(qrContainer, {
            text: joinUrl,
            width: 200,
            height: 200,
            colorDark: "#0f3827",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    }

    hostPeer = new Peer(`kh8-trivia-${roomCode}`);
    hostPeer.on("connection", (conn) => {
        connectedPeers.push(conn); // <--- ADD THIS LINE

        conn.on("data", (data) => {
            if (data.type === "BUZZ") {
                handleIncomingBuzz(data.teamName);
            }
        });
    });
        };
    

function handleIncomingBuzz(teamName) {
    if (!currentBuzzedTeam && document.getElementById("question-screen").style.display === "block") {
        currentBuzzedTeam = teamName;
        const statusDiv = document.getElementById("buzzer-status");
        if (statusDiv) {
            statusDiv.innerText = `🔔 BUZZED IN: ${teamName.toUpperCase()}!`;
            statusDiv.style.color = "#ffcc00";
        }
    }
}

function resetBuzzer() {
    currentBuzzedTeam = null;
    const statusDiv = document.getElementById("buzzer-status");
    if (statusDiv) {
        statusDiv.innerText = "Waiting for buzz...";
        statusDiv.style.color = "#F19C2E";
    }
}