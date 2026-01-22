'use client'
import { FC, ReactNode, useMemo } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare'
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack'

export const WalletConnectionProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const endpoint = (process.env.NEXT_PUBLIC_SOLANA_RPC_URL as string)
    || (process.env.NEXT_PUBLIC_CLUSTER === 'devnet' ? 'https://api.devnet.solana.com'
    : (process.env.NEXT_PUBLIC_CLUSTER === 'testnet' ? 'https://api.testnet.solana.com' : 'https://api.mainnet-beta.solana.com'))
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter({ network: process.env.NEXT_PUBLIC_CLUSTER as any }),
    new BackpackWalletAdapter(),
  ], [])
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
