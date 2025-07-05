
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';
import { githubToBRDWorkflow } from './workflows/github-to-brd.workflow';
import { brdAgent } from './agents/brd-generator.agent';
import { taskMasterAgent } from './agents/task-master.agent';

export const mastra = new Mastra({
  workflows: { weatherWorkflow, githubToBRDWorkflow },
  agents: { weatherAgent, brdAgent, taskMasterAgent },
  storage: new LibSQLStore({
    // stores telemetry, evals, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
});
