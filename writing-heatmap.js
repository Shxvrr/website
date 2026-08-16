(function () {
  const COLORS = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'];
  const COLORS_DARK = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Leave empty to use writing-activity.json in this repo.
  // After deploying the Google Apps Script web app, paste its URL here:
  // Example: 'https://script.google.com/macros/s/AKfycb.../exec'
  const DATA_URL = 'https://script.google.com/macros/s/AKfycbxsE-yBx8rgJPmVeuzBcMgf2Ba8hrmpW5e_IKbUA9T7GnKedehC40Se_WSyio9pi_WTgQ/exec';

  const THRESHOLDS = [1, 250, 750, 1500];

  let dailyWords = {};
  let selectedYear = new Date().getFullYear();
  let useDarkTheme = true;

  function formatDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function parseDateKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function getLevel(count) {
    if (!count || count <= 0) return 0;
    for (let i = THRESHOLDS.length - 1; i >= 0; i--) {
      if (count >= THRESHOLDS[i]) return i + 1;
    }
    return 1;
  }

  function getColors() {
    return useDarkTheme ? COLORS_DARK : COLORS;
  }

  function startOfWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d;
  }

  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function getAvailableYears() {
    const years = new Set([new Date().getFullYear()]);
    Object.keys(dailyWords).forEach((key) => years.add(parseDateKey(key).getFullYear()));
    return [...years].sort((a, b) => b - a);
  }

  function getDateRange(year) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentYear = today.getFullYear();

    if (year === currentYear) {
      const end = today;
      const start = addDays(end, -364);
      return { start, end, mode: 'rolling' };
    }

    return {
      start: new Date(year, 0, 1),
      end: new Date(year, 11, 31),
      mode: 'calendar',
    };
  }

  function buildWeeks(start, end) {
    const gridStart = startOfWeek(start);
    const weeks = [];
    let cursor = new Date(gridStart);

    while (cursor <= end || weeks.length === 0) {
      const week = [];
      for (let day = 0; day < 7; day++) {
        week.push(new Date(cursor));
        cursor = addDays(cursor, 1);
      }
      weeks.push(week);
      if (cursor > addDays(end, 7)) break;
    }

    return weeks;
  }

  function countWordsInRange(start, end) {
    let total = 0;
    const cursor = new Date(start);
    while (cursor <= end) {
      total += dailyWords[formatDateKey(cursor)] || 0;
      cursor.setDate(cursor.getDate() + 1);
    }
    return total;
  }

  function formatNumber(n) {
    return n.toLocaleString('en-US');
  }

  function formatTooltipDate(date) {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function renderSummary(total, mode) {
    const label = total === 1 ? 'word' : 'words';
    const period = mode === 'rolling' ? ' in the last year' : ` in ${selectedYear}`;
    return `${formatNumber(total)} ${label} written${period}`;
  }

  function renderMonthLabels(weeks, container) {
    container.innerHTML = '';
    let lastMonth = -1;

    weeks.forEach((week, index) => {
      const label = document.createElement('span');
      label.className = 'heatmap-month-label';

      const visibleDay = week.find((day) => day.getMonth() !== lastMonth) || week[0];
      const month = visibleDay.getMonth();

      if (month !== lastMonth) {
        label.textContent = MONTHS[month];
        lastMonth = month;
      }

      label.style.gridColumn = `${index + 1}`;
      container.appendChild(label);
    });
  }

  function renderGrid(weeks, start, end) {
    const grid = document.getElementById('heatmap-grid');
    const months = document.getElementById('heatmap-months');
    const colors = getColors();

    grid.innerHTML = '';
    grid.style.gridTemplateColumns = `repeat(${weeks.length}, 1fr)`;

    renderMonthLabels(weeks, months);
    months.style.gridTemplateColumns = `repeat(${weeks.length}, 1fr)`;

    weeks.forEach((week, weekIndex) => {
      week.forEach((day, dayIndex) => {
        const cell = document.createElement('div');
        const inRange = day >= start && day <= end;
        const count = inRange ? dailyWords[formatDateKey(day)] || 0 : 0;
        const level = inRange ? getLevel(count) : 0;

        cell.className = 'heatmap-cell';
        cell.style.backgroundColor = inRange ? colors[level] : 'transparent';
        cell.style.gridColumn = weekIndex + 1;
        cell.style.gridRow = dayIndex + 1;

        if (inRange) {
          const tooltip = document.createElement('div');
          tooltip.className = 'heatmap-tooltip';
          tooltip.textContent =
            count > 0
              ? `${formatNumber(count)} words on ${formatTooltipDate(day)}`
              : `No words written on ${formatTooltipDate(day)}`;
          cell.appendChild(tooltip);
        } else {
          cell.style.visibility = 'hidden';
        }

        grid.appendChild(cell);
      });
    });
  }

  function renderYearNav(years) {
    const nav = document.getElementById('heatmap-years');
    nav.innerHTML = '';

    years.forEach((year) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'heatmap-year-btn' + (year === selectedYear ? ' is-active' : '');
      btn.textContent = year;
      btn.addEventListener('click', () => {
        selectedYear = year;
        render();
      });
      nav.appendChild(btn);
    });
  }

  function renderLegend() {
    const legend = document.getElementById('heatmap-legend-cells');
    const colors = getColors();
    legend.innerHTML = '';

    colors.forEach((color) => {
      const cell = document.createElement('div');
      cell.className = 'heatmap-legend-cell';
      cell.style.backgroundColor = color;
      legend.appendChild(cell);
    });
  }

  function render() {
    const { start, end, mode } = getDateRange(selectedYear);
    const weeks = buildWeeks(start, end);
    const total = countWordsInRange(start, end);
    const years = getAvailableYears();

    document.getElementById('heatmap-summary').textContent = renderSummary(total, mode);
    renderGrid(weeks, start, end);
    renderYearNav(years);
    renderLegend();
  }

  async function init() {
    const sources = DATA_URL
      ? [DATA_URL, 'writing-activity.json']
      : ['writing-activity.json'];

    for (const source of sources) {
      try {
        const response = await fetch(source);
        if (response.ok) {
          const data = await response.json();
          dailyWords = data.dailyWords || {};
          break;
        }
      } catch (_) {
        // try next source
      }
    }

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
