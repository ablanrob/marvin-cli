import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { z } from "zod/v4";
import { DocumentStore } from "../../../src/storage/store.js";
import { createMeetingTools } from "../../../src/plugins/builtin/tools/meetings.js";
import { COMMON_REGISTRATIONS } from "../../../src/plugins/common.js";

describe("Meeting Tools", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;
  let tools: Record<string, (args: any) => Promise<any>>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-test-"));
    marvinDir = path.join(tmpDir, ".marvin");
    for (const dir of [
      "decisions",
      "actions",
      "questions",
      "meetings",
      "reports",
      "features",
      "epics",
    ]) {
      fs.mkdirSync(path.join(marvinDir, "docs", dir), { recursive: true });
    }
    store = new DocumentStore(marvinDir, COMMON_REGISTRATIONS);

    const meetingTools = createMeetingTools(store);
    tools = {};
    for (const t of meetingTools) {
      tools[t.name] = (t as any).handler;
    }
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should create a meeting and get it by ID", async () => {
    const createResult = await tools.create_meeting({
      title: "Sprint Planning",
      content: "Plan the next sprint.",
      attendees: ["alice", "bob"],
      date: "2026-02-15",
    });
    expect(createResult.content[0].text).toContain("M-001");
    expect(createResult.content[0].text).toContain("Sprint Planning");

    const getResult = await tools.get_meeting({ id: "M-001" });
    const data = JSON.parse(getResult.content[0].text);
    expect(data.title).toBe("Sprint Planning");
    expect(data.status).toBe("scheduled");
    expect(data.attendees).toEqual(["alice", "bob"]);
  });

  it("should list meetings", async () => {
    await tools.create_meeting({ title: "Standup", content: "Daily standup.", date: "2026-02-15" });
    await tools.create_meeting({
      title: "Retro",
      content: "Sprint retro.",
      status: "completed",
      date: "2026-02-16",
    });

    const listResult = await tools.list_meetings({});
    const list = JSON.parse(listResult.content[0].text);
    expect(list).toHaveLength(2);

    const filteredResult = await tools.list_meetings({ status: "completed" });
    const filtered = JSON.parse(filteredResult.content[0].text);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("Retro");
  });

  it("should update a meeting", async () => {
    await tools.create_meeting({ title: "Planning", content: "Plan.", date: "2026-02-15" });

    const updateResult = await tools.update_meeting({
      id: "M-001",
      status: "completed",
      content: "Planning done. Decided on sprint scope.",
    });
    expect(updateResult.content[0].text).toContain("Updated meeting M-001");

    const getResult = await tools.get_meeting({ id: "M-001" });
    const data = JSON.parse(getResult.content[0].text);
    expect(data.status).toBe("completed");
    expect(data.content).toContain("Planning done");
  });

  it("should return error for non-existent meeting", async () => {
    const result = await tools.get_meeting({ id: "M-999" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  it("should use the provided date for the meeting filename", async () => {
    await tools.create_meeting({
      title: "Past Standup",
      content: "Notes from last week.",
      date: "2025-12-01",
    });

    const meetingsDir = path.join(marvinDir, "docs", "meetings");
    const files = fs.readdirSync(meetingsDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toBe("2025-12-01-past-standup.md");
  });

  it("should assign sequential IDs to multiple meetings", async () => {
    await tools.create_meeting({ title: "Kickoff", content: "Start.", date: "2026-01-01" });
    await tools.create_meeting({ title: "Standup", content: "Daily.", date: "2026-01-02" });
    await tools.create_meeting({ title: "Retro", content: "Review.", date: "2026-01-03" });

    const m1 = await tools.get_meeting({ id: "M-001" });
    expect(JSON.parse(m1.content[0].text).title).toBe("Kickoff");

    const m2 = await tools.get_meeting({ id: "M-002" });
    expect(JSON.parse(m2.content[0].text).title).toBe("Standup");

    const m3 = await tools.get_meeting({ id: "M-003" });
    expect(JSON.parse(m3.content[0].text).title).toBe("Retro");
  });

  it("should assign IDs above file count when existing meetings have duplicate IDs", async () => {
    // Simulate corrupted data: 3 files all with id: M-001
    const meetingsDir = path.join(marvinDir, "docs", "meetings");
    for (const [date, title] of [
      ["2025-10-01", "Meeting A"],
      ["2025-10-02", "Meeting B"],
      ["2025-10-03", "Meeting C"],
    ]) {
      const slug = title.toLowerCase().replace(/\s+/g, "-");
      const filePath = path.join(meetingsDir, `${date}-${slug}.md`);
      fs.writeFileSync(
        filePath,
        [
          "---",
          "id: M-001",
          `title: ${title}`,
          "type: meeting",
          "status: completed",
          `date: ${date}`,
          `created: ${date}T00:00:00.000Z`,
          `updated: ${date}T00:00:00.000Z`,
          "---",
          `Notes for ${title}`,
        ].join("\n"),
      );
    }

    // Recreate store so it picks up the corrupted files
    store = new DocumentStore(marvinDir, COMMON_REGISTRATIONS);
    const freshTools: Record<string, (args: any) => Promise<any>> = {};
    for (const t of createMeetingTools(store)) {
      freshTools[t.name] = (t as any).handler;
    }

    // New meeting should get M-004 (above the 3 existing files), not M-002
    const result = await freshTools.create_meeting({
      title: "New Meeting",
      content: "Fresh notes.",
      date: "2025-11-01",
    });
    expect(result.content[0].text).toContain("M-004");
  });

  it("should reject create_meeting when date is omitted", async () => {
    // inputSchema is the raw Zod shape — validate that parsing without date fails
    const meetingTools = createMeetingTools(store);
    const createTool = meetingTools.find((t) => t.name === "create_meeting")!;
    const schema = z.object(createTool.inputSchema);
    const result = schema.safeParse({ title: "Test", content: "Notes" });
    expect(result.success).toBe(false);
  });
});
