export class AudioVisualizer {
  constructor(d3ContainerId, chartCanvasId) {
    this.container = d3.select(`#${d3ContainerId}`);
    this.chartCanvasId = chartCanvasId;
    this.barCount = 36;
    this.isPlaying = false;
    this.animationFrameId = null;
    this.chartInstance = null;

    this.initD3Spectrum();
    window.addEventListener('resize', () => this.handleResize());
  }

  initD3Spectrum() {
    this.container.selectAll('*').remove();

    const node = this.container.node();
    const width = node ? node.clientWidth || 420 : 420;
    const height = 44;

    this.svg = this.container
      .append('svg')
      .attr('width', '100%')
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'none');

    const defs = this.svg.append('defs');
    const gradient = defs
      .append('linearGradient')
      .attr('id', 'disco-bar-grad')
      .attr('x1', '0%')
      .attr('y1', '100%')
      .attr('x2', '0%')
      .attr('y2', '0%');

    gradient.append('stop').attr('offset', '0%').attr('stop-color', '#8c5a32');
    gradient.append('stop').attr('offset', '50%').attr('stop-color', '#2ea043');
    gradient.append('stop').attr('offset', '100%').attr('stop-color', '#56bae8');

    const initialData = Array.from({ length: this.barCount }, () => 4);
    const barSpacing = width / this.barCount;
    const barWidth = Math.max(3, barSpacing * 0.62);

    this.bars = this.svg
      .selectAll('rect')
      .data(initialData)
      .enter()
      .append('rect')
      .attr('x', (_, i) => i * barSpacing)
      .attr('y', (d) => height - d)
      .attr('width', barWidth)
      .attr('height', (d) => d)
      .attr('rx', 2)
      .attr('fill', 'url(#disco-bar-grad)')
      .attr('opacity', 0.9);
  }

  handleResize() {
    this.initD3Spectrum();
  }

  start() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.animate();
  }

  stop() {
    this.isPlaying = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    const height = 44;
    if (this.bars) {
      this.bars
        .transition()
        .duration(250)
        .attr('y', height - 4)
        .attr('height', 4);
    }
  }

  animate() {
    if (!this.isPlaying) return;

    const height = 44;
    const time = performance.now() * 0.006;

    const data = Array.from({ length: this.barCount }, (_, i) => {
      const centerWeight = 1 - Math.abs(i - this.barCount / 2) / (this.barCount / 1.6);
      const wave =
        Math.sin(time + i * 0.45) * 0.35 +
        Math.cos(time * 1.7 - i * 0.3) * 0.35 +
        Math.random() * 0.3;
      const amplitude = Math.max(0.1, Math.min(1, (wave + 0.5) * centerWeight + 0.15));
      return Math.max(4, Math.round(amplitude * (height - 4)));
    });

    this.bars
      .data(data)
      .attr('y', (d) => height - d)
      .attr('height', (d) => d);

    this.animationFrameId = requestAnimationFrame(() => this.animate());
  }

  renderSummaryChart(history) {
    const canvas = document.getElementById(this.chartCanvasId);
    if (!canvas) return;

    if (this.chartInstance) {
      this.chartInstance.destroy();
    }

    const labels = history.map((item) => `Round ${item.round} (${item.targetName})`);
    const exactPointsData = history.map((item) => (item.status === 'exact' ? item.earnedPoints : 0));
    const closePointsData = history.map((item) => (item.status === 'close' ? item.earnedPoints : 0));
    const timeData = history.map((item) => item.timeTaken);

    this.chartInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Exact Match (pts)',
            data: exactPointsData,
            backgroundColor: 'rgba(46, 160, 67, 0.88)',
            borderRadius: 6,
            grouped: false,
            yAxisID: 'y'
          },
          {
            label: 'Proximity Bonus (pts)',
            data: closePointsData,
            backgroundColor: 'rgba(184, 125, 75, 0.88)',
            borderRadius: 6,
            grouped: false,
            yAxisID: 'y'
          },
          {
            label: 'Response Time (s)',
            data: timeData,
            type: 'line',
            borderColor: '#56bae8',
            backgroundColor: '#56bae8',
            borderWidth: 2,
            tension: 0.3,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: '#f4f7f5', font: { family: 'Inter' } }
          }
        },
        scales: {
          x: {
            ticks: { color: '#a7bcc9', maxRotation: 25, minRotation: 0 },
            grid: { color: 'rgba(164, 113, 72, 0.14)' }
          },
          y: {
            type: 'linear',
            position: 'left',
            beginAtZero: true,
            ticks: { color: '#a7bcc9' },
            grid: { color: 'rgba(164, 113, 72, 0.14)' },
            title: { display: true, text: 'Points', color: '#a7bcc9' }
          },
          y1: {
            type: 'linear',
            position: 'right',
            beginAtZero: true,
            max: 25,
            ticks: { color: '#56bae8' },
            grid: { drawOnChartArea: false },
            title: { display: true, text: 'Time (s)', color: '#56bae8' }
          }
        }
      }
    });
  }
}