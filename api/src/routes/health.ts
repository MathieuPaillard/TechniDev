import { Router } from 'express';

const router = Router();

// Ne touche pas la base : le contrôle de santé de Render ne doit pas tenir Neon éveillé (SPEC §B4).
router.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

export default router;
