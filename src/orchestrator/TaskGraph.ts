import type { Phase } from "../schemas/task.schema.js";

export class TaskGraph {
  private readonly phases: Map<string, Phase>;

  constructor(phases: Phase[]) {
    this.phases = new Map(phases.map((p) => [p.id, p]));
    this.validateDependencies();
  }

  getPhase(id: string): Phase {
    const phase = this.phases.get(id);
    if (!phase) {
      throw new Error(`Unknown phase: "${id}"`);
    }
    return phase;
  }

  getAllPhases(): Phase[] {
    return [...this.phases.values()];
  }

  getExecutionOrder(): Phase[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: Phase[] = [];

    const visit = (id: string): void => {
      if (visited.has(id)) return;
      if (visiting.has(id)) {
        throw new Error(`Cycle detected at phase "${id}"`);
      }
      visiting.add(id);
      const phase = this.getPhase(id);
      for (const dep of phase.dependsOn) {
        visit(dep);
      }
      visiting.delete(id);
      visited.add(id);
      order.push(phase);
    };

    for (const phase of this.phases.values()) {
      visit(phase.id);
    }

    return order;
  }

  private validateDependencies(): void {
    for (const phase of this.phases.values()) {
      for (const dep of phase.dependsOn) {
        if (!this.phases.has(dep)) {
          throw new Error(`Phase "${phase.id}" depends on unknown phase "${dep}"`);
        }
      }
    }
  }
}
