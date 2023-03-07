const hre = require('hardhat')

async function main() {
  const [account] = await hre.ethers.getSigners()
  console.log(`Deployer account: ${account.address}`)

  // Bitgert Router
  const ROUTER = '0xdBD619b395d04e7a2E4cE18d78A006A888Ea86EB'

  const Token = await hre.ethers.getContractFactory('EvoToken')
  const token = await Token.deploy(ROUTER)

  await token.deployed()

  console.log(`Evo deployed to: ${token.address}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
