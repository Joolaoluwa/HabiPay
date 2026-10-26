import app from './app';
import { env } from './config/env';

const PORT = env.PORT;

app.listen(PORT, () => {
  console.log(`\n🚀 HabiPay server running in ${env.NODE_ENV} mode`);
  console.log(`   Local: http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health\n`);
});
