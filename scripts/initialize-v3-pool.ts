import { createPublicClient, createWalletClient, http, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { defineChain } from 'viem';

import BalancerRouterAbi from '../modules/sources/contracts/abis/BalancerRouter';
import VaultV3Abi from '../modules/sources/contracts/abis/VaultV3';
import Erc20Abi from '../modules/sources/contracts/abis/ERC20';

const DEFAULT_PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as const;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

function isZeroAddress(a: string) {
    return a.toLowerCase() === ZERO_ADDRESS;
}

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

async function main() {
    const { pool, amounts } = parseArgs();
    if (!pool) {
        throw new Error('Usage: bun run scripts/initialize-v3-pool.ts --pool <poolAddress> --amounts <a,b,c>');
    }

    const rpcUrl = requireEnv('SWELLCHAIN_SEPOLIA_RPC_URL');
    const vaultAddress = requireEnv('SWELLCHAIN_SEPOLIA_V3_VAULT_ADDRESS') as `0x${string}`;
    const routerAddress = requireEnv('SWELLCHAIN_SEPOLIA_V3_ROUTER_ADDRESS') as `0x${string}`;
    const privateKey = requireEnv('PRIVATE_KEY') as `0x${string}`;

    const chain = defineChain({
        id: 1924,
        name: 'swellchain-sepolia',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [rpcUrl] } },
    });

    const account = privateKeyToAccount(privateKey);
    const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
    const walletClient = createWalletClient({ chain, transport: http(rpcUrl), account });

    // Routers can be deployed in two modes:
    // - Permit2 ("retail") mode: router pulls tokens from the user via Permit2.
    // - Prepaid mode: router expects tokens to already be in the Vault and uses `vault.settle`.
    //
    // Your Swellchain-Sepolia router is prepaid (getPermit2() returns address(0)).
    const routerInfoAbi = [
        { type: 'function', name: 'getPermit2', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
        { type: 'function', name: 'version', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
    ] as const;

    const routerPermit2 = (await publicClient
        .readContract({
            address: routerAddress,
            abi: routerInfoAbi as any,
            functionName: 'getPermit2',
        })
        .catch(() => DEFAULT_PERMIT2)) as `0x${string}`;

    const routerVersion = await publicClient
        .readContract({
            address: routerAddress,
            abi: routerInfoAbi as any,
            functionName: 'version',
        })
        .catch(() => 'UNKNOWN');

    const permit2Address =
        !isZeroAddress(routerPermit2) && process.env.PERMIT2_ADDRESS ? (process.env.PERMIT2_ADDRESS as `0x${string}`) : routerPermit2;

    console.log(
        `Using vault=${vaultAddress} router=${routerAddress} routerVersion=${routerVersion} routerPermit2=${routerPermit2} permit2=${permit2Address}`,
    );

    const poolAddress = pool as `0x${string}`;

    const tokens = (await publicClient.readContract({
        address: vaultAddress,
        abi: VaultV3Abi as any,
        functionName: 'getPoolTokens',
        args: [poolAddress],
    })) as `0x${string}`[];

    if (!tokens?.length) {
        throw new Error(`Vault returned no tokens for pool ${poolAddress}. Is the pool registered in the v3 vault?`);
    }

    const amountStrings = (amounts ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (amountStrings.length !== tokens.length) {
        throw new Error(
            `--amounts must have exactly ${tokens.length} comma-separated values (got ${amountStrings.length}). ` +
                `Token order is the vault's token order: ${tokens.join(', ')}`,
        );
    }

    // If in Permit2 mode, setup requires:
    // 1) ERC20 approve(token -> Permit2)
    // 2) Permit2 approve(owner -> router for token)
    const tokenMetas = await Promise.all(
        tokens.map(async (token) => {
            const [decimals, symbol, balance, erc20AllowanceToPermit2] = await Promise.all([
                publicClient.readContract({
                    address: token,
                    abi: Erc20Abi as any,
                    functionName: 'decimals',
                }) as Promise<number>,
                publicClient
                    .readContract({
                        address: token,
                        abi: Erc20Abi as any,
                        functionName: 'symbol',
                    })
                    .catch(() => 'UNKNOWN') as Promise<string>,
                publicClient.readContract({
                    address: token,
                    abi: Erc20Abi as any,
                    functionName: 'balanceOf',
                    args: [account.address],
                }) as Promise<bigint>,
                publicClient.readContract({
                    address: token,
                    abi: Erc20Abi as any,
                    functionName: 'allowance',
                    args: [account.address, permit2Address],
                }) as Promise<bigint>,
            ]);
            return { token, decimals, symbol, balance, erc20AllowanceToPermit2 };
        }),
    );

    const exactAmountsIn = tokenMetas.map((meta, i) => parseUnits(amountStrings[i], meta.decimals));

    for (let i = 0; i < tokenMetas.length; i++) {
        const meta = tokenMetas[i];
        const needed = exactAmountsIn[i];
        if (meta.balance < needed) {
            throw new Error(
                `Insufficient balance for ${meta.symbol} (${meta.token}). Have ${meta.balance.toString()}, need ${needed.toString()}.`,
            );
        }
    }

    const isPrepaidRouter = isZeroAddress(routerPermit2);
    if (isPrepaidRouter) {
        console.log('Router is in prepaid mode (Permit2=0). Pre-transferring tokens to the Vault...');
        for (let i = 0; i < tokenMetas.length; i++) {
            const meta = tokenMetas[i];
            const needed = exactAmountsIn[i];
            const [reservesBefore, currentBalance] = await Promise.all([
                publicClient.readContract({
                    address: vaultAddress,
                    abi: VaultV3Abi as any,
                    functionName: 'getReservesOf',
                    args: [meta.token],
                }) as Promise<bigint>,
                publicClient.readContract({
                    address: meta.token,
                    abi: Erc20Abi as any,
                    functionName: 'balanceOf',
                    args: [vaultAddress],
                }) as Promise<bigint>,
            ]);

            // We need `currentBalance - reservesBefore >= needed` so that when the router calls `vault.settle(token, needed)`
            // the Vault credits at least `needed` and transient accounting can be balanced.
            const minBalanceAfter = reservesBefore + needed;
            const transferAmount = currentBalance >= minBalanceAfter ? 0n : minBalanceAfter - currentBalance;

            if (transferAmount > 0n) {
                console.log(
                    `  ${meta.symbol}: reservesBefore=${reservesBefore} currentBalance=${currentBalance} transfer=${transferAmount}`,
                );
                const hash = await walletClient.writeContract({
                    address: meta.token,
                    abi: Erc20Abi as any,
                    functionName: 'transfer',
                    args: [vaultAddress, transferAmount],
                });
                await publicClient.waitForTransactionReceipt({ hash });
            } else {
                console.log(`  ${meta.symbol}: already funded for settle (no transfer needed)`);
            }
        }
    } else {
        for (let i = 0; i < tokenMetas.length; i++) {
            const meta = tokenMetas[i];
            const needed = exactAmountsIn[i];
            if (meta.erc20AllowanceToPermit2 < needed) {
                console.log(`Approving Permit2 for ${meta.symbol} (${meta.token})...`);
                const hash = await walletClient.writeContract({
                    address: meta.token,
                    abi: Erc20Abi as any,
                    functionName: 'approve',
                    // Unlimited approve is convenient for testnets/dev
                    args: [permit2Address, 2n ** 256n - 1n],
                });
                await publicClient.waitForTransactionReceipt({ hash });
            }
        }

        // Minimal Permit2 ABI needed for allowance+approve
        const permit2Abi = [
            {
                type: 'function',
                name: 'allowance',
                stateMutability: 'view',
                inputs: [
                    { name: 'user', type: 'address' },
                    { name: 'token', type: 'address' },
                    { name: 'spender', type: 'address' },
                ],
                outputs: [
                    { name: 'amount', type: 'uint160' },
                    { name: 'expiration', type: 'uint48' },
                    { name: 'nonce', type: 'uint48' },
                ],
            },
            {
                type: 'function',
                name: 'approve',
                stateMutability: 'nonpayable',
                inputs: [
                    { name: 'token', type: 'address' },
                    { name: 'spender', type: 'address' },
                    { name: 'amount', type: 'uint160' },
                    { name: 'expiration', type: 'uint48' },
                ],
                outputs: [],
            },
        ] as const;

        const maxUint160 = (2n ** 160n - 1n) as bigint;
        const maxUint48 = (2n ** 48n - 1n) as bigint;

        const now = BigInt(Math.floor(Date.now() / 1000));
        for (const meta of tokenMetas) {
            const [amount, expiration] = (await publicClient.readContract({
                address: permit2Address,
                abi: permit2Abi as any,
                functionName: 'allowance',
                args: [account.address, meta.token, routerAddress],
            })) as [bigint, bigint, bigint];

            // If allowance isn't set or is expired, set an unlimited one.
            if (amount === 0n || expiration === 0n || expiration < now) {
                console.log(`Setting Permit2 allowance for router for ${meta.symbol} (${meta.token})...`);
                const hash = await walletClient.writeContract({
                    address: permit2Address,
                    abi: permit2Abi as any,
                    functionName: 'approve',
                    args: [meta.token, routerAddress, maxUint160, maxUint48],
                });
                await publicClient.waitForTransactionReceipt({ hash });
            }
        }
    }

    console.log(`Initializing pool ${poolAddress} via router ${routerAddress}...`);
    const initHash = await walletClient.writeContract({
        address: routerAddress,
        abi: BalancerRouterAbi as any,
        functionName: 'initialize',
        args: [poolAddress, tokens, exactAmountsIn, 0n, false, '0x'],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: initHash });
    console.log(`Initialized. tx=${receipt.transactionHash}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

