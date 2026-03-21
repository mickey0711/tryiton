import { Router } from "express";
export default Router().get("/", (_req, res) => res.json({ ok: true, service: "tryiton-api" }));
