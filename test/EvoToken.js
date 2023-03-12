const { expect, assert } = require('chai')
const { ethers } = require('hardhat')
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers')
const {
  calculatePercentage,
  estimateRebase,
  parseUnitsExtended,
  ROUTER_ABI,
  ROUTER_BYTECODE,
} = require('./utils')
const { BigNumber } = require('ethers')
const { formatEther } = ethers.utils

const ROUTER = '0xdBD619b395d04e7a2E4cE18d78A006A888Ea86EB'
const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD'

describe('Token Contract', () => {
  const deployTokenFixture = async () => {
    const Token = await ethers.getContractFactory('Token')
    const [owner, addr1, addr2, addr3] = await ethers.getSigners()

    const token = await Token.deploy(ROUTER)
    await token.deployed()

    await token.setInitialDistributionFinished(true)
    await token.setNextRebase(1)
    await token.setRebaseFrequency(1)
    // console.log('hello ', token.address)

    return { token, owner, addr1, addr2, addr3 }
  }

  describe('Deployment', () => {
    it('Should set the right owner', async function () {
      const { token, owner } = await loadFixture(deployTokenFixture)
      expect(await token.owner()).to.equal(owner.address)
    })

    it('Deployment should assign the total supply of tokens to the owner', async () => {
      const { token, owner } = await loadFixture(deployTokenFixture)

      const ownerBalance = await token.balanceOf(owner.address)
      expect(await token.totalSupply()).to.equal(ownerBalance)
    })
  })

  describe('Transactions', () => {
    it('Should take fee on token tranfer', async () => {
      const { token, addr1, addr2 } = await loadFixture(deployTokenFixture)
      const amount = parseUnitsExtended(50, 'ether')

      await token.setFeesOnNormalTransfers(true)

      // Transfer 50 tokens from owner to addr1
      await token.transfer(addr1.address, amount)
      expect(await token.balanceOf(addr1.address)).to.equal(amount)

      // Transfer 50 tokens from addr1 to addr2
      await token.connect(addr1).transfer(addr2.address, amount)
      expect(await token.balanceOf(addr2.address)).to.equal(
        parseUnitsExtended(
          parseUnitsExtended(50 - calculatePercentage(50, 3)),
          'wei'
        )
      )
    })

    it('Should give accurate positive rebase to owner', async () => {
      const { token, owner, addr1, addr2 } = await loadFixture(
        deployTokenFixture
      )
      const amount_100 = parseUnitsExtended(10000, 'ether')
      const amount_50 = parseUnitsExtended(5000, 'ether')

      await token.setFeesOnNormalTransfers(true)

      // Transfer 100 tokens from owner to addr1
      await token.transfer(addr1.address, amount_100)
      expect(await token.balanceOf(addr1.address)).to.equal(amount_100)

      // Transfer 50 tokens from addr1 to addr2
      await token.connect(addr1).transfer(addr2.address, amount_50)

      // do rebase
      const balanceBeforeRebase = await token.balanceOf(addr2.address)
      const totalSupplyBefore = await token.totalSupply()
      const contractBeforeRebase = await token.balanceOf(token.address)

      await token.manualRebase()

      const balanceAfterRebase = await token.balanceOf(addr2.address)
      const totalSupplyAfter = await token.totalSupply()
      const contractAfterRebase = await token.balanceOf(token.address)
      // console.log('before contract: ', formatEther(contractBeforeRebase))
      // console.log('after contract: ', formatEther(contractAfterRebase))
      // console.log('before supploy: ', formatEther(totalSupplyBefore))
      // console.log('after supploy: ', formatEther(totalSupplyAfter))
      // console.log('Before rebase balance: ', formatEther(balanceBeforeRebase))
      // console.log('after rebase balance: ', formatEther(balanceAfterRebase))

      // expect(
      //   parseFloat(formatEther(balanceAfterRebase)).toFixed(1)
      // ).to.be.equal(
      //   estimateRebase(
      //     parseFloat(formatEther(balanceBeforeRebase)),
      //     counter
      //   ).toFixed(1)
      // )
    })

    // it('Should give accurate positive rebase to other users', async () => {
    //   const { token, addr1, addr3 } = await loadFixture(deployTokenFixture)
    //   const amount = parseUnitsExtended(50, 'ether')

    //   // remove rebase from some wallet
    //   await token.setExcludeFromRebase(addr3.address, true)

    //   // Transfer 50 tokens from owner to addr1
    //   await token.transfer(addr1.address, amount)
    //   expect(await token.balanceOf(addr1.address)).to.equal(amount)

    //   let counter = 10

    //   const balanceBeforeRebase = await token.balanceOf(addr1.address)

    //   for (let i = 0; i < counter; i++) await token.manualRebase()

    //   const balanceAfterRebase = await token.balanceOf(addr1.address)

    //   expect(
    //     parseFloat(formatEther(balanceAfterRebase)).toFixed(1)
    //   ).to.be.equal(
    //     estimateRebase(
    //       parseFloat(formatEther(balanceBeforeRebase)),
    //       counter
    //     ).toFixed(1)
    //   )
    // })

    it('Should fail transcation if balance 0', async () => {
      const { token, addr1, addr2 } = await loadFixture(deployTokenFixture)

      const amount = parseUnitsExtended(100, 'ether')

      await expect(token.connect(addr1).transfer(addr2.address, amount)).to.be
        .reverted
    })
  })
})

describe.only('DEX Interactions', () => {
  const deployWBRISE = async () => {
    const [owner, addr1] = await ethers.getSigners()
    const Wbrise = await ethers.getContractFactory('WBRISE')
    const wbrise = await Wbrise.deploy()
    // console.log('wbrise ', wbrise.address)

    // const transactionHash = await owner.sendTransaction({
    //   to: wbrise.address,
    //   value: ethers.utils.parseEther('1000'),
    // })

    // transactionHash.wait()

    return { wbrise }
  }

  const deployRouterFixture = async () => {
    const { wbrise } = await deployWBRISE()
    const factoryAddress = '0xe070606FB836967dAfb5ebF8724f98Cf968286fB'
    const rewardTokenAddress = '0x6ab7616635425a1045712e119B9f2c8923c09f23'

    const Router = await ethers.getContractFactory(ROUTER_ABI, ROUTER_BYTECODE)

    const router = await Router.deploy(
      factoryAddress,
      wbrise.address,
      rewardTokenAddress
    )

    router.deployed()
    // console.log('router: ', router.address)

    return { router }
  }

  const deployTokenFixture = async () => {
    const { router } = await deployRouterFixture()
    const Token = await ethers.getContractFactory('Token')
    const [owner, addr1, addr2, addr3] = await ethers.getSigners()

    const token = await Token.deploy(router.address)
    await token.deployed()

    await token.setInitialDistributionFinished(true)
    await token.setNextRebase(1)
    await token.setRebaseFrequency(1)
    // console.log('hello ', token.address)
    // add liquidity

    await token.approve(router.address, ethers.utils.parseEther('3000'))

    const blockNumber = await ethers.provider.getBlockNumber()
    const block = await ethers.provider.getBlock(blockNumber)
    const blockTimestamp = block.timestamp
    const deadline = blockTimestamp + 60 * 20

    const tx = await router.addLiquidityBRISE(
      token.address,
      3000,
      2000,
      1,
      addr1.address,
      BigNumber.from(deadline).toHexString(),
      { value: ethers.utils.parseEther('2000') }
    )
    console.log('TX hash: ', tx.hash)
    await tx.wait()

    return { token, owner, addr1, addr2, addr3, router }
  }

  describe('Transactions', () => {
    it('Add liquidity', async () => {
      const { token, addr1, addr2, router } = await loadFixture(
        deployTokenFixture
      )
    })
  })
})
