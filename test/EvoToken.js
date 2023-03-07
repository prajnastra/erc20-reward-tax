const { expect, assert } = require('chai')
const { ethers } = require('hardhat')
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers')
const {
  calculatePercentage,
  estimateRebase,
  parseUnitsExtended,
} = require('./utils')
const { formatEther } = ethers.utils

const ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'
const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD'

describe('Token Contract', () => {
  const deployTokenFixture = async () => {
    const Token = await ethers.getContractFactory('EvoToken')
    const [owner, addr1, addr2, addr3] = await ethers.getSigners()

    const token = await Token.deploy(ROUTER)
    await token.deployed()

    await token.setInitialDistributionFinished(true)
    await token.setNextRebase(1)
    await token.setRebaseFrequency(1)

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
          parseUnitsExtended(50 - calculatePercentage(50, 14)),
          'wei'
        )
      )
    })

    it('Should do positive rebase', async () => {
      const { token, owner } = await loadFixture(deployTokenFixture)

      const balanceBeforeRebase = await token.balanceOf(owner.address)
      await token.manualRebase()
      const balanceAfterRebase = await token.balanceOf(owner.address)

      expect(balanceAfterRebase).to.be.greaterThan(balanceBeforeRebase)
    })

    it('Should give accurate positive rebase to owner', async () => {
      const { token, owner } = await loadFixture(deployTokenFixture)
      let counter = 6
      const balanceBeforeRebase = await token.balanceOf(owner.address)

      for (let i = 0; i < counter; i++) await token.manualRebase()

      const balanceAfterRebase = await token.balanceOf(owner.address)

      expect(
        parseFloat(formatEther(balanceAfterRebase)).toFixed(1)
      ).to.be.equal(
        estimateRebase(
          parseFloat(formatEther(balanceBeforeRebase)),
          counter
        ).toFixed(1)
      )
    })

    it('Should give accurate positive rebase to other users', async () => {
      const { token, addr1, addr3 } = await loadFixture(deployTokenFixture)
      const amount = parseUnitsExtended(50, 'ether')

      // remove rebase from some wallet
      await token.setExcludeFromRebase(addr3.address, true)

      // Transfer 50 tokens from owner to addr1
      await token.transfer(addr1.address, amount)
      expect(await token.balanceOf(addr1.address)).to.equal(amount)

      let counter = 10

      const balanceBeforeRebase = await token.balanceOf(addr1.address)

      for (let i = 0; i < counter; i++) await token.manualRebase()

      const balanceAfterRebase = await token.balanceOf(addr1.address)

      expect(
        parseFloat(formatEther(balanceAfterRebase)).toFixed(1)
      ).to.be.equal(
        estimateRebase(
          parseFloat(formatEther(balanceBeforeRebase)),
          counter
        ).toFixed(1)
      )
    })

    it('Should give positive rebase after burn', async () => {
      const { token, addr1, addr2, addr3 } = await loadFixture(
        deployTokenFixture
      )
      const amount = parseUnitsExtended(1000, 'ether')

      // turn fee on
      await token.setFeesOnNormalTransfers(true)

      // remove rebase from some wallet
      await token.setExcludeFromRebase(addr3.address, true)

      // Burn 1000 tokens
      await token.transfer(DEAD_ADDRESS, amount)

      // Transfer 1000 tokens from owner to addr1
      await token.transfer(addr1.address, amount)

      // Transfer tokens from addr1 to addr2
      await token
        .connect(addr1)
        .transfer(addr2.address, parseUnitsExtended(500, 'ether'))

      let counter = 10

      const balanceBeforeRebase = await token.balanceOf(addr1.address)

      for (let i = 0; i < counter; i++) await token.manualRebase()

      const balanceAfterRebase = await token.balanceOf(addr1.address)

      expect(
        parseFloat(formatEther(balanceAfterRebase)).toFixed(1)
      ).to.be.equal(
        estimateRebase(
          parseFloat(formatEther(balanceBeforeRebase)),
          counter
        ).toFixed(1)
      )
    })

    it('Should exclude account from rebase', async () => {
      const { token, addr3 } = await loadFixture(deployTokenFixture)
      const amount = parseUnitsExtended(1000, 'ether')

      // turn fee on
      await token.setFeesOnNormalTransfers(true)

      // remove rebase from some wallet
      await token.setExcludeFromRebase(addr3.address, true)

      // Transfer 1000 tokens from owner to addr1
      await token.transfer(addr3.address, amount)

      const prevBalance = formatEther(await token.balanceOf(addr3.address))

      await token.manualRebase()
      await token.manualRebase()
      await token.manualRebase()

      const currBalance = formatEther(await token.balanceOf(addr3.address))

      expect(currBalance).to.be.equal(prevBalance)
    })

    it('Should exclude multiple account from rebase', async () => {
      const { token, addr3, addr1, addr2 } = await loadFixture(
        deployTokenFixture
      )
      const amount1 = parseUnitsExtended(1000, 'ether')
      const amount2 = parseUnitsExtended(500, 'ether')
      const amount3 = parseUnitsExtended(2100, 'ether')

      // turn fee on
      await token.setFeesOnNormalTransfers(true)

      // remove rebase from some wallet
      await token.setExcludeFromRebase(addr1.address, true)
      await token.setExcludeFromRebase(addr2.address, true)
      await token.setExcludeFromRebase(addr3.address, true)

      // Transfer tokens from owner to addr1, addr2, addr3
      await token.transfer(addr1.address, amount1)
      await token.transfer(addr2.address, amount2)
      await token.transfer(addr3.address, amount3)

      const prevBalance1 = formatEther(await token.balanceOf(addr1.address))
      const prevBalance2 = formatEther(await token.balanceOf(addr2.address))
      const prevBalance3 = formatEther(await token.balanceOf(addr3.address))

      // rebase 4 times
      await token.manualRebase()
      await token.manualRebase()
      await token.manualRebase()
      await token.manualRebase()

      const currBalance1 = formatEther(await token.balanceOf(addr1.address))
      const currBalance2 = formatEther(await token.balanceOf(addr2.address))
      const currBalance3 = formatEther(await token.balanceOf(addr3.address))

      expect(currBalance1).to.be.equal(prevBalance1)
      expect(currBalance2).to.be.equal(prevBalance2)
      expect(currBalance3).to.be.equal(prevBalance3)
    })

    it('Should fail transcation if balance 0', async () => {
      const { token, addr1, addr2 } = await loadFixture(deployTokenFixture)

      const amount = parseUnitsExtended(100, 'ether')

      await expect(token.connect(addr1).transfer(addr2.address, amount)).to.be
        .reverted
    })

    it('Should fail transcation if wallet spent limit reached', async () => {
      const { token, addr1, addr2 } = await loadFixture(deployTokenFixture)

      const amount = parseUnitsExtended(100, 'ether')
      const spendAmount = parseUnitsExtended(99, 'ether')

      // Transfer 100 tokens from owner to addr1
      await token.transfer(addr1.address, amount)

      await token.setSpecificWalletSpendLimit(addr1.address, spendAmount, true)

      await expect(token.connect(addr1).transfer(addr2.address, amount)).to.be
        .reverted
    })

    it('Should not take fee in only sell', async () => {
      const { token, addr1, addr2, addr3 } = await loadFixture(
        deployTokenFixture
      )
      const amount = parseUnitsExtended(100, 'ether')
      const amount2x = parseUnitsExtended(200, 'ether')

      await token.setFeesOnNormalTransfers(true)
      await token.setFeesOnSell(false)
      await token.setAutomatedMarketMakerPair(addr2.address, true)

      // Transfer 100 tokens from owner to addr1
      await token.transfer(addr1.address, amount2x)

      // Transfer 100 tokens from addr1 to addr2
      await token.connect(addr1).transfer(addr2.address, amount)
      await token.connect(addr1).transfer(addr3.address, amount)

      expect(await token.balanceOf(addr2.address)).to.equal(amount)
      expect(await token.balanceOf(addr3.address)).to.equal(
        parseUnitsExtended(
          parseUnitsExtended(100 - calculatePercentage(100, 14)),
          'wei'
        )
      )
    })

    it('Should not take fee in only buy', async () => {
      const { token, addr1, addr2, addr3 } = await loadFixture(
        deployTokenFixture
      )
      const amount = parseUnitsExtended(100, 'ether')
      const amount2x = parseUnitsExtended(200, 'ether')

      await token.setFeesOnNormalTransfers(true)
      await token.setFeesOnBuy(false)
      await token.setAutomatedMarketMakerPair(addr2.address, true)

      // Transfer 100 tokens from owner to addr1
      await token.transfer(addr1.address, amount2x)

      // Transfer 100 tokens from addr1 to addr2
      await token.connect(addr1).transfer(addr2.address, amount)
      await token.connect(addr1).transfer(addr3.address, amount)

      expect(await token.balanceOf(addr2.address)).to.equal(
        parseUnitsExtended(
          parseUnitsExtended(100 - calculatePercentage(100, 18)),
          'wei'
        )
      )
      expect(await token.balanceOf(addr3.address)).to.equal(amount)
    })

    it('Should distribute fee to fee receivers', async () => {
      const { token, addr1 } = await loadFixture(deployTokenFixture)
      const amount = parseUnitsExtended(399999, 'ether')

      await token.setFeesOnNormalTransfers(true)

      // Transfer 100 tokens from owner to token address
      await token.transfer(token.address, amount)

      // Transfer 100 tokens from owner to addr1
      await token.transfer(addr1.address, amount)

      expect(await token.balanceOf(addr1.address)).to.equal(amount)
    })
  })
})
