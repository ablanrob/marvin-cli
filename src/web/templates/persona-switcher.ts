import type { DashboardPersona } from "../persona-views.js";
import { getAllPersonaViews } from "../persona-views.js";
import { escapeHtml } from "./layout.js";

export function renderPersonaSwitcher(
  current: DashboardPersona,
  currentPath: string,
): string {
  const views = getAllPersonaViews();
  if (views.length === 0) return "";

  const options = [
    `<option value=""${current === null ? " selected" : ""}>Admin</option>`,
    ...views.map(
      (v) =>
        `<option value="${v.shortName}"${current === v.shortName ? " selected" : ""}>${escapeHtml(v.displayName)}</option>`,
    ),
  ].join("\n          ");

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
        } else {
          window.location.href = '/';
        }
      }
    </script>`;
}

export function renderPersonaBanner(): string {
  const views = getAllPersonaViews();
  if (views.length === 0) return "";

  const cards = views
    .map(
      (v) => `
      <a href="/${v.shortName}/dashboard" class="persona-banner-option" style="--persona-card-accent: ${v.color}" onclick="dismissPersonaBanner()">
        <div class="persona-banner-name">${escapeHtml(v.displayName)}</div>
        <div class="persona-banner-desc">${escapeHtml(v.description)}</div>
      </a>`,
    )
    .join("\n");

  return `
    <div class="persona-banner" id="persona-banner">
      <div class="persona-banner-header">
        <h3>Choose a View</h3>
        <button class="persona-banner-dismiss" onclick="dismissPersonaBanner()" title="Dismiss">&times;</button>
      </div>
      <p class="persona-banner-subtitle">Get a curated dashboard for your role, or stay in admin mode for full access.</p>
      <div class="persona-banner-options">
        ${cards}
      </div>
    </div>
    <script>
      (function() {
        if (localStorage.getItem('marvin-persona-banner-dismissed')) {
          var banner = document.getElementById('persona-banner');
          if (banner) banner.style.display = 'none';
        }
      })();
      function dismissPersonaBanner() {
        localStorage.setItem('marvin-persona-banner-dismissed', '1');
        var banner = document.getElementById('persona-banner');
        if (banner) banner.style.display = 'none';
      }
    </script>`;
}
