const { ethers } = require('hardhat')
const { parseUnits } = ethers.utils

exports.calculatePercentage = (num, percentage) => {
  return num * (percentage / 100)
}

exports.estimateRebase = (num, times) => {
  const apy = (1 + 0.63283933 / 100) ** times * 100
  return this.calculatePercentage(num, apy)
}

exports.parseUnitsExtended = (num, unitName) => {
  return parseUnits(num.toString(), unitName)
}
