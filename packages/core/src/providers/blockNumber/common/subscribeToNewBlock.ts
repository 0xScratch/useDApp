import { Provider } from 'ethers'
import { ChainId } from '../../../constants'
import { Dispatch } from 'react'
import { BlockNumberChanged } from './reducer'

export async function subscribeToNewBlock(
  provider: Provider,
  chainId: ChainId | undefined,
  dispatch: Dispatch<BlockNumberChanged>,
  isActive: boolean
) {
  if (provider && chainId !== undefined && isActive) {
    const update = (blockNumber: number) => dispatch({ chainId, blockNumber })
    await provider.on('block', update)

    provider.getBlockNumber().then(
      (blockNumber) => update(blockNumber),
      (err) => {
        console.error(err)
      }
    )

    return () => {
      void provider.off('block', update)
    }
  }

  return () => undefined
}
