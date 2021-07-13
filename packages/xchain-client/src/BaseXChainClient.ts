/* eslint-disable ordered-imports/ordered-imports */
import { validatePhrase } from '@xchainjs/xchain-crypto'
import { Asset, Chain } from '@xchainjs/xchain-util'
import axios from 'axios'

import {
  Address,
  Balance,
  FeeRate,
  Fees,
  Network,
  RootDerivationPaths,
  Tx,
  TxHistoryParams,
  TxParams,
  TxsPage,
  XChainClient,
  XChainClientParams,
} from './types'

import { Explorer } from './Explorer'

import { Explorers } from './Explorers'
import { Provider, ProviderMap, ProviderParams } from './providers/Provider'
import { DefaultProviders } from './providers/Providers'

const MAINNET_THORNODE_API_BASE = 'https://thornode.thorchain.info/thorchain'
const TESTNET_THORNODE_API_BASE = 'https://testnet.thornode.thorchain.info/thorchain'

export abstract class BaseXChainClient implements XChainClient {
  protected chain: Chain
  protected network: Network
  protected phrase = ''
  protected rootDerivationPaths: RootDerivationPaths | undefined
  protected explorer: Explorer
  protected providerMap: ProviderMap

  /**
   * Constructor
   *
   * Client has to be initialised with network type and phrase.
   * It will throw an error if an invalid phrase has been passed.
   *
   * @param {XChainClientParams} params
   *
   * @throws {"Invalid phrase"} Thrown if the given phase is invalid.
   */
  constructor(chain: Chain, params: XChainClientParams) {
    this.chain = chain
    this.network = params.network || Network.Testnet
    this.explorer = params.explorer || Explorers[chain].DEFAULT
    this.providerMap = params.providers
      ? this.overrideDefaultProvidersMap(params.providers)
      : DefaultProviders[this.chain]

    if (params.rootDerivationPaths) this.rootDerivationPaths = params.rootDerivationPaths
    if (params.phrase) this.setPhrase(params.phrase)
  }
  overrideDefaultProvidersMap(override: ProviderParams): ProviderMap {
    return { ...DefaultProviders[this.chain], ...override } as ProviderMap
  }
  /**
   * Set/update the current network.
   *
   * @param {Network} network
   * @returns {void}
   *
   * @throws {"Network must be provided"}
   * Thrown if network has not been set before.
   */
  public setNetwork(network: Network): void {
    if (!network) {
      throw new Error('Network must be provided')
    }
    this.network = network
  }

  /**
   * Get the current network.
   *
   * @returns {Network}
   */
  public getNetwork(): Network {
    return this.network
  }

  protected async getFeeRateFromThorchain(): Promise<FeeRate> {
    const respData = await this.thornodeAPIGet('/inbound_addresses')
    if (!Array.isArray(respData)) throw new Error('bad response from Thornode API')

    const chainData: { chain: Chain; gas_rate: string } = respData.find(
      (elem) => elem.chain === this.chain && typeof elem.gas_rate === 'string',
    )
    if (!chainData) throw new Error(`Thornode API /inbound_addresses does not contain fees for ${this.chain}`)

    return Number(chainData.gas_rate)
  }

  protected async thornodeAPIGet(endpoint: string): Promise<unknown> {
    const url = (() => {
      switch (this.network) {
        case Network.Mainnet:
          return MAINNET_THORNODE_API_BASE
        case Network.Testnet:
          return TESTNET_THORNODE_API_BASE
      }
    })()
    return (await axios.get(url + endpoint)).data
  }

  /**
   * Set/update a new phrase
   *
   * @param {string} phrase A new phrase.
   * @param {number} walletIndex (optional) HD wallet index
   * @returns {Address} The address from the given phrase
   *
   * @throws {"Invalid phrase"}
   * Thrown if the given phase is invalid.
   */
  public setPhrase(phrase: string, walletIndex = 0): Address {
    if (this.phrase !== phrase) {
      if (!validatePhrase(phrase)) {
        throw new Error('Invalid phrase')
      }
      this.phrase = phrase
    }

    return this.getAddress(walletIndex)
  }

  /**
   * Get getFullDerivationPath
   *
   * @param {number} walletIndex HD wallet index
   * @returns {string} The bitcoin derivation path based on the network.
   */
  protected getFullDerivationPath(walletIndex: number): string {
    return this.rootDerivationPaths ? `${this.rootDerivationPaths[this.network]}${walletIndex}` : ''
  }
  /**
   * Purge client.
   *
   * @returns {void}
   */
  public purgeClient(): void {
    this.phrase = ''
  }
  // ==================
  // Explorer methods
  // ==================
  /**
   * Get the explorer url for the given address.
   *
   * @param {Address} address
   * @returns {string} The explorer url for the given address based on the network.
   */
  getExplorerAddressUrl(address: string): string {
    return this.explorer.getExplorerAddressUrl(this.network, address)
  }
  /**
   * Get the explorer url for the given transaction id.
   *
   * @param {string} txID The transaction id
   * @returns {string} The explorer url for the given transaction id based on the network.
   */
  getExplorerTxUrl(txID: string): string {
    return this.explorer.getExplorerAddressUrl(this.network, txID)
  }
  // ==================
  // Provider methods
  // ==================
  async getBalance(address: string, assets?: Asset[]): Promise<Balance[]> {
    const providers = this.providerMap.getBalance
    for (let index = 0; index < providers.length; index++) {
      const provider: Provider = providers[index]
      try {
        return await provider.getBalance(this.network, address, assets)
      } catch (error) {
        console.log(error)
      }
    }
    //ALL attempts failed
    throw new Error('unable to getBalance')
  }

  //individual clients will need to implement these
  abstract getFees(): Promise<Fees>
  abstract getAddress(walletIndex: number): string
  abstract validateAddress(address: string): boolean
  // abstract getBalance(address: string, assets?: Asset[]): Promise<Balance[]>
  abstract getTransactions(params?: TxHistoryParams): Promise<TxsPage>
  abstract getTransactionData(txId: string, assetAddress?: string): Promise<Tx>
  abstract transfer(params: TxParams): Promise<string>
}
