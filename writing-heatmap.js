(function () {
  const COLORS = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'];
  const COLORS_DARK = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const DATA_URL = 'https://script.google.com/macros/s/AKfycbxsE-yBx8rgJPmVeuzBcMgf2Ba8hrmpW5e_IKbUA9T7GnKedehC40Se_WSyio9pi_WTgQ/exec';

  const THRESHOLDS = [1, 250, 750, 1500];

  let dailyWords = {};
  let selectedYear = new Date().getFullYear();
  let lastUpdated = '';

  function formatDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function normalizeDateKey(key) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      return key;
    }

    const parsed = new Date(key);
    if (!isNaN(parsed.getTime())) {
      return formatDateKey(parsed);
    }

    return null;
  }

  function normalizeDailyWords(raw) {
    const normalized = {};

    Object.entries(raw || {}).forEach(function ([key, words]) {
      const dateKey = normalizeDateKey(key);
      const count = Number(words) || 0;
      if (dateKey && count > 0) {
        normalized[dateKey] = count;
      }
    });

    return normalized;
  }

  function parseDateKey(key) {
    const normalized = normalizeDateKey(key);
    if (!normalized) {
      return new Date(NaN);
    }
    const [y, m, d] = normalized.split('-').map(Number);
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
    return COLORS_DARK;
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
    const years = new Set();

    Object.keys(dailyWords).forEach(function (key) {
      const year = parseDateKey(key).getFullYear();
      if (!isNaN(year)) {
        years.add(year);
      }
    });

    if (years.size === 0) {
      years.add(new Date().getFullYear());
    }

    return [...years].sort(function (a, b) {
      return b - a;
    });
  }

  function getDateRange(year) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentYear = today.getFullYear();

    if (year === currentYear) {
      return {
        start: addDays(today, -364),
        end: today,
        mode: 'rolling',
      };
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
    if (!isFinite(n)) return '0';
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
    const updated = lastUpdated ? ` · Updated ${lastUpdated}` : '';
    return `${formatNumber(total)} ${label} written${period}${updated}`;
  }

  function renderMonthLabels(weeks, container) {
    container.innerHTML = '';
    let lastMonth = -1;

    weeks.forEach(function (week, index) {
      const label = document.createElement('span');
      label.className = 'heatmap-month-label';

      const visibleDay = week.find(function (day) {
        return day.getMonth() !== lastMonth;
      }) || week[0];
      const month = visibleDay.getMonth();

      if (month !== lastMonth) {
        label.textContent = MONTHS[month];
        lastMonth = month;
      }

      label.style.gridColumn = String(index + 1);
      container.appendChild(label);
    });
  }

  function renderGrid(weeks, start, end) {
    const grid = document.getElementById('heatmap-grid');
    const months = document.getElementById('heatmap-months');
    const colors = getColors();

    grid.innerHTML = '';
    grid.style.gridTemplateColumns = `repeat(${weeks.length}, 11px)`;

    renderMonthLabels(weeks, months);
    months.style.gridTemplateColumns = `repeat(${weeks.length}, 11px)`;

    weeks.forEach(function (week, weekIndex) {
      week.forEach(function (day, dayIndex) {
        const cell = document.createElement('div');
        const inRange = day >= start && day <= end;
        const count = inRange ? dailyWords[formatDateKey(day)] || 0 : 0;
        const level = inRange ? getLevel(count) : 0;

        cell.className = 'heatmap-cell';
        cell.style.backgroundColor = inRange ? colors[level] : 'transparent';
        cell.style.gridColumn = String(weekIndex + 1);
        cell.style.gridRow = String(dayIndex + 1);

        if (inRange) {
          const tooltip = document.createElement('div');
          tooltip.className = 'heatmap-tooltip';
          tooltip.textContent = count > 0
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

    years.forEach(function (year) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'heatmap-year-btn' + (year === selectedYear ? ' is-active' : '');
      btn.textContent = String(year);
      btn.addEventListener('click', function () {
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

    colors.forEach(function (color) {
      const cell = document.createElement('div');
      cell.className = 'heatmap-legend-cell';
      cell.style.backgroundColor = color;
      legend.appendChild(cell);
    });
  }

  function render() {
    const years = getAvailableYears();

    if (!years.includes(selectedYear)) {
      selectedYear = years[0];
    }

    const range = getDateRange(selectedYear);
    const weeks = buildWeeks(range.start, range.end);
    const total = countWordsInRange(range.start, range.end);

    document.getElementById('heatmap-summary').textContent = renderSummary(total, range.mode);
    renderGrid(weeks, range.start, range.end);
    renderYearNav(years);
    renderLegend();
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      redirect: 'follow',
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  }

  async function init() {
    const sources = DATA_URL
      ? [`${DATA_URL}?t=${Date.now()}`, `writing-activity.json?t=${Date.now()}`]
      : [`writing-activity.json?t=${Date.now()}`];

    for (const source of sources) {
      try {
        const data = await fetchJson(source);
        dailyWords = normalizeDailyWords(data.dailyWords);
        lastUpdated = data.lastUpdated || '';
        if (Object.keys(dailyWords).length > 0) {
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
