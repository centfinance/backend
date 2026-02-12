import { createPublicClient, createWalletClient, defineChain, http, isAddress, parseUnits, zeroAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { randomBytes } from 'node:crypto';

function requireEnv(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env var ${name}`);
    return v;
}

function parseArgs() {
    const args = process.argv.slice(2);
    const out: Record<string, string> = {};
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (!a.startsWith('--')) continue;
        const key = a.slice(2);
        const value = args[i + 1];
        if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
        out[key] = value;
        i++;
    }
    return out;
}

const weightedPoolFactoryAbi = [
    {
        type: 'event',
        name: 'PoolCreated',
        inputs: [
            { name: 'pool', type: 'address', indexed: true },
            { name: 'poolId', type: 'bytes32', indexed: true },
        ],
        anonymous: false,
    },
    {
        type: 'function',
        name: 'create',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'name', type: 'string' },
            { name: 'symbol', type: 'string' },
            {
                name: 'tokens',
                type: 'tuple[]',
                components: [
                    { name: 'token', type: 'address' },
                    { name: 'tokenType', type: 'uint8' },
                    { name: 'rateProvider', type: 'address' },
                    { name: 'paysYieldFees', type: 'bool' },
                ],
            },
            { name: 'normalizedWeights', type: 'uint256[]' },
            {
                name: 'roleAccounts',
                type: 'tuple',
                components: [
                    { name: 'pauseManager', type: 'address' },
                    { name: 'swapFeeManager', type: 'address' },
                    { name: 'poolCreator', type: 'address' },
                ],
            },
            { name: 'swapFeePercentage', type: 'uint256' },
            { name: 'poolHooksContract', type: 'address' },
            { name: 'enableDonation', type: 'bool' },
            { name: 'disableUnbalancedLiquidity', type: 'bool' },
            { name: 'salt', type: 'bytes32' },
        ],
        outputs: [{ name: 'pool', type: 'address' }],
    },
] as const;

async function main() {
    const {
        name,
        symbol,
        tokens: tokensArg,
        weights: weightsArg,
        swapFee,
        pauseManager,
        swapFeeManager,
        hooks,
        enableDonation,
        disableUnbalancedLiquidity,
        salt,
    } = parseArgs();

    if (!name || !symbol || !tokensArg || !weightsArg || !swapFee) {
        throw new Error(
            'Usage: bun run scripts/create-v3-weighted-pool.ts ' +
                '--name <name> --symbol <symbol> --tokens <a,b,...> --weights <w1,w2,...> --swapFee <0.001> ' +
                '[--pauseManager <addr>] [--swapFeeManager <addr>] [--hooks <addr>] ' +
                '[--enableDonation true|false] [--disableUnbalancedLiquidity true|false] [--salt 0x...]',
        );
    }

    const rpcUrl = requireEnv('SWELLCHAIN_SEPOLIA_RPC_URL');
    const privateKey = requireEnv('PRIVATE_KEY') as `0x${string}`;
    const factoryAddress = requireEnv('SWELLCHAIN_SEPOLIA_V3_WEIGHTED_POOL_FACTORY_ADDRESS') as `0x${string}`;

    const chain = defineChain({
        id: 1924,
        name: 'swellchain-sepolia',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [rpcUrl] } },
    });

    const account = privateKeyToAccount(privateKey);
    const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
    const walletClient = createWalletClient({ chain, transport: http(rpcUrl), account });

    const tokenList = tokensArg
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((t) => {
            if (!isAddress(t)) throw new Error(`Invalid token address: ${t}`);
            return t as `0x${string}`;
        })
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    const weightStrings = weightsArg.split(',').map((s) => s.trim()).filter(Boolean);
    if (weightStrings.length !== tokenList.length) {
        throw new Error(`--weights must have exactly ${tokenList.length} values (got ${weightStrings.length}).`);
    }

    const normalizedWeights = weightStrings.map((w) => parseUnits(w, 18));
    const sumWeights = normalizedWeights.reduce((acc, w) => acc + w, 0n);
    const ONE = 10n ** 18n;
    if (sumWeights !== ONE) {
        throw new Error(`Weights must sum to 1.0 (1e18). Got sum=${sumWeights.toString()}.`);
    }

    const swapFeePercentage = parseUnits(swapFee, 18);
    const hooksContract = (hooks ? (hooks as `0x${string}`) : zeroAddress) as `0x${string}`;

    const roleAccounts = {
        pauseManager: (pauseManager ? (pauseManager as `0x${string}`) : account.address) as `0x${string}`,
        swapFeeManager: (swapFeeManager ? (swapFeeManager as `0x${string}`) : account.address) as `0x${string}`,
        // Must be zero for "standard" pools (factory reverts otherwise)
        poolCreator: zeroAddress as `0x${string}`,
    };

    const tokens = tokenList.map((token) => ({
        token,
        tokenType: 0, // STANDARD
        rateProvider: zeroAddress as `0x${string}`,
        paysYieldFees: false,
    }));

    const enableDonationBool = (enableDonation ?? 'false').toLowerCase() === 'true';
    const disableUnbalancedLiquidityBool = (disableUnbalancedLiquidity ?? 'false').toLowerCase() === 'true';

    const saltBytes32 =
        (salt as `0x${string}` | undefined) ??
        (`0x${Buffer.from(randomBytes(32)).toString('hex')}` as `0x${string}`);

    console.log(`Using factory=${factoryAddress}`);
    console.log(`Tokens (sorted)=${tokenList.join(', ')}`);
    console.log(`Weights=${weightStrings.join(', ')} swapFee=${swapFee}`);
    console.log(`Roles: pauseManager=${roleAccounts.pauseManager} swapFeeManager=${roleAccounts.swapFeeManager} poolCreator=0x0`);
    console.log(`Hooks=${hooksContract} enableDonation=${enableDonationBool} disableUnbalancedLiquidity=${disableUnbalancedLiquidityBool}`);
    console.log(`Salt=${saltBytes32}`);

    // Static call (predict pool address & catch revert reasons early)
    const predicted = (await publicClient.readContract({
        address: factoryAddress,
        abi: weightedPoolFactoryAbi as any,
        functionName: 'create',
        args: [
            name,
            symbol,
            tokens,
            normalizedWeights,
            roleAccounts,
            swapFeePercentage,
            hooksContract,
            enableDonationBool,
            disableUnbalancedLiquidityBool,
            saltBytes32,
        ],
        account: account.address,
    })) as `0x${string}`;

    console.log(`Predicted pool=${predicted}`);

    const hash = await walletClient.writeContract({
        address: factoryAddress,
        abi: weightedPoolFactoryAbi as any,
        functionName: 'create',
        args: [
            name,
            symbol,
            tokens,
            normalizedWeights,
            roleAccounts,
            swapFeePercentage,
            hooksContract,
            enableDonationBool,
            disableUnbalancedLiquidityBool,
            saltBytes32,
        ],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    // Try to parse PoolCreated event
    let poolFromEvent: `0x${string}` | undefined;
    try {
        for (const log of receipt.logs) {
            if (log.address.toLowerCase() !== factoryAddress.toLowerCase()) continue;
            if (log.topics?.[0]?.toLowerCase() !== '0x65d64f0e26c09d9d159028a6152613dffea8d4bcf7779352b6c1c1c0d7d2ec3b') continue; // PoolCreated(address,bytes32)
            // Topic0 matches; decode via viem (safe) in case of indexing differences
            const decoded = publicClient.decodeEventLog({
                abi: weightedPoolFactoryAbi as any,
                data: log.data,
                topics: log.topics,
            }) as any;
            poolFromEvent = decoded?.args?.pool as `0x${string}` | undefined;
            if (poolFromEvent) break;
        }
    } catch {
        // ignore
    }

    const poolAddress = poolFromEvent ?? predicted;
    console.log(`Created. tx=${receipt.transactionHash}`);
    console.log(`Pool=${poolAddress}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

