import { Router } from 'express'
const router = Router()
router.get('/', (req, res) => res.status(503).json({ error: 'SSE not yet implemented' }))
export default router
