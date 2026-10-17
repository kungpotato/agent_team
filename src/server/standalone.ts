import { startServer } from './server.js';

const port = parseInt(process.argv[2] || process.env.AGENT_TEAM_PORT || '3333', 10);

startServer(port).catch(err => {
  console.error('Fatal server error:', err);
  process.exit(1);
});
