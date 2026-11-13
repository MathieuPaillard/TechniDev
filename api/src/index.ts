import 'dotenv/config';
import { createApp } from './app.js';
import { config } from './config/env.js';

createApp().listen(config.PORT, () => {
  console.log(`API TechniDev lancée sur le port ${config.PORT} : http://localhost:${config.PORT}/api/health`);
});
