// backend/routes/track.js
import express from 'express';
import Package from '../models/Package.js';

const router = express.Router();

// Handles POST requests to http://localhost:4000/track
router.post('/track', async (req, res) => {
  try {
    const { code } = req.body;

    // Validate that a code was sent
    if (!code) {
      return res.status(400).json({ found: false, error: 'Tracking code is required.' });
    }

    // Find the package in Supabase matching the code
    const pkg = await Package.findOne({ where: { code: code.trim() } });

    // If no package exists, let the frontend know cleanly
    if (!pkg) {
      return res.status(200).json({ found: false });
    }

    // Return the complete database row payload to your React app
    return res.json({
      found: true,
      code: pkg.code,
      packageInfo: pkg.packageInfo,
      current: pkg.current,
      route: pkg.route,
      traveled: pkg.traveled,
      currentRouteIndex: pkg.currentRouteIndex,
      isMoving: pkg.isMoving,
      pauseReason: pkg.pauseReason,
      statusLogs: pkg.statusLogs,
      createdAt: pkg.createdAt,
      updatedAt: pkg.updatedAt
    });

  } catch (error) {
    console.error('Database fetch error:', error);
    return res.status(500).json({ found: false, error: 'Internal Server Error' });
  }
});

export default router;