// backend/routes/adminauth.js
import express from 'express';
import Package from '../models/Package.js';

const router = express.Router();

router.post('/login', async (req, res) => {
    const { password } = req.body;
    console.log('Active', password);
});

export default router;