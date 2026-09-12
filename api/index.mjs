import handler from "../server/app.mjs";

export default async function (req, res) {
  return await handler(req, res);
}
