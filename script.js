// script.js

// Config
const WORD_LENGTH = 5;
const MAX_GUESSES = 6;
const STORAGE_KEY = "wordleCloneStateV2";
const STATS_KEY = "wordleCloneStatsV2";

// DOM
const boardElement = document.getElementById("board");
const keyboardElement = document.getElementById("keyboard");
const messageElement = document.getElementById("message");

const statsButton = document.getElementById("stats-button");
const statsModal = document.getElementById("stats-modal");
const modalBackdrop = document.getElementById("modal-backdrop");
const closeStatsButton = document.getElementById("close-stats");

const statPlayed = document.getElementById("stat-played");
const statWinRate = document.getElementById("stat-winrate");
const statCurrentStreak = document.getElementById("stat-current-streak");
const statMaxStreak = document.getElementById("stat-max-streak");
const guessDistributionElement = document.getElementById("guess-distribution");

const resetButton = document.getElementById("reset-button");

// Word lists
let WORD_LIST = [];
let SOLUTIONS = [];
let VALID_GUESSES = new Set();

// Game state
let solution = "";
let solutionDate = "";
let currentRow = 0;
let currentCol = 0;
let guesses = Array(MAX_GUESSES)
  .fill("")
  .map(() => Array(WORD_LENGTH).fill(""));
let gameStatus = "IN_PROGRESS"; // "IN_PROGRESS" | "WIN" | "LOSE"

// Stats
let stats = {
  played: 0,
  wins: 0,
  currentStreak: 0,
  maxStreak: 0,
  guessDistribution: [0, 0, 0, 0, 0, 0]
};

// --- Helpers ---

function getTodayString() {
  const now = new Date();
  return now.toISOString().slice(0, 10); // YYYY-MM-DD
}

function pickDailySolution() {
  const today = getTodayString();
  if (!SOLUTIONS.length) {
    throw new Error("No solutions loaded");
  }
  let hash = 0;
  for (const char of today) {
    hash = (hash * 31 + char.charCodeAt(0)) % SOLUTIONS.length;
  }
  return {
    solution: SOLUTIONS[hash],
    date: today
  };
}

// --- Word list loading ---

async function loadWordList() {
  try {
    const res = await fetch("wordle.json");
    if (!res.ok) throw new Error("Failed to fetch wordle.json");
    const data = await res.json(); // array of lowercase strings
    WORD_LIST = data.map(w => w.toUpperCase());
    SOLUTIONS = WORD_LIST;
    VALID_GUESSES = new Set(WORD_LIST);
  } catch (err) {
    console.error("Error loading word list, falling back to small list:", err);
    WORD_LIST = ["APPLE", "BRAVE", "CRANE", "DRINK", "EARTH"];
    SOLUTIONS = WORD_LIST;
    VALID_GUESSES = new Set(WORD_LIST);
  }
}

// --- Stats persistence ---

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

// --- Game persistence ---

function loadGame() {
  const today = getTodayString();
  const daily = pickDailySolution();
  solution = daily.solution;
  solutionDate = daily.date;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    const parsed = JSON.parse(stored);
    if (!parsed || parsed.solutionDate !== today) {
      // New day, ignore old state
      return;
    }

    // Restore
    solution = parsed.solution || solution;
    solutionDate = parsed.solutionDate || solutionDate;
    currentRow = parsed.currentRow || 0;
    currentCol = parsed.currentCol || 0;
    guesses = parsed.guesses || guesses;
    gameStatus = parsed.gameStatus || "IN_PROGRESS";
  } catch (err) {
    console.error("Failed to load game", err);
  }
}

function saveGame() {
  const data = {
    solution,
    solutionDate,
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

// --- UI creation ---

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
      // ENTER key first
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
      // BACKSPACE key at the end
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
  return boardElement.querySelector(`.tile[data-row="${row}"][data-col="${col}"]`);
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

// --- Messaging ---

function showMessage(text, isError = false) {
  messageElement.textContent = text;
  messageElement.classList.toggle("error", isError);
}

function clearMessage() {
  showMessage("");
}

// --- Input & logic ---

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

function computeResult(guess, answer) {
  const result = Array(WORD_LENGTH).fill("absent");
  const answerCounts = {};

  for (let i = 0; i < WORD_LENGTH; i++) {
    const letter = answer[i];
    answerCounts[letter] = (answerCounts[letter] || 0) + 1;
  }

  // First pass: correct
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === answer[i]) {
      result[i] = "correct";
      answerCounts[guess[i]] -= 1;
    }
  }

  // Second pass: present
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

function revealGuess(guess, answer, rowIndex) {
  const result = computeResult(guess, answer);

  // 1) Update keyboard colours first, based on the full result
  for (let i = 0; i < WORD_LENGTH; i++) {
    updateKeyboardKey(guess[i], result[i]);
  }

  // 2) Then animate the tiles using that result
  for (let i = 0; i < WORD_LENGTH; i++) {
    const tile = getTile(rowIndex, i);
    const inner = tile.querySelector(".tile-inner");
    const status = result[i];

    setTimeout(() => {
      tile.classList.add("reveal");
      setTimeout(() => {
        tile.classList.remove("reveal");
        tile.classList.add(status);
        inner.textContent = guess[i];
      }, 100);
    }, i * 300);
  }

  // 3) Finally, check win/lose after the animation
  setTimeout(() => {
    handleEndOfGuess(guess, result);
  }, WORD_LENGTH * 300 + 150);
}


function updateKeyboardKey(letter, status) {
  const keyButton = keyboardElement.querySelector(`.key[data-key="${letter}"]`);
  if (!keyButton) return;

  const existing = keyButton.dataset.status;
  const priority = { correct: 3, present: 2, absent: 1, "": 0 };

  if (priority[status] > priority[existing || ""]) {
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

  currentRow++;

  if (currentRow >= MAX_GUESSES) {
    gameStatus = "LOSE";
    showMessage(`The word was ${solution.toUpperCase()}`);
    updateStats(false);
    saveStats();
    saveGame();
    return;
  }

  currentCol = 0;
  saveGame();
}

function resetPuzzle() {
  // Pick a completely random word for testing
  const randomIndex = Math.floor(Math.random() * SOLUTIONS.length);
  solution = SOLUTIONS[randomIndex];
  solutionDate = getTodayString() + "#test"; // mark it as a test game

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


// --- Stats logic ---

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

// --- Modal UI ---

function openStats() {
  updateStatsUI();
  statsModal.classList.remove("d-none");
  modalBackdrop.classList.remove("d-none");
}

function closeStats() {
  statsModal.classList.add("d-none");
  modalBackdrop.classList.add("d-none");
}

// --- Event listeners ---

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

  // 👇 New
  resetButton.addEventListener("click", resetPuzzle);
}

// --- Restore from saved state ---

function restoreBoardFromState() {
  updateBoard();

  // Colour already-submitted guesses
  for (let row = 0; row < currentRow; row++) {
    const guess = wordFromRow(row);
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
    showMessage(`The word was ${solution.toUpperCase()}`);
  }
}

// --- Bootstrap the game ---

async function bootstrapGame() {
  await loadWordList();   // loads SOLUTIONS & VALID_GUESSES
  loadStats();
  loadGame();
  createBoard();
  createKeyboard();
  setupEventListeners();
  restoreBoardFromState();
}

bootstrapGame();
