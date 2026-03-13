import { useGame } from '../store'

interface WalletModalProps {
  onClose: () => void
}

// Legacy wallet modal — now just opens the Solana wallet-adapter modal.
// Kept for backwards compatibility with any agent code that references it.
export default function WalletModal({ onClose }: WalletModalProps) {
  const { connectWallet } = useGame()

  const handleConnect = () => {
    connectWallet()
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation" data-testid="wallet-modal-overlay">
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Connect wallet"
        data-testid="wallet-modal"
      >
        <div className="modal-header">
          <h2>Connect Solana Wallet</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close wallet modal" data-testid="wallet-modal-close">&times;</button>
        </div>
        <p className="modal-desc">
          Connect a Solana wallet (Phantom, Solflare) to start challenging.
        </p>
        <button className="btn btn-primary btn-lg" onClick={handleConnect} data-testid="wallet-connect-solana">
          Connect Wallet
        </button>
      </div>
    </div>
  )
}
