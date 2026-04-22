import { describe, it, expect, beforeEach } from "vitest";
import type { SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import { PersonaContextManager } from "../../src/mcp/persona-context.js";
import { wrapToolsWithPersonaValidation } from "../../src/mcp/tool-wrapper.js";

function fakeTool(name: string, responseText: string): SdkMcpToolDefinition<any> {
  return {
    name,
    description: `Test tool: ${name}`,
    inputSchema: {},
    handler: async () => ({
      content: [{ type: "text" as const, text: responseText }],
    }),
  };
}

describe("wrapToolsWithPersonaValidation", () => {
  let ctx: PersonaContextManager;

  beforeEach(() => {
    ctx = new PersonaContextManager();
  });

  it("should pass through read-only tools unchanged", async () => {
    const tools = [
      fakeTool("list_decisions", "[]"),
      fakeTool("get_decision", "{}"),
      fakeTool("search_documents", "[]"),
      fakeTool("project_summary", "{}"),
    ];

    ctx.setPersona("po");
    const wrapped = wrapToolsWithPersonaValidation(tools, ctx);

    for (let i = 0; i < wrapped.length; i++) {
      const result = await wrapped[i].handler({}, {});
      const text = result.content[0].text;
      expect(text).not.toContain("[PERSONA WARNING]");
    }
  });

  it("should block write tools when no persona is set", async () => {
    const tools = [fakeTool("create_epic", "Created epic E-001")];
    const wrapped = wrapToolsWithPersonaValidation(tools, ctx);

    const result = await wrapped[0].handler({}, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("[PERSONA REQUIRED]");
    expect(result.content[0].text).toContain("set_persona");
    expect(result.content[0].text).toContain("Product Owner");
    expect(result.content[0].text).toContain("Delivery Manager");
    expect(result.content[0].text).toContain("Technical Lead");
  });

  it("should not execute the handler when no persona is set", async () => {
    let called = false;
    const tools: SdkMcpToolDefinition<any>[] = [
      {
        name: "create_decision",
        description: "Create decision",
        inputSchema: {},
        handler: async () => {
          called = true;
          return {
            content: [{ type: "text" as const, text: "Created" }],
          };
        },
      },
    ];
    const wrapped = wrapToolsWithPersonaValidation(tools, ctx);
    await wrapped[0].handler({}, {});
    expect(called).toBe(false);
  });

  it("should allow read-only tools even when no persona is set", async () => {
    const tools = [fakeTool("list_decisions", "[]")];
    const wrapped = wrapToolsWithPersonaValidation(tools, ctx);

    const result = await wrapped[0].handler({}, {});
    expect(result.content[0].text).toBe("[]");
    expect(result.isError).toBeUndefined();
  });

  it("should pass through write tools when doc type is allowed", async () => {
    ctx.setPersona("po");
    const tools = [fakeTool("create_decision", "Created decision D-001")];
    const wrapped = wrapToolsWithPersonaValidation(tools, ctx);

    const result = await wrapped[0].handler({}, {});
    expect(result.content[0].text).toBe("Created decision D-001");
    expect(result.content[0].text).not.toContain("[PERSONA WARNING]");
  });

  it("should prepend warning when create_ doc type is out of scope", async () => {
    ctx.setPersona("po"); // PO cannot create epics
    const tools = [fakeTool("create_epic", "Created epic E-001")];
    const wrapped = wrapToolsWithPersonaValidation(tools, ctx);

    const result = await wrapped[0].handler({}, {});
    const text = result.content[0].text;

    expect(text).toContain("[PERSONA WARNING]");
    expect(text).toContain("Product Owner");
    expect(text).toContain('"epic"');
    expect(text).toContain("decision, question, action, feature, use-case");
    expect(text).toContain("Created epic E-001");
  });

  it("should normalize underscores to hyphens in doc type extraction", async () => {
    ctx.setPersona("po"); // PO has use-case in documentTypes
    const tools = [fakeTool("create_use_case", "Created use case UC-001")];
    const wrapped = wrapToolsWithPersonaValidation(tools, ctx);

    const result = await wrapped[0].handler({}, {});
    const text = result.content[0].text;

    expect(text).not.toContain("[PERSONA WARNING]");
    expect(text).toBe("Created use case UC-001");
  });

  it("should warn with hyphenated type name for unrecognized multi-word tools", async () => {
    ctx.setPersona("po"); // PO doesn't have "foo-bar"
    const tools = [fakeTool("create_foo_bar", "Created foo-bar")];
    const wrapped = wrapToolsWithPersonaValidation(tools, ctx);

    const result = await wrapped[0].handler({}, {});
    const text = result.content[0].text;

    expect(text).toContain("[PERSONA WARNING]");
    expect(text).toContain('"foo-bar"');
    expect(text).toContain("Created foo-bar");
  });

  it("should prepend warning when update_ doc type is out of scope", async () => {
    ctx.setPersona("tl"); // TL cannot update features
    const tools = [fakeTool("update_feature", "Updated feature F-001")];
    const wrapped = wrapToolsWithPersonaValidation(tools, ctx);

    const result = await wrapped[0].handler({}, {});
    const text = result.content[0].text;

    expect(text).toContain("[PERSONA WARNING]");
    expect(text).toContain("Technical Lead");
    expect(text).toContain('"feature"');
    expect(text).toContain("Updated feature F-001");
  });

  it("should handle save_report as a special case", async () => {
    ctx.setPersona("po"); // PO doesn't have "report" in documentTypes
    const tools = [fakeTool("save_report", "Report saved")];
    const wrapped = wrapToolsWithPersonaValidation(tools, ctx);

    const result = await wrapped[0].handler({}, {});
    const text = result.content[0].text;

    expect(text).toContain("[PERSONA WARNING]");
    expect(text).toContain('"report"');
    expect(text).toContain("Report saved");
  });

  it("should not warn DM for broad document types", async () => {
    ctx.setPersona("dm"); // DM has broadest access
    const tools = [
      fakeTool("create_meeting", "Created meeting M-001"),
      fakeTool("create_epic", "Created epic E-001"),
      fakeTool("create_feature", "Created feature F-001"),
    ];
    const wrapped = wrapToolsWithPersonaValidation(tools, ctx);

    for (const tool of wrapped) {
      const result = await tool.handler({}, {});
      expect(result.content[0].text).not.toContain("[PERSONA WARNING]");
    }
  });

  it("should preserve original tool metadata", () => {
    const tools = [fakeTool("create_decision", "ok")];
    const wrapped = wrapToolsWithPersonaValidation(tools, ctx);

    expect(wrapped[0].name).toBe("create_decision");
    expect(wrapped[0].description).toBe("Test tool: create_decision");
    expect(wrapped[0].inputSchema).toEqual({});
  });

  it("should still execute the tool even when warning is prepended", async () => {
    let called = false;
    const tools: SdkMcpToolDefinition<any>[] = [
      {
        name: "create_epic",
        description: "Create epic",
        inputSchema: {},
        handler: async () => {
          called = true;
          return {
            content: [{ type: "text" as const, text: "Epic created" }],
          };
        },
      },
    ];

    ctx.setPersona("po");
    const wrapped = wrapToolsWithPersonaValidation(tools, ctx);
    await wrapped[0].handler({}, {});

    expect(called).toBe(true);
  });
});
