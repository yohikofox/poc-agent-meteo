import agentsJson from "./agents.json";

export interface AgentDefinition {
  id: string;
  name: string;
  capabilities: string[];
  natsSubject: string;
  type: "programmatic" | "llm-local";
}

export class AgentRegistry {
  private definitions: AgentDefinition[] = agentsJson as AgentDefinition[];

  getAll(): AgentDefinition[] {
    return this.definitions;
  }

  getById(id: string): AgentDefinition | undefined {
    return this.definitions.find((d) => d.id === id);
  }
}
