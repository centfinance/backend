import { tokenService } from '../../token/token.service';
import { Chain } from '@prisma/client';
import { chainToChainId as chainToIdMap } from '../../network/chain-id-to-chain';
import { GqlSorGetSwapPaths } from '../../../apps/api/gql/generated-schema';
import { replaceZeroAddressWithEth } from '../../web3/addresses';
import { Address } from 'viem';
import { Token, TokenAmount } from '@balancer/sdk';
import config from '../../../config';
import { getViemClient } from '../../sources/viem-client';
import { parseAbi } from 'viem';

const erc20DecimalsAbi = parseAbi(['function decimals() view returns (uint8)']);
const decimalsCache = new Map<string, number>();

export async function getTokenAmountHuman(tokenAddr: string, humanAmount: string, chain: Chain): Promise<TokenAmount> {
    const token = await getToken(tokenAddr, chain);
    return TokenAmount.fromHumanAmount(token, humanAmount as `${number}`);
}

export async function getTokenAmountRaw(tokenAddr: string, rawAmount: string, chain: Chain): Promise<TokenAmount> {
    const token = await getToken(tokenAddr, chain);
    return TokenAmount.fromRawAmount(token, rawAmount);
}

/**
 * Gets a b-sdk Token based off tokenAddr.
 * @param address
 * @param chain
 * @returns
 */
export const getToken = async (tokenAddr: string, chain: Chain): Promise<Token> => {
    if (tokenAddr === config[chain].eth.address) {
        return new Token(parseInt(chainToIdMap[chain]), config[chain].weth.address as Address, 18);
    } else {
        const decimals = await tokenService.getTokenDecimals(tokenAddr, chain);
        if (decimals) {
            return new Token(parseInt(chainToIdMap[chain]), tokenAddr as Address, decimals);
        }

        // Fallback for test/dev chains where token definitions may not exist yet in DB.
        // This keeps SOR usable for freshly created pools & mock tokens.
        const key = `${chain}:${tokenAddr.toLowerCase()}`;
        const cached = decimalsCache.get(key);
        if (cached !== undefined) {
            return new Token(parseInt(chainToIdMap[chain]), tokenAddr as Address, cached);
        }

        try {
            const client = getViemClient(chain);
            const onchainDecimals = (await client.readContract({
                address: tokenAddr as Address,
                abi: erc20DecimalsAbi,
                functionName: 'decimals',
            })) as number;
            decimalsCache.set(key, onchainDecimals);
            return new Token(parseInt(chainToIdMap[chain]), tokenAddr as Address, onchainDecimals);
        } catch (e) {
            throw Error(`Missing token decimals for ${tokenAddr} on ${chain}`);
        }
    }
};

export const swapPathsZeroResponse = (tokenIn: string, tokenOut: string, chain: Chain): GqlSorGetSwapPaths => {
    return {
        swaps: [],
        paths: [],
        tokenAddresses: [],
        swapType: 'EXACT_IN',
        vaultVersion: 2,
        protocolVersion: 2,
        tokenIn: replaceZeroAddressWithEth(tokenIn, chain),
        tokenOut: replaceZeroAddressWithEth(tokenOut, chain),
        tokenInAmount: '0',
        tokenOutAmount: '0',
        swapAmount: '0',
        swapAmountRaw: '0',
        returnAmount: '0',
        returnAmountRaw: '0',
        effectivePrice: '0',
        effectivePriceReversed: '0',
        routes: [],
        priceImpact: {
            error: 'No swaps found',
        },
    };
};
