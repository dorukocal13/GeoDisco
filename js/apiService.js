const MB_BASE_URL = 'https://musicbrainz.org/ws/2/artist';
const ITUNES_BASE_URL = 'https://itunes.apple.com/search';

const artistPoolCache = new Map();
let lastMbRequestTime = 0;

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

  // 1. Ülke kodu birebir eşleşmeli
  if (artist.country !== expectedIso2) return false;

  // 2. Sadece yüksek güvenilirlikli ve topluluk tarafından etiketlenmiş gerçek sanatçıları al
  if (typeof artist.score === 'number' && artist.score < 90) return false;
  if (!Array.isArray(artist.tags) || artist.tags.length === 0) return false;

  // 3. Yabancı uyruk açıklaması varsa reddet
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

  // Zorluk arttıkça daha geniş ve derin bir yerel sanatçı havuzundan (100 -> 300 -> 500) seçim yap
  const maxPage =
    country.difficulty === 'easy'
      ? 1
      : country.difficulty === 'medium'
      ? 3
      : 5;
  const randomOffset = Math.floor(Math.random() * maxPage) * 100;

  const query = encodeURIComponent(`country:${country.iso2} AND tag:*`);
  const url = `${MB_BASE_URL}?query=${query}&limit=100&offset=${randomOffset}&fmt=json`;

  const response = await fetch(url, {
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`MusicBrainz HTTP ${response.status}`);
  }

  const data = await response.json();
  let artists = (data.artists || []).filter((a) => isVerifiedNativeArtist(a, country.iso2));

  // Küçük ülkelerde derin sayfa (offset > 0) boş dönerse ilk 100 sanatçıya düş
  if (artists.length === 0 && randomOffset > 0) {
    await new Promise((resolve) => setTimeout(resolve, 1100));
    lastMbRequestTime = Date.now();
    const retryRes = await fetch(`${MB_BASE_URL}?query=${query}&limit=100&offset=0&fmt=json`);
    const retryData = await retryRes.json();
    artists = (retryData.artists || []).filter((a) => isVerifiedNativeArtist(a, country.iso2));
  }

  return artists;
}

async function fetchItunesTrackForArtist(artistName) {
  const term = encodeURIComponent(artistName);
  const url = `${ITUNES_BASE_URL}?term=${term}&country=US&media=music&entity=song&limit=15`;

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  const normalizedTarget = artistName.toLowerCase().trim();

  const validTracks = (data.results || []).filter((item) => {
    if (!item.previewUrl || !item.previewUrl.startsWith('https://') || !item.artistName) {
      return false;
    }
    const returnedArtist = item.artistName.toLowerCase().trim();
    const collection = (item.collectionName || '').toLowerCase();
    if (collection.includes('karaoke') || collection.includes('tribute')) return false;

    return returnedArtist === normalizedTarget;
  });

  if (validTracks.length === 0) return null;

  const picked = validTracks[Math.floor(Math.random() * validTracks.length)];
  return {
    title: picked.trackName,
    artist: picked.artistName,
    genre: picked.primaryGenreName || 'World Music',
    releaseYear: picked.releaseDate ? new Date(picked.releaseDate).getFullYear() : null,
    previewUrl: picked.previewUrl
  };
}

export async function getRandomTrackForCountry(country) {
  // 1. Katman: MusicBrainz etiketli yerel sanatçı havuzundan rastgele parça çek
  try {
    let artists = artistPoolCache.get(country.iso2);

    if (!artists || artists.length === 0) {
      artists = await fetchMusicBrainzArtists(country);
      artistPoolCache.set(country.iso2, artists);
    }

    const candidates = shuffleArray(artists).slice(0, 4);

    for (const candidate of candidates) {
      const track = await fetchItunesTrackForArtist(candidate.name);
      if (track) {
        artistPoolCache.set(
          country.iso2,
          artists.filter((a) => a.id !== candidate.id)
        );
        return { ...track, country };
      }
    }
  } catch (err) {
    console.warn('MusicBrainz layer skipped, switching to verified local roster:', err.message);
  }

  // 2. Katman: Ülkenin çok dönemli doğrulanmış yerel sanatçı listesinden rastgele parça getir
  const nativeRoster = shuffleArray(COUNTRY_MULTI_ERA_ARTISTS[country.iso2] || []);
  for (const artistName of nativeRoster) {
    const track = await fetchItunesTrackForArtist(artistName);
    if (track) {
      return { ...track, country };
    }
  }

  throw new Error(`No verified native track found for ${country.name}`);
}