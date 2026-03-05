import { escapeHtml } from "./layout.js";

/**
 * Returns a <script> block with client-side table sort/filter utilities.
 * Uses ES5 syntax to match existing inline script patterns.
 */
export function renderTableUtilsScript(): string {
  return `<script>
(function() {
  function marvinSortTable(tableId, colIndex) {
    var table = document.getElementById(tableId);
    if (!table) return;
    var tbody = table.querySelector('tbody');
    if (!tbody) return;
    var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));

    // Determine current sort direction
    var th = table.querySelectorAll('th')[colIndex];
    var arrow = th ? th.querySelector('.sort-arrow') : null;
    var asc = true;
    if (th && th.getAttribute('data-sort-dir') === 'asc') {
      asc = false;
      th.setAttribute('data-sort-dir', 'desc');
    } else if (th) {
      th.setAttribute('data-sort-dir', 'asc');
    }

    // Clear all arrows in this table
    var allArrows = table.querySelectorAll('.sort-arrow');
    for (var i = 0; i < allArrows.length; i++) {
      allArrows[i].textContent = '';
    }
    if (arrow) {
      arrow.textContent = asc ? '\\u25B2' : '\\u25BC';
    }

    rows.sort(function(a, b) {
      var cellA = a.cells[colIndex];
      var cellB = b.cells[colIndex];
      if (!cellA || !cellB) return 0;
      var valA = (cellA.textContent || '').trim();
      var valB = (cellB.textContent || '').trim();

      // ISO date detection
      if (/^\\d{4}-\\d{2}-\\d{2}/.test(valA) && /^\\d{4}-\\d{2}-\\d{2}/.test(valB)) {
        return asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      // Number detection
      var numA = parseFloat(valA);
      var numB = parseFloat(valB);
      if (!isNaN(numA) && !isNaN(numB)) {
        return asc ? numA - numB : numB - numA;
      }

      return asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });

    for (var j = 0; j < rows.length; j++) {
      tbody.appendChild(rows[j]);
    }
  }

  function marvinFilterTable(tableId) {
    var table = document.getElementById(tableId);
    if (!table) return;
    var tbody = table.querySelector('tbody');
    if (!tbody) return;
    var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));

    // Collect all filter elements (multi-select details + date-range selects)
    var filterEls = document.querySelectorAll('[data-filter-for="' + tableId + '"]');

    for (var r = 0; r < rows.length; r++) {
      var show = true;
      for (var f = 0; f < filterEls.length; f++) {
        var el = filterEls[f];
        var col = parseInt(el.getAttribute('data-col'), 10);
        var cell = rows[r].cells[col];
        if (!cell) { show = false; break; }
        var cellText = (cell.textContent || '').trim();

        if (el.getAttribute('data-filter-type') === 'date-range') {
          var val = el.value;
          if (!val) continue;
          var days = parseInt(val, 10);
          if (isNaN(days)) continue;
          var dateMatch = cellText.match(/\\d{4}-\\d{2}-\\d{2}/);
          if (!dateMatch) { show = false; break; }
          var cellDate = new Date(dateMatch[0]).getTime();
          var cutoff = Date.now() - days * 86400000;
          if (cellDate < cutoff) { show = false; break; }
        } else if (el.classList.contains('multi-filter')) {
          var checked = el.querySelectorAll('input[type="checkbox"]:checked');
          if (checked.length === 0) continue;
          var match = false;
          for (var c = 0; c < checked.length; c++) {
            if (cellText.toLowerCase().indexOf(checked[c].value.toLowerCase()) !== -1) {
              match = true;
              break;
            }
          }
          if (!match) { show = false; break; }
        }
      }
      rows[r].style.display = show ? '' : 'none';
    }
  }

  // Update summary label when checkboxes change
  window.marvinMultiFilterChanged = function(checkbox) {
    var wrapper = checkbox.closest('.multi-filter');
    if (!wrapper) return;
    var summary = wrapper.querySelector('summary');
    var allLabel = wrapper.getAttribute('data-all-label') || 'All';
    var checked = wrapper.querySelectorAll('input[type="checkbox"]:checked');
    if (checked.length === 0) {
      summary.textContent = allLabel;
    } else if (checked.length === 1) {
      summary.textContent = checked[0].value;
    } else {
      summary.textContent = checked.length + ' selected';
    }
    var tid = wrapper.getAttribute('data-filter-for');
    if (tid) marvinFilterTable(tid);
  };

  // Auto-init on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', function() {
    // Click handlers for sortable headers
    var sortHeaders = document.querySelectorAll('th.sortable-th');
    for (var i = 0; i < sortHeaders.length; i++) {
      (function(th) {
        th.addEventListener('click', function() {
          var tid = th.getAttribute('data-table');
          var col = parseInt(th.getAttribute('data-col'), 10);
          if (tid) marvinSortTable(tid, col);
        });
      })(sortHeaders[i]);
    }

    // Change handlers for date-range selects
    var dateSelects = document.querySelectorAll('select[data-filter-for][data-filter-type="date-range"]');
    for (var j = 0; j < dateSelects.length; j++) {
      (function(sel) {
        sel.addEventListener('change', function() {
          var tid = sel.getAttribute('data-filter-for');
          if (tid) marvinFilterTable(tid);
        });
      })(dateSelects[j]);
    }

    // Close open <details> when clicking outside
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.multi-filter')) {
        var openDetails = document.querySelectorAll('details.multi-filter[open]');
        for (var k = 0; k < openDetails.length; k++) {
          openDetails[k].removeAttribute('open');
        }
      }
    });
  });
})();
</script>`;
}

/**
 * Generate a sortable <th> element.
 */
export function sortableTh(label: string, tableId: string, colIndex: number): string {
  return `<th class="sortable-th" data-table="${escapeHtml(tableId)}" data-col="${colIndex}">${escapeHtml(label)} <span class="sort-arrow"></span></th>`;
}

/**
 * Generate a multi-select checkbox filter using native <details>/<summary>.
 */
export function tableFilter(
  tableId: string,
  colIndex: number,
  label: string,
  values: string[],
): string {
  const allLabel = `All ${escapeHtml(label)}`;
  const checkboxes = values
    .map(
      (v) =>
        `<label class="multi-filter-option"><input type="checkbox" value="${escapeHtml(v)}" onchange="marvinMultiFilterChanged(this)"> ${escapeHtml(v)}</label>`,
    )
    .join("");
  return `<details class="multi-filter" data-filter-for="${escapeHtml(tableId)}" data-col="${colIndex}" data-all-label="${allLabel}"><summary>${allLabel}</summary><div class="multi-filter-menu">${checkboxes}</div></details>`;
}

/**
 * Generate a date-range <select> filter for a table column.
 */
export function tableDateFilter(tableId: string, colIndex: number): string {
  return `<select data-filter-for="${escapeHtml(tableId)}" data-col="${colIndex}" data-filter-type="date-range"><option value="">All dates</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select>`;
}
