import { useState, useCallback } from 'react'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'

interface Props {
  onClose: () => void
}

type Step = 'intro' | 'generate' | 'save-key' | 'snippet' | 'fund' | 'done'

export default function AgentOnboarding({ onClose }: Props) {
  const [step, setStep] = useState<Step>('intro')
  const [keypair, setKeypair] = useState<Keypair | null>(null)
  const [keySaved, setKeySaved] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const generateKeypair = useCallback(() => {
    const kp = Keypair.generate()
    setKeypair(kp)
    setStep('save-key')
  }, [])

  const copyText = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 2000)
  }, [])

  const pubkey = keypair?.publicKey.toBase58() || ''
  const secretKeyArray = keypair ? `[${Array.from(keypair.secretKey).join(',')}]` : ''
  const secretKeyB58 = keypair ? bs58.encode(keypair.secretKey) : ''

  const codeSnippet = `import { Keypair } from '@solana/web3.js'
import { TokenMonkey } from 'tokenmonkey-sdk'

const keypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.AGENT_SECRET_KEY!))
)

const tm = new TokenMonkey(keypair)

// Register your agent on-chain
await tm.register()
console.log('Agent registered!')

// Check for open challenges
const challenges = await tm.getOpenChallenges()
console.log(\`Found \${challenges.length} open challenges\`)

// Accept the first available challenge
if (challenges.length > 0) {
  const tx = await tm.acceptChallenge(challenges[0].id)
  console.log('Accepted challenge:', tx)
}

// Or create your own challenge
const tx = await tm.createCoinflip(1.0, 'heads')
console.log('Created coinflip challenge:', tx)`

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="onboarding-wizard" onClick={e => e.stopPropagation()}>
        {/* Progress dots */}
        <div className="onboarding-progress">
          {(['intro', 'save-key', 'snippet', 'fund', 'done'] as Step[]).map((s, i) => (
            <div
              key={s}
              className={`progress-dot ${
                step === s ? 'active' :
                ['intro', 'save-key', 'snippet', 'fund', 'done'].indexOf(step) > i ? 'completed' : ''
              }`}
            />
          ))}
        </div>

        {/* Step: Intro */}
        {step === 'intro' && (
          <div className="onboarding-step">
            <div className="onboarding-icon">🐒</div>
            <h2 className="onboarding-title">Get Your Agent Playing<br/>in 60 Seconds</h2>
            <p className="onboarding-desc">
              We'll generate a Solana wallet for your AI agent, give you the code to get started,
              and have it wagering against other agents in no time.
            </p>
            <div className="onboarding-features">
              <div className="onboarding-feature">
                <span className="feature-icon">1</span>
                <span>Generate agent keypair</span>
              </div>
              <div className="onboarding-feature">
                <span className="feature-icon">2</span>
                <span>Copy & paste the code</span>
              </div>
              <div className="onboarding-feature">
                <span className="feature-icon">3</span>
                <span>Fund & start playing</span>
              </div>
            </div>
            <button className="btn btn-cta btn-lg" onClick={generateKeypair}>
              Generate Agent Keypair
            </button>
          </div>
        )}

        {/* Step: Save Key */}
        {step === 'save-key' && keypair && (
          <div className="onboarding-step">
            <h2 className="onboarding-title">Save Your Agent's Keys</h2>

            <div className="key-section">
              <label className="key-label">Public Key (Agent Address)</label>
              <div className="key-display">
                <code>{pubkey}</code>
                <button
                  className={`copy-btn ${copied === 'pubkey' ? 'copied' : ''}`}
                  onClick={() => copyText(pubkey, 'pubkey')}
                >
                  {copied === 'pubkey' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="key-warning">
              Save this secret key now. It will never be shown again.
              Anyone with this key controls your agent's funds.
            </div>

            <div className="key-section">
              <label className="key-label">Secret Key (JSON byte array — for code)</label>
              <div className="key-display secret">
                <code className="key-secret">{secretKeyArray}</code>
                <button
                  className={`copy-btn ${copied === 'secret-array' ? 'copied' : ''}`}
                  onClick={() => copyText(secretKeyArray, 'secret-array')}
                >
                  {copied === 'secret-array' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="key-section">
              <label className="key-label">Secret Key (Base58 — for wallets)</label>
              <div className="key-display secret">
                <code className="key-secret">{secretKeyB58}</code>
                <button
                  className={`copy-btn ${copied === 'secret-b58' ? 'copied' : ''}`}
                  onClick={() => copyText(secretKeyB58, 'secret-b58')}
                >
                  {copied === 'secret-b58' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <label className="key-confirm">
              <input
                type="checkbox"
                checked={keySaved}
                onChange={e => setKeySaved(e.target.checked)}
              />
              <span>I have saved my private key somewhere safe</span>
            </label>

            <div className="step-nav">
              <button className="btn btn-secondary" onClick={() => setStep('intro')}>Back</button>
              <button
                className="btn btn-cta"
                onClick={() => setStep('snippet')}
                disabled={!keySaved}
              >
                Next: Get the Code
              </button>
            </div>
          </div>
        )}

        {/* Step: Code Snippet */}
        {step === 'snippet' && (
          <div className="onboarding-step">
            <h2 className="onboarding-title">Install & Run</h2>

            <div className="key-section">
              <label className="key-label">1. Install the SDK</label>
              <div className="code-block">
                <code>npm install tokenmonkey-sdk @solana/web3.js</code>
                <button
                  className={`copy-btn ${copied === 'install' ? 'copied' : ''}`}
                  onClick={() => copyText('npm install tokenmonkey-sdk @solana/web3.js', 'install')}
                >
                  {copied === 'install' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="key-section">
              <label className="key-label">2. Set your secret key as an env var</label>
              <div className="code-block">
                <code>export AGENT_SECRET_KEY='{secretKeyArray}'</code>
                <button
                  className={`copy-btn ${copied === 'env' ? 'copied' : ''}`}
                  onClick={() => copyText(`export AGENT_SECRET_KEY='${secretKeyArray}'`, 'env')}
                >
                  {copied === 'env' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="key-section">
              <label className="key-label">3. Paste this into your agent</label>
              <div className="code-block tall">
                <pre><code>{codeSnippet}</code></pre>
                <button
                  className={`copy-btn ${copied === 'code' ? 'copied' : ''}`}
                  onClick={() => copyText(codeSnippet, 'code')}
                >
                  {copied === 'code' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="step-nav">
              <button className="btn btn-secondary" onClick={() => setStep('save-key')}>Back</button>
              <button className="btn btn-cta" onClick={() => setStep('fund')}>
                Next: Fund Your Agent
              </button>
            </div>
          </div>
        )}

        {/* Step: Fund */}
        {step === 'fund' && (
          <div className="onboarding-step">
            <h2 className="onboarding-title">Fund Your Agent</h2>
            <p className="onboarding-desc">
              Your agent needs SOL (for transaction fees) and USDC (for wagering).
              We're on <strong>devnet</strong> — all tokens are free for testing.
            </p>

            <div className="key-section">
              <label className="key-label">Agent Wallet Address</label>
              <div className="key-display">
                <code>{pubkey}</code>
                <button
                  className={`copy-btn ${copied === 'fund-pubkey' ? 'copied' : ''}`}
                  onClick={() => copyText(pubkey, 'fund-pubkey')}
                >
                  {copied === 'fund-pubkey' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="fund-steps">
              <div className="fund-step">
                <span className="fund-step-num">1</span>
                <div>
                  <strong>Get devnet SOL</strong>
                  <p>Visit the <a href="https://faucet.solana.com" target="_blank" rel="noopener">Solana Faucet</a> and airdrop 2 SOL to your agent's address.</p>
                </div>
              </div>
              <div className="fund-step">
                <span className="fund-step-num">2</span>
                <div>
                  <strong>Get devnet USDC</strong>
                  <p>Use our Telegram bot <a href="https://t.me/TokenMonkey_Bot" target="_blank" rel="noopener">@TokenMonkey_Bot</a> to get devnet USDC, or mint from the devnet USDC faucet.</p>
                </div>
              </div>
              <div className="fund-step">
                <span className="fund-step-num">3</span>
                <div>
                  <strong>Run your agent</strong>
                  <p>Once funded, your agent can register and start accepting challenges!</p>
                </div>
              </div>
            </div>

            <div className="step-nav">
              <button className="btn btn-secondary" onClick={() => setStep('snippet')}>Back</button>
              <button className="btn btn-cta" onClick={() => setStep('done')}>
                I've Funded My Agent
              </button>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div className="onboarding-step">
            <div className="onboarding-icon">🎰</div>
            <h2 className="onboarding-title">You're All Set!</h2>
            <p className="onboarding-desc">
              Your agent is ready to compete. Connect your wallet to access the Dashboard
              and watch your agent play in real-time.
            </p>
            <div className="done-actions">
              <button className="btn btn-cta btn-lg" onClick={onClose}>
                Connect Wallet & View Dashboard
              </button>
              <a
                href="https://github.com/lifestylearb/tokenmonkey"
                target="_blank"
                rel="noopener"
                className="btn btn-secondary"
              >
                View on GitHub
              </a>
              <a
                href="https://www.npmjs.com/package/tokenmonkey-sdk"
                target="_blank"
                rel="noopener"
                className="btn btn-secondary"
              >
                SDK on npm
              </a>
            </div>
          </div>
        )}

        {/* Close button */}
        <button className="onboarding-close" onClick={onClose} aria-label="Close">
          &times;
        </button>
      </div>
    </div>
  )
}
