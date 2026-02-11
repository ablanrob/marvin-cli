import { z } from "zod/v4";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../../../storage/store.js";

export function createAemReportTools(
  store: DocumentStore,
): SdkMcpToolDefinition<any>[] {
  return [
    tool(
      "generate_extension_portfolio",
      "Generate a portfolio view of all use cases with their linked tech assessments and extension designs",
      {},
      async () => {
        const useCases = store.list({ type: "use-case" });
        const techAssessments = store.list({ type: "tech-assessment" });
        const extensionDesigns = store.list({ type: "extension-design" });

        const portfolio = useCases.map((uc) => {
          const linkedTAs = techAssessments.filter(
            (ta) => ta.frontmatter.linkedUseCase === uc.frontmatter.id,
          );
          const linkedXDs = linkedTAs.flatMap((ta) =>
            extensionDesigns.filter(
              (xd) => xd.frontmatter.linkedTechAssessment === ta.frontmatter.id,
            ),
          );

          return {
            useCase: {
              id: uc.frontmatter.id,
              title: uc.frontmatter.title,
              status: uc.frontmatter.status,
              extensionType: uc.frontmatter.extensionType,
              businessProcess: uc.frontmatter.businessProcess,
              priority: uc.frontmatter.priority,
            },
            techAssessments: linkedTAs.map((ta) => ({
              id: ta.frontmatter.id,
              title: ta.frontmatter.title,
              status: ta.frontmatter.status,
              btpServices: ta.frontmatter.btpServices,
              recommendation: ta.frontmatter.recommendation,
            })),
            extensionDesigns: linkedXDs.map((xd) => ({
              id: xd.frontmatter.id,
              title: xd.frontmatter.title,
              status: xd.frontmatter.status,
              architecture: xd.frontmatter.architecture,
            })),
          };
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ portfolio, summary: { useCases: useCases.length, techAssessments: techAssessments.length, extensionDesigns: extensionDesigns.length } }, null, 2),
            },
          ],
        };
      },
      { annotations: { readOnly: true } },
    ),

    tool(
      "generate_tech_readiness",
      "Generate a BTP technology readiness report showing service coverage and gaps across assessments",
      {},
      async () => {
        const techAssessments = store.list({ type: "tech-assessment" });
        const useCases = store.list({ type: "use-case" });

        // Aggregate BTP service usage
        const serviceUsage = new Map<string, { assessments: string[]; status: string[] }>();
        for (const ta of techAssessments) {
          const services = (ta.frontmatter.btpServices as string[] | undefined) ?? [];
          for (const svc of services) {
            if (!serviceUsage.has(svc)) {
              serviceUsage.set(svc, { assessments: [], status: [] });
            }
            const entry = serviceUsage.get(svc)!;
            entry.assessments.push(ta.frontmatter.id);
            entry.status.push(ta.frontmatter.status);
          }
        }

        const services = Array.from(serviceUsage.entries()).map(([name, data]) => ({
          service: name,
          assessmentCount: data.assessments.length,
          assessments: data.assessments,
          statuses: data.status,
        }));

        // Find use cases without tech assessments
        const assessedUCIds = new Set(
          techAssessments.map((ta) => ta.frontmatter.linkedUseCase),
        );
        const unassessedUseCases = useCases
          .filter((uc) => !assessedUCIds.has(uc.frontmatter.id))
          .map((uc) => ({
            id: uc.frontmatter.id,
            title: uc.frontmatter.title,
            status: uc.frontmatter.status,
          }));

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                btpServices: services,
                unassessedUseCases,
                summary: {
                  totalServices: services.length,
                  totalAssessments: techAssessments.length,
                  unassessedCount: unassessedUseCases.length,
                },
              }, null, 2),
            },
          ],
        };
      },
      { annotations: { readOnly: true } },
    ),

    tool(
      "generate_phase_status",
      "Generate a phase progress report showing artifact counts and readiness per AEM phase",
      {},
      async () => {
        const useCases = store.list({ type: "use-case" });
        const techAssessments = store.list({ type: "tech-assessment" });
        const extensionDesigns = store.list({ type: "extension-design" });

        const ucByStatus: Record<string, number> = {};
        for (const uc of useCases) {
          ucByStatus[uc.frontmatter.status] = (ucByStatus[uc.frontmatter.status] ?? 0) + 1;
        }

        const taByStatus: Record<string, number> = {};
        for (const ta of techAssessments) {
          taByStatus[ta.frontmatter.status] = (taByStatus[ta.frontmatter.status] ?? 0) + 1;
        }

        const xdByStatus: Record<string, number> = {};
        for (const xd of extensionDesigns) {
          xdByStatus[xd.frontmatter.status] = (xdByStatus[xd.frontmatter.status] ?? 0) + 1;
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                phases: {
                  "assess-use-case": {
                    total: useCases.length,
                    byStatus: ucByStatus,
                    gateReady: useCases.length > 0 && useCases.every(
                      (uc) => ["assessed", "approved", "deferred"].includes(uc.frontmatter.status),
                    ),
                  },
                  "assess-technology": {
                    total: techAssessments.length,
                    byStatus: taByStatus,
                    gateReady: techAssessments.length > 0 && techAssessments.every(
                      (ta) => ["recommended", "rejected"].includes(ta.frontmatter.status),
                    ),
                  },
                  "define-solution": {
                    total: extensionDesigns.length,
                    byStatus: xdByStatus,
                    gateReady: extensionDesigns.length > 0 && extensionDesigns.every(
                      (xd) => ["validated", "approved"].includes(xd.frontmatter.status),
                    ),
                  },
                },
              }, null, 2),
            },
          ],
        };
      },
      { annotations: { readOnly: true } },
    ),
  ];
}
