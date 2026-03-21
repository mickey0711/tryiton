import { Router } from "express";
import { searchPrices } from "../services/priceSearch";

const router = Router();

// GET /prices/search?q=blue+denim+jacket&limit=12
router.get("/search", async (req, res, next) => {
    try {
        const query = String(req.query.q ?? "").trim();
        if (!query) return res.status(400).json({ error: "VALIDATION", message: "Query parameter 'q' is required" });

        const limit = Math.min(parseInt(String(req.query.limit ?? "12")), 20);
        const results = await searchPrices(query, limit);

        res.json({ query, count: results.length, results });
    } catch (err) { next(err); }
});

export default router;
