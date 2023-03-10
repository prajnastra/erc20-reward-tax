const hre = require('hardhat')

async function main() {
  const [account] = await hre.ethers.getSigners()
  console.log(`Deployer account: ${account.address}`)

  const Token = await hre.ethers.getContractFactory('Token')
  const token = await Token.deploy()

  await token.deployed()

  console.log(`Token deployed to: ${token.address}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
