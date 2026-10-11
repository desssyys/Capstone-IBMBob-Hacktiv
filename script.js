/**
 * script.js — Employee Onboarding Dashboard
 * ─────────────────────────────────────────
 * Responsibilities:
 *   1. Fetch employee data from data.json
 *   2. Maintain filter state (department + status)
 *   3. Compute and render KPI cards
 *   4. Render / update Chart.js charts (doughnut + bar)
 *   5. Render / update the employee table
 *   6. Wire up filter controls and reset button
 */

'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Colour palette shared across charts and status badges */
const STATUS_COLORS = {
  'Completed':   { bg: '#10b981', light: 'bg-emerald-100 text-emerald-700' },
  'In Progress': { bg: '#f59e0b', light: 'bg-amber-100   text-amber-700'   },
  'Not Started': { bg: '#ef4444', light: 'bg-red-100     text-red-700'     },
};

const DEPT_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444'];

const DEPARTMENTS = ['Engineering', 'HR', 'Marketing', 'Finance', 'Sales'];

// ─── State ───────────────────────────────────────────────────────────────────

/** Full unfiltered dataset loaded from data.json */
let allEmployees = [];

/** Currently active filter values */
let activeFilters = { department: 'All', status: 'All' };

/** Chart.js instances – kept for destroy/re-render on filter change */
let chartStatus     = null;
let chartDepartment = null;

// ─── Data Fetching ───────────────────────────────────────────────────────────

/**
 * Fetch the employee dataset from data.json.
 * Shows a user-friendly error in the table body if the fetch fails.
 */
async function loadData() {
  try {
    const response = await fetch('data.json');

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} – could not load data.json`);
    }

    allEmployees = await response.json();

    // Stamp the last-updated badge with the current time
    const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    document.getElementById('last-updated').textContent = `Last updated: ${stamp}`;

    // Initial render with no filters applied
    render();
  } catch (err) {
    console.error('[Dashboard] Failed to load data:', err);

    document.getElementById('table-body').innerHTML = `
      <tr>
        <td colspan="5" class="px-4 py-8 text-center text-red-500 text-sm">
          ⚠️ Unable to load employee data. Make sure you are serving the files via a local server
          and that <code>data.json</code> exists in the same directory.<br/>
          <span class="text-slate-400 text-xs mt-1 block">${err.message}</span>
        </td>
      </tr>`;
  }
}

// ─── Filtering ───────────────────────────────────────────────────────────────

/**
 * Returns the subset of allEmployees that matches the active filters.
 * @returns {Array} filtered employee records
 */
function getFilteredData() {
  return allEmployees.filter(emp => {
    const deptMatch   = activeFilters.department === 'All' || emp.department === activeFilters.department;
    const statusMatch = activeFilters.status     === 'All' || emp.status     === activeFilters.status;
    return deptMatch && statusMatch;
  });
}

// ─── KPI Computation ─────────────────────────────────────────────────────────

/**
 * Computes KPI values from a filtered dataset.
 * @param {Array} data – filtered employee records
 * @returns {{ total: number, avgCompletion: number, avgSatisfaction: number }}
 */
function computeKPIs(data) {
  const total = data.length;

  if (total === 0) {
    return { total: 0, avgCompletion: 0, avgSatisfaction: 0 };
  }

  const avgCompletion   = data.reduce((sum, e) => sum + e.completionRate,  0) / total;
  const avgSatisfaction = data.reduce((sum, e) => sum + e.feedbackScore,   0) / total;

  return {
    total,
    avgCompletion:   Math.round(avgCompletion),
    avgSatisfaction: avgSatisfaction.toFixed(1),
  };
}

// ─── KPI Rendering ───────────────────────────────────────────────────────────

/**
 * Updates the KPI card text nodes with computed values.
 * @param {{ total, avgCompletion, avgSatisfaction }} kpis
 */
function renderKPIs(kpis) {
  document.getElementById('kpi-total').textContent        = kpis.total;
  document.getElementById('kpi-completion').textContent   = `${kpis.avgCompletion}%`;
  document.getElementById('kpi-satisfaction').textContent = `${kpis.avgSatisfaction} / 5`;
}

// ─── Status Distribution Chart (Doughnut) ────────────────────────────────────

/**
 * Builds the data payload for the status doughnut chart.
 * @param {Array} data – filtered records
 * @returns {{ labels: string[], counts: number[], colors: string[] }}
 */
function buildStatusChartData(data) {
  const labels = Object.keys(STATUS_COLORS);
  const counts = labels.map(label => data.filter(e => e.status === label).length);
  const colors = labels.map(label => STATUS_COLORS[label].bg);
  return { labels, counts, colors };
}

/**
 * Creates or updates the doughnut chart for onboarding status distribution.
 * Destroys the previous instance before re-creating to avoid canvas conflicts.
 * @param {Array} data – filtered records
 */
function renderStatusChart(data) {
  const { labels, counts, colors } = buildStatusChartData(data);
  const ctx = document.getElementById('chart-status').getContext('2d');

  // Destroy stale instance if it exists
  if (chartStatus) {
    chartStatus.destroy();
    chartStatus = null;
  }

  chartStatus = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data:            counts,
        backgroundColor: colors,
        borderColor:     '#ffffff',
        borderWidth:     3,
        hoverOffset:     8,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      cutout:              '60%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding:   16,
            font:      { size: 12 },
            color:     '#475569',
            usePointStyle: true,
            pointStyleWidth: 10,
          },
        },
        tooltip: {
          callbacks: {
            /** Show count + percentage in tooltip */
            label(ctx) {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct   = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
              return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

// ─── Completion Rate by Department Chart (Bar) ───────────────────────────────

/**
 * Builds the data payload for the department bar chart.
 * Departments with no matching records are shown as 0.
 * @param {Array} data – filtered records
 * @returns {{ labels: string[], averages: number[] }}
 */
function buildDeptChartData(data) {
  const averages = DEPARTMENTS.map(dept => {
    const deptRecords = data.filter(e => e.department === dept);
    if (deptRecords.length === 0) return 0;
    return Math.round(deptRecords.reduce((sum, e) => sum + e.completionRate, 0) / deptRecords.length);
  });
  return { labels: DEPARTMENTS, averages };
}

/**
 * Creates or updates the horizontal bar chart for avg completion by department.
 * @param {Array} data – filtered records
 */
function renderDeptChart(data) {
  const { labels, averages } = buildDeptChartData(data);
  const ctx = document.getElementById('chart-department').getContext('2d');

  if (chartDepartment) {
    chartDepartment.destroy();
    chartDepartment = null;
  }

  chartDepartment = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label:           'Avg Completion (%)',
        data:            averages,
        backgroundColor: DEPT_COLORS,
        borderRadius:    6,
        borderSkipped:   false,
        barThickness:    28,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      indexAxis:           'y',   // horizontal bars
      scales: {
        x: {
          beginAtZero: true,
          max:         100,
          ticks: {
            callback: val => `${val}%`,
            color:    '#94a3b8',
            font:     { size: 11 },
          },
          grid: { color: '#f1f5f9' },
        },
        y: {
          ticks: { color: '#475569', font: { size: 12 } },
          grid:  { display: false },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.parsed.x}% completion`,
          },
        },
      },
    },
  });
}

// ─── Employee Table ───────────────────────────────────────────────────────────

/**
 * Generates an HTML string for a status badge.
 * @param {string} status – employee onboarding status
 * @returns {string} HTML span element
 */
function statusBadge(status) {
  const cls = STATUS_COLORS[status]?.light ?? 'bg-slate-100 text-slate-600';
  return `<span class="inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${cls}">${status}</span>`;
}

/**
 * Generates an HTML string for a completion rate progress bar.
 * @param {number} rate – 0-100
 * @returns {string} HTML markup
 */
function progressBar(rate) {
  // Colour the bar based on completion threshold
  const color = rate === 100 ? 'bg-emerald-400' : rate >= 50 ? 'bg-amber-400' : 'bg-red-400';
  return `
    <div class="flex items-center gap-2">
      <div class="w-24 bg-slate-100 rounded-full h-1.5 overflow-hidden">
        <div class="${color} h-1.5 rounded-full transition-all duration-500" style="width:${rate}%"></div>
      </div>
      <span class="text-slate-600 text-xs font-medium">${rate}%</span>
    </div>`;
}

/**
 * Renders or re-renders the employee table rows.
 * @param {Array} data – filtered records
 */
function renderTable(data) {
  const tbody = document.getElementById('table-body');
  const count = document.getElementById('table-count');

  count.textContent = `${data.length} record${data.length !== 1 ? 's' : ''}`;

  if (data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="px-4 py-10 text-center text-slate-400 text-sm">
          No employees match the current filters.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = data.map(emp => `
    <tr class="hover:bg-slate-50 transition-colors">
      <td class="px-4 py-3 font-medium text-slate-700">${emp.name}</td>
      <td class="px-4 py-3 text-slate-500">${emp.department}</td>
      <td class="px-4 py-3">${statusBadge(emp.status)}</td>
      <td class="px-4 py-3">${progressBar(emp.completionRate)}</td>
      <td class="px-4 py-3">
        <div class="flex items-center gap-1.5">
          <span class="text-amber-400 text-sm">★</span>
          <span class="text-slate-600 text-sm font-medium">${emp.feedbackScore.toFixed(1)}</span>
        </div>
      </td>
    </tr>`).join('');
}

// ─── Master Render ────────────────────────────────────────────────────────────

/**
 * Master render function.
 * Applies active filters, then refreshes all dashboard sections.
 */
function render() {
  const filtered = getFilteredData();

  renderKPIs(computeKPIs(filtered));
  renderStatusChart(filtered);
  renderDeptChart(filtered);
  renderTable(filtered);
}

// ─── Event Listeners ─────────────────────────────────────────────────────────

/**
 * Wires up the department dropdown, status dropdown, and reset button.
 * Each change triggers a full re-render without a page reload.
 */
function bindFilters() {
  const deptSelect   = document.getElementById('filter-department');
  const statusSelect = document.getElementById('filter-status');
  const resetBtn     = document.getElementById('btn-reset');

  deptSelect.addEventListener('change', e => {
    activeFilters.department = e.target.value;
    render();
  });

  statusSelect.addEventListener('change', e => {
    activeFilters.status = e.target.value;
    render();
  });

  resetBtn.addEventListener('click', () => {
    // Reset both dropdowns and state, then re-render
    deptSelect.value   = 'All';
    statusSelect.value = 'All';
    activeFilters      = { department: 'All', status: 'All' };
    render();
  });
}

// ─── Initialisation ───────────────────────────────────────────────────────────

/**
 * Entry point — bind controls then fetch data.
 * Binding happens first so event handlers are ready before data arrives.
 */
(function init() {
  bindFilters();
  loadData();
})();
