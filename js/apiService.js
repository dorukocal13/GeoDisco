const MB_BASE_URL = 'https://musicbrainz.org/ws/2/artist';
const ITUNES_BASE_URL = 'https://itunes.apple.com/search';

// Tarayıcı önbelleği: Aynı ülkenin sanatçı havuzunu tekrar tekrar sorgulamamak için
const artistPoolCache = new Map();

function shuffleArray(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function fetchMusicBrainzArtists(country) {
  const randomOffset = Math.floor(Math.random() * (country.maxOffset || 50));
  const query = encodeURIComponent(`country:${country.iso2}`);
  const url = `${MB_BASE_URL}?query=${query}&limit=100&offset=${randomOffset}&fmt=json`;

  const response = await fetch(url, {
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`MusicBrainz HTTP ${response.status}`);
  }

  const data = await response.json();
  let artists = (data.artists || []).filter(
    (a) => a.name && a.name.length > 2 && !a.name.includes('[unknown]')
  );

  // Eğer yüksek offset boş dönerse offset=0 ile tekrar dene
  if (artists.length === 0 && randomOffset > 0) {
    const retryRes = await fetch(`${MB_BASE_URL}?query=${query}&limit=100&offset=0&fmt=json`);
    const retryData = await retryRes.json();
    artists = (retryData.artists || []).filter((a) => a.name && a.name.length > 2);
  }

  return artists;
}

async function fetchItunesTrackForArtist(artistName) {
  const term = encodeURIComponent(artistName);
  const url = `${ITUNES_BASE_URL}?term=${term}&media=music&entity=song&limit=15`;

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  const normalizedTarget = artistName.toLowerCase().trim();

  // Sadece ses önizlemesi olan ve sanatçı adı gerçekten eşleşen parçaları filtrele
  const validTracks = (data.results || []).filter((item) => {
    if (!item.previewUrl || !item.artistName) return false;
    const returnedArtist = item.artistName.toLowerCase();
    return returnedArtist.includes(normalizedTarget) || normalizedTarget.includes(returnedArtist);
  });

  if (validTracks.length === 0) return null;

  // Farklı dönem ve albümlerden çeşitlilik sağlamak için rastgele bir parça seç
  const picked = validTracks[Math.floor(Math.random() * validTracks.length)];
  return {
    title: picked.trackName,
    artist: picked.artistName,
    genre: picked.primaryGenreName || 'World Music',
    releaseYear: picked.releaseDate ? new Date(picked.releaseDate).getFullYear() : null,
    previewUrl: picked.previewUrl
  };
}

async function fetchRegionalFallbackTrack(country) {
  const term = encodeURIComponent(country.fallbackQuery);
  const url = `${ITUNES_BASE_URL}?term=${term}&media=music&entity=song&limit=25`;

  const res = await fetch(url);
  const data = await res.json();
  const validTracks = (data.results || []).filter((item) => item.previewUrl);

  if (validTracks.length === 0) {
    throw new Error(`${country.name} için ses akışı bulunamadı.`);
  }

  const picked = validTracks[Math.floor(Math.random() * validTracks.length)];
  return {
    title: picked.trackName,
    artist: picked.artistName,
    genre: picked.primaryGenreName || 'Traditional / World',
    releaseYear: picked.releaseDate ? new Date(picked.releaseDate).getFullYear() : null,
    previewUrl: picked.previewUrl
  };
}

export async function getRandomTrackForCountry(country) {
  try {
    let artists = artistPoolCache.get(country.iso2);

    if (!artists || artists.length === 0) {
      artists = await fetchMusicBrainzArtists(country);
      artistPoolCache.set(country.iso2, artists);
    }

    // Havuzdan rastgele en fazla 5 sanatçı dene
    const candidates = shuffleArray(artists).slice(0, 5);

    for (const candidate of candidates) {
      const track = await fetchItunesTrackForArtist(candidate.name);
      if (track) {
        // Seçilen sanatçıyı havuzdan çıkar ki sonraki turlarda farklı isim gelsin
        artistPoolCache.set(
          country.iso2,
          artists.filter((a) => a.id !== candidate.id)
        );
        return { ...track, country };
      }
    }
  } catch (err) {
    console.warn('MusicBrainz katmanı atlandı, bölgesel katalog kullanılıyor:', err.message);
  }

  // Yedek katman: Ülkenin kültürel/bölgesel etiketiyle rastgele parça getir
  const fallbackTrack = await fetchRegionalFallbackTrack(country);
  return { ...fallbackTrack, country };
}