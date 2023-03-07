# EVO V2


# Local Development

The following assumes the use of `node@>=14`.

## Install Dependenciess

`yarn`

## Add Environment Variables

`MNEMONIC="YOUR_WALLET_MNEMONIC"`\
`TESTNET_ADDRESS="https://testnet-rpc.brisescan.com"`\
`MAINNET_ADDRESS="https://chainrpc.com"`

## Compile Contracts

`npx hardhat compile`

## Deploy Contract

`npx hardhat run scripts/deploy.js --network mainnet`