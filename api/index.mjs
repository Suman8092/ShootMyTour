let appHandler = null;
let initError = null;

async function getHandler() {
  if (appHandler) return appHandler;
  if (initError) throw initError;
  try {
    const mod = await import("../server/app.mjs");
    appHandler = mod.default || mod.handler;
    return appHandler;
  } catch (err) {
    initError = err;
    console.error("[Vercel Serverless] Module load error:", err);
    throw err;
  }
}

export default async function (req, res) {
  try {
    const handler = await getHandler();
    return await handler(req, res);
  } catch (err) {
    console.error("[Vercel Serverless] Uncaught request error:", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Internal Server Error",
          message: err.message,
        }),
      );
    }
  }
}
