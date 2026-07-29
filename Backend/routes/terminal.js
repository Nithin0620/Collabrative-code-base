import { Router } from 'express'
import { authenticateToken } from '../middleware/auth.js'
import { killTerminal } from '../utils/terminalManager.js'

const router = Router()

router.delete('/:terminalId', authenticateToken, async (req, res) => {
  try {
    await killTerminal(req.params.terminalId)
    res.json({ killed: true })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
