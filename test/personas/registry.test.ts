import { describe, it, expect } from "vitest";
import {
  getPersona,
  listPersonas,
  resolvePersonaId,
} from "../../src/personas/registry.js";

describe("getPersona", () => {
  it("should find persona by full ID", () => {
    const persona = getPersona("product-owner");
    expect(persona).toBeDefined();
    expect(persona!.name).toBe("Product Owner");
  });

  it("should find persona by short name", () => {
    const persona = getPersona("po");
    expect(persona).toBeDefined();
    expect(persona!.id).toBe("product-owner");
  });

  it("should find delivery manager by short name", () => {
    const persona = getPersona("dm");
    expect(persona).toBeDefined();
    expect(persona!.id).toBe("delivery-manager");
  });

  it("should find tech lead by short name", () => {
    const persona = getPersona("tl");
    expect(persona).toBeDefined();
    expect(persona!.id).toBe("tech-lead");
  });

  it("should return undefined for unknown persona", () => {
    const persona = getPersona("unknown");
    expect(persona).toBeUndefined();
  });

  it("should be case-insensitive", () => {
    const persona = getPersona("PO");
    expect(persona).toBeDefined();
    expect(persona!.id).toBe("product-owner");
  });
});

describe("listPersonas", () => {
  it("should return all three built-in personas", () => {
    const personas = listPersonas();
    expect(personas).toHaveLength(3);
    const ids = personas.map((p) => p.id);
    expect(ids).toContain("product-owner");
    expect(ids).toContain("delivery-manager");
    expect(ids).toContain("tech-lead");
  });

  it("should return a copy (not the internal array)", () => {
    const a = listPersonas();
    const b = listPersonas();
    expect(a).not.toBe(b);
  });
});

describe("resolvePersonaId", () => {
  it("should resolve short name to full ID", () => {
    expect(resolvePersonaId("po")).toBe("product-owner");
    expect(resolvePersonaId("dm")).toBe("delivery-manager");
    expect(resolvePersonaId("tl")).toBe("tech-lead");
  });

  it("should resolve full ID to itself", () => {
    expect(resolvePersonaId("product-owner")).toBe("product-owner");
  });

  it("should throw for unknown persona", () => {
    expect(() => resolvePersonaId("cto")).toThrow('Unknown persona "cto"');
  });
});

describe("PersonaDefinition structure", () => {
  it("each persona should have required fields", () => {
    const personas = listPersonas();
    for (const persona of personas) {
      expect(persona.id).toBeTruthy();
      expect(persona.name).toBeTruthy();
      expect(persona.shortName).toBeTruthy();
      expect(persona.description).toBeTruthy();
      expect(persona.systemPrompt).toBeTruthy();
      expect(persona.focusAreas.length).toBeGreaterThan(0);
      expect(persona.documentTypes.length).toBeGreaterThan(0);
    }
  });

  it("each persona should have unique short names", () => {
    const personas = listPersonas();
    const shortNames = personas.map((p) => p.shortName);
    expect(new Set(shortNames).size).toBe(shortNames.length);
  });
});
