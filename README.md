# Balancer API

Welcome to Balancer's API. This guide will help you get started with using the API and accessing the data locked in Balancer's contracts.

## Getting started

The API is running as a graphql server and is deployed at: [https://api-v3.balancer.fi](https://api-v3.balancer.fi)

## Swellchain Sepolia (chainId 1924) local notes (Symmetric v4 / Balancer v3 fork)

This repo can be pointed at Swellchain-Sepolia by setting `DEFAULT_CHAIN_ID=1924` and configuring the Swellchain-Sepolia RPC + contract + subgraph URLs in `.env`.

### Current Swellchain-Sepolia core addresses

These are the **current** (2026-02-11) addresses from the Symmetric fork deployment.

- **Vault**: `0x89d3Bdfc7F9b3C6F07daa20366F6DC48a65daE07`
- **Router (Permit2-enabled)**: `0x360667b615962d7FE35F8B566c53E046D69A578F`
- **ProtocolFeeController**: `0xEA90b92B4A3AA583AD27483b1247d80409752716`
- **WeightedPoolFactory**: `0x9E57809C7d9A1Cb069957656dEff4409DeAab34C`
- **StablePoolFactory**: `0xFE9288d762aA767c76946256A37da6B5306ceB4e`
- **WETH**: `0x4200000000000000000000000000000000000006`
- **Multicall3**: `0xca11bde05977b3631167028862be2a173976ca11`

### Subgraphs (Goldsky)

TheGraph Studio / `thegraph.com` does not currently support Swellchain-Sepolia, so the subgraphs are deployed to Goldsky (GraphQL-compatible endpoints):

- **Vault subgraph**: `https://api.goldsky.com/api/public/project_cmcdf3rxxvu1001va1c918dzw/subgraphs/symmetric-v-4-swell-testnet-vault/0.0.1770848696/gn`
- **Pools subgraph**: `https://api.goldsky.com/api/public/project_cmcdf3rxxvu1001va1c918dzw/subgraphs/symmetric-v-4-swell-testnet-pools/0.0.1770847987/gn`

### Important: prepaid vs Permit2 routers

Some older router deployments on Swellchain-Sepolia were deployed in a “prepaid” mode (router `getPermit2() == 0x0`), which caused `initialize(...)` to revert with `FailedCall()` in our flow.

The scripts in this repo now:

- Auto-detect router mode via `router.getPermit2()`
- Support Permit2 routers directly
- Support prepaid routers by pre-funding the Vault (but **pool initialization is expected to be done with the Permit2-enabled router above**)

### Test pool created in this workspace

- **Pool**: `0x6A265BF525D83511133797FCa1681f55C5376EF1` (mDAI/mUSDC weighted 50/50)
- **Initialize tx**: `0xf259f35b7c863c3698915b31d12d370b90067e95d9a577e46cae439f818aa771`

## Creating new test pools (Weighted) on Swellchain-Sepolia

### 1) Create a new Weighted pool (registers it in the Vault)

```bash
bun run scripts/create-v3-weighted-pool.ts \
  --name mDAI-mUSDC \
  --symbol mDAI-mUSDC \
  --tokens 0x8E3ADF1855725848156099134825B0b40A6c7D2f,0xB4DC57a4608E69Ec81d0471A01d139A8B2E05e46 \
  --weights 0.5,0.5 \
  --swapFee 0.001
```

This prints `Pool=0x...` which you use in the next step.

### 2) Initialize the pool (seed initial liquidity)

```bash
bun run scripts/initialize-v3-pool.ts \
  --pool 0xYourNewPool \
  --amounts 100,100
```

The `--amounts` order must match the Vault’s token order (the script fetches that order from `Vault.getPoolTokens(pool)`).

### 3) Wait for subgraphs, then load into the backend

After initialization, wait for your Vault + Pools subgraphs to index the new pool. Then run admin mutations (API playground or curl) like:

- `poolReloadPools(chains: [SWELLCHAIN_SEPOLIA])`
- `poolLoadOnChainDataForAllPools(chains: [SWELLCHAIN_SEPOLIA])`

And verify with:

- `poolGetPools(first: 50, where: { chainIn: [SWELLCHAIN_SEPOLIA] })`

## Use cases

Queries are organised around these main domains:

-   Pools
    -   poolGetPool
    -   poolGetPools
-   Gauges
    -   veBalGetUser
    -   veBalGetUserBalance
    -   veBalGetVotingList
-   Events
    -   poolGetEvents
-   Users
    -   userGetPoolBalances
    -   userGetStaking
-   Tokens
    -   tokenGetTokens
    -   tokenGetTokenDynamicData
    -   tokenGetTokensDynamicData
    -   tokenGetTokenData
    -   tokenGetTokensData
-   Prices
    -   tokenGetCurrentPrices
    -   tokenGetHistoricalPrices
-   SOR
    -   sorGetSwapPaths

To query specific data refer to the [API's documentation](https://api-v3.balancer.fi/). Click top left to show the Documentation Explorer.

Most of the queries will take one or multiple `chain` as an argument. The usage of the `chainId` header is deprecated!

## Examples

How to get the pool's details including APRs.

```
{
  poolGetPool(id: "0x7f2b3b7fbd3226c5be438cde49a519f442ca2eda00020000000000000000067d", chain:MAINNET) {
    id
    name
    type
    version
    allTokens {
      address
      name
    }
    poolTokens {
      address
      symbol
      balance
      hasNestedPool
    }
    dynamicData {
      totalLiquidity
      aprItems {
        title
        type
        apr
      }
    }
  }
}
```

Query all pools on Arbitrum and Avalanche that have TVL greater than $10k:

```
{
  poolGetPools(where: {chainIn: [AVALANCHE, ARBITRUM], minTvl: 10000}) {
    id
    address
    name
  }
}
```

Query the SOR to swap 1 WETH to USDC

```
{
  sorGetSwapPaths(
    chain: MAINNET
    swapAmount: "1"
    swapType: EXACT_IN
    tokenIn: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
    tokenOut: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
  ) {
    swapAmountRaw
    returnAmountRaw
    priceImpact {
      priceImpact
      error
    }
  }
}
```

## Pricing of tokens

First of all, for a token to be able to have a price it must be allowed, meaning it must be added to the [tokenlist](https://github.com/balancer/tokenlists). This must happen _before_ any pricing can occur.

To price a token there are various handlers that will try to price a token. These handlers take priority over each other. This means that as soon
as a handler can price a token, it will not be price by another handler. These handlers, order by priority, are:

1. Protocol specific handlers such as Aave or fbeets where prices can be infered via on-chain calls and underlying token prices
2. Coingecko
3. BPT price handler ($TVL/totalShares)
4. Swaps (When ever a token is swapped with a token that has a price, the original token's price is inferred relative to the swapped token)

In addition to this, there are manual interventions possible:

1. If a token has a wrong Coingecko feed, it can be excluded by adding [an override](https://github.com/balancer/tokenlists/blob/main/src/tokenlists/balancer/overwrites.ts#L406) like this `extensions: { coingeckoId: null, },`.
2. If a token does not have a Coingecko feed on a specific chain, or can be priced using a different token's Coingecko feed, the Coingecko ID can [be overridden](https://github.com/balancer/tokenlists/blob/main/src/tokenlists/balancer/overwrites.ts#L393) with another ID like this `extensions: { coingeckId: 'gyroscope-gyd', },`.

# Development

## Project setup

### Prepare .env file

Rename `env.local` file to `.env`.

For the sanity content to work, you need to set
the `SANITY_API_TOKEN`.

### Generate gql types

There are 2 kinds of graphql types to generate. We have types for interacting with the different subgraphs, and the types
for our exposed graphql api schema.
Run `yarn generate` to generate all gql types

### Setup empty database & Prisma

#### Start docker container and manually set up your database (For setup from backup, read below)

First we need to spin up the database, there is a `docker-compose` file with a postgres
database configured. Spin it up by running `docker-compose up -d`.

#### Apply prisma migrations

Run `yarn prisma migrate dev` to apply all database migrations.

#### Generate prisma client

Run `yarn prisma generate` to generate the prisma client. Usually this is already
done by applying the migrations

#### Run mutations to initialize fill database with intial data

Trigger the following mutations when you start from a clean DB:

```
poolSyncAllPoolsFromSubgraph
poolReloadStakingForAllPools
userInitWalletBalancesForAllPools
userInitStakedBalances
```

You can do that by starting the server in development mode with hot reloading and calling the methods via API playground, or curl from the shell:

```
curl -d '{"query":"mutation { poolSyncAllPoolsFromSubgraph }"}' -H 'Content-Type: application/json' -H 'chainId: 1' -H "AdminApiKey: $(grep '^ADMIN_API_KEY=' .env | cut -d '=' -f2)" http://localhost:4000/graphql
```

### Setup database & Prisma from backup

Retrieve the current pg_dump file under `https://api-db-dump.s3.eu-central-1.amazonaws.com/canary/api-dump.YYYYMMDD`.
Database dumps are kept for the previous 7 days, replace YYYYMMDD in the URL above (ie: 20230317) to download a db dump.

Run `docker-compose up -d` to start the database via docker compose.

Run `docker exec -i $(docker ps -qf "name=balancer-backend") /bin/bash -c "PGPASSWORD=let-me-in psql --username backend database" < /path/on/your/machine/dump`

The output at the very end saying `ERROR: role "rdsadmin" does not exist` is normal and can be ignored.

## Run locally

`yarn dev`

## Branching and deployment environments

We run a canary and a production (called main) deployment environment.
The canary environment is built from the `v3-canary` branch and the production deployment
is built from the `v3-main` branch. The environments can be accessed through the following links:

https://backend-v3.beets-ftm-node.com/

https://api-v3.balancer.fi/

## Contributing

To contribute, branch from `v3-canary` (which is our development branch) and open a PR against `v3-canary` once the feature is complete. It will be reviewed and eventually merged into v2-canary.

### Database Updates

If you make any changes to the database schema be sure to run `yarn prisma migrate dev --name <change_name>` which will create a new file in `prisma/migrations` that contains all the database changes you've made as an SQL update script.
