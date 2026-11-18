-- Align future AgentRun records with the currently supported Gemini model.
ALTER TABLE "agent_runs"
ALTER COLUMN "modelName" SET DEFAULT 'gemini-3.8-flash';
