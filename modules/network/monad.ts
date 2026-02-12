import { NetworkConfig, NetworkData } from './network-config-types';
import config from '../../config';
import { activeChainWorkerJobsGeneric, activeChainWorkerJobsV3, lbpWorkerJobs } from './worker-jobs';

// This chain is experimental and may not be wired in all deployments.
// Keep it loosely typed so it doesn't break builds if config doesn't include it.
const monadNetworkData: NetworkData = (config as any).MONAD;

export const monadNetworkConfig: NetworkConfig = {
    data: monadNetworkData,
    userStakedBalanceServices: [],
    workerJobs: [...activeChainWorkerJobsGeneric, ...activeChainWorkerJobsV3, ...lbpWorkerJobs],
};
