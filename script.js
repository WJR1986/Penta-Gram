// script.js

// =====================
// Config
// =====================
const WORD_LENGTH = 5;
const MAX_GUESSES = 6;
const STORAGE_KEY = "wordleCloneStateV4"; // last game (any mode)
const STATS_KEY = "wordleCloneStatsV2";
const COLORBLIND_KEY = "wordleColorblindV1";
const MODE_KEY = "wordleGameModeV1";
const DAILY_META_KEY = "wordleDailyMetaV1"; // NEW: tracks if today's daily is finished

// Animation timings
const FLIP_STAGGER = 250;
const FLIP_DURATION = 250;

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

const colorblindToggle = document.getElementById("colorblind-toggle");
const modePracticeBtn = document.getElementById("mode-practice");
const modeDailyBtn = document.getElementById("mode-daily");
const shareButton = document.getElementById("share-button");

// =====================
// Word lists
// =====================
let WORD_LIST = [];
let SOLUTIONS = [];
let VALID_GUESSES = new Set();

// =====================
// Game state
// =====================
let solution = "";
let solutionDate = null; // YYYY-MM-DD for daily mode
let currentRow = 0;
let currentCol = 0;
let guesses = Array(MAX_GUESSES)
  .fill("")
  .map(() => Array(WORD_LENGTH).fill(""));
let gameStatus = "IN_PROGRESS"; // "IN_PROGRESS" | "WIN" | "LOSE"

let gameMode = "PRACTICE"; // "PRACTICE" | "DAILY"
let colorblindMode = false;

// =====================
// Stats
// =====================
let stats = {
  played: 0,
  wins: 0,
  currentStreak: 0,
  maxStreak: 0,
  guessDistribution: [0, 0, 0, 0, 0, 0]
};

// =====================
// Utility
// =====================
function getTodayString() {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

function pickRandomSolution() {
  if (!SOLUTIONS.length) throw new Error("No solutions loaded");
  const idx = Math.floor(Math.random() * SOLUTIONS.length);
  return SOLUTIONS[idx];
}

function pickDailySolution() {
  const today = getTodayString();
  if (!SOLUTIONS.length) throw new Error("No solutions loaded");

  let hash = 0;
  for (const char of today) {
    hash = (hash * 31 + char.charCodeAt(0)) % SOLUTIONS.length;
  }

  return { solution: SOLUTIONS[hash], date: today };
}

// =====================
// Word list loading
// =====================
async function loadWordLists() {
  try {
    const solutionsRes = await fetch("wordle.json");
    if (!solutionsRes.ok) throw new Error("Failed to fetch wordle.json");
    const solutionsData = await solutionsRes.json();
    const solutionsUpper = solutionsData.map(w => w.toUpperCase());

    let extraGuessesUpper = [];
    try {
      const guessesRes = await fetch("./allowed-guesses.json");
      if (guessesRes.ok) {
        const guessesData = await guessesRes.json();
        extraGuessesUpper = guessesData.map(w => w.toUpperCase());
      } else {
        console.warn("allowed-guesses.json not found or not ok; using solutions only");
      }
    } catch (innerErr) {
      console.warn("Failed to load allowed-guesses.json; using solutions only", innerErr);
    }

    SOLUTIONS = solutionsUpper;
    WORD_LIST = solutionsUpper.slice();
    VALID_GUESSES = new Set([...solutionsUpper, ...extraGuessesUpper]);

    console.log(
      `Loaded ${SOLUTIONS.length} solutions and ${VALID_GUESSES.size} valid guesses`
    );
  } catch (err) {
    console.error("Error loading word lists, falling back:", err);
    WORD_LIST = ["APPLE", "BRAVE", "CRANE", "DRINK", "EARTH"].map(w =>
      w.toUpperCase()
    );
    SOLUTIONS = WORD_LIST;
    VALID_GUESSES = new Set(WORD_LIST);
  }
}

// =====================
// Settings (mode + colorblind)
// =====================
function loadSettings() {
  try {
    const cb = localStorage.getItem(COLORBLIND_KEY);
    if (cb === "1") {
      colorblindMode = true;
      document.body.classList.add("colorblind");
      if (colorblindToggle) colorblindToggle.checked = true;
    }

    const storedMode = localStorage.getItem(MODE_KEY);
    if (storedMode === "DAILY" || storedMode === "PRACTICE") {
      gameMode = storedMode;
    }

    updateModeButtons();
  } catch (err) {
    console.error("Failed to load settings", err);
  }
}

function saveSettings() {
  try {
    localStorage.setItem(COLORBLIND_KEY, colorblindMode ? "1" : "0");
    localStorage.setItem(MODE_KEY, gameMode);
  } catch (err) {
    console.error("Failed to save settings", err);
  }
}

function updateModeButtons() {
  if (!modePracticeBtn || !modeDailyBtn) return;

  if (gameMode === "PRACTICE") {
    modePracticeBtn.classList.add("active");
    modeDailyBtn.classList.remove("active");
  } else {
    modeDailyBtn.classList.add("active");
    modePracticeBtn.classList.remove("active");
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
          guessDistribution:
            parsed.guessDistribution || stats.guessDistribution
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
// Daily meta (lock daily puzzle)
// =====================
function saveDailyMeta(status) {
  if (gameMode !== "DAILY") return;
  const date = solutionDate || getTodayString();
  const meta = { date, status };
  try {
    localStorage.setItem(DAILY_META_KEY, JSON.stringify(meta));
  } catch (err) {
    console.error("Failed to save daily meta", err);
  }
}

// If today's daily has already been completed (win/lose),
// force the daily into a locked state (no replay).
function ensureDailyLock() {
  if (gameMode !== "DAILY") return;

  try {
    const raw = localStorage.getItem(DAILY_META_KEY);
    if (!raw) return;

    const meta = JSON.parse(raw);
    const today = getTodayString();
    if (!meta || meta.date !== today) return;
    if (meta.status === "IN_PROGRESS") return;

    // Lock for today – we do NOT allow replay.
    const daily = pickDailySolution();
    solution = daily.solution;
    solutionDate = daily.date;
    gameStatus = meta.status;

    // Clear board and guesses so user can't play more,
    // but they see a fresh locked board.
    guesses = Array(MAX_GUESSES)
      .fill("")
      .map(() => Array(WORD_LENGTH).fill(""));
    currentRow = 0;
    currentCol = 0;

    saveGame();
  } catch (err) {
    console.error("Failed to enforce daily lock", err);
  }
}

// =====================
// Game persistence
// =====================
function saveGame() {
  const data = {
    solution,
    solutionDate,
    currentRow,
    currentCol,
    guesses,
    gameStatus,
    gameMode
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
// UI helpers for buttons
// =====================
function updateButtonsForGameState() {
  if (!resetButton) return;

  if (gameMode === "DAILY" && gameStatus !== "IN_PROGRESS") {
    resetButton.disabled = true;
    resetButton.title =
      "Daily puzzle already completed. Come back tomorrow.";
  } else {
    resetButton.disabled = false;
    resetButton.title = "";
  }
}

// =====================
// Starting new games
// =====================
function startNewGameForCurrentMode() {
  if (gameMode === "DAILY") {
    // If today's daily is already completed, do NOT create a new one.
    const raw = localStorage.getItem(DAILY_META_KEY);
    const today = getTodayString();
    if (raw) {
      try {
        const meta = JSON.parse(raw);
        if (meta.date === today && meta.status !== "IN_PROGRESS") {
          // Lock & exit – no replay.
          ensureDailyLock();
          updateButtonsForGameState();
          updateShareButtonState();
          return;
        }
      } catch (e) {
        console.error("Error reading daily meta", e);
      }
    }

    const daily = pickDailySolution();
    solution = daily.solution;
    solutionDate = daily.date;
  } else {
    solution = pickRandomSolution();
    solutionDate = null;
  }

  currentRow = 0;
  currentCol = 0;
  guesses = Array(MAX_GUESSES)
    .fill("")
    .map(() => Array(WORD_LENGTH).fill(""));
  gameStatus = "IN_PROGRESS";

  document.querySelectorAll(".tile").forEach(tile => {
    tile.className = "tile";
    const inner = tile.querySelector(".tile-inner");
    if (inner) inner.textContent = "";
  });

  document.querySelectorAll(".key").forEach(key => {
    key.classList.remove("correct", "present", "absent");
    delete key.dataset.status;
  });

  clearMessage();
  saveGame();
  updateShareButtonState();
  updateButtonsForGameState();
}

function loadGame() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      startNewGameForCurrentMode();
      return;
    }

    const parsed = JSON.parse(stored);
    if (!parsed || !parsed.solution) {
      startNewGameForCurrentMode();
      return;
    }

    // If saved mode doesn't match current mode, start fresh for this mode
    if (parsed.gameMode && parsed.gameMode !== gameMode) {
      startNewGameForCurrentMode();
      return;
    }

    solution = parsed.solution;
    solutionDate = parsed.solutionDate || null;
    guesses = parsed.guesses || guesses;
    currentRow = parsed.currentRow || 0;
    currentCol = parsed.currentCol || 0;
    gameStatus = parsed.gameStatus || "IN_PROGRESS";

    // For daily mode, if saved solution isn't today's, start fresh
    if (gameMode === "DAILY") {
      const today = getTodayString();
      if (solutionDate !== today) {
        startNewGameForCurrentMode();
        return;
      }
    }

    normaliseCurrentRow();
  } catch (err) {
    console.error("Failed to load game, starting new:", err);
    startNewGameForCurrentMode();
  }
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

  const rows = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

  rows.forEach((rowStr, rowIndex) => {
    const rowDiv = document.createElement("div");
    rowDiv.className = "keyboard-row";

    if (rowIndex === 2) {
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
// Result logic
// =====================
function computeResult(guess, answer) {
  const result = Array(WORD_LENGTH).fill("absent");
  const answerCounts = {};

  for (let i = 0; i < WORD_LENGTH; i++) {
    const letter = answer[i];
    answerCounts[letter] = (answerCounts[letter] || 0) + 1;
  }

  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === answer[i]) {
      result[i] = "correct";
      answerCounts[guess[i]] -= 1;
    }
  }

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

function revealGuess(guess, answer, rowIndex) {
  const result = computeResult(guess, answer);

  for (let i = 0; i < WORD_LENGTH; i++) {
    updateKeyboardKey(guess[i], result[i]);
  }

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
      }, FLIP_DURATION / 2);
    }, i * FLIP_STAGGER);
  }

  setTimeout(() => {
    handleEndOfGuess(guess, result);
  }, WORD_LENGTH * FLIP_STAGGER + FLIP_DURATION);
}

function handleEndOfGuess(guess, result) {
  const isWin = result.every(r => r === "correct");

  if (isWin) {
    gameStatus = "WIN";
    showMessage("You got it! 🎉");
    updateStats(true);
    saveStats();
    saveGame();
    if (gameMode === "DAILY") saveDailyMeta("WIN");
    updateShareButtonState();
    updateButtonsForGameState();
    return;
  }

  currentRow++;

  if (currentRow >= MAX_GUESSES) {
    gameStatus = "LOSE";
    showMessage(`Out of tries! The word was ${solution.toUpperCase()}`);
    updateStats(false);
    saveStats();
    saveGame();
    if (gameMode === "DAILY") saveDailyMeta("LOSE");
    updateShareButtonState();
    updateButtonsForGameState();
    return;
  }

  currentCol = 0;
  saveGame();
}

// =====================
// Stats UI
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
// Share
// =====================
function updateShareButtonState() {
  if (!shareButton) return;
  const hasGuess = guesses.some(row => row.join("").length > 0);
  shareButton.disabled = gameStatus === "IN_PROGRESS" || !hasGuess;
}

function buildShareText() {
  const attempts = gameStatus === "WIN" ? currentRow + 1 : "X";
  const modeLabel = gameMode === "DAILY" ? "Daily" : "Practice";
  const title = `Wordle Clone ${attempts}/${MAX_GUESSES} (${modeLabel})`;

  const emojiMap = colorblindMode
    ? { correct: "🟧", present: "🟦", absent: "⬛" }
    : { correct: "🟩", present: "🟨", absent: "⬛" };

  const lines = [];
  for (let row = 0; row < MAX_GUESSES; row++) {
    const guess = wordFromRow(row);
    if (!guess || guess.length !== WORD_LENGTH) break;
    const result = computeResult(guess, solution);
    const line = result.map(r => emojiMap[r] || emojiMap.absent).join("");
    lines.push(line);
  }

  return `${title}\n${lines.join("\n")}`;
}

async function shareResult() {
  if (gameStatus === "IN_PROGRESS") {
    showMessage("Finish the game before sharing.", true);
    return;
  }

  const text = buildShareText();

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    showMessage("Result copied to clipboard! 📋");
  } catch (err) {
    console.error("Failed to copy share text", err);
    showMessage("Couldn't copy result.", true);
  }
}

// =====================
// Mode + reset
// =====================
function resetPuzzle() {
  if (gameMode === "DAILY" && gameStatus !== "IN_PROGRESS") {
    showMessage("Daily puzzle already completed. Come back tomorrow.");
    return;
  }
  startNewGameForCurrentMode();
}

function setGameMode(mode) {
  if (mode !== "PRACTICE" && mode !== "DAILY") return;
  if (gameMode === mode) return;

  gameMode = mode;
  updateModeButtons();
  saveSettings();

  if (gameMode === "DAILY") {
    loadGame();
    ensureDailyLock();
  } else {
    startNewGameForCurrentMode();
  }

  restoreBoardFromState();
}

// =====================
// Modal
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

  if (colorblindToggle) {
    colorblindToggle.addEventListener("change", () => {
      colorblindMode = colorblindToggle.checked;
      document.body.classList.toggle("colorblind", colorblindMode);
      saveSettings();
    });
  }

  if (modePracticeBtn && modeDailyBtn) {
    modePracticeBtn.addEventListener("click", () => setGameMode("PRACTICE"));
    modeDailyBtn.addEventListener("click", () => setGameMode("DAILY"));
  }

  if (shareButton) {
    shareButton.addEventListener("click", shareResult);
  }
}

// =====================
// Restore UI
// =====================
function restoreBoardFromState() {
  updateBoard();

  // Re-colour previously submitted guesses
  for (let row = 0; row < MAX_GUESSES; row++) {
    const guess = wordFromRow(row);
    if (!guess || guess.length !== WORD_LENGTH) continue;
    if (row >= currentRow && gameStatus === "IN_PROGRESS") break;

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

  updateShareButtonState();
  updateButtonsForGameState();
}

// =====================
// Bootstrap
// =====================
async function bootstrapGame() {
  await loadWordLists();
  loadStats();
  loadSettings();
  createBoard();
  createKeyboard();
  loadGame();
  ensureDailyLock(); // make sure daily can't be replayed
  setupEventListeners();
  restoreBoardFromState();
}

bootstrapGame();
