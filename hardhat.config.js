require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: {
    version: "0.7.4",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  networks: {
    hardhat: {
      forking: {
        url: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
        blockNumber: 14189520,
      },
    },
    testnet: {
      url: process.env.TESTNET_ADDRESS,
      chainId: 64668,
      gasPrice: 100000000,
      accounts: [process.env.PRIVET_KEY],
    },
    mainnet: {
      url: process.env.MAINNET_ADDRESS,
      chainId: 32520,
      gasPrice: 5000000000,
      accounts: [process.env.PRIVET_KEY],
    },
  },
};
