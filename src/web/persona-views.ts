export type DashboardPersona = "po" | "dm" | "tl" | null; // null = admin

export interface PersonaNavItem {
  path: string;
  label: string;
}

export interface PersonaViewConfig {
  shortName: "po" | "dm" | "tl";
  displayName: string;
  description: string;
  color: string;
  navItems: PersonaNavItem[];
}

export type PersonaPageRenderer = (ctx: PersonaPageContext) => string;

export interface PersonaPageContext {
  store: import("../storage/store.js").DocumentStore;
  projectName: string;
}

const VIEWS = new Map<string, PersonaViewConfig>();
const PAGE_RENDERERS = new Map<string, PersonaPageRenderer>();

export function registerPersonaView(config: PersonaViewConfig): void {
  VIEWS.set(config.shortName, config);
}

export function registerPersonaPage(
  persona: string,
  pageId: string,
  renderer: PersonaPageRenderer,
): void {
  PAGE_RENDERERS.set(`${persona}/${pageId}`, renderer);
}

export function getPersonaView(mode: DashboardPersona): PersonaViewConfig | undefined {
  if (!mode) return undefined;
  return VIEWS.get(mode);
}

export function getPersonaPageRenderer(
  persona: string,
  pageId: string,
): PersonaPageRenderer | undefined {
  return PAGE_RENDERERS.get(`${persona}/${pageId}`);
}

export function getAllPersonaViews(): PersonaViewConfig[] {
  return [...VIEWS.values()];
}

const VALID_PERSONAS = new Set(["po", "dm", "tl"]);

export function parsePersonaFromUrl(params: URLSearchParams): DashboardPersona {
  const value = params.get("persona")?.toLowerCase();
  if (value && VALID_PERSONAS.has(value)) return value as DashboardPersona;
  return null;
}

export function parsePersonaFromPath(pathname: string): DashboardPersona {
  const match = pathname.match(/^\/(po|dm|tl)(?:\/|$)/);
  return match ? (match[1] as DashboardPersona) : null;
}
