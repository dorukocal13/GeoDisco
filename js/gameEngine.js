const CONSTANTS = {
  TOTAL_ROUNDS: 10,
  INITIAL_LIVES: 3,
  ROUND_DURATION_SEC: 25,
  BASE_EXACT_POINTS: 1000,
  MAX_PROXIMITY_POINTS: 500,
  PROXIMITY_TOLERANCE_KM: 1700,
  HIGHSCORE_STORAGE_KEY: 'geodisco_highscore_v1'
};

function calculateHaversineKm([lat1, lon1], [lat2, lon2]) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getTargetIso3(country) {
  return country.iso3 || country.iso || '';
}

function getTargetCoords(country) {
  if (Array.isArray(country.coords) && country.coords.length === 2) return country.coords;
  if (Array.isArray(country.latlng) && country.latlng.length === 2) return country.latlng;
  if (typeof country.lat === 'number' && typeof country.lng === 'number') {
    return [country.lat, country.lng];
  }
  return [0, 0];
}

export function createGameEngine(countriesPool = []) {
  let currentRound = 0;
  let score = 0;
  let highScore = Number(localStorage.getItem(CONSTANTS.HIGHSCORE_STORAGE_KEY)) || 0;
  let lives = CONSTANTS.INITIAL_LIVES;
  let difficulty = 'easy';
  let usedCountryCodes = new Set();
  let activeCountry = null;
  let activeTrack = null;
  let roundHistory = [];

  function getDifficultyForRound(roundNum) {
    if (roundNum <= 3) return 'easy';
    if (roundNum <= 7) return 'medium';
    return 'hard';
  }

  function resetGame() {
    currentRound = 0;
    score = 0;
    lives = CONSTANTS.INITIAL_LIVES;
    difficulty = 'easy';
    usedCountryCodes.clear();
    activeCountry = null;
    activeTrack = null;
    roundHistory = [];
  }

  function pickNextCountry() {
    currentRound += 1;
    difficulty = getDifficultyForRound(currentRound);

    let candidates = countriesPool.filter(
      (c) => c.difficulty === difficulty && !usedCountryCodes.has(getTargetIso3(c))
    );

    if (candidates.length === 0) {
      candidates = countriesPool.filter((c) => !usedCountryCodes.has(getTargetIso3(c)));
    }

    if (candidates.length === 0) {
      usedCountryCodes.clear();
      candidates = [...countriesPool];
    }

    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    usedCountryCodes.add(getTargetIso3(picked));
    activeCountry = picked;
    activeTrack = null;

    return activeCountry;
  }

  function activateRound(trackData) {
    activeTrack = trackData;
  }

  function getMultiplierPreview(remainingSeconds, hintUsed = false) {
    let rawMult = 1.0;
    if (remainingSeconds >= 20) {
      rawMult = 2.0;
    } else if (remainingSeconds > 0) {
      rawMult = 1.0 + remainingSeconds / 20;
    }

    const adjusted = hintUsed ? Math.max(1.0, rawMult - 0.2) : rawMult;
    return Number(adjusted.toFixed(1));
  }

  function updateHighScoreIfNeeded() {
    if (score > highScore) {
      highScore = score;
      localStorage.setItem(CONSTANTS.HIGHSCORE_STORAGE_KEY, String(highScore));
    }
  }

  function checkIsGameOver() {
    return lives <= 0 || currentRound >= CONSTANTS.TOTAL_ROUNDS;
  }

  function evaluateGuess({ guessedIso, guessedName, guessedLatLng, remainingSeconds, hintUsed }) {
    if (!activeCountry || !activeTrack) return null;

    const targetIso = getTargetIso3(activeCountry);
    const targetCoords = getTargetCoords(activeCountry);
    const timeTaken = Number((CONSTANTS.ROUND_DURATION_SEC - remainingSeconds).toFixed(1));
    const distanceKm =
      guessedIso === targetIso ? 0 : Math.round(calculateHaversineKm(guessedLatLng, targetCoords));

    let status = 'wrong';
    let earnedPoints = 0;

    if (guessedIso === targetIso) {
      status = 'exact';
      const multiplier = getMultiplierPreview(remainingSeconds, hintUsed);
      earnedPoints = Math.round(CONSTANTS.BASE_EXACT_POINTS * multiplier);
      score += earnedPoints;
    } else if (distanceKm <= CONSTANTS.PROXIMITY_TOLERANCE_KM) {
      status = 'close';
      const ratio = 1 - distanceKm / CONSTANTS.PROXIMITY_TOLERANCE_KM;
      earnedPoints = Math.max(100, Math.round(CONSTANTS.MAX_PROXIMITY_POINTS * ratio));
      score += earnedPoints;
    } else {
      status = 'wrong';
      lives = Math.max(0, lives - 1);
    }

    updateHighScoreIfNeeded();

    const record = {
      round: currentRound,
      targetIso,
      targetName: activeCountry.name,
      guessedIso,
      guessedName,
      status,
      earnedPoints,
      distanceKm,
      timeTaken,
      artist: activeTrack.artist,
      trackTitle: activeTrack.title,
      releaseYear: activeTrack.releaseYear
    };

    roundHistory.push(record);

    return {
      ...record,
      targetCoords,
      guessedCoords: guessedLatLng,
      isGameOver: checkIsGameOver()
    };
  }

  function handleTimeout() {
    if (!activeCountry || !activeTrack) return null;

    const targetIso = getTargetIso3(activeCountry);
    const targetCoords = getTargetCoords(activeCountry);
    lives = Math.max(0, lives - 1);

    const record = {
      round: currentRound,
      targetIso,
      targetName: activeCountry.name,
      guessedIso: null,
      guessedName: 'No Guess',
      status: 'timeout',
      earnedPoints: 0,
      distanceKm: null,
      timeTaken: CONSTANTS.ROUND_DURATION_SEC,
      artist: activeTrack.artist,
      trackTitle: activeTrack.title,
      releaseYear: activeTrack.releaseYear
    };

    roundHistory.push(record);

    return {
      ...record,
      targetCoords,
      guessedCoords: null,
      isGameOver: checkIsGameOver()
    };
  }

  function getSummaryStats() {
    const totalPlayed = roundHistory.length;
    const successfulRounds = roundHistory.filter(
      (r) => r.status === 'exact' || r.status === 'close'
    ).length;

    const totalTime = roundHistory.reduce((acc, r) => acc + r.timeTaken, 0);
    const avgResponseTime = totalPlayed > 0 ? (totalTime / totalPlayed).toFixed(1) : '0.0';
    const accuracyPercent = totalPlayed > 0 ? Math.round((successfulRounds / totalPlayed) * 100) : 0;

    return {
      finalScore: score,
      avgResponseTime,
      accuracyPercent,
      history: [...roundHistory]
    };
  }

  function getState() {
    return {
      currentRound,
      totalRounds: CONSTANTS.TOTAL_ROUNDS,
      score,
      highScore,
      difficulty,
      lives,
      activeCountry,
      activeTrack
    };
  }

  return {
    constants: CONSTANTS,
    resetGame,
    pickNextCountry,
    activateRound,
    getMultiplierPreview,
    evaluateGuess,
    handleTimeout,
    getSummaryStats,
    getState
  };
}