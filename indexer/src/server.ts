import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { initDb } from './db.js'
import { startIndexer } from './indexer.js'
import { router } from './routes.js'

const app = express()
const PORT = parseInt(process.env.PORT || '3001')

app.use(cors())
app.use(express.json())
app.use('/api', router)

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'TokenMonkey Indexer',
    version: '0.1.0',
    endpoints: [
      'GET /api/health',
      'GET /api/challenges?wallet=xxx',
      'GET /api/challenges/open',
      'GET /api/challenges/:id',
      'GET /api/stats?wallet=xxx',
      'GET /api/leaderboard',
    ],
  })
})

// Initialize
initDb()
startIndexer()

app.listen(PORT, () => {
  console.log(`TokenMonkey indexer running on http://localhost:${PORT}`)
})
