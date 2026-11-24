import { MapManager } from './mapManager.js';
import { getRandomTrackForCountry } from './apiService.js';
import { createGameEngine } from './gameEngine.js';
import { AudioVisualizer } from './audioVisualizer.js';

let gameEngine = null;
let mapManager = null;
let visualizer = null;
let isAppReady = false;

let timerInterval = null;
let remainingSeconds = 25;
let hintStage = 0;
let isRoundResolving = false;
let isWaitingForAudioStart = false;
let audioRetryCount = 0;
let roundSessionId = 0;

// DOM References
const roundDisplay = document.getElementById('round-display');
const difficultyDisplay = document.getElementById('difficulty-display');
const scoreDisplay = document.getElementById('score-display');
const highscoreDisplay = document.getElementById('highscore-display');
const livesDisplay = document.getElementById('lives-display');
const hudRestartBtn = document.getElementById('hud-restart-btn');

const timerBar = document.getElementById('timer-bar');
const timerText = document.getElementById('timer-text');
const multiplierText = document.getElementById('multiplier-text');

const hintPanel = document.getElementById('hint-panel');
const hintText = document.getElementById('hint-text');

const feedbackToast = document.getElementById('feedback-toast');
const feedbackTitle = document.getElementById('feedback-title');
const feedbackDetails = document.getElementById('feedback-details');
const nextRoundBtn = document.getElementById('next-round-btn');

const playPauseBtn = document.getElementById('play-pause-btn');
const playIcon = document.getElementById('play-icon');
const trackStatusText = document.getElementById('track-status-text');
const audioPlayer = document.getElementById('audio-player');

const startModal = document.getElementById('start-modal');
const startGameBtn = document.getElementById('start-game-btn');
const gameoverModal = document.getElementById('gameover-modal');
const restartGameBtn = document.getElementById('restart-game-btn');

const DIFFICULTY_LABELS = {
  easy: { text: 'EASY', className: 'badge-easy' },
  medium: { text: 'MEDIUM', className: 'badge-medium' },
  hard: { text: 'HARD', className: 'badge-hard' }
};

function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

function unlockMobileAudio() {
  try {
    audioPlayer.load();
  } catch {
    // Ignore unlock errors on desktop
  }
}

async function initApp() {
  bindEventHandlers();

  try {
    const response = await fetch('./data/countries_pool.json');
    if (!response.ok) throw new Error('countries_pool.json not found');
    const countriesPool = await response.json();

    gameEngine = createGameEngine(countriesPool);
    visualizer = new AudioVisualizer('d3-visualizer', 'performance-chart');
    mapManager = new MapManager('map', handleCountrySelection);

    await mapManager.loadCountries();
    updateHud();

    isAppReady = true;
    startGameBtn.textContent = 'Start Game';
  } catch (error) {
    console.error('Initialization error:', error);
    startGameBtn.textContent = 'Retry Loading';
    trackStatusText.textContent = 'Failed to load map data. Check your connection and refresh.';
  }
}

function updateHud() {
  if (!gameEngine) return;
  const state = gameEngine.getState();
  roundDisplay.textContent = `${Math.max(1, state.currentRound)} / ${state.totalRounds}`;
  scoreDisplay.textContent = state.score.toLocaleString('en-US');
  highscoreDisplay.textContent = state.highScore.toLocaleString('en-US');

  const diffInfo = DIFFICULTY_LABELS[state.difficulty] || DIFFICULTY_LABELS.easy;
  difficultyDisplay.textContent = diffInfo.text;
  difficultyDisplay.className = `stat-value ${diffInfo.className}`;

  const fullHearts = '❤️'.repeat(state.lives);
  const emptyHearts = '🖤'.repeat(Math.max(0, gameEngine.constants.INITIAL_LIVES - state.lives));
  livesDisplay.textContent = fullHearts + emptyHearts;
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function resetTimerDisplay() {
  stopTimer();
  remainingSeconds = gameEngine.constants.ROUND_DURATION_SEC;
  hintStage = 0;
  hintPanel.classList.add('hidden');
  timerBar.style.width = '100%';
  timerBar.style.background = 'linear-gradient(90deg, #8c5a32, #2ea043, #2b93c9)';
  timerText.textContent = '25.0 s';
  multiplierText.textContent = 'Speed Multiplier: 2.0x';
}

function startTimer() {
  stopTimer();
  remainingSeconds = gameEngine.constants.ROUND_DURATION_SEC;
  hintStage = 0;
  hintPanel.classList.add('hidden');
  updateTimerUi();

  timerInterval = setInterval(() => {
    remainingSeconds = Math.max(0, Number((remainingSeconds - 0.1).toFixed(1)));
    updateTimerUi();
    checkProgressiveHints();

    if (remainingSeconds <= 0) {
      stopTimer();
      handleRoundTimeout();
    }
  }, 100);
}

function updateTimerUi() {
  const total = gameEngine.constants.ROUND_DURATION_SEC;
  const percent = (remainingSeconds / total) * 100;
  timerBar.style.width = `${percent}%`;
  timerText.textContent = `${remainingSeconds.toFixed(1)} s`;

  if (remainingSeconds <= 6) {
    timerBar.style.background = '#dc2626';
  } else if (remainingSeconds <= 15) {
    timerBar.style.background = '#b87d4b';
  } else {
    timerBar.style.background = 'linear-gradient(90deg, #8c5a32, #2ea043, #2b93c9)';
  }

  const mult = gameEngine.getMultiplierPreview(remainingSeconds, hintStage > 0);
  multiplierText.textContent = `Speed Multiplier: ${mult.toFixed(1)}x`;
}

function checkProgressiveHints() {
  const { activeCountry, activeTrack } = gameEngine.getState();
  if (!activeCountry || !activeTrack) return;

  if (remainingSeconds <= 15 && hintStage === 0) {
    hintStage = 1;
    const yearInfo = activeTrack.releaseYear ? `Released in ${activeTrack.releaseYear}` : 'Unknown era';
    hintText.innerHTML = `<strong>Genre:</strong> ${activeTrack.genre} • <strong>Era:</strong> ${yearInfo}`;
    hintPanel.classList.remove('hidden');
  }

  if (remainingSeconds <= 8 && hintStage === 1) {
    hintStage = 2;
    hintText.innerHTML += `<br/><strong>Region:</strong> <em>${activeCountry.continent}</em> is highlighted on the map!`;
    mapManager.highlightHintContinent(activeCountry.continent);
  }
}

function clearAudioPlayer() {
  audioPlayer.pause();
  audioPlayer.removeAttribute('src');
  audioPlayer.load();
  playIcon.textContent = '▶';
  visualizer.stop();
}

async function loadAndPlayTrackForCountry(targetCountry, activeSessionId) {
  trackStatusText.textContent = 'Selecting a track from the global archive...';
  resetTimerDisplay();

  const trackData = await getRandomTrackForCountry(targetCountry);
  if (activeSessionId !== roundSessionId) return;

  gameEngine.activateRound(trackData);

  isWaitingForAudioStart = true;
  isRoundResolving = false;

  audioPlayer.src = trackData.previewUrl;
  audioPlayer.load();

  try {
    await audioPlayer.play();
  } catch {
    if (isWaitingForAudioStart && activeSessionId === roundSessionId) {
      trackStatusText.textContent = isTouchDevice()
        ? '▶ Tap Play to listen'
        : '▶ Click Play or press Space to listen';
    }
  }
}

async function startNewRound() {
  roundSessionId += 1;
  const currentSession = roundSessionId;

  isRoundResolving = true;
  isWaitingForAudioStart = false;
  audioRetryCount = 0;

  stopTimer();
  clearAudioPlayer();

  feedbackToast.classList.add('hidden');
  hintPanel.classList.add('hidden');
  mapManager.resetRound();

  const targetCountry = gameEngine.pickNextCountry();
  updateHud();

  try {
    await loadAndPlayTrackForCountry(targetCountry, currentSession);
  } catch (err) {
    if (currentSession !== roundSessionId) return;
    console.error('Track loading error:', err);
    if (audioRetryCount < 2) {
      audioRetryCount += 1;
      await loadAndPlayTrackForCountry(targetCountry, currentSession);
    } else {
      trackStatusText.textContent = 'Stream unavailable, try next round.';
    }
  }
}

function restartFullGame() {
  if (!isAppReady) return;
  unlockMobileAudio();

  startModal.classList.add('hidden');
  gameoverModal.classList.add('hidden');
  feedbackToast.classList.add('hidden');
  hintPanel.classList.add('hidden');

  gameEngine.resetGame();
  startNewRound();
}

function handleCountrySelection(selectedCountry) {
  if (isRoundResolving || isWaitingForAudioStart) return;

  isRoundResolving = true;
  stopTimer();
  audioPlayer.pause();
  visualizer.stop();

  const result = gameEngine.evaluateGuess({
    guessedIso: selectedCountry.iso,
    guessedName: selectedCountry.name,
    guessedLatLng: selectedCountry.latlng,
    remainingSeconds,
    hintUsed: hintStage > 0
  });

  if (!result) return;
  presentRoundFeedback(result);
}

function handleRoundTimeout() {
  if (isRoundResolving) return;
  isRoundResolving = true;
  audioPlayer.pause();
  visualizer.stop();

  const result = gameEngine.handleTimeout();
  if (!result) return;
  presentRoundFeedback(result);
}

function presentRoundFeedback(result) {
  updateHud();
  mapManager.showRoundResult(result);

  const yearStr = result.releaseYear ? ` (${result.releaseYear})` : '';
  const songMeta = `<strong>${result.artist}</strong> — <em>${result.trackTitle}</em>${yearStr}`;

  if (result.status === 'exact') {
    feedbackTitle.textContent = `🎯 Bullseye! +${result.earnedPoints} pts`;
    feedbackTitle.style.color = '#4ade80';
    feedbackDetails.innerHTML = `Country: <strong>${result.targetName}</strong> (${result.timeTaken} s)<br/>${songMeta}`;
  } else if (result.status === 'close') {
    feedbackTitle.textContent = `🧭 So Close! +${result.earnedPoints} pts`;
    feedbackTitle.style.color = '#b87d4b';
    feedbackDetails.innerHTML = `Your guess: ${result.guessedName} — Answer: <strong>${result.targetName}</strong> (${result.distanceKm.toLocaleString('en-US')} km away, no life lost!)<br/>${songMeta}`;
  } else if (result.status === 'timeout') {
    feedbackTitle.textContent = "⏱️ Time's Up! (-1 Life)";
    feedbackTitle.style.color = '#dc2626';
    feedbackDetails.innerHTML = `Correct Country: <strong>${result.targetName}</strong><br/>${songMeta}`;
  } else {
    feedbackTitle.textContent = '❌ Wrong Region! (-1 Life)';
    feedbackTitle.style.color = '#dc2626';
    feedbackDetails.innerHTML = `Your guess: ${result.guessedName} (${result.distanceKm.toLocaleString('en-US')} km away)<br/>Correct Country: <strong>${result.targetName}</strong><br/>${songMeta}`;
  }

  trackStatusText.textContent = `${result.artist} - ${result.trackTitle}`;
  nextRoundBtn.textContent = result.isGameOver ? 'View Results 📊' : 'Next Round ➔';
  hintPanel.classList.add('hidden');
  feedbackToast.classList.remove('hidden');

  nextRoundBtn.onclick = () => {
    if (result.isGameOver) {
      showGameOverScreen();
    } else {
      startNewRound();
    }
  };
}

function showGameOverScreen() {
  feedbackToast.classList.add('hidden');
  clearAudioPlayer();
  const stats = gameEngine.getSummaryStats();

  document.getElementById('gameover-title').textContent =
    gameEngine.getState().lives <= 0 ? '💔 Out of Lives!' : '🏆 World Tour Complete!';
  document.getElementById('final-score').textContent = stats.finalScore.toLocaleString('en-US');
  document.getElementById('final-avg-time').textContent = `${stats.avgResponseTime} s`;
  document.getElementById('final-accuracy').textContent = `${stats.accuracyPercent}%`;

  gameoverModal.classList.remove('hidden');
  visualizer.renderSummaryChart(stats.history);
}

function toggleAudioPlayback() {
  if (!audioPlayer.src) return;
  if (audioPlayer.paused) {
    audioPlayer.play().catch(() => {});
  } else {
    audioPlayer.pause();
  }
}

function bindEventHandlers() {
  startGameBtn.addEventListener('click', () => {
    if (!isAppReady) {
      window.location.reload();
      return;
    }
    restartFullGame();
  });

  restartGameBtn.addEventListener('click', restartFullGame);
  hudRestartBtn.addEventListener('click', restartFullGame);

  playPauseBtn.addEventListener('click', toggleAudioPlayback);

  document.addEventListener('keydown', (event) => {
    if (
      event.code === 'Space' &&
      startModal.classList.contains('hidden') &&
      gameoverModal.classList.contains('hidden')
    ) {
      event.preventDefault();
      toggleAudioPlayback();
    }
  });

  audioPlayer.addEventListener('playing', () => {
    playIcon.textContent = '❚❚';
    visualizer.start();

    if (isWaitingForAudioStart && !isRoundResolving) {
      isWaitingForAudioStart = false;
      trackStatusText.textContent = isTouchDevice()
        ? '🎵 Playing — Tap the country on the map!'
        : '🎵 Playing — Find the country on the map!';
      startTimer();
    }
  });

  audioPlayer.addEventListener('pause', () => {
    playIcon.textContent = '▶';
    visualizer.stop();
  });

  audioPlayer.addEventListener('ended', () => {
    playIcon.textContent = '▶';
    visualizer.stop();
  });

  audioPlayer.addEventListener('error', async () => {
    if (isWaitingForAudioStart && audioRetryCount < 3) {
      audioRetryCount += 1;
      const currentSession = roundSessionId;
      const { activeCountry } = gameEngine.getState();
      if (activeCountry) {
        trackStatusText.textContent = 'Stream error, loading another track...';
        await loadAndPlayTrackForCountry(activeCountry, currentSession);
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', initApp);