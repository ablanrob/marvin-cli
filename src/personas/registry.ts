import type { PersonaDefinition } from "./types.js";
import { productOwner } from "./builtin/product-owner.js";
import { deliveryManager } from "./builtin/delivery-manager.js";
import { techLead } from "./builtin/tech-lead.js";

const BUILTIN_PERSONAS: PersonaDefinition[] = [
  productOwner,
  deliveryManager,
  techLead,
];

export function getPersona(idOrShortName: string): PersonaDefinition | undefined {
  const key = idOrShortName.toLowerCase();
  return BUILTIN_PERSONAS.find(
    (p) => p.id === key || p.shortName === key,
  );
}

export function listPersonas(): PersonaDefinition[] {
  return [...BUILTIN_PERSONAS];
}

export function resolvePersonaId(input: string): string {
  const persona = getPersona(input);
  if (!persona) {
    const available = BUILTIN_PERSONAS.map(
      (p) => `${p.shortName} (${p.name})`,
    ).join(", ");
    throw new Error(
      `Unknown persona "${input}". Available: ${available}`,
    );
  }
  return persona.id;
}
