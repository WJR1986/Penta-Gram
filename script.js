// script.js

// =====================
// Config
// =====================
const WORD_LENGTH = 5;
const MAX_GUESSES = 6;
const STORAGE_KEY = "wordleCloneStateV3";
const STATS_KEY = "wordleCloneStatsV2";

// =====================
// DOM elements
// =====================
const boardElement = document.getElementById("board");
const keyboardElement = document.getElementById("keyboard");
const messageElement = document.getElementById("message");

const statsButton = document.getElementById("stats-button");
const statsModal = document.getElementById("stats-modal");
const modalBackdrop = document.getElementById("modal-backdrop");
const closeStatsButton = document.getElementById("close-stats");
const resetButton = document.getElementById("reset-button");

const statPlayed = document.getElementById("stat-played");
const statWinRate = document.getElementById("stat-winrate");
const statCurrentStreak = document.getElementById("stat-current-streak");
const statMaxStreak = document.getElementById("stat-max-streak");
const guessDistributionElement = document.getElementById("guess-distribution");

// =====================
// Word lists
// =====================
let WORD_LIST = [];      // full list from wordle.json
let SOLUTIONS = [];      // we use the same list as solutions
let VALID_GUESSES = new Set(); // for quick lookup

// =====================
// Game state
// =====================
let solution = "";
let currentRow = 0;
let currentCol = 0;
let guesses = Array(MAX_GUESSES)
  .fill("")
  .map(() => Array(WORD_LENGTH).fill(""));
let gameStatus = "IN_PROGRESS"; // "IN_PROGRESS" | "WIN" | "LOSE"

// =====================
// Stats
// =====================
let stats = {
  played: 0,
  wins: 0,
  currentStreak: 0,
  maxStreak: 0,
  // index 0 = solved in 1 guess, index 5 = solved in 6 guesses
  guessDistribution: [0, 0, 0, 0, 0, 0]
};

// =====================
// Utility
// =====================
function pickRandomSolution() {
  if (!SOLUTIONS.length) {
    throw new Error("No solutions loaded");
  }
  const idx = Math.floor(Math.random() * SOLUTIONS.length);
  return SOLUTIONS[idx];
}

// =====================
// Word list loading
// =====================
async function loadWordList() {
  try {
    const res = await fetch("wordle.json");
    if (!res.ok) throw new Error("Failed to fetch wordle.json");

    const data = await res.json(); // array of lowercase words
    WORD_LIST = data.map(w => w.toUpperCase());
    SOLUTIONS = WORD_LIST;
    VALID_GUESSES = new Set(WORD_LIST);
  } catch (err) {
    console.error("Error loading word list, falling back to small list:", err);
    WORD_LIST = ["APPLE", "BRAVE", "CRANE", "DRINK", "EARTH"].map(w =>
      w.toUpperCase()
    );
    SOLUTIONS = WORD_LIST;
    VALID_GUESSES = new Set(WORD_LIST);
  }
}

// =====================
// Stats persistence
// =====================
function loadStats() {
  try {
    const stored = localStorage.getItem(STATS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === "object") {
        stats = {
          ...stats,
          ...parsed,
          guessDistribution: parsed.guessDistribution || stats.guessDistribution
        };
      }
    }
  } catch (err) {
    console.error("Failed to load stats", err);
  }
}

function saveStats() {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch (err) {
    console.error("Failed to save stats", err);
  }
}

// =====================
// Game persistence
// =====================
function loadGame() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      // No saved game: start a fresh random one
      solution = pickRandomSolution();
      return;
    }

    const parsed = JSON.parse(stored);
    if (!parsed || !parsed.solution) {
      solution = pickRandomSolution();
      return;
    }

    // Restore saved state
    solution = parsed.solution;
    guesses = parsed.guesses || guesses;
    currentRow = parsed.currentRow || 0;
    currentCol = parsed.currentCol || 0;
    gameStatus = parsed.gameStatus || "IN_PROGRESS";

    // Recompute row/col properly to fix "start on row 2" bug
    normaliseCurrentRow();

  } catch (err) {
    console.error("Failed to load game, starting new:", err);
    solution = pickRandomSolution();
  }
}



function saveGame() {
  const data = {
    solution,
    currentRow,
    currentCol,
    guesses,
    gameStatus
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error("Failed to save game", err);
  }
}

function normaliseCurrentRow() {
  if (gameStatus !== "IN_PROGRESS") return;

  for (let row = 0; row < MAX_GUESSES; row++) {
    const word = guesses[row].join("");
    if (word.length < WORD_LENGTH) {
      currentRow = row;
      currentCol = word.length;
      return;
    }
  }

  currentRow = MAX_GUESSES - 1;
  currentCol = WORD_LENGTH;
}


// =====================
// UI creation
// =====================
function createBoard() {
  boardElement.innerHTML = "";

  for (let row = 0; row < MAX_GUESSES; row++) {
    const rowDiv = document.createElement("div");
    rowDiv.className = "board-row";

    for (let col = 0; col < WORD_LENGTH; col++) {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.dataset.row = row;
      tile.dataset.col = col;

      const inner = document.createElement("div");
      inner.className = "tile-inner";
      tile.appendChild(inner);

      rowDiv.appendChild(tile);
    }

    boardElement.appendChild(rowDiv);
  }
}

function createKeyboard() {
  keyboardElement.innerHTML = "";

  const rows = [
    "QWERTYUIOP",
    "ASDFGHJKL",
    "ZXCVBNM"
  ];

  rows.forEach((rowStr, rowIndex) => {
    const rowDiv = document.createElement("div");
    rowDiv.className = "keyboard-row";

    if (rowIndex === 2) {
      // ENTER key at start of bottom row
      const enterBtn = document.createElement("button");
      enterBtn.className = "key wide";
      enterBtn.textContent = "ENTER";
      enterBtn.dataset.key = "ENTER";
      rowDiv.appendChild(enterBtn);
    }

    for (const char of rowStr) {
      const button = document.createElement("button");
      button.className = "key";
      button.textContent = char;
      button.dataset.key = char;
      rowDiv.appendChild(button);
    }

    if (rowIndex === 2) {
      // BACKSPACE key at end of bottom row
      const backBtn = document.createElement("button");
      backBtn.className = "key wide";
      backBtn.textContent = "⌫";
      backBtn.dataset.key = "BACKSPACE";
      rowDiv.appendChild(backBtn);
    }

    keyboardElement.appendChild(rowDiv);
  });
}

function getTile(row, col) {
  return boardElement.querySelector(
    `.tile[data-row="${row}"][data-col="${col}"]`
  );
}

function updateBoard() {
  for (let row = 0; row < MAX_GUESSES; row++) {
    for (let col = 0; col < WORD_LENGTH; col++) {
      const tile = getTile(row, col);
      const inner = tile.querySelector(".tile-inner");
      const letter = guesses[row][col];
      inner.textContent = letter || "";
      tile.classList.toggle("filled", !!letter);
    }
  }
}

// =====================
// Messaging
// =====================
function showMessage(text, isError = false) {
  messageElement.textContent = text;
  messageElement.classList.toggle("error", isError);
}

function clearMessage() {
  showMessage("");
}

// =====================
// Input & gameplay
// =====================
function handleKeyPress(key) {
  if (gameStatus !== "IN_PROGRESS") return;

  if (key === "ENTER") {
    submitGuess();
    return;
  }

  if (key === "BACKSPACE" || key === "DELETE") {
    deleteLetter();
    return;
  }

  if (/^[A-Z]$/.test(key)) {
    addLetter(key);
  }
}

function addLetter(letter) {
  if (currentCol >= WORD_LENGTH || currentRow >= MAX_GUESSES) return;

  guesses[currentRow][currentCol] = letter;
  currentCol++;
  updateBoard();
  clearMessage();
  saveGame();
}

function deleteLetter() {
  if (currentCol === 0) return;
  currentCol--;
  guesses[currentRow][currentCol] = "";
  updateBoard();
  clearMessage();
  saveGame();
}

function wordFromRow(rowIndex) {
  return guesses[rowIndex].join("");
}

function submitGuess() {
  const guess = wordFromRow(currentRow);

  if (guess.length < WORD_LENGTH) {
    showMessage("Not enough letters", true);
    return;
  }

  if (!VALID_GUESSES.has(guess.toUpperCase())) {
    showMessage("Not in word list", true);
    return;
  }

  revealGuess(guess.toUpperCase(), solution.toUpperCase(), currentRow);
}

// =====================
// Result logic (green/yellow/grey)
// =====================
function computeResult(guess, answer) {
  const result = Array(WORD_LENGTH).fill("absent");
  const answerCounts = {};

  // Count letters in answer
  for (let i = 0; i < WORD_LENGTH; i++) {
    const letter = answer[i];
    answerCounts[letter] = (answerCounts[letter] || 0) + 1;
  }

  // First pass: correct (green)
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === answer[i]) {
      result[i] = "correct";
      answerCounts[guess[i]] -= 1;
    }
  }

  // Second pass: present (yellow)
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] === "correct") continue;
    const letter = guess[i];
    if (answerCounts[letter] > 0) {
      result[i] = "present";
      answerCounts[letter] -= 1;
    }
  }

  return result;
}

// Colour tiles + keys and end game appropriately
function revealGuess(guess, answer, rowIndex) {
  const result = computeResult(guess, answer);

  // 1) Update keyboard based on full result first
  for (let i = 0; i < WORD_LENGTH; i++) {
    updateKeyboardKey(guess[i], result[i]);
  }

  // 2) Animate tiles and apply correct/present/absent classes
  for (let i = 0; i < WORD_LENGTH; i++) {
    const tile = getTile(rowIndex, i);
    const inner = tile.querySelector(".tile-inner");
    const status = result[i];

    setTimeout(() => {
      tile.classList.add("reveal");
      setTimeout(() => {
        tile.classList.remove("reveal");
        tile.classList.add(status); // hooks into CSS
        inner.textContent = guess[i];
      }, 100);
    }, i * 300);
  }

  // 3) After animation finishes, handle win/lose
  setTimeout(() => {
    handleEndOfGuess(guess, result);
  }, WORD_LENGTH * 300 + 180);
}

// Prioritise correct > present > absent for keyboard
function updateKeyboardKey(letter, status) {
  const keyButton = keyboardElement.querySelector(
    `.key[data-key="${letter}"]`
  );
  if (!keyButton) return;

  const existing = keyButton.dataset.status || "";
  const priority = { "": 0, absent: 1, present: 2, correct: 3 };

  if (priority[status] > priority[existing]) {
    keyButton.dataset.status = status;
    keyButton.classList.remove("correct", "present", "absent");
    keyButton.classList.add(status);
  }
}

function handleEndOfGuess(guess, result) {
  const isWin = result.every(r => r === "correct");

  if (isWin) {
    gameStatus = "WIN";
    showMessage("You got it! 🎉");
    updateStats(true);
    saveStats();
    saveGame();
    return;
  }

  // Not a win: move to next row
  currentRow++;

  // If we've just used the 6th row, game over (lose)
  if (currentRow >= MAX_GUESSES) {
    gameStatus = "LOSE";
    showMessage(`Out of tries! The word was ${solution.toUpperCase()}`);
    updateStats(false);
    saveStats();
    saveGame();
    return;
  }

  // Otherwise, next guess from column 0
  currentCol = 0;
  saveGame();
}

// =====================
// Stats logic
// =====================
function updateStats(isWin) {
  stats.played += 1;

  if (isWin) {
    stats.wins += 1;
    stats.currentStreak += 1;
    if (stats.currentStreak > stats.maxStreak) {
      stats.maxStreak = stats.currentStreak;
    }
    const index = Math.min(currentRow, MAX_GUESSES - 1);
    stats.guessDistribution[index] += 1;
  } else {
    stats.currentStreak = 0;
  }
}

function updateStatsUI() {
  const { played, wins, currentStreak, maxStreak, guessDistribution } = stats;

  statPlayed.textContent = played;
  const winRate = played === 0 ? 0 : Math.round((wins / played) * 100);
  statWinRate.textContent = `${winRate}%`;
  statCurrentStreak.textContent = currentStreak;
  statMaxStreak.textContent = maxStreak;

  guessDistributionElement.innerHTML = "";
  const maxValue = Math.max(...guessDistribution, 1);

  guessDistribution.forEach((value, index) => {
    const row = document.createElement("div");
    row.className = "guess-bar";

    const label = document.createElement("span");
    label.className = "guess-bar-label";
    label.textContent = index + 1;

    const bar = document.createElement("div");
    bar.className = "guess-bar-fill";
    const width = (value / maxValue) * 100;
    bar.style.width = `${Math.max(width, 8)}%`;
    bar.textContent = value;

    row.appendChild(label);
    row.appendChild(bar);
    guessDistributionElement.appendChild(row);
  });
}

// =====================
// Modal UI
// =====================
function openStats() {
  updateStatsUI();
  statsModal.classList.remove("d-none");
  modalBackdrop.classList.remove("d-none");
}

function closeStats() {
  statsModal.classList.add("d-none");
  modalBackdrop.classList.add("d-none");
}

// =====================
// Reset / New random game
// =====================
function resetPuzzle() {
  // Pick a completely new random solution
  solution = pickRandomSolution();

  currentRow = 0;
  currentCol = 0;
  guesses = Array(MAX_GUESSES)
    .fill("")
    .map(() => Array(WORD_LENGTH).fill(""));
  gameStatus = "IN_PROGRESS";

  // Clear board UI
  document.querySelectorAll(".tile").forEach(tile => {
    tile.classList.remove("correct", "present", "absent", "filled", "reveal");
    const inner = tile.querySelector(".tile-inner");
    if (inner) inner.textContent = "";
  });

  // Clear keyboard UI
  document.querySelectorAll(".key").forEach(key => {
    key.classList.remove("correct", "present", "absent");
    delete key.dataset.status;
  });

  clearMessage();
  saveGame();
}

// =====================
// Event listeners
// =====================
function setupEventListeners() {
  keyboardElement.addEventListener("click", e => {
    const key = e.target.closest(".key");
    if (!key) return;
    handleKeyPress(key.dataset.key);
  });

  window.addEventListener("keydown", e => {
    if (!statsModal.classList.contains("d-none")) {
      if (e.key === "Escape") closeStats();
      return;
    }

    if (e.key === "Enter") {
      handleKeyPress("ENTER");
    } else if (e.key === "Backspace" || e.key === "Delete") {
      handleKeyPress("BACKSPACE");
    } else {
      const letter = e.key.toUpperCase();
      if (/^[A-Z]$/.test(letter)) {
        handleKeyPress(letter);
      }
    }
  });

  statsButton.addEventListener("click", openStats);
  closeStatsButton.addEventListener("click", closeStats);
  modalBackdrop.addEventListener("click", closeStats);

  if (resetButton) {
    resetButton.addEventListener("click", resetPuzzle);
  }
}

// =====================
// Restore UI from saved state
// =====================
function restoreBoardFromState() {
  updateBoard();

  // Colour already-submitted guesses
  for (let row = 0; row < currentRow; row++) {
    const guess = wordFromRow(row);
    if (!guess || guess.length !== WORD_LENGTH) continue;

    const result = computeResult(guess, solution);
    for (let i = 0; i < WORD_LENGTH; i++) {
      const tile = getTile(row, i);
      const inner = tile.querySelector(".tile-inner");
      const status = result[i];
      tile.classList.add(status);
      inner.textContent = guess[i];
      updateKeyboardKey(guess[i], status);
    }
  }

  if (gameStatus === "WIN") {
    showMessage("You got it! 🎉");
  } else if (gameStatus === "LOSE") {
    showMessage(`Out of tries! The word was ${solution.toUpperCase()}`);
  }
}

// =====================
// Bootstrap the game
// =====================
async function bootstrapGame() {
  await loadWordList();   // load word list first
  loadStats();            // restore stats
  // Create UI before restoring game so tiles/keys exist
  createBoard();
  createKeyboard();
  loadGame();             // restore or start random game
  setupEventListeners();
  restoreBoardFromState();
}

bootstrapGame();
