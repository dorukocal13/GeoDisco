const LOCAL_GEOJSON_URL = './data/countries.geojson';
const REMOTE_GEOJSON_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';

export class MapManager {
  constructor(mapElementId, onCountrySelect) {
    this.onCountrySelect = onCountrySelect;
    this.isLocked = false;
    this.countryLayers = new Map();
    this.feedbackGroup = L.layerGroup();

    this.map = L.map(mapElementId, {
      center: [22, 12],
      zoom: 2.3,
      minZoom: 2,
      maxZoom: 7,
      worldCopyJump: true,
      zoomControl: true
    });

    // Etiketsiz koyu altlık harita (Ülke isimleri gizli kalsın)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO | Natural Earth',
      subdomains: 'abcd',
      maxZoom: 18
    }).addTo(this.map);

    this.feedbackGroup.addTo(this.map);
    this.tooltipEl = document.getElementById('country-tooltip');
  }

  async loadCountries() {
    let geoData;
    try {
      const localRes = await fetch(LOCAL_GEOJSON_URL);
      if (!localRes.ok) throw new Error('Yerel GeoJSON bulunamadı');
      geoData = await localRes.json();
    } catch {
      const remoteRes = await fetch(REMOTE_GEOJSON_URL);
      geoData = await remoteRes.json();
    }

    this.geoJsonLayer = L.geoJSON(geoData, {
      filter: (feature) => feature.properties.ISO_A3 !== 'ATA',
      style: () => this.defaultStyle(),
      onEachFeature: (feature, layer) => this.bindCountryEvents(feature, layer)
    }).addTo(this.map);
  }

  extractIsoCode(props) {
    if (props.ISO_A3 && props.ISO_A3 !== '-99') return props.ISO_A3;
    return props.ADM0_A3 || props.ISO_A3_EH;
  }

  defaultStyle() {
    return {
      fillColor: '#1e293b',
      weight: 1,
      opacity: 0.85,
      color: '#475569',
      fillOpacity: 0.65
    };
  }

  bindCountryEvents(feature, layer) {
    const iso = this.extractIsoCode(feature.properties);
    const name = feature.properties.NAME || feature.properties.ADMIN;
    const continent = feature.properties.CONTINENT || 'World';

    if (iso) {
      this.countryLayers.set(iso, layer);
    }

    layer.on({
      mouseover: (e) => {
        if (this.isLocked) return;
        const target = e.target;
        target.setStyle({
          fillColor: '#38bdf8',
          fillOpacity: 0.45,
          weight: 2,
          color: '#7dd3fc'
        });
        target.bringToFront();

        this.tooltipEl.textContent = name;
        this.tooltipEl.classList.remove('hidden');
      },
      mouseout: (e) => {
        if (this.isLocked) return;
        this.geoJsonLayer.resetStyle(e.target);
        this.tooltipEl.classList.add('hidden');
      },
      click: (e) => {
        if (this.isLocked) return;
        this.tooltipEl.classList.add('hidden');

        const center = layer.getBounds().getCenter();
        this.onCountrySelect({
          iso,
          name,
          continent,
          latlng: [e.latlng.lat, e.latlng.lng],
          centroid: [center.lat, center.lng]
        });
      }
    });
  }

  highlightHintContinent(targetContinent) {
    if (!this.geoJsonLayer) return;
    this.geoJsonLayer.eachLayer((layer) => {
      const props = layer.feature.properties;
      if (props.CONTINENT === targetContinent) {
        layer.setStyle({
          fillColor: '#eab308',
          fillOpacity: 0.25,
          color: '#facc15'
        });
      }
    });
  }

  showRoundResult({ guessedIso, targetIso, targetCoords, guessedCoords, distanceKm, status }) {
    this.isLocked = true;
    this.feedbackGroup.clearLayers();

    const targetLayer = this.countryLayers.get(targetIso);
    const guessedLayer = this.countryLayers.get(guessedIso);

    if (guessedLayer && guessedIso !== targetIso) {
      const guessColor = status === 'close' ? '#eab308' : '#ef4444';
      guessedLayer.setStyle({
        fillColor: guessColor,
        fillOpacity: 0.75,
        color: '#ffffff',
        weight: 2
      });
    }

    if (targetLayer) {
      targetLayer.setStyle({
        fillColor: '#22c55e',
        fillOpacity: 0.8,
        color: '#86efac',
        weight: 2.5
      });
      targetLayer.bringToFront();
    }

    if (guessedIso !== targetIso && guessedCoords && targetCoords) {
      const line = L.polyline([guessedCoords, targetCoords], {
        color: '#38bdf8',
        weight: 2.5,
        dashArray: '8, 8'
      }).addTo(this.feedbackGroup);

      const midLat = (guessedCoords[0] + targetCoords[0]) / 2;
      const midLng = (guessedCoords[1] + targetCoords[1]) / 2;

      L.tooltip({
        permanent: true,
        direction: 'center',
        className: 'distance-label'
      })
        .setLatLng([midLat, midLng])
        .setContent(`${Math.round(distanceKm).toLocaleString('tr-TR')} km`)
        .addTo(this.feedbackGroup);

      this.map.fitBounds(line.getBounds(), { padding: [70, 70], maxZoom: 4 });
    } else if (targetLayer) {
      this.map.fitBounds(targetLayer.getBounds(), { padding: [60, 60], maxZoom: 4 });
    }
  }

  resetRound() {
    this.isLocked = false;
    this.feedbackGroup.clearLayers();
    if (this.geoJsonLayer) {
      this.geoJsonLayer.eachLayer((layer) => this.geoJsonLayer.resetStyle(layer));
    }
    this.map.setView([22, 12], 2.3);
  }
}