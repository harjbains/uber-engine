import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || loadDotEnv().PORT || 8787);
const PUBLIC_EXTENSIONS = new Set([".html", ".css", ".js", ".json", ".png", ".jpg", ".jpeg", ".svg", ".ico", ".webp"]);

function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!existsSync(envPath)) return {};

  return readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .reduce((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return acc;
      const index = trimmed.indexOf("=");
      if (index === -1) return acc;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
      acc[key] = value;
      return acc;
    }, {});
}

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".webp") return "image/webp";
  if (extension === ".ico") return "image/x-icon";
  return "application/octet-stream";
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const safePath = path.normalize(path.join(__dirname, pathname));

  if (!safePath.startsWith(__dirname) || !PUBLIC_EXTENSIONS.has(path.extname(safePath).toLowerCase())) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  try {
    const file = await readFile(safePath);
    response.writeHead(200, {
      "Content-Type": getContentType(safePath),
      "Cache-Control": "no-store"
    });
    response.end(file);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

const server = http.createServer((request, response) => {
  serveStatic(request, response);
});

server.listen(PORT, () => {
  console.log(`Uber Engine running at http://127.0.0.1:${PORT}`);
});
