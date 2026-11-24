const MB_BASE_URL = 'https://musicbrainz.org/ws/2/artist';
const ITUNES_BASE_URL = 'https://itunes.apple.com/search';

const artistPoolCache = new Map();
const itunesTrackCache = new Map();
let lastMbRequestTime = 0;
let musicBrainzUnavailable = false;

// Her ülke için 1960'lardan günümüze farklı dönemleri kapsayan, tekrarsız doğrulanmış yerel sanatçı havuzu (2. Katman)
const COUNTRY_MULTI_ERA_ARTISTS = {
  TR: ['Barış Manço', 'Sezen Aksu', 'Selda Bağcan', 'Tarkan', 'mor ve ötesi', 'Mabel Matiz', 'Erkin Koray', 'Duman'],
  BR: ['Jorge Ben Jor', 'João Gilberto', 'Caetano Veloso', 'Tim Maia', 'Seu Jorge', 'Anitta', 'Elis Regina', 'Gilberto Gil'],
  IN: ['A. R. Rahman', 'Lata Mangeshkar', 'Ravi Shankar', 'Arijit Singh', 'Kishore Kumar', 'Nucleya', 'Anoushka Shankar'],
  US: ['Johnny Cash', 'Stevie Wonder', 'Nirvana', 'Aretha Franklin', 'Kendrick Lamar', 'Miles Davis', 'Prince'],
  GB: ['David Bowie', 'The Clash', 'Amy Winehouse', 'Radiohead', 'Arctic Monkeys', 'Queen', 'Gorillaz'],
  JP: ['Tatsuro Yamashita', 'Ryuichi Sakamoto', 'Hikaru Utada', 'Mariya Takeuchi', 'Perfume', 'Kenshi Yonezu', 'Nujabes'],
  FR: ['Serge Gainsbourg', 'Édith Piaf', 'Daft Punk', 'Charles Aznavour', 'Françoise Hardy', 'Zaz', 'Phoenix', 'Justice'],
  IT: ['Lucio Battisti', 'Mina', 'Franco Battiato', 'Fabrizio De André', 'Eros Ramazzotti', 'Laura Pausini', 'Måneskin', 'Mahmood'],
  KR: ['Cho Yong-pil', 'IU', 'BTS', 'HYUKOH', 'BLACKPINK', 'Epik High', 'NewJeans', 'Seo Taiji'],
  MX: ['Luis Miguel', 'Natalia Lafourcade', 'Vicente Fernández', 'Café Tacvba', 'Juan Gabriel', 'Julieta Venegas', 'Peso Pluma'],
  ES: ['Paco de Lucía', 'Camarón de la Isla', 'Rosalía', 'Mecano', 'Joaquín Sabina', 'C. Tangana', 'Alejandro Sanz'],
  DE: ['Kraftwerk', 'Nena', 'Rammstein', 'Scorpions', 'Seeed', 'Moderat', 'Herbert Grönemeyer'],
  AR: ['Astor Piazzolla', 'Soda Stereo', 'Charly García', 'Mercedes Sosa', 'Gustavo Cerati', 'Carlos Gardel', 'Bizarrap'],
  GR: ['Mikis Theodorakis', 'Haris Alexiou', 'Vassilis Tsitsanis', 'Sokratis Malamas', 'Natassa Bofiliou', 'Giorgos Dalaras'],
  NG: ['Fela Kuti', 'Burna Boy', 'Wizkid', 'King Sunny Adé', 'Tems', 'Davido', 'William Onyeabor'],
  JM: ['Bob Marley', 'Peter Tosh', 'Jimmy Cliff', 'Lee "Scratch" Perry', 'Chronixx', 'Koffee', 'Toots & The Maytals'],
  IE: ['The Dubliners', 'Sinéad O\'Connor', 'Van Morrison', 'Enya', 'Thin Lizzy', 'Hozier', 'The Cranberries'],
  SE: ['ABBA', 'Robyn', 'Avicii', 'First Aid Kit', 'The Cardigans', 'Kent', 'Lykke Li'],
  EG: ['Umm Kulthum', 'Abdel Halim Hafez', 'Amr Diab', 'Mohamed Mounir', 'Cairokee', 'Hamza Namira'],
  CO: ['Carlos Vives', 'Joe Arroyo', 'Totó la Momposina', 'Bomba Estéreo', 'Juanes', 'Karol G', 'Fruko y sus Tesos'],
  CU: ['Buena Vista Social Club', 'Compay Segundo', 'Celia Cruz', 'Ibrahim Ferrer', 'Los Van Van', 'Silvio Rodríguez'],
  PT: ['Amália Rodrigues', 'Mariza', 'Salvador Sobral', 'Carlos Paredes', 'Carminho', 'Madredeus'],
  ZA: ['Miriam Makeba', 'Hugh Masekela', 'Ladysmith Black Mambazo', 'Black Coffee', 'Tyla', 'Brenda Fassie'],
  RU: ['Kino', 'Vladimir Vysotsky', 'Zemfira', 'Mumiy Troll', 't.A.T.u.', 'DDT', 'Alla Pugacheva'],
  ML: ['Ali Farka Touré', 'Tinariwen', 'Toumani Diabaté', 'Amadou & Mariam', 'Salif Keita', 'Oumou Sangaré', 'Fatoumata Diawara', 'Rokia Traoré', 'Habib Koité', 'Bassekou Kouyaté'],
  MN: ['The HU', 'Batzorig Vaanchig', 'Khusugtun', 'Uuhai', 'Enkhjargal Dandarvaanchig', 'Nominjin', 'Altan Urag', 'Sedaa'],
  GE: ['Rustavi Choir', 'Hamlet Gonashvili', 'Nino Katamadze', 'Trio Mandili', 'Mgzavrebi', 'Lela Tsurtsumia', 'Bera', 'Niaz Diasamidze'],
  IS: ['Björk', 'Sigur Rós', 'Ólafur Arnalds', 'Of Monsters and Men', 'Ásgeir', 'Emilíana Torrini', 'Kaleo', 'Daði Freyr', 'GusGus'],
  SN: ['Youssou N\'Dour', 'Baaba Maal', 'Orchestra Baobab', 'Cheikh Lô', 'Ismaël Lô', 'Omar Pene', 'Viviane Chidid', 'Thione Seck'],
  ID: ['Iwan Fals', 'Rhoma Irama', 'Chrisye', 'NIKI', 'Rich Brian', 'Dewa 19', 'Tulus', 'Raisa', 'Sheila On 7'],
  PE: ['Susana Baca', 'Chabuca Granda', 'Los Mirlos', 'Eva Ayllón', 'Juaneco y Su Combo', 'Gian Marco', 'Pedro Suárez-Vértiz', 'Yma Sumac'],
  ET: ['Mulatu Astatke', 'Mahmoud Ahmed', 'Aster Aweke', 'Tilahun Gessesse', 'Hailu Mergia', 'Teddy Afro', 'Gétatchèw Mèkurya', 'Ejigayehu Shibabaw'],
  AZ: ['Alim Qasimov', 'Rashid Behbudov', 'Vagif Mustafazadeh', 'Aziza Mustafa Zadeh', 'Üzeyir Hacıbəyov', 'Muslim Magomayev', 'Polad Bülbüloğlu', 'Röya'],
  LB: ['Fairuz', 'Marcel Khalife', 'Mashrou\' Leila', 'Nancy Ajram', 'Ziad Rahbani', 'Elissa', 'Wael Kfoury', 'Majida El Roumi'],
  FI: ['Nightwish', 'HIM', 'Värttinä', 'Apocalyptica', 'The Rasmus', 'Käärijä', 'Children of Bodom', 'Darude', 'Lordi'],
  CL: ['Víctor Jara', 'Violeta Parra', 'Los Jaivas', 'Mon Laferte', 'Inti-Illimani', 'Los Prisioneros', 'Ana Tijoux', 'Los Bunkers']
};

const FOREIGN_NATIONALITY_TERMS = {
  US: ['american', 'united states', 'u.s.'],
  GB: ['british', 'english', 'scottish', 'welsh', 'uk'],
  CA: ['canadian'],
  AU: ['australian'],
  DE: ['german'],
  FR: ['french'],
  IT: ['italian'],
  ES: ['spanish'],
  KR: ['korean'],
  JP: ['japanese'],
  BR: ['brazilian'],
  TR: ['turkish']
};

function shuffleArray(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function normalizeArtistKey(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]/g, '');
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function fetchItunesViaJsonp(url, timeoutMs = 7000) {
  return new Promise((resolve) => {
    const callbackName = `geodisco_cb_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const script = document.createElement('script');
    let settled = false;

    const cleanup = () => {
      if (script.parentNode) script.parentNode.removeChild(script);
      delete window[callbackName];
    };

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve(null);
      }
    }, timeoutMs);

    window[callbackName] = (data) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        cleanup();
        resolve(data);
      }
    };

    script.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        cleanup();
        resolve(null);
      }
    };

    script.src = `${url}&callback=${callbackName}`;
    document.head.appendChild(script);
  });
}

function hasConflictingNationality(disambiguation, expectedIso2) {
  if (!disambiguation) return false;
  const text = disambiguation.toLowerCase();

  for (const [iso, keywords] of Object.entries(FOREIGN_NATIONALITY_TERMS)) {
    if (iso === expectedIso2) continue;
    if (keywords.some((kw) => new RegExp(`\\b${kw}\\b`, 'i').test(text))) {
      return true;
    }
  }
  return false;
}

function isVerifiedNativeArtist(artist, expectedIso2) {
  if (!artist || !artist.name || artist.name.length < 2) return false;
  if (artist.country !== expectedIso2) return false;
  if (typeof artist.score === 'number' && artist.score < 90) return false;
  if (!Array.isArray(artist.tags) || artist.tags.length === 0) return false;
  if (hasConflictingNationality(artist.disambiguation, expectedIso2)) return false;

  const lowerName = artist.name.toLowerCase();
  const lowerDisambig = (artist.disambiguation || '').toLowerCase();
  const bannedKeywords = ['tribute', 'karaoke', 'various artists', 'unknown', 'cover band', 'orchestra studio'];

  if (bannedKeywords.some((kw) => lowerName.includes(kw) || lowerDisambig.includes(kw))) {
    return false;
  }

  return true;
}

async function fetchMusicBrainzArtists(country) {
  const now = Date.now();
  const elapsed = now - lastMbRequestTime;
  if (elapsed < 1100) {
    await new Promise((resolve) => setTimeout(resolve, 1100 - elapsed));
  }
  lastMbRequestTime = Date.now();

  const maxPage =
    country.difficulty === 'easy'
      ? 1
      : country.difficulty === 'medium'
      ? 3
      : 5;
  const randomOffset = Math.floor(Math.random() * maxPage) * 100;

  const query = encodeURIComponent(`country:${country.iso2} AND tag:*`);
  const url = `${MB_BASE_URL}?query=${query}&limit=100&offset=${randomOffset}&fmt=json`;

  const response = await fetchWithTimeout(
    url,
    { headers: { Accept: 'application/json' } },
    2200
  );

  if (!response.ok) {
    throw new Error(`MusicBrainz HTTP ${response.status}`);
  }

  const data = await response.json();
  let artists = (data.artists || []).filter((a) => isVerifiedNativeArtist(a, country.iso2));

  if (artists.length === 0 && randomOffset > 0) {
    await new Promise((resolve) => setTimeout(resolve, 1100));
    lastMbRequestTime = Date.now();
    const retryRes = await fetchWithTimeout(
      `${MB_BASE_URL}?query=${query}&limit=100&offset=0&fmt=json`,
      { headers: { Accept: 'application/json' } },
      2200
    );
    if (retryRes.ok) {
      const retryData = await retryRes.json();
      artists = (retryData.artists || []).filter((a) => isVerifiedNativeArtist(a, country.iso2));
    }
  }

  return artists;
}

async function fetchItunesTrackForArtist(artistName, allowLooseMatch = false) {
  const cacheKey = `${artistName.toLowerCase()}_${allowLooseMatch}`;
  if (itunesTrackCache.has(cacheKey)) {
    const cachedList = itunesTrackCache.get(cacheKey);
    if (!cachedList || cachedList.length === 0) return null;
    return cachedList[Math.floor(Math.random() * cachedList.length)];
  }

  const term = encodeURIComponent(artistName);
  const url = `${ITUNES_BASE_URL}?term=${term}&media=music&entity=song&limit=15`;

  let data = null;
  try {
    const res = await fetchWithTimeout(url, {}, 7500);
    if (res.ok) {
      data = await res.json();
    }
  } catch {
    // Mobil tarayıcı fetch'i engellerse JSONP üzerinden dene
  }

  if (!data) {
    data = await fetchItunesViaJsonp(url, 7500);
  }

  if (!data || !Array.isArray(data.results)) {
    return null;
  }

  const targetKey = normalizeArtistKey(artistName);

  const validTracks = data.results
    .filter((item) => {
      if (!item.previewUrl || !item.previewUrl.startsWith('https://') || !item.artistName) {
        return false;
      }
      const collection = (item.collectionName || '').toLowerCase();
      const trackLower = (item.trackName || '').toLowerCase();
      if (
        collection.includes('karaoke') ||
        collection.includes('tribute') ||
        trackLower.includes('karaoke')
      ) {
        return false;
      }

      if (allowLooseMatch) return true;

      const returnedKey = normalizeArtistKey(item.artistName);
      if (!returnedKey || !targetKey) return false;

      return (
        returnedKey === targetKey ||
        (targetKey.length >= 5 && returnedKey.includes(targetKey))
      );
    })
    .map((picked) => ({
      title: picked.trackName,
      artist: picked.artistName,
      genre: picked.primaryGenreName || 'World Music',
      releaseYear: picked.releaseDate ? new Date(picked.releaseDate).getFullYear() : null,
      previewUrl: picked.previewUrl
    }));

  if (validTracks.length === 0) return null;

  itunesTrackCache.set(cacheKey, validTracks);
  return validTracks[Math.floor(Math.random() * validTracks.length)];
}

export async function getRandomTrackForCountry(country) {
  // 1. Katman: MusicBrainz yerel sanatçı havuzu (mobil ağda engellenirse anında 2. katmana geçer)
  if (!musicBrainzUnavailable) {
    try {
      let artists = artistPoolCache.get(country.iso2);

      if (!artists || artists.length === 0) {
        artists = await fetchMusicBrainzArtists(country);
        artistPoolCache.set(country.iso2, artists);
      }

      const candidates = shuffleArray(artists).slice(0, 2);

      for (const candidate of candidates) {
        const track = await fetchItunesTrackForArtist(candidate.name, false);
        if (track) {
          artistPoolCache.set(
            country.iso2,
            artists.filter((a) => a.id !== candidate.id)
          );
          return { ...track, country };
        }
      }
    } catch (err) {
      musicBrainzUnavailable = true;
      console.warn('MusicBrainz skipped on mobile/restricted network:', err.message);
    }
  }

  // 2. Katman: Ülkenin doğrulanmış çok dönemli yerel sanatçı listesinden tekil sıralı sorgu (Apple rate-limit dostu)
  const nativeRoster = shuffleArray(COUNTRY_MULTI_ERA_ARTISTS[country.iso2] || []);

  for (const artistName of nativeRoster) {
    const track = await fetchItunesTrackForArtist(artistName, false);
    if (track) {
      return { ...track, country };
    }
  }

  // 3. Katman: Yedek esnek arama (hiçbir turun boş dönmemesi için)
  if (nativeRoster.length > 0) {
    const looseTrack = await fetchItunesTrackForArtist(nativeRoster[0], true);
    if (looseTrack) {
      return { ...looseTrack, country };
    }
  }

  throw new Error(`No verified native track found for ${country.name}`);
}