import type { DashboardPersona } from "../persona-views.js";
import { getAllPersonaViews } from "../persona-views.js";
import { escapeHtml } from "./layout.js";

export function renderPersonaSwitcher(current: DashboardPersona, _currentPath: string): string {
  const views = getAllPersonaViews();
  if (views.length === 0) return "";

  const options = views
    .map(
      (v) =>
        `<option value="${v.shortName}"${current === v.shortName ? " selected" : ""}>${escapeHtml(v.displayName)}</option>`,
    )
    .join("\n          ");

  return `
    <div class="persona-switcher">
      <label class="persona-label" for="persona-select">View</label>
      <select class="persona-select" id="persona-select" onchange="switchPersona(this.value)">
          ${options}
      </select>
    </div>
    <script>
      function switchPersona(value) {
        if (value) {
          window.location.href = '/' + value + '/dashboard';
        }
      }
    </script>`;
}
