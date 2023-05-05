import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-gas-reporter"
import "dotenv/config"

const COINMARKETCAP_API_KEY = process.env.COINMARKETCAP_API_KEY

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
      localhost: {
          url: "http://127.0.0.1:8545/",
          chainId: 31337,
      },
  },  
  solidity: {
    compilers:[
      {
        version :"0.8.18"
      },
      {
        version: "0.8.9"
      }
    ]
  },
  gasReporter: {
    enabled: true,
    outputFile: "gas-report.txt",
    noColors: true,
    currency: "USD",
    coinmarketcap: COINMARKETCAP_API_KEY,
    token: "MATIC",
  }
};

export default config;
