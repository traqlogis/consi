// backend/routes/adminauth.js
import express from 'express';
import Package from '../models/package.js';

const router = express.Router();

router.post('/login', async (req, res) => {
    const { password } = req.body;
    console.log('Active', password);
});

export default router;