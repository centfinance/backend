import { env } from '../apps/env';
import { NetworkData } from '../modules/network/network-config-types';

/**
 * Swellchain Sepolia (chainId: 1924)
 *
 * This backend relies on:
 * - RPC URL
 * - Balancer v3 vault + router addresses
 * - Balancer v3 subgraphs (vault + pools)
 *
 * Configure these via `.env` (see `env.local` for suggested keys).
 */
export default ({
    chain: {
        slug: 'swellchain-sepolia',
        id: 1924,
        nativeAssetAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        wrappedNativeAssetAddress: env.SWELLCHAIN_SEPOLIA_WETH_ADDRESS || '',
        prismaId: 'SWELLCHAIN_SEPOLIA',
        gqlId: 'SWELLCHAIN_SEPOLIA',
    },
    subgraphs: {
        // Set this to when your deployments started indexing.
        startDate: '2026-02-01',
        balancer: env.SWELLCHAIN_SEPOLIA_BALANCER_V2_SUBGRAPH_URL || '',
        balancerV3: env.SWELLCHAIN_SEPOLIA_BALANCER_V3_SUBGRAPH_URL || '',
        balancerPoolsV3: env.SWELLCHAIN_SEPOLIA_BALANCER_POOLS_V3_SUBGRAPH_URL || '',
        cowAmm: env.SWELLCHAIN_SEPOLIA_COW_AMM_SUBGRAPH_URL || '',
        gauge: env.SWELLCHAIN_SEPOLIA_GAUGE_SUBGRAPH_URL || '',
    },
    eth: {
        address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        addressFormatted: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        symbol: 'ETH',
        name: 'Ether',
    },
    weth: {
        address: (env.SWELLCHAIN_SEPOLIA_WETH_ADDRESS || '').toLowerCase(),
        addressFormatted: env.SWELLCHAIN_SEPOLIA_WETH_ADDRESS || '',
    },
    coingecko: {
        nativeAssetId: 'ethereum',
        platformId: 'ethereum',
        excludedTokenAddresses: [],
    },
    rpcUrl: env.SWELLCHAIN_SEPOLIA_RPC_URL || 'https://swell-testnet.alt.technology',
    rpcMaxBlockRange: 10_000,
    acceptableSGLag: 100, // ~1min, tune for your subgraph
    protocolToken: 'bal',
    bal: env.SWELLCHAIN_SEPOLIA_BAL_ADDRESS ? { address: env.SWELLCHAIN_SEPOLIA_BAL_ADDRESS } : undefined,
    balancer: {
        v2: {
            vaultAddress: env.SWELLCHAIN_SEPOLIA_V2_VAULT_ADDRESS || '',
            defaultSwapFeePercentage: '0.5',
            defaultYieldFeePercentage: '0.5',
            balancerQueriesAddress: env.SWELLCHAIN_SEPOLIA_V2_BALANCER_QUERIES_ADDRESS || '',
        },
        v3: {
            vaultAddress: env.SWELLCHAIN_SEPOLIA_V3_VAULT_ADDRESS || '',
            // Not part of NetworkData typing, but used elsewhere in configs.
            protocolFeeController: env.SWELLCHAIN_SEPOLIA_V3_PROTOCOL_FEE_CONTROLLER || '',
            routerAddress: env.SWELLCHAIN_SEPOLIA_V3_ROUTER_ADDRESS || '',
            defaultSwapFeePercentage: '0.5',
            defaultYieldFeePercentage: '0.1',
        },
    },
    hooks: {},
    aprHandlers: {},
    multicall: env.SWELLCHAIN_SEPOLIA_MULTICALL_ADDRESS || env.SWELLCHAIN_SEPOLIA_MULTICALL3_ADDRESS || '',
    multicall3: env.SWELLCHAIN_SEPOLIA_MULTICALL3_ADDRESS || env.SWELLCHAIN_SEPOLIA_MULTICALL_ADDRESS || '',
    avgBlockSpeed: 2,
    monitoring: {
        main: {
            alarmTopicArn: '',
        },
        canary: {
            alarmTopicArn: '',
        },
    },
} as unknown) as NetworkData;

