const LOCAL_GEOJSON_URL = './data/countries.geojson';
const JSDELIVR_GEOJSON_URL =
  'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_admin_0_countries.geojson';
const GITHUB_GEOJSON_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';

const FULL_WORLD_BOUNDS = L.latLngBounds([
  [-58, -180],
  [84, 180]
]);

export class MapManager {
  constructor(mapElementId, onCountrySelect) {
    this.onCountrySelect = onCountrySelect;
    this.isLocked = false;
    this.hoveredLayer = null;
    this.activeHintContinent = null;
    this.countryLayers = new Map();
    this.countryLabels = [];
    this.labelsGroup = L.layerGroup();
    this.feedbackGroup = L.layerGroup();

    this.map = L.map(mapElementId, {
      zoomSnap: 0.05,
      zoomDelta: 0.5,
      dragging: true,
      touchZoom: true,
      tap: true,
      tapTolerance: 15,
      doubleClickZoom: true,
      scrollWheelZoom: true,
      boxZoom: true,
      keyboard: false,
      zoomControl: true,
      worldCopyJump: false,
      maxZoom: 8,
      maxBoundsViscosity: 0.85,
      attributionControl: true
    });

    this.map.attributionControl.setPrefix(false);
    this.map.attributionControl.addAttribution('Natural Earth Vector Data');

    this.addResetViewControl();
    this.labelsGroup.addTo(this.map);
    this.feedbackGroup.addTo(this.map);
    this.tooltipEl = document.getElementById('country-tooltip');

    this.map.on('zoomend', () => this.updateCountryLabels());
    this.map.on('mouseout', () => {
      if (!this.isLocked) {
        this.clearHoveredLayer();
      }
    });

    this.fitSingleWorld();
    setTimeout(() => this.fitSingleWorld(), 80);
    window.addEventListener('resize', () => this.fitSingleWorld());
  }

  addResetViewControl() {
    const ResetControl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: () => {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        const btn = L.DomUtil.create('a', 'reset-view-btn', container);
        btn.href = '#';
        btn.title = 'Fit Full World';
        btn.innerHTML = '🌍';

        L.DomEvent.disableClickPropagation(btn);
        L.DomEvent.on(btn, 'click', (e) => {
          L.DomEvent.preventDefault(e);
          this.fitSingleWorld();
        });
        return container;
      }
    });

    this.map.addControl(new ResetControl());
  }

  fitSingleWorld() {
    this.map.invalidateSize();
    this.map.setMinZoom(0);
    this.map.setMaxBounds(null);

    const isMobile = window.innerWidth <= 768;
    const pad = isMobile ? [6, 6] : [18, 18];

    this.map.fitBounds(FULL_WORLD_BOUNDS, {
      padding: pad,
      animate: false
    });

    const fittedZoom = this.map.getZoom();
    this.map.setMinZoom(fittedZoom);
    this.map.setMaxBounds([
      [-85, -180],
      [85, 180]
    ]);

    this.updateCountryLabels();
  }

  async loadCountries() {
    const sources = [LOCAL_GEOJSON_URL, JSDELIVR_GEOJSON_URL, GITHUB_GEOJSON_URL];
    let geoData = null;

    for (const url of sources) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          geoData = await res.json();
          break;
        }
      } catch {
        // Try next source
      }
    }

    if (!geoData) {
      throw new Error('Could not load country boundaries GeoJSON.');
    }

    this.labelsGroup.clearLayers();
    this.countryLabels = [];

    this.geoJsonLayer = L.geoJSON(geoData, {
      filter: (feature) => feature.properties.ISO_A3 !== 'ATA',
      style: () => this.defaultStyle(),
      onEachFeature: (feature, layer) => this.bindCountryEvents(feature, layer)
    }).addTo(this.map);

    this.fitSingleWorld();
  }

  extractIsoCode(props) {
    if (props.ISO_A3 && props.ISO_A3 !== '-99') return props.ISO_A3;
    return props.ADM0_A3 || props.ISO_A3_EH;
  }

  getMainlandMetrics(feature, layer) {
    const geom = feature.geometry;
    if (!geom || !geom.coordinates) {
      const center = layer.getBounds().getCenter();
      return { center: [center.lat, center.lng], areaScore: 10 };
    }

    const polygons =
      geom.type === 'Polygon'
        ? [geom.coordinates]
        : geom.type === 'MultiPolygon'
        ? geom.coordinates
        : [];

    let bestCenter = null;
    let maxAreaScore = -1;

    for (const poly of polygons) {
      const outerRing = poly[0];
      if (!outerRing || outerRing.length === 0) continue;

      let minLng = Infinity;
      let maxLng = -Infinity;
      let minLat = Infinity;
      let maxLat = -Infinity;

      for (const [lng, lat] of outerRing) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }

      const areaScore = Math.max(0.1, (maxLat - minLat) * (maxLng - minLng));
      if (areaScore > maxAreaScore) {
        maxAreaScore = areaScore;
        bestCenter = [(minLat + maxLat) / 2, (minLng + maxLng) / 2];
      }
    }

    if (!bestCenter) {
      const fallback = layer.getBounds().getCenter();
      return { center: [fallback.lat, fallback.lng], areaScore: 10 };
    }

    return { center: bestCenter, areaScore: maxAreaScore };
  }

  defaultStyle() {
    return {
      fillColor: '#543d2b',
      weight: 1,
      opacity: 0.95,
      color: '#8c6647',
      fillOpacity: 0.88
    };
  }

  hintContinentStyle() {
    return {
      fillColor: '#2b93c9',
      weight: 1.5,
      opacity: 0.95,
      color: '#7dd3fc',
      fillOpacity: 0.65
    };
  }

  restoreLayerStyle(layer) {
    if (!layer) return;
    const continent = layer.feature?.properties?.CONTINENT;
    if (this.activeHintContinent && continent === this.activeHintContinent) {
      layer.setStyle(this.hintContinentStyle());
    } else {
      layer.setStyle(this.defaultStyle());
    }
  }

  clearHoveredLayer() {
    if (this.hoveredLayer) {
      this.restoreLayerStyle(this.hoveredLayer);
      this.hoveredLayer = null;
    }
    if (this.tooltipEl) {
      this.tooltipEl.classList.add('hidden');
    }
  }

  bindCountryEvents(feature, layer) {
    const iso = this.extractIsoCode(feature.properties);
    const name = feature.properties.NAME || feature.properties.ADMIN;
    const continent = feature.properties.CONTINENT || 'World';

    if (iso) {
      this.countryLayers.set(iso, layer);
    }

    const { center, areaScore } = this.getMainlandMetrics(feature, layer);
    const labelIcon = L.divIcon({
      className: 'country-label-wrapper',
      html: `<span class="country-map-label">${name}</span>`,
      iconSize: [0, 0]
    });

    const labelMarker = L.marker(center, {
      icon: labelIcon,
      interactive: false,
      keyboard: false
    });

    this.countryLabels.push({
      name,
      areaScore,
      marker: labelMarker
    });

    layer.on({
      mouseover: (e) => {
        if (this.isLocked) return;
        if (e.originalEvent && e.originalEvent.pointerType === 'touch') return;

        const target = e.target;

        if (this.hoveredLayer && this.hoveredLayer !== target) {
          this.restoreLayerStyle(this.hoveredLayer);
        }

        this.hoveredLayer = target;
        target.setStyle({
          fillColor: '#2ea043',
          fillOpacity: 0.78,
          weight: 2,
          color: '#86efac'
        });

        this.tooltipEl.textContent = name;
        this.tooltipEl.classList.remove('hidden');
      },
      mouseout: (e) => {
        if (this.isLocked) return;
        this.restoreLayerStyle(e.target);
        if (this.hoveredLayer === e.target) {
          this.hoveredLayer = null;
        }
        this.tooltipEl.classList.add('hidden');
      },
      click: (e) => {
        if (this.isLocked) return;
        this.clearHoveredLayer();

        const boundsCenter = layer.getBounds().getCenter();
        this.onCountrySelect({
          iso,
          name,
          continent,
          latlng: [e.latlng.lat, e.latlng.lng],
          centroid: [boundsCenter.lat, boundsCenter.lng]
        });
      }
    });
  }

  updateCountryLabels() {
    if (!this.map || this.countryLabels.length === 0) return;

    const zoom = this.map.getZoom();
    const minAreaThreshold = zoom < 2.75 ? 85 : zoom < 3.8 ? 22 : 0;

    for (const item of this.countryLabels) {
      const shouldShow = item.areaScore >= minAreaThreshold;
      const isAdded = this.labelsGroup.hasLayer(item.marker);

      if (shouldShow && !isAdded) {
        this.labelsGroup.addLayer(item.marker);
      } else if (!shouldShow && isAdded) {
        this.labelsGroup.removeLayer(item.marker);
      }
    }
  }

  highlightHintContinent(targetContinent) {
    this.activeHintContinent = targetContinent;
    if (!this.geoJsonLayer) return;

    this.geoJsonLayer.eachLayer((layer) => {
      if (layer === this.hoveredLayer) return;
      this.restoreLayerStyle(layer);
    });
  }

  showRoundResult({ guessedIso, targetIso, targetCoords, guessedCoords, distanceKm, status }) {
    this.isLocked = true;
    this.hoveredLayer = null;
    this.activeHintContinent = null;
    this.feedbackGroup.clearLayers();

    if (this.geoJsonLayer) {
      this.geoJsonLayer.eachLayer((layer) => layer.setStyle(this.defaultStyle()));
    }

    const targetLayer = this.countryLayers.get(targetIso);
    const guessedLayer = this.countryLayers.get(guessedIso);

    if (guessedLayer && guessedIso !== targetIso) {
      const guessColor = status === 'close' ? '#b87d4b' : '#dc2626';
      guessedLayer.setStyle({
        fillColor: guessColor,
        fillOpacity: 0.88,
        color: '#ffffff',
        weight: 2
      });
    }

    if (targetLayer) {
      targetLayer.setStyle({
        fillColor: '#22c55e',
        fillOpacity: 0.92,
        color: '#bbf7d0',
        weight: 2.5
      });
      targetLayer.bringToFront();
    }

    if (guessedIso !== targetIso && guessedCoords && targetCoords) {
      L.polyline([guessedCoords, targetCoords], {
        color: '#56bae8',
        weight: 2.5,
        dashArray: '8, 8'
      }).addTo(this.feedbackGroup);

      L.circleMarker(targetCoords, {
        radius: 5,
        color: '#bbf7d0',
        fillColor: '#22c55e',
        fillOpacity: 1
      }).addTo(this.feedbackGroup);

      const midLat = (guessedCoords[0] + targetCoords[0]) / 2;
      const midLng = (guessedCoords[1] + targetCoords[1]) / 2;

      L.tooltip({
        permanent: true,
        direction: 'center',
        className: 'distance-label'
      })
        .setLatLng([midLat, midLng])
        .setContent(`${Math.round(distanceKm).toLocaleString('en-US')} km`)
        .addTo(this.feedbackGroup);
    }
  }

  resetRound() {
    this.isLocked = false;
    this.hoveredLayer = null;
    this.activeHintContinent = null;
    this.feedbackGroup.clearLayers();
    if (this.geoJsonLayer) {
      this.geoJsonLayer.eachLayer((layer) => layer.setStyle(this.defaultStyle()));
    }
    this.fitSingleWorld();
  }
}