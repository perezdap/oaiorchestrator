import { builtInAgentDefinitions } from "../agents/index.js";
import { mergeSkillIds } from "../skills/mergeSkillIds.js";
import type { AgentConfig, AgentDefinition, AgentType } from "../schemas/agent.schema.js";

export class AgentRegistry {
  private readonly typeDefaults = new Map<AgentType, AgentDefinition>();
  private readonly workflowAgents = new Map<string, AgentConfig & { id: string }>();

  constructor() {
    for (const def of builtInAgentDefinitions) {
      this.typeDefaults.set(def.type, def);
    }
  }

  registerType(definition: AgentDefinition): void {
    this.typeDefaults.set(definition.type, definition);
  }

  registerWorkflowAgents(agents: Record<string, AgentConfig>): void {
    for (const [id, config] of Object.entries(agents)) {
      this.workflowAgents.set(id, { id, ...config });
    }
  }

  resolve(agentId: string): AgentConfig & { id: string; type: AgentType } {
    const workflowAgent = this.workflowAgents.get(agentId);
    if (!workflowAgent) {
      throw new Error(`Unknown workflow agent id: "${agentId}"`);
    }

    const typeDefault = this.typeDefaults.get(workflowAgent.type);
    if (!typeDefault) {
      throw new Error(`Unknown agent type: "${workflowAgent.type}" for agent "${agentId}"`);
    }

    return {
      id: agentId,
      type: workflowAgent.type,
      model: workflowAgent.model ?? typeDefault.model,
      baseUrl: workflowAgent.baseUrl ?? typeDefault.baseUrl,
      instructions: workflowAgent.instructions || typeDefault.instructions,
      allowedTools: workflowAgent.allowedTools ?? typeDefault.allowedTools,
      executionMode: workflowAgent.executionMode ?? typeDefault.executionMode,
      inputs: workflowAgent.inputs ?? typeDefault.inputs,
      outputs: workflowAgent.outputs ?? typeDefault.outputs,
      skills: mergeSkillIds(typeDefault.skills, workflowAgent.skills),
    };
  }

  listTypes(): AgentDefinition[] {
    return [...this.typeDefaults.values()];
  }

  listWorkflowAgents(): Array<AgentConfig & { id: string }> {
    return [...this.workflowAgents.values()];
  }

  hasAgent(agentId: string): boolean {
    return this.workflowAgents.has(agentId);
  }
}
