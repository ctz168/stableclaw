import { describe, expect, it, beforeEach } from "vitest";
import {
  createPlan,
  getPlan,
  getAllPlans,
  updatePlan,
  deletePlan,
  addStep,
  updateStep,
  removeStep,
  reorderSteps,
  renderPlanMarkdown,
  renderPlanSummary,
  clearSessionPlans,
  createTaskPlanTool,
  __testing,
} from "./task-plan.js";

describe("task-plan", () => {
  beforeEach(() => {
    __testing.resetStore();
  });

  describe("createPlan", () => {
    it("creates a plan with title and steps", () => {
      const plan = createPlan({
        sessionKey: "test",
        title: "Build website",
        goal: "Create a responsive landing page",
        steps: [
          { description: "Design mockup" },
          { description: "Implement HTML" },
          { description: "Add styles" },
        ],
      });

      expect(plan.title).toBe("Build website");
      expect(plan.goal).toBe("Create a responsive landing page");
      expect(plan.steps).toHaveLength(3);
      expect(plan.steps[0].status).toBe("pending");
      expect(plan.steps[0].id).toMatch(/^step-/);
    });

    it("creates an empty plan", () => {
      const plan = createPlan({
        sessionKey: "test",
        title: "Empty plan",
      });

      expect(plan.steps).toHaveLength(0);
      expect(plan.id).toMatch(/^plan-/);
    });

    it("stores plans per session", () => {
      createPlan({ sessionKey: "session-a", title: "Plan A" });
      createPlan({ sessionKey: "session-b", title: "Plan B" });

      expect(getAllPlans("session-a")).toHaveLength(1);
      expect(getAllPlans("session-b")).toHaveLength(1);
      expect(getAllPlans("session-c")).toHaveLength(0);
    });
  });

  describe("updatePlan", () => {
    it("updates plan title and goal", () => {
      const plan = createPlan({ sessionKey: "test", title: "Old" });
      const updated = updatePlan({
        sessionKey: "test",
        planId: plan.id,
        title: "New",
        goal: "New goal",
      });

      expect(updated?.title).toBe("New");
      expect(updated?.goal).toBe("New goal");
    });

    it("returns null for non-existent plan", () => {
      const result = updatePlan({
        sessionKey: "test",
        planId: "nonexistent",
        title: "X",
      });
      expect(result).toBeNull();
    });
  });

  describe("deletePlan", () => {
    it("deletes an existing plan", () => {
      const plan = createPlan({ sessionKey: "test", title: "Delete me" });
      expect(getAllPlans("test")).toHaveLength(1);

      const deleted = deletePlan("test", plan.id);
      expect(deleted).toBe(true);
      expect(getAllPlans("test")).toHaveLength(0);
    });

    it("returns false for non-existent plan", () => {
      expect(deletePlan("test", "nonexistent")).toBe(false);
    });
  });

  describe("addStep", () => {
    it("adds a step at the end", () => {
      const plan = createPlan({
        sessionKey: "test",
        title: "Plan",
        steps: [{ description: "Step 1" }],
      });
      const updated = addStep({
        sessionKey: "test",
        planId: plan.id,
        description: "Step 2",
      });

      expect(updated?.steps).toHaveLength(2);
      expect(updated?.steps[1].description).toBe("Step 2");
      expect(updated?.steps[1].priority).toBe(2);
    });

    it("inserts a step before another", () => {
      const plan = createPlan({
        sessionKey: "test",
        title: "Plan",
        steps: [{ description: "Step 1" }, { description: "Step 2" }],
      });
      const updated = addStep({
        sessionKey: "test",
        planId: plan.id,
        description: "Step 1.5",
        insertBefore: plan.steps[1].id,
      });

      expect(updated?.steps).toHaveLength(3);
      expect(updated?.steps[1].description).toBe("Step 1.5");
      expect(updated?.steps[1].priority).toBe(2);
    });

    it("inserts a step after another", () => {
      const plan = createPlan({
        sessionKey: "test",
        title: "Plan",
        steps: [{ description: "Step 1" }, { description: "Step 2" }],
      });
      const updated = addStep({
        sessionKey: "test",
        planId: plan.id,
        description: "Step 1.5",
        insertAfter: plan.steps[0].id,
      });

      expect(updated?.steps).toHaveLength(3);
      expect(updated?.steps[1].description).toBe("Step 1.5");
    });

    it("returns null for non-existent plan", () => {
      const result = addStep({
        sessionKey: "test",
        planId: "nonexistent",
        description: "X",
      });
      expect(result).toBeNull();
    });
  });

  describe("updateStep", () => {
    it("marks a step as completed", () => {
      const plan = createPlan({
        sessionKey: "test",
        title: "Plan",
        steps: [{ description: "Step 1" }],
      });
      const updated = updateStep({
        sessionKey: "test",
        planId: plan.id,
        stepId: plan.steps[0].id,
        status: "completed",
      });

      expect(updated?.steps[0].status).toBe("completed");
    });

    it("marks a step as in_progress", () => {
      const plan = createPlan({
        sessionKey: "test",
        title: "Plan",
        steps: [{ description: "Step 1" }],
      });
      const updated = updateStep({
        sessionKey: "test",
        planId: plan.id,
        stepId: plan.steps[0].id,
        status: "in_progress",
      });

      expect(updated?.steps[0].status).toBe("in_progress");
    });

    it("updates step description and detail", () => {
      const plan = createPlan({
        sessionKey: "test",
        title: "Plan",
        steps: [{ description: "Old desc" }],
      });
      const updated = updateStep({
        sessionKey: "test",
        planId: plan.id,
        stepId: plan.steps[0].id,
        description: "New desc",
        detail: "Additional info",
      });

      expect(updated?.steps[0].description).toBe("New desc");
      expect(updated?.steps[0].detail).toBe("Additional info");
    });

    it("returns null for non-existent plan or step", () => {
      createPlan({ sessionKey: "test", title: "Plan", steps: [{ description: "S1" }] });
      expect(updateStep({ sessionKey: "test", planId: "bad", stepId: "bad" })).toBeNull();
    });
  });

  describe("removeStep", () => {
    it("removes a step and reindexes", () => {
      const plan = createPlan({
        sessionKey: "test",
        title: "Plan",
        steps: [{ description: "S1" }, { description: "S2" }, { description: "S3" }],
      });
      const updated = removeStep({
        sessionKey: "test",
        planId: plan.id,
        stepId: plan.steps[1].id,
      });

      expect(updated?.steps).toHaveLength(2);
      expect(updated?.steps[0].priority).toBe(1);
      expect(updated?.steps[1].priority).toBe(2);
    });
  });

  describe("reorderSteps", () => {
    it("reorders steps by ID", () => {
      const plan = createPlan({
        sessionKey: "test",
        title: "Plan",
        steps: [{ description: "A" }, { description: "B" }, { description: "C" }],
      });
      const [a, b, c] = plan.steps;
      const updated = reorderSteps({
        sessionKey: "test",
        planId: plan.id,
        stepIds: [c.id, a.id, b.id],
      });

      expect(updated?.steps[0].description).toBe("C");
      expect(updated?.steps[1].description).toBe("A");
      expect(updated?.steps[2].description).toBe("B");
    });
  });

  describe("renderPlanMarkdown", () => {
    it("renders an empty plan", () => {
      const plan = createPlan({ sessionKey: "test", title: "Empty" });
      const md = renderPlanMarkdown(plan);

      expect(md).toContain("## 📋 Empty");
      expect(md).toContain("0%");
      expect(md).toContain("No steps defined");
    });

    it("renders a plan with mixed statuses", () => {
      const plan = createPlan({
        sessionKey: "test",
        title: "Build App",
        goal: "Create a mobile app",
        steps: [
          { description: "Design UI" },
          { description: "Implement backend" },
          { description: "Write tests" },
        ],
      });
      updateStep({
        sessionKey: "test",
        planId: plan.id,
        stepId: plan.steps[0].id,
        status: "completed",
      });
      updateStep({
        sessionKey: "test",
        planId: plan.id,
        stepId: plan.steps[1].id,
        status: "in_progress",
      });
      updateStep({
        sessionKey: "test",
        planId: plan.id,
        stepId: plan.steps[2].id,
        status: "failed",
        detail: "Test environment broken",
      });

      const md = renderPlanMarkdown(plan);

      expect(md).toContain("## 📋 Build App");
      expect(md).toContain("**Goal:** Create a mobile app");
      expect(md).toContain("33%"); // 1/3 completed
      expect(md).toContain("✅ ~~Design UI~~");
      expect(md).toContain("🔄 Implement backend");
      expect(md).toContain("❌ Write tests — _Test environment broken_");
      expect(md).toContain("⚠️ 1 step(s) failed");
      expect(md).toContain("🔄 1 step(s) in progress");
    });

    it("renders progress bar correctly", () => {
      const plan = createPlan({
        sessionKey: "test",
        title: "Progress test",
        steps: [
          { description: "S1" },
          { description: "S2" },
          { description: "S3" },
          { description: "S4" },
        ],
      });
      updateStep({
        sessionKey: "test",
        planId: plan.id,
        stepId: plan.steps[0].id,
        status: "completed",
      });
      updateStep({
        sessionKey: "test",
        planId: plan.id,
        stepId: plan.steps[1].id,
        status: "completed",
      });

      const md = renderPlanMarkdown(plan);

      expect(md).toContain("50%");
      expect(md).toContain("2/4 done");
    });

    it("strikes through completed steps", () => {
      const plan = createPlan({
        sessionKey: "test",
        title: "Strike test",
        steps: [{ description: "Done task" }],
      });
      updateStep({
        sessionKey: "test",
        planId: plan.id,
        stepId: plan.steps[0].id,
        status: "completed",
      });

      const md = renderPlanMarkdown(plan);
      expect(md).toContain("~~Done task~~");
    });
  });

  describe("renderPlanSummary", () => {
    it("renders a compact summary", () => {
      const plan = createPlan({
        sessionKey: "test",
        title: "Test",
        steps: [{ description: "S1" }, { description: "S2" }],
      });
      updateStep({
        sessionKey: "test",
        planId: plan.id,
        stepId: plan.steps[0].id,
        status: "completed",
      });

      const summary = renderPlanSummary(plan);
      expect(summary).toBe("[Test] 50% (1/2)");
    });
  });

  describe("clearSessionPlans", () => {
    it("clears all plans for a session", () => {
      createPlan({ sessionKey: "test", title: "Plan 1" });
      createPlan({ sessionKey: "test", title: "Plan 2" });
      expect(getAllPlans("test")).toHaveLength(2);

      clearSessionPlans("test");
      expect(getAllPlans("test")).toHaveLength(0);
    });
  });

  describe("createTaskPlanTool", () => {
    it("creates the tool with correct metadata", () => {
      const tool = createTaskPlanTool({ sessionKey: "test" });
      expect(tool.name).toBe("task_plan");
      expect(tool.label).toBe("Task Planning");
    });

    it("handles create action", async () => {
      const tool = createTaskPlanTool({ sessionKey: "test" });
      const result = await tool.execute("call-1", {
        action: "create",
        title: "My Plan",
        goal: "Do something",
        steps: [{ description: "Step 1" }, { description: "Step 2" }],
      } as any);

      // jsonResult returns { content: [{ type: "text", text }], details }
      const details = (result as any)?.details;
      expect(details.planId).toMatch(/^plan-/);
      expect(details.markdown).toContain("## 📋 My Plan");
      expect(details.markdown).toContain("**Goal:** Do something");
    });

    it("handles update_step action", async () => {
      const tool = createTaskPlanTool({ sessionKey: "test" });
      // Create plan and get the step ID via the store
      const plan = createPlan({
        sessionKey: "test",
        title: "Plan",
        steps: [{ description: "Step 1" }],
      });
      const stepId = plan.steps[0].id;

      const result = await tool.execute("call-1", {
        action: "update_step",
        planId: plan.id,
        stepId,
        stepStatus: "completed",
      } as any);

      const details = (result as any)?.details;
      expect(details.markdown).toContain("✅ ~~Step 1~~");
    });

    it("handles show action for all plans", async () => {
      const tool = createTaskPlanTool({ sessionKey: "test" });
      const result = await tool.execute("call-1", {
        action: "show",
      } as any);

      const details = (result as any)?.details;
      expect(details.markdown).toContain("No active task plans");
    });

    it("handles show action for specific plan", async () => {
      const tool = createTaskPlanTool({ sessionKey: "test" });
      const plan = createPlan({
        sessionKey: "test",
        title: "My Plan",
        steps: [{ description: "S1" }],
      });

      const result = await tool.execute("call-1", {
        action: "show",
        planId: plan.id,
      } as any);

      const details = (result as any)?.details;
      expect(details.markdown).toContain("## 📋 My Plan");
      expect(details.summary).toContain("0%");
    });

    it("handles delete action", async () => {
      const tool = createTaskPlanTool({ sessionKey: "test" });
      const plan = createPlan({
        sessionKey: "test",
        title: "Delete me",
      });

      const result = await tool.execute("call-1", {
        action: "delete",
        planId: plan.id,
      } as any);
      const details = (result as any)?.details;
      expect(details.deleted).toBe(true);
    });

    it("returns error for non-existent plan", async () => {
      const tool = createTaskPlanTool({ sessionKey: "test" });
      try {
        await tool.execute("call-1", {
          action: "show",
          planId: "nonexistent",
        } as any);
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(String(err)).toContain("not found");
      }
    });
  });
});
