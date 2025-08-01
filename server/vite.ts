import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { type Server } from "http";
import { nanoid } from "nanoid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Vite imports are dynamic to avoid runtime errors in production
let viteLogger: { info: (msg: string) => void; error: (msg: string) => void; warn: (msg: string) => void } | undefined;

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  // Dynamic imports for Vite to avoid production runtime errors
  const { createServer: createViteServer, createLogger } = await import("vite");
  const viteConfig = await import("../vite.config");
  
  if (!viteLogger) {
    viteLogger = createLogger();
  }

  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true,
  };

  const vite = await createViteServer({
    ...viteConfig.default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        __dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const buildPath = path.resolve(__dirname, "..", "build", "public");
  const distPath = path.resolve(__dirname, "..", "dist", "public");
  
  // Try build directory first, fall back to dist directory
  const staticPath = fs.existsSync(buildPath) ? buildPath : distPath;

  if (!fs.existsSync(staticPath)) {
    throw new Error(
      `Could not find static files in either ${buildPath} or ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(staticPath));

  // fall through to index.html for frontend routes only
  // Explicitly exclude API routes to prevent routing conflicts
  app.get('*', (req, res, next) => {
    // Skip serving index.html for API routes
    if (req.path.startsWith('/api/')) {
      return next();
    }
    
    // Serve index.html for all frontend routes
    res.sendFile(path.resolve(staticPath, "index.html"));
  });
}
