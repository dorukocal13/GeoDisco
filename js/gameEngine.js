const TOTAL_ROUNDS = 10;
const INITIAL_LIVES = 3;
const ROUND_DURATION_SEC = 25;
const PROXIMITY_THRESHOLD_KM = 1500;
const HIGHSCORE_STORAGE_KEY = 'geodisco_highscore_v1';

// İki coğrafi koordinat arasındaki Haversine (Büyük Daire) mesafesini km cinsinden hesaplar
export function calculateHaversineKm([lat1, lon1], [lat2, lon2]) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371; // Dünya ortalama yarıçapı (km)

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function createGameEngine(countriesPool) {
  // --- Closure ile Kapsüllenmiş Özel Durum Değişkenleri ---
  let score = 0;
  let lives = INITIAL_LIVES;
  let currentRound = 0;
  let highScore = Number(localStorage.getItem(HIGHSCORE_STORAGE_KEY)) || 0;
  let usedIsos = new Set();
  let roundHistory = [];
  let activeCountry = null;
  let activeTrack = null;
  let isRoundActive = false;

  function getDifficultyForRound(roundNum) {
    if (roundNum <= 3) return 'easy';
    if (roundNum <= 7) return 'medium';
    return 'hard';
  }

  function getSpeedMultiplier(remainingSeconds, hintUsed) {
    if (hintUsed) return 1.0;
    const elapsed = ROUND_DURATION_SEC - remainingSeconds;
    if (elapsed <= 5) return 2.0;
    if (elapsed <= 15) return 1.5;
    return 1.0;
  }

  function updateHighScoreIfNeeded() {
    if (score > highScore) {
      highScore = score;
      localStorage.setItem(HIGHSCORE_STORAGE_KEY, String(highScore));
    }
  }

  // --- Dışarıya Açılan Kontrollü Arayüz (Public API) ---
  return {
    constants: {
      TOTAL_ROUNDS,
      INITIAL_LIVES,
      ROUND_DURATION_SEC,
      PROXIMITY_THRESHOLD_KM
    },

    resetGame() {
      score = 0;
      lives = INITIAL_LIVES;
      currentRound = 0;
      usedIsos.clear();
      roundHistory = [];
      activeCountry = null;
      activeTrack = null;
      isRoundActive = false;
    },

    pickNextCountry() {
      currentRound += 1;
      const targetDiff = getDifficultyForRound(currentRound);

      let candidates = countriesPool.filter(
        (c) => c.difficulty === targetDiff && !usedIsos.has(c.iso3)
      );

      // Havuz tükenirse kullanılmamış herhangi bir ülkeden devam et
      if (candidates.length === 0) {
        candidates = countriesPool.filter((c) => !usedIsos.has(c.iso3));
      }

      const selected = candidates[Math.floor(Math.random() * candidates.length)];
      usedIsos.add(selected.iso3);
      activeCountry = selected;
      return selected;
    },

    activateRound(trackData) {
      activeTrack = trackData;
      isRoundActive = true;
    },

    evaluateGuess({ guessedIso, guessedName, guessedLatLng, remainingSeconds, hintUsed }) {
      if (!isRoundActive || !activeCountry) return null;
      isRoundActive = false;

      const timeTaken = Math.max(0.1, Number((ROUND_DURATION_SEC - remainingSeconds).toFixed(1)));
      const targetCoords = activeCountry.coords;
      const isExact = guessedIso === activeCountry.iso3;
      const distanceKm = isExact ? 0 : calculateHaversineKm(guessedLatLng, targetCoords);

      let status = 'wrong';
      let earnedPoints = 0;

      if (isExact) {
        status = 'exact';
        const mult = getSpeedMultiplier(remainingSeconds, hintUsed);
        earnedPoints = Math.round(1000 * mult);
        score += earnedPoints;
      } else if (distanceKm <= PROXIMITY_THRESHOLD_KM) {
        status = 'close';
        earnedPoints = Math.round(500 * (1 - distanceKm / PROXIMITY_THRESHOLD_KM));
        score += earnedPoints;
      } else {
        status = 'wrong';
        lives = Math.max(0, lives - 1);
      }

      updateHighScoreIfNeeded();

      const record = {
        round: currentRound,
        difficulty: activeCountry.difficulty,
        targetName: activeCountry.name,
        guessedName: guessedName || 'Süre Doldu',
        status,
        distanceKm: Math.round(distanceKm),
        timeTaken,
        earnedPoints,
        trackTitle: activeTrack?.title || '',
        artist: activeTrack?.artist || '',
        releaseYear: activeTrack?.releaseYear || ''
      };

      roundHistory.push(record);

      return {
        ...record,
        targetIso: activeCountry.iso3,
        targetCoords,
        guessedIso,
        guessedCoords: guessedLatLng,
        score,
        lives,
        highScore,
        isGameOver: lives <= 0 || currentRound >= TOTAL_ROUNDS
      };
    },

    handleTimeout() {
      if (!isRoundActive || !activeCountry) return null;
      isRoundActive = false;
      lives = Math.max(0, lives - 1);

      const record = {
        round: currentRound,
        difficulty: activeCountry.difficulty,
        targetName: activeCountry.name,
        guessedName: 'Süre Doldu',
        status: 'timeout',
        distanceKm: null,
        timeTaken: ROUND_DURATION_SEC,
        earnedPoints: 0,
        trackTitle: activeTrack?.title || '',
        artist: activeTrack?.artist || '',
        releaseYear: activeTrack?.releaseYear || ''
      };

      roundHistory.push(record);

      return {
        ...record,
        targetIso: activeCountry.iso3,
        targetCoords: activeCountry.coords,
        guessedIso: null,
        guessedCoords: null,
        score,
        lives,
        highScore,
        isGameOver: lives <= 0 || currentRound >= TOTAL_ROUNDS
      };
    },

    getMultiplierPreview(remainingSeconds, hintUsed) {
      return getSpeedMultiplier(remainingSeconds, hintUsed);
    },

    getState() {
      return {
        score,
        lives,
        currentRound,
        totalRounds: TOTAL_ROUNDS,
        highScore,
        difficulty: getDifficultyForRound(Math.max(1, currentRound)),
        activeCountry,
        activeTrack
      };
    },

    getSummaryStats() {
      const totalPlayed = roundHistory.length || 1;
      const hits = roundHistory.filter((r) => r.status === 'exact' || r.status === 'close').length;
      const avgTime =
        roundHistory.reduce((acc, r) => acc + r.timeTaken, 0) / totalPlayed;

      return {
        finalScore: score,
        highScore,
        accuracyPercent: Math.round((hits / totalPlayed) * 100),
        avgResponseTime: avgTime.toFixed(1),
        history: [...roundHistory]
      };
    }
  };
}