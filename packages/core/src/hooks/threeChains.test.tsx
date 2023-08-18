/* eslint react-hooks/rules-of-hooks: 0 */
import { AbstractProvider, Contract, Wallet, ZeroAddress } from 'ethers'
import { useCall, useCalls } from './useCall'
import { MockProvider, SECOND_TEST_CHAIN_ID, renderDAppHook, waitUntil } from '../testing'
import { doublerContractABI, MultiCall, timestampContractABI } from '../constants/abi'
import { expect } from 'chai'
import { randomInt } from 'crypto'
import { deployContract } from '../testing/utils/deployContract'
import waitForExpect from 'wait-for-expect'

const FIRST_TEST_CHAIN_ID = 1337
const THIRD_TEST_CHAIN_ID = 31338

interface ChainData {
  provider: AbstractProvider
  deployer: Wallet
  mineBlock?: () => Promise<void>
  isBlockMining?: boolean
  mineBlockTimerId?: number
  timestampContract?: Contract
  doublerContract?: Contract
  multicallAddress?: string
}

type Chains = {
  [chainId: number]: ChainData
}

const chainIds = [FIRST_TEST_CHAIN_ID, SECOND_TEST_CHAIN_ID, THIRD_TEST_CHAIN_ID] as const

describe('useCall - three chains', () => {
  const chains: Chains = {}

  function extractFromChains<T extends keyof ChainData>(
    prop: T
  ): { [chainId: number]: Exclude<ChainData[T], undefined> } {
    const entries = Object.entries(chains).map(([chainId, data]) => [chainId, data[prop]])
    const filteredEntries = entries.filter(([, value]) => value !== undefined)
    return Object.fromEntries(filteredEntries)
  }

  for (const chainId of chainIds) {
    const provider = new MockProvider({ chainId })
    const [deployer] = provider.getWallets()
    chains[chainId] = {
      provider,
      deployer,
    }
    const mineBlock = async () => {
      if (!chains[chainId].isBlockMining) {
        chains[chainId].isBlockMining = true
        const tx = await deployer.sendTransaction({ to: ZeroAddress, value: 0 })
        await tx.wait()
        chains[chainId].isBlockMining = false
      }
    }
    chains[chainId].mineBlock = mineBlock
  }

  beforeEach(async () => {
    for (const [, chain] of Object.entries(chains)) {
      chain.timestampContract = await deployContract(chain.deployer, timestampContractABI)
      chain.doublerContract = await deployContract(chain.deployer, doublerContractABI)
      chain.multicallAddress = (await deployContract(chain.deployer, MultiCall)).target as string
      if (chain.mineBlock) {
        chain.mineBlockTimerId = +setInterval(chain.mineBlock, (randomInt(10) + 1) * 100)
      }
    }
  })

  afterEach(async () => {
    for (const [, chain] of Object.entries(chains)) {
      clearInterval(chain.mineBlockTimerId)
    }
    await waitUntil(() => {
      for (const [, chain] of Object.entries(chains)) {
        if (chain.isBlockMining) {
          return false
        }
      }
      return true
    })
  })

  const numberOfCalls = 100

  const useTimestamps = (chainId: number) =>
    useCall(
      {
        contract: chains[chainId].timestampContract!,
        method: 'getTimestamp',
        args: [numberOfCalls],
      },
      { chainId }
    )

  const useDoubler = (chainId: number) => (arr: BigInt[] | undefined) =>
    useCalls(
      arr === undefined
        ? []
        : arr.map((timestamp) => ({
            contract: chains[chainId].doublerContract!,
            method: 'double',
            args: [timestamp],
          })),
      { chainId }
    )

  for (let num = 0; num < 5; num++) {
    it('Test #' + num, async () => {
      const { result } = await renderDAppHook(
        () => {
          const timestampsFirstChain = useTimestamps(FIRST_TEST_CHAIN_ID)
          const timestampsSecondChain = useTimestamps(SECOND_TEST_CHAIN_ID)
          const timestampsThirdChain = useTimestamps(THIRD_TEST_CHAIN_ID)
          const dTimestampsFirstChain = useDoubler(FIRST_TEST_CHAIN_ID)(timestampsFirstChain?.value?.[0])
          const dTimestampsSecondChain = useDoubler(SECOND_TEST_CHAIN_ID)(timestampsSecondChain?.value?.[0])
          const dTimestampsThirdChain = useDoubler(THIRD_TEST_CHAIN_ID)(timestampsThirdChain?.value?.[0])
          return {
            timestamps: {
              [FIRST_TEST_CHAIN_ID]: timestampsFirstChain as any,
              [SECOND_TEST_CHAIN_ID]: timestampsSecondChain as any,
              [THIRD_TEST_CHAIN_ID]: timestampsThirdChain as any,
            },
            doubled: {
              [FIRST_TEST_CHAIN_ID]: dTimestampsFirstChain as any,
              [SECOND_TEST_CHAIN_ID]: dTimestampsSecondChain as any,
              [THIRD_TEST_CHAIN_ID]: dTimestampsThirdChain as any,
            },
          }
        },
        {
          config: {
            readOnlyChainId: FIRST_TEST_CHAIN_ID,
            readOnlyUrls: extractFromChains('provider'),
            multicallAddresses: extractFromChains('multicallAddress'),
            refresh: 'never',
          },
        }
      )

      await waitForExpect(() => {
        const allDefined = chainIds.every((chainId) => {
          const timestamps = result.current?.doubled?.[chainId]
          if (timestamps?.length !== numberOfCalls) {
            return false
          }

          return timestamps.every((timestamp: any) => timestamp !== undefined)
        })

        expect(allDefined).to.be.true
      })

      for (const chainId of chainIds) {
        const timestamps = result.current.timestamps[chainId]
        const doubled = result.current.doubled[chainId]
        for (let i = 0; i < timestamps?.value?.[0]?.length; i++) {
          expect(timestamps?.value[0]?.[i] * BigInt(2)).to.eq(doubled[i]?.value[0])
        }
      }
    }).timeout(12000)
  }
})
