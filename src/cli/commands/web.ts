import { startWebServer } from "../../web/server.js";

export async function webCommand(options: {
  port?: string;
  open: boolean;
}): Promise<void> {
  const port = options.port ? parseInt(options.port, 10) : 3000;

  if (isNaN(port) || port < 1 || port > 65535) {
    console.error("Error: invalid port number");
    process.exit(1);
  }

  await startWebServer({ port, open: options.open });
}
