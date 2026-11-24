import { MapManager } from './mapManager.js';
import { getRandomTrackForCountry } from './apiService.js';
import { createGameEngine } from './gameEngine.js';
import { AudioVisualizer } from './audioVisualizer.js';

const SILENT_AUDIO_URI =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

let gameEngine = null;
let mapManager = null;
let visualizer = null;
let isAppReady = false;

let timerInterval = null;
let bufferingWatchdog = null;
let remainingSeconds = 25;
let hintStage = 0;
let isRoundResolving = false;
let isWaitingForAudioStart = false;
let isAudioReadyForRound = false;
let hasTimerStartedForRound = false;
let audioRetryCount = 0;
let roundSessionId = 0;

// Bir sonraki turun şarkısını önceden hazırlamak için önbellek
let prefetchedRound = null;

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

function primeAudioElementOnGesture() {
  try {
    audioPlayer.src = SILENT_AUDIO_URI;
    const p = audioPlayer.play();
    if (p !== undefined) {
      p.then(() => audioPlayer.pause()).catch(() => {});
    }
  } catch {
    // Ignore
  }
}

function clearBufferingWatchdog() {
  if (bufferingWatchdog) {
    clearTimeout(bufferingWatchdog);
    bufferingWatchdog = null;
  }
}

function prepareNextRoundInBackground() {
  if (!gameEngine) return Promise.resolve(null);
  const sessionAtCreation = roundSessionId;
  const targetCountry = gameEngine.pickNextCountry();

  const entry = {
    session: sessionAtCreation,
    country: targetCountry,
    resolvedTrack: null,
    promise: null
  };

  entry.promise = getRandomTrackForCountry(targetCountry)
    .then((track) => {
      if (entry.session === roundSessionId) {
        entry.resolvedTrack = track;
      }
      return track;
    })
    .catch(() => null);

  prefetchedRound = entry;
  return entry.promise;
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

    // 1. turun şarkısını açılışta hazırla (maksimum 6 sn bekle, yine de Start Game'i kilitleme)
    startGameBtn.textContent = 'Preparing First Track...';
    await Promise.race([
      prepareNextRoundInBackground(),
      new Promise((resolve) => setTimeout(resolve, 6000))
    ]);

    isAppReady = true;
    startGameBtn.textContent = 'Start Game';
  } catch (error) {
    console.error('Initialization error:', error);
    startGameBtn.textContent = 'Retry Loading';
    trackStatusText.textContent = 'Failed to load data. Check your connection and refresh.';
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

function stopAudioPlayback() {
  clearBufferingWatchdog();
  isAudioReadyForRound = false;
  playPauseBtn.classList.remove('needs-tap');
  audioPlayer.pause();
  playIcon.textContent = '▶';
  visualizer.stop();
}

function promptManualTap(activeSessionId) {
  if (!isWaitingForAudioStart || activeSessionId !== roundSessionId) return;
  playPauseBtn.classList.add('needs-tap');
  trackStatusText.textContent = isTouchDevice()
    ? '▶ Tap the glowing Play button to start music'
    : '▶ Click Play or press Space to listen';
}

function beginPlayingTrack(trackData, activeSessionId) {
  if (activeSessionId !== roundSessionId) return;

  gameEngine.activateRound(trackData);
  isAudioReadyForRound = true;
  isWaitingForAudioStart = true;
  hasTimerStartedForRound = false;
  isRoundResolving = false;

  trackStatusText.textContent = '⏳ Starting audio stream...';
  audioPlayer.src = trackData.previewUrl;

  clearBufferingWatchdog();
  bufferingWatchdog = setTimeout(() => {
    if (isWaitingForAudioStart && activeSessionId === roundSessionId && !hasTimerStartedForRound) {
      promptManualTap(activeSessionId);
    }
  }, 4000);

  const playPromise = audioPlayer.play();
  if (playPromise !== undefined) {
    playPromise.catch(() => {
      clearBufferingWatchdog();
      promptManualTap(activeSessionId);
    });
  }
}

async function startNewRound() {
  roundSessionId += 1;
  const currentSession = roundSessionId;

  isRoundResolving = true;
  isWaitingForAudioStart = false;
  hasTimerStartedForRound = false;
  audioRetryCount = 0;

  stopTimer();
  stopAudioPlayback();
  resetTimerDisplay();

  feedbackToast.classList.add('hidden');
  hintPanel.classList.add('hidden');
  mapManager.resetRound();

  const cached = prefetchedRound;
  prefetchedRound = null;

  // Ön yükleme tamamlandıysa dokunma anında senkron başlat
  if (cached && cached.resolvedTrack) {
    updateHud();
    beginPlayingTrack(cached.resolvedTrack, currentSession);
    return;
  }

  // Ön yükleme henüz bitmediyse dokunma anında ses öğesini kilitsiz tut
  primeAudioElementOnGesture();
  let targetCountry = cached ? cached.country : gameEngine.pickNextCountry();
  updateHud();
  trackStatusText.textContent = 'Selecting a track from the global archive...';

  for (let attempt = 0; attempt < 3; attempt++) {
    if (currentSession !== roundSessionId) return;
    try {
      let trackData = attempt === 0 && cached ? await cached.promise : null;
      if (!trackData) {
        trackData = await getRandomTrackForCountry(targetCountry);
      }
      beginPlayingTrack(trackData, currentSession);
      return;
    } catch (err) {
      console.warn(`Attempt ${attempt + 1} failed for ${targetCountry.name}:`, err.message);
      targetCountry = gameEngine.pickNextCountry();
      updateHud();
    }
  }

  if (currentSession === roundSessionId) {
    trackStatusText.textContent = 'Network unavailable — check internet and tap ↻';
  }
}

function restartFullGame() {
  if (!isAppReady) return;
  primeAudioElementOnGesture();

  prefetchedRound = null;
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
  stopAudioPlayback();

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
  stopAudioPlayback();

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

  // Sonuç kartı okunurken bir sonraki turun şarkısını arka planda hazırla
  if (!result.isGameOver) {
    prepareNextRoundInBackground();
  }

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
  stopAudioPlayback();
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
  if (!isAudioReadyForRound || !audioPlayer.src || audioPlayer.src.startsWith('data:')) return;

  if (audioPlayer.paused) {
    audioPlayer.play().catch(() => {
      promptManualTap(roundSessionId);
    });
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
    startModal.classList.add('hidden');
    startNewRound();
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
    if (!isAudioReadyForRound || !audioPlayer.src || audioPlayer.src.startsWith('data:')) return;

    clearBufferingWatchdog();
    playPauseBtn.classList.remove('needs-tap');
    playIcon.textContent = '❚❚';
    visualizer.start();

    if (isWaitingForAudioStart && !isRoundResolving && !hasTimerStartedForRound) {
      isWaitingForAudioStart = false;
      hasTimerStartedForRound = true;
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
    if (!isAudioReadyForRound || !audioPlayer.src || audioPlayer.src.startsWith('data:')) return;

    clearBufferingWatchdog();
    if (isWaitingForAudioStart && audioRetryCount < 2) {
      audioRetryCount += 1;
      const currentSession = roundSessionId;
      const { activeCountry } = gameEngine.getState();
      if (activeCountry) {
        trackStatusText.textContent = 'Stream error, loading another track...';
        try {
          const fallbackTrack = await getRandomTrackForCountry(activeCountry);
          beginPlayingTrack(fallbackTrack, currentSession);
        } catch {
          trackStatusText.textContent = 'Stream unavailable — tap ↻ to skip.';
        }
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', initApp);