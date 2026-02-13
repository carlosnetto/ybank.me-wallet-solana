import { ethers } from 'ethers';
import { BASE_RPC_URL, USDC_ADDRESS_BASE, Transaction } from '../types';

// ERC20 ABI with Transfer event
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

// Singleton provider instance to avoid connection churn and rate limits
let providerInstance: ethers.JsonRpcProvider | null = null;

export const getProvider = () => {
  if (!providerInstance) {
    // 1rpc.io is generally reliable for Base mainnet free tier
    providerInstance = new ethers.JsonRpcProvider('https://1rpc.io/base', 8453, { 
      staticNetwork: true,
      batchMaxCount: 1 
    });
  }
  return providerInstance;
};

export const validateMnemonic = (phrase: string): boolean => {
  return ethers.Mnemonic.isValidMnemonic(phrase);
};

export const getWalletFromMnemonic = (phrase: string) => {
  const wallet = ethers.Wallet.fromPhrase(phrase);
  return wallet.connect(getProvider());
};

export const getETHBalance = async (address: string): Promise<string> => {
  try {
    const provider = getProvider();
    const balance = await provider.getBalance(address);
    return ethers.formatEther(balance);
  } catch (error) {
    console.error("Error fetching ETH balance:", error);
    return "0.00";
  }
};

export const getUSDCBalance = async (address: string): Promise<string> => {
  try {
    const provider = getProvider();
    const contract = new ethers.Contract(USDC_ADDRESS_BASE, ERC20_ABI, provider);
    
    // Optimization: USDC always has 6 decimals. 
    // We hardcode it to avoid an extra RPC call which was causing failures.
    const decimals = 6; 
    
    const balance = await contract.balanceOf(address);
    return ethers.formatUnits(balance, decimals);
  } catch (error) {
    // Log as warning to reduce noise, since retries happen automatically via polling
    console.warn("Error fetching USDC balance:", error);
    return "0.00";
  }
};

export const sendUSDC = async (wallet: ethers.Signer, to: string, amount: string): Promise<string> => {
  const contract = new ethers.Contract(USDC_ADDRESS_BASE, ERC20_ABI, wallet);
  const decimals = 6; // Hardcoded for USDC on Base
  const amountInUnits = ethers.parseUnits(amount, decimals);
  
  try {
    const tx = await contract.transfer(to, amountInUnits);
    await tx.wait(); // Wait for confirmation
    return tx.hash;
  } catch (error: any) {
    console.error("Send Transaction Error:", error);
    
    // Handle specific ethers.js errors
    if (error.code === 'INSUFFICIENT_FUNDS' || (error.info && error.info.error && error.info.error.code === -32003)) {
      throw new Error("Insufficient ETH for gas fees. Please deposit Base ETH.");
    }
    
    // Handle generic execution revert
    if (error.code === 'CALL_EXCEPTION') {
       throw new Error("Transaction failed. Ensure you have enough USDC and ETH.");
    }

    throw new Error(error.message || "Transaction failed. Please check your connection and balance.");
  }
};

export const getRecentTransactions = async (address: string): Promise<Transaction[]> => {
  try {
    const provider = getProvider();
    const contract = new ethers.Contract(USDC_ADDRESS_BASE, ERC20_ABI, provider);
    
    // Base block time is ~2 seconds.
    // 7,500 blocks is ~4.1 hours. This is much faster than scanning days.
    const SCAN_RANGE = 7500;
    const CHUNK_SIZE = 2500; 

    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - SCAN_RANGE); 

    const filterIn = contract.filters.Transfer(null, address);
    const filterOut = contract.filters.Transfer(address, null);

    // Helper to fetch logs in chunks to respect RPC limits
    const fetchLogsChunked = async (filter: any) => {
      let allLogs: ethers.EventLog[] = [];
      // Use a functional approach to create ranges
      const ranges = [];
      for (let i = fromBlock; i < currentBlock; i += CHUNK_SIZE) {
        ranges.push({
          from: i,
          to: Math.min(i + CHUNK_SIZE - 1, currentBlock)
        });
      }

      // Execute chunks in parallel (groups of 3) to speed up fetching
      const BATCH_SIZE = 3;
      for (let i = 0; i < ranges.length; i += BATCH_SIZE) {
        const batch = ranges.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
           batch.map(range => 
             contract.queryFilter(filter, range.from, range.to)
               .catch(e => {
                 console.warn(`Error logs range ${range.from}-${range.to}:`, e);
                 return [];
               })
           )
        );
        results.forEach(chunk => {
            allLogs = [...allLogs, ...chunk as ethers.EventLog[]];
        });
      }
      return allLogs;
    };

    const [logsIn, logsOut] = await Promise.all([
      fetchLogsChunked(filterIn),
      fetchLogsChunked(filterOut)
    ]);

    // Combine logs
    const allLogs = [...logsIn, ...logsOut] as ethers.EventLog[];
    
    // Deduplicate logs based on transaction hash and log index
    const uniqueLogsMap = new Map<string, ethers.EventLog>();
    allLogs.forEach(log => {
      const key = `${log.transactionHash}-${log.index}`;
      uniqueLogsMap.set(key, log);
    });
    const uniqueLogs = Array.from(uniqueLogsMap.values());

    // Fetch timestamps for blocks
    const blockNumbers = [...new Set(uniqueLogs.map(l => l.blockNumber))];
    const blockMap: Record<number, number> = {};
    
    // Increased chunk size for block details since getBlock is usually lighter
    const requestChunkSize = 10; 
    for (let i = 0; i < blockNumbers.length; i += requestChunkSize) {
      const chunk = blockNumbers.slice(i, i + requestChunkSize);
      await Promise.all(chunk.map(async (bn) => {
        try {
          const block = await provider.getBlock(bn);
          if (block) blockMap[bn] = block.timestamp * 1000;
        } catch (e) {
          console.error("Error fetching block", bn, e);
        }
      }));
    }

    const transactions: Transaction[] = uniqueLogs.map(log => {
      // Event args: [from, to, value]
      const amount = ethers.formatUnits(log.args[2], 6); // USDC has 6 decimals
      const isIn = log.args[1].toLowerCase() === address.toLowerCase();
      
      return {
        hash: log.transactionHash,
        type: (isIn ? 'in' : 'out') as 'in' | 'out',
        amount: amount,
        timestamp: blockMap[log.blockNumber] || Date.now(),
        status: 'confirmed' as 'confirmed',
        from: log.args[0],
        to: log.args[1]
      };
    })
    // Filter out zero value transactions
    .filter(tx => parseFloat(tx.amount) > 0);

    // Sort by time descending
    return transactions.sort((a, b) => b.timestamp - a.timestamp);

  } catch (error) {
    console.warn("Error fetching history:", error);
    return [];
  }
};