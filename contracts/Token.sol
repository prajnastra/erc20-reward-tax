// SPDX-License-Identifier: MIT
pragma solidity ^0.7.4;

import './ERC20.sol';
import './Ownable.sol';
import './libraries/SafeMath.sol';
import './interfaces/IDEXFactory.sol';
import './interfaces/IDEXRouter.sol';
import './interfaces/InterfaceLP.sol';

contract Token is ERC20, Ownable {
  using SafeMath for uint256;
  using SafeMathInt for int256;

  bool public initialDistributionFinished = false;
  bool public swapEnabled = true;
  bool public autoRebase = false;
  bool public feesOnNormalTransfers = false;

  uint256 public rewardYield = 63283933;
  uint256 public rewardYieldDenominator = 10000000000;
  uint256 public maxSellTransactionAmount = 2500000 * 10 ** 18;

  uint256 public rebaseFrequency = 86400;
  uint256 public nextRebase = block.timestamp + 86400;

  mapping(address => bool) _isFeeExempt;
  address[] public _markerPairs;
  mapping(address => bool) public automatedMarketMakerPairs;

  uint256 public constant MAX_FEE_RATE = 18;
  uint256 private constant MAX_REBASE_FREQUENCY = 86400;
  uint256 private constant DECIMALS = 18;
  uint256 private constant MAX_UINT256 = ~uint256(0);
  uint256 private constant INITIAL_FRAGMENTS_SUPPLY =
    4 * 10 ** 9 * 10 ** DECIMALS;
  uint256 private constant TOTAL_GONS =
    MAX_UINT256 - (MAX_UINT256 % INITIAL_FRAGMENTS_SUPPLY);
  uint256 private constant MAX_SUPPLY = ~uint128(0);

  address DEAD = 0x000000000000000000000000000000000000dEaD;
  address ZERO = 0x0000000000000000000000000000000000000000;

  address public liquidityReceiver = 0x4f8DeAABEd85CF5eD0351ca36B2f9dE1AEb5Daf1;
  address public treasuryReceiver = 0x83a4784e5a29F3E1Bca8699A2A744A9f0A69d217;
  address public reserveReceiver = 0x36a7B5BA99d6D624e613AAf83dCD53f2C3934fC2;

  IDEXRouter public router;
  address public pair;

  uint256 public liquidityFee = 1;
  uint256 public treasuryFee = 1;
  uint256 public buyFeeReserve = 1;
  uint256 public sellFeeTreasuryAdded = 1;
  uint256 public sellFeeReserveAdded = 1;
  uint256 public totalBuyFee = liquidityFee.add(treasuryFee).add(buyFeeReserve);
  uint256 public totalSellFee =
    liquidityFee.add(sellFeeTreasuryAdded).add(sellFeeReserveAdded);
  uint256 public feeDenominator = 100;

  uint256 targetLiquidity = 50;
  uint256 targetLiquidityDenominator = 100;

  bool inSwap;

  modifier swapping() {
    inSwap = true;
    _;
    inSwap = false;
  }

  modifier validRecipient(address to) {
    require(to != address(0x0));
    _;
  }

  uint256 private _totalSupply;
  uint256 private _gonsPerFragment;
  uint256 private gonSwapThreshold = (TOTAL_GONS * 10) / 10000;

  mapping(address => uint256) private _gonBalances;
  mapping(address => mapping(address => uint256)) private _allowedFragments;

  constructor(address _router) ERC20('Test', 'TST', uint8(DECIMALS)) {
    // DEX router Mainnet
    router = IDEXRouter(_router);
    pair = IDEXFactory(router.factory()).createPair(
      address(this),
      router.WBRISE()
    );

    _allowedFragments[address(this)][address(router)] = uint256(-1);
    _allowedFragments[address(this)][pair] = uint256(-1);

    setAutomatedMarketMakerPair(pair, true);

    _totalSupply = INITIAL_FRAGMENTS_SUPPLY;
    _gonBalances[msg.sender] = TOTAL_GONS;
    _gonsPerFragment = TOTAL_GONS.div(_totalSupply);

    _isFeeExempt[treasuryReceiver] = true;
    _isFeeExempt[reserveReceiver] = true;
    _isFeeExempt[address(this)] = true;
    _isFeeExempt[msg.sender] = true;

    emit Transfer(address(0x0), msg.sender, _totalSupply);
  }

  receive() external payable {}

  function totalSupply() external view override returns (uint256) {
    return _totalSupply;
  }

  function allowance(
    address owner_,
    address spender
  ) external view override returns (uint256) {
    return _allowedFragments[owner_][spender];
  }

  function balanceOf(address who) public view override returns (uint256) {
    return _gonBalances[who].div(_gonsPerFragment);
  }

  function checkFeeExempt(address _addr) external view returns (bool) {
    return _isFeeExempt[_addr];
  }

  function checkSwapThreshold() external view returns (uint256) {
    return gonSwapThreshold.div(_gonsPerFragment);
  }

  function shouldRebase() internal view returns (bool) {
    return nextRebase <= block.timestamp;
  }

  function shouldTakeFee(
    address from,
    address to
  ) internal view returns (bool) {
    if (_isFeeExempt[from] || _isFeeExempt[to]) {
      return false;
    } else if (feesOnNormalTransfers) {
      return true;
    } else {
      return (automatedMarketMakerPairs[from] || automatedMarketMakerPairs[to]);
    }
  }

  function shouldSwapBack() public view returns (bool) {
    return
      !automatedMarketMakerPairs[msg.sender] &&
      !inSwap &&
      swapEnabled &&
      totalBuyFee.add(totalSellFee) > 0 &&
      _gonBalances[address(this)] >= gonSwapThreshold;
  }

  function getCirculatingSupply() public view returns (uint256) {
    return
      (TOTAL_GONS.sub(_gonBalances[DEAD]).sub(_gonBalances[ZERO])).div(
        _gonsPerFragment
      );
  }

  function getLiquidityBacking(uint256 accuracy) public view returns (uint256) {
    uint256 liquidityBalance = 0;
    for (uint i = 0; i < _markerPairs.length; i++) {
      liquidityBalance.add(balanceOf(_markerPairs[i]).div(10 ** 9));
    }
    return
      accuracy.mul(liquidityBalance.mul(2)).div(
        getCirculatingSupply().div(10 ** 9)
      );
  }

  function isOverLiquified(
    uint256 target,
    uint256 accuracy
  ) public view returns (bool) {
    return getLiquidityBacking(accuracy) > target;
  }

  function manualSync() public {
    for (uint i = 0; i < _markerPairs.length; i++) {
      InterfaceLP(_markerPairs[i]).sync();
    }
  }

  function transfer(
    address to,
    uint256 value
  ) external override validRecipient(to) returns (bool) {
    _transferFrom(msg.sender, to, value);
    return true;
  }

  function _basicTransfer(
    address from,
    address to,
    uint256 amount
  ) internal returns (bool) {
    uint256 gonAmount = amount.mul(_gonsPerFragment);
    _gonBalances[from] = _gonBalances[from].sub(gonAmount);
    _gonBalances[to] = _gonBalances[to].add(gonAmount);

    emit Transfer(from, to, amount);

    return true;
  }

  function _transferFrom(
    address sender,
    address recipient,
    uint256 amount
  ) internal returns (bool) {
    bool excludedAccount = _isFeeExempt[sender] || _isFeeExempt[recipient];

    require(
      initialDistributionFinished || excludedAccount,
      'Trading not started'
    );

    if (automatedMarketMakerPairs[recipient] && !excludedAccount) {
      require(amount <= maxSellTransactionAmount, 'Error amount');
    }

    if (inSwap) {
      return _basicTransfer(sender, recipient, amount);
    }

    uint256 gonAmount = amount.mul(_gonsPerFragment);

    _gonBalances[sender] = _gonBalances[sender].sub(gonAmount);

    uint256 gonAmountReceived = shouldTakeFee(sender, recipient)
      ? takeFee(sender, recipient, gonAmount)
      : gonAmount;

    _gonBalances[recipient] = _gonBalances[recipient].add(gonAmountReceived);

    emit Transfer(sender, recipient, gonAmountReceived.div(_gonsPerFragment));

    if (shouldRebase() && autoRebase && recipient != DEAD) {
      _rebase();

      if (
        !automatedMarketMakerPairs[sender] &&
        !automatedMarketMakerPairs[recipient]
      ) {
        manualSync();
      }
    }

    return true;
  }

  function transferFrom(
    address from,
    address to,
    uint256 value
  ) external override validRecipient(to) returns (bool) {
    if (_allowedFragments[from][msg.sender] != uint256(-1)) {
      _allowedFragments[from][msg.sender] = _allowedFragments[from][msg.sender]
        .sub(value, 'Insufficient Allowance');
    }

    _transferFrom(from, to, value);
    return true;
  }

  function _swapAndLiquify(uint256 contractTokenBalance) private {
    uint256 half = contractTokenBalance.div(2);
    uint256 otherHalf = contractTokenBalance.sub(half);

    uint256 initialBalance = address(this).balance;

    _swapTokensForBrise(half, address(this));

    uint256 newBalance = address(this).balance.sub(initialBalance);

    _addLiquidity(otherHalf, newBalance);

    emit SwapAndLiquify(half, newBalance, otherHalf);
  }

  function _addLiquidity(uint256 tokenAmount, uint256 briseAmount) private {
    router.addLiquidityBRISE{value: briseAmount}(
      address(this),
      tokenAmount,
      0,
      0,
      liquidityReceiver,
      block.timestamp + 1000
    );
  }

  function _approveRouter(uint256 amount) private {
    approve(0xdBD619b395d04e7a2E4cE18d78A006A888Ea86EB, amount);
  }

  function approveFeeDistribution() public {
    uint256 contractTokenBalance = _gonBalances[address(this)].div(
      _gonsPerFragment
    );
    _approveRouter(contractTokenBalance);
  }

  function _swapTokensForBrise(uint256 tokenAmount, address receiver) private {
    address[] memory path = new address[](2);
    path[0] = address(this);
    path[1] = router.WBRISE();

    router.swapExactTokensForBRISESupportingFeeOnTransferTokens(
      tokenAmount,
      0,
      path,
      receiver,
      block.timestamp + 1000
    );
  }

  function swapBack() internal swapping {
    uint256 realTotalFee = totalBuyFee.add(totalSellFee);

    uint256 contractTokenBalance = _gonBalances[address(this)].div(
      _gonsPerFragment
    );

    uint256 amountToLiquify = contractTokenBalance
      .mul(liquidityFee.add(liquidityFee))
      .div(realTotalFee);
    uint256 amountToTreasury = contractTokenBalance
      .mul(treasuryFee.add(sellFeeTreasuryAdded))
      .div(realTotalFee);

    if (amountToLiquify > 0) {
      _swapTokensForBrise(amountToLiquify, reserveReceiver);
    }

    if (amountToTreasury > 0) {
      _swapTokensForBrise(amountToTreasury, treasuryReceiver);
    }

    emit SwapBack(
      contractTokenBalance,
      amountToLiquify,
      amountToLiquify,
      amountToTreasury
    );
  }

  function distributeFees() public onlyOwner {
    swapBack();
  }

  function takeFee(
    address sender,
    address recipient,
    uint256 gonAmount
  ) internal returns (uint256) {
    uint256 _realFee = totalBuyFee;
    if (automatedMarketMakerPairs[recipient]) _realFee = totalSellFee;

    uint256 feeAmount = gonAmount.mul(_realFee).div(feeDenominator);

    _gonBalances[address(this)] = _gonBalances[address(this)].add(feeAmount);

    emit Transfer(sender, address(this), feeAmount.div(_gonsPerFragment));

    return gonAmount.sub(feeAmount);
  }

  function decreaseAllowance(
    address spender,
    uint256 subtractedValue
  ) external returns (bool) {
    uint256 oldValue = _allowedFragments[msg.sender][spender];
    if (subtractedValue >= oldValue) {
      _allowedFragments[msg.sender][spender] = 0;
    } else {
      _allowedFragments[msg.sender][spender] = oldValue.sub(subtractedValue);
    }
    emit Approval(msg.sender, spender, _allowedFragments[msg.sender][spender]);
    return true;
  }

  function increaseAllowance(
    address spender,
    uint256 addedValue
  ) external returns (bool) {
    _allowedFragments[msg.sender][spender] = _allowedFragments[msg.sender][
      spender
    ].add(addedValue);
    emit Approval(msg.sender, spender, _allowedFragments[msg.sender][spender]);
    return true;
  }

  function approve(
    address spender,
    uint256 value
  ) public override returns (bool) {
    _allowedFragments[msg.sender][spender] = value;
    emit Approval(msg.sender, spender, value);
    return true;
  }

  function _rebase() private {
    if (!inSwap) {
      uint256 circulatingSupply = getCirculatingSupply();
      int256 supplyDelta = int256(
        circulatingSupply.mul(rewardYield).div(rewardYieldDenominator)
      );

      coreRebase(supplyDelta);
    }
  }

  function coreRebase(int256 supplyDelta) private returns (uint256) {
    uint256 epoch = block.timestamp;

    if (supplyDelta == 0) {
      emit LogRebase(epoch, _totalSupply);
      return _totalSupply;
    }

    if (supplyDelta < 0) {
      _totalSupply = _totalSupply.sub(uint256(-supplyDelta));
    } else {
      _totalSupply = _totalSupply.add(uint256(supplyDelta));
    }

    if (_totalSupply > MAX_SUPPLY) {
      _totalSupply = MAX_SUPPLY;
    }

    _gonsPerFragment = TOTAL_GONS.div(_totalSupply);

    nextRebase = epoch + rebaseFrequency;

    emit LogRebase(epoch, _totalSupply);
    return _totalSupply;
  }

  function manualRebase() external onlyOwner {
    require(!inSwap, 'Try again');
    require(nextRebase <= block.timestamp, 'Not in time');

    uint256 realTotalFee = totalBuyFee.add(totalSellFee);

    uint256 contractTokenBalance = _gonBalances[address(this)].div(
      _gonsPerFragment
    );

    uint256 amountToReserve = contractTokenBalance
      .mul(buyFeeReserve.add(sellFeeReserveAdded))
      .div(realTotalFee);

    int256 supplyDelta = int256(amountToReserve);

    coreRebase(supplyDelta);

    _transferFrom(
      address(this),
      address(0x000000000000000000000000000000000000dEaD),
      amountToReserve
    );

    manualSync();
  }

  function setAutomatedMarketMakerPair(
    address _pair,
    bool _value
  ) public onlyOwner {
    require(automatedMarketMakerPairs[_pair] != _value, 'Value already set');

    automatedMarketMakerPairs[_pair] = _value;

    if (_value) {
      _markerPairs.push(_pair);
    } else {
      require(_markerPairs.length > 1, 'Required 1 pair');
      for (uint256 i = 0; i < _markerPairs.length; i++) {
        if (_markerPairs[i] == _pair) {
          _markerPairs[i] = _markerPairs[_markerPairs.length - 1];
          _markerPairs.pop();
          break;
        }
      }
    }

    emit SetAutomatedMarketMakerPair(_pair, _value);
  }

  function setInitialDistributionFinished(bool _value) external onlyOwner {
    require(initialDistributionFinished != _value, 'Not changed');
    initialDistributionFinished = _value;
  }

  function setFeeExempt(address _addr, bool _value) external onlyOwner {
    require(_isFeeExempt[_addr] != _value, 'Not changed');
    _isFeeExempt[_addr] = _value;
  }

  function setTargetLiquidity(
    uint256 target,
    uint256 accuracy
  ) external onlyOwner {
    targetLiquidity = target;
    targetLiquidityDenominator = accuracy;
  }

  function setSwapBackSettings(
    bool _enabled,
    uint256 _num,
    uint256 _denom
  ) external onlyOwner {
    swapEnabled = _enabled;
    gonSwapThreshold = TOTAL_GONS.div(_denom).mul(_num);
  }

  function setFeeReceivers(
    address _liquidityReceiver,
    address _treasuryReceiver,
    address _reserveReceiver
  ) external onlyOwner {
    liquidityReceiver = _liquidityReceiver;
    treasuryReceiver = _treasuryReceiver;
    reserveReceiver = _reserveReceiver;
  }

  function clearStuckBalance(address _receiver) external onlyOwner {
    uint256 balance = address(this).balance;
    payable(_receiver).transfer(balance);
  }

  function rescueToken(
    address tokenAddress,
    uint256 tokens
  ) external onlyOwner returns (bool success) {
    return ERC20(tokenAddress).transfer(msg.sender, tokens);
  }

  function setAutoRebase(bool _autoRebase) external onlyOwner {
    require(autoRebase != _autoRebase, 'Not changed');
    autoRebase = _autoRebase;
  }

  function setRebaseFrequency(uint256 _rebaseFrequency) external onlyOwner {
    require(_rebaseFrequency <= MAX_REBASE_FREQUENCY, 'Too high');
    rebaseFrequency = _rebaseFrequency;
  }

  function setRewardYield(
    uint256 _rewardYield,
    uint256 _rewardYieldDenominator
  ) external onlyOwner {
    rewardYield = _rewardYield;
    rewardYieldDenominator = _rewardYieldDenominator;
  }

  function setFeesOnNormalTransfers(bool _enabled) external onlyOwner {
    require(feesOnNormalTransfers != _enabled, 'Not changed');
    feesOnNormalTransfers = _enabled;
  }

  function setNextRebase(uint256 _nextRebase) external onlyOwner {
    nextRebase = _nextRebase;
  }

  function setMaxSellTransaction(uint256 _maxTxn) external onlyOwner {
    maxSellTransactionAmount = _maxTxn;
  }

  event SwapBack(
    uint256 contractTokenBalance,
    uint256 amountToLiquify,
    uint256 amountToReserve,
    uint256 amountToTreasury
  );
  event SwapAndLiquify(
    uint256 tokensSwapped,
    uint256 briseReceived,
    uint256 tokensIntoLiqudity
  );
  event LogRebase(uint256 indexed epoch, uint256 totalSupply);
  event SetAutomatedMarketMakerPair(address indexed pair, bool indexed value);
}
