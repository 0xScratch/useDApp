import { useEffect, useRef } from 'react'
import type { Provider, Signer } from 'ethers'
import { Contract } from 'ethers'
import { GNOSIS_SAFE_ABI } from '../helpers/gnosisSafeUtils'

/**
 * @internal Intended for internal use - use it on your own risk
 */
export const useGnosisSafeContract = (
  account: string | undefined,
  provider: Signer | Provider | undefined
) => {
  const safeContract = useRef<Contract | undefined>(undefined)

  useEffect(() => {
    return () => {
      void safeContract.current?.removeAllListeners()
    }
  }, [])

  return {
    get: () => {
      if (!account || !provider) {
        return undefined
      }

      if (safeContract.current) {
        void safeContract.current.removeAllListeners()
      }
      safeContract.current = new Contract(account, GNOSIS_SAFE_ABI, provider)

      return safeContract.current
    },
  }
}
