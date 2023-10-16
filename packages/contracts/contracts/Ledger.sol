// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "del-osx-artifacts/contracts/PhoneLinkCollection.sol";
import "./ValidatorCollection.sol";
import "./CurrencyRate.sol";
import "./ShopCollection.sol";

/// @notice 포인트와 토큰의 원장
contract Ledger {
    /// @notice Hash value of a blank string
    bytes32 public constant NULL = 0x32105b1d0b88ada155176b58ee08b45c31e4f2f7337475831982c313533b880c;
    bytes32 public constant BASE_CURRENCY = keccak256(bytes("krw"));
    bytes32 public constant NULL_CURRENCY = keccak256(bytes(""));
    uint32 public constant MAX_FEE = 5;

    mapping(bytes32 => uint256) private unPayablePointBalances;
    mapping(address => uint256) private pointBalances;
    mapping(address => uint256) private tokenBalances;
    mapping(address => uint256) private nonce;

    enum RoyaltyType {
        POINT,
        TOKEN
    }
    mapping(address => RoyaltyType) private royaltyTypes;

    struct PurchaseData {
        string purchaseId;
        uint256 timestamp;
        uint256 amount;
        string currency;
        bytes32 shopId;
        uint32 method;
        address account;
        bytes32 phone;
    }

    struct PaymentData {
        string purchaseId;
        uint256 amount;
        string currency;
        bytes32 shopId;
        address account;
        bytes signature;
    }

    mapping(string => PurchaseData) private purchases;
    string[] private purchaseIds;

    address public foundationAccount;
    address public settlementAccount;
    address public feeAccount;
    address public tokenAddress;
    address public validatorAddress;
    address public linkCollectionAddress;
    address public currencyRateAddress;
    address public shopCollectionAddress;
    uint32 public fee;

    ERC20 private token;
    ValidatorCollection private validatorCollection;
    PhoneLinkCollection private linkCollection;
    CurrencyRate private currencyRate;
    ShopCollection private shopCollection;

    /// @notice 검증자가 추가될 때 발생되는 이벤트
    event SavedPurchase(
        string purchaseId,
        uint256 timestamp,
        uint256 amount,
        string currency,
        bytes32 shopId,
        uint32 method,
        address account,
        bytes32 phone
    );
    /// @notice 포인트가 지급될 때 발생되는 이벤트
    event ProvidedPoint(
        address account,
        uint256 providedPoint,
        uint256 providedValue,
        uint256 balancePoint,
        string purchaseId,
        bytes32 shopId
    );
    /// @notice 포인트가 지급될 때 발생되는 이벤트
    event ProvidedUnPayablePoint(
        bytes32 phone,
        uint256 providedPoint,
        uint256 providedValue,
        uint256 balancePoint,
        string purchaseId,
        bytes32 shopId
    );
    /// @notice 사용가능한 포인트로 변환될 때 발생되는 이벤트
    event ChangedToPayablePoint(
        bytes32 phone,
        address account,
        uint256 changedPoint,
        uint256 changedValue,
        uint256 balancePoint
    );
    /// @notice 포인트가 정산될 때 발생되는 이벤트
    event ProvidedTokenForSettlement(
        address account,
        bytes32 shopId,
        uint256 providedPoint,
        uint256 providedToken,
        uint256 balanceToken,
        string purchaseId
    );
    /// @notice 토큰이 지급될 때 발생되는 이벤트
    event ProvidedToken(
        address account,
        uint256 providedToken,
        uint256 providedValue,
        uint256 balanceToken,
        string purchaseId,
        bytes32 shopId
    );
    /// @notice 포인트로 지불을 완료했을 때 발생하는 이벤트
    event PaidPoint(
        address account,
        uint256 paidPoint,
        uint256 paidValue,
        uint256 feePoint,
        uint256 feeValue,
        uint256 balancePoint,
        string purchaseId,
        bytes32 shopId
    );
    /// @notice 토큰으로 지불을 완료했을 때 발생하는 이벤트
    event PaidToken(
        address account,
        uint256 paidToken,
        uint256 paidValue,
        uint256 feeToken,
        uint256 feeValue,
        uint256 balanceToken,
        string purchaseId,
        bytes32 shopId
    );
    /// @notice 토큰을 예치했을 때 발생하는 이벤트
    event Deposited(address account, uint256 depositedToken, uint256 depositedValue, uint256 balanceToken);
    /// @notice 토큰을 인출했을 때 발생하는 이벤트
    event Withdrawn(address account, uint256 withdrawnToken, uint256 withdrawnValue, uint256 balanceToken);
    /// @notice 구매 후 적립되는 포인트의 종류 (0: 포인트, 1: 토큰)
    event ChangedRoyaltyType(address account, RoyaltyType royaltyType);

    /// @notice 생성자
    /// @param _foundationAccount 재단의 계정
    /// @param _settlementAccount 정산금 계정
    /// @param _feeAccount 수수료 계정
    /// @param _tokenAddress 토큰 컨트랙트의 주소
    /// @param _validatorAddress 검증자 컬랙션 컨트랙트의 주소
    /// @param _linkCollectionAddress 전화번호-지갑주소 링크 컨트랙트의 주소
    /// @param _currencyRateAddress 환률을 제공하는 컨트랙트의 주소
    /// @param _shopCollectionAddress 가맹점 컬랙션 컨트랙트의 주소
    constructor(
        address _foundationAccount,
        address _settlementAccount,
        address _feeAccount,
        address _tokenAddress,
        address _validatorAddress,
        address _linkCollectionAddress,
        address _currencyRateAddress,
        address _shopCollectionAddress
    ) {
        foundationAccount = _foundationAccount;
        settlementAccount = _settlementAccount;
        feeAccount = _feeAccount;
        tokenAddress = _tokenAddress;
        validatorAddress = _validatorAddress;
        linkCollectionAddress = _linkCollectionAddress;
        currencyRateAddress = _currencyRateAddress;
        shopCollectionAddress = _shopCollectionAddress;

        token = ERC20(_tokenAddress);
        validatorCollection = ValidatorCollection(_validatorAddress);
        linkCollection = PhoneLinkCollection(_linkCollectionAddress);
        currencyRate = CurrencyRate(_currencyRateAddress);
        shopCollection = ShopCollection(_shopCollectionAddress);
        fee = MAX_FEE;
    }

    modifier onlyValidator(address _account) {
        require(validatorCollection.isActiveValidator(_account), "Not validator");
        _;
    }

    /// @notice 구매내역을 저장합니다.
    /// @dev 이것은 검증자들에 의해 호출되어야 합니다.
    function savePurchase(PurchaseData calldata data) public onlyValidator(msg.sender) {
        purchaseIds.push(data.purchaseId);
        purchases[data.purchaseId] = data;

        if (data.method == 0) {
            ShopCollection.ShopData memory shop = shopCollection.shopOf(data.shopId);
            if (shop.status == ShopCollection.ShopStatus.ACTIVE) {
                if (data.account != address(0x0)) {
                    uint256 royaltyValue = (data.amount * shop.providePercent) / 100;
                    uint256 royaltyPoint = convertCurrencyToPoint(royaltyValue, data.currency);
                    if (royaltyTypes[data.account] == RoyaltyType.POINT) {
                        providePoint(data.account, royaltyPoint, royaltyValue, data.purchaseId, data.shopId);
                    } else {
                        provideToken(data.account, royaltyPoint, royaltyValue, data.purchaseId, data.shopId);
                    }
                    shopCollection.addProvidedPoint(data.shopId, royaltyPoint, data.purchaseId);
                } else if (data.phone != NULL) {
                    uint256 royaltyValue = (data.amount * shop.providePercent) / 100;
                    uint256 royaltyPoint = convertCurrencyToPoint(royaltyValue, data.currency);
                    address account = linkCollection.toAddress(data.phone);
                    if (account == address(0x00)) {
                        provideUnPayablePoint(data.phone, royaltyPoint, royaltyValue, data.purchaseId, data.shopId);
                    } else {
                        if (royaltyTypes[account] == RoyaltyType.POINT) {
                            providePoint(account, royaltyPoint, royaltyValue, data.purchaseId, data.shopId);
                        } else {
                            provideToken(account, royaltyPoint, royaltyValue, data.purchaseId, data.shopId);
                        }
                    }
                    shopCollection.addProvidedPoint(data.shopId, royaltyPoint, data.purchaseId);
                }
            }
        }

        emit SavedPurchase(
            data.purchaseId,
            data.timestamp,
            data.amount,
            data.currency,
            data.shopId,
            data.method,
            data.account,
            data.phone
        );
    }

    /// @notice 포인트를 지급합니다.
    /// @dev 구매 데이터를 확인한 후 호출됩니다.
    /// @param _account 사용자의 지갑주소
    /// @param _royaltyPoint 지급할 포인트(단위:포인트)
    /// @param _royaltyValue 지급할 포인트가치(단위:구매한 화폐의 통화)
    /// @param _purchaseId 구매 아이디
    /// @param _shopId 구매한 가맹점 아이디
    function providePoint(
        address _account,
        uint256 _royaltyPoint,
        uint256 _royaltyValue,
        string calldata _purchaseId,
        bytes32 _shopId
    ) internal {
        pointBalances[_account] += _royaltyPoint;
        emit ProvidedPoint(_account, _royaltyPoint, _royaltyValue, pointBalances[_account], _purchaseId, _shopId);
    }

    /// @notice 포인트를 지급합니다.
    /// @dev 구매 데이터를 확인한 후 호출됩니다.
    /// @param _phone 전화번호 해시
    /// @param _royaltyPoint 지급할 포인트(단위:포인트)
    /// @param _royaltyValue 지급할 포인트가치(단위:구매한 화폐의 통화)
    /// @param _purchaseId 구매 아이디
    /// @param _shopId 구매한 가맹점 아이디
    function provideUnPayablePoint(
        bytes32 _phone,
        uint256 _royaltyPoint,
        uint256 _royaltyValue,
        string calldata _purchaseId,
        bytes32 _shopId
    ) internal {
        unPayablePointBalances[_phone] += _royaltyPoint;
        emit ProvidedUnPayablePoint(
            _phone,
            _royaltyPoint,
            _royaltyValue,
            unPayablePointBalances[_phone],
            _purchaseId,
            _shopId
        );
    }

    /// @notice 토큰을 지급합니다.
    /// @dev 구매 데이터를 확인한 후 호출됩니다.
    /// @param _account 사용자의 지갑주소
    /// @param _royaltyPoint 지급할 포인트(단위:포인트)
    /// @param _royaltyValue 지급할 포인트가치(단위:구매한 화폐의 통화)
    /// @param _purchaseId 구매 아이디
    /// @param _shopId 구매한 가맹점 아이디
    function provideToken(
        address _account,
        uint256 _royaltyPoint,
        uint256 _royaltyValue,
        string calldata _purchaseId,
        bytes32 _shopId
    ) internal {
        uint256 amountToken = convertPointToToken(_royaltyPoint);

        require(tokenBalances[foundationAccount] >= amountToken, "Insufficient foundation balance");
        tokenBalances[_account] += amountToken;
        tokenBalances[foundationAccount] -= amountToken;

        emit ProvidedToken(_account, amountToken, _royaltyValue, tokenBalances[_account], _purchaseId, _shopId);
    }

    /// @notice 사용가능한 포인트로 전환합니다.
    /// @dev 중계서버를 통해서 호출됩니다.
    function changeToPayablePoint(bytes32 _phone, address _account, bytes calldata _signature) public {
        bytes32 dataHash = keccak256(abi.encode(_phone, _account, nonce[_account]));
        require(ECDSA.recover(ECDSA.toEthSignedMessageHash(dataHash), _signature) == _account, "Invalid signature");
        address userAddress = linkCollection.toAddress(_phone);
        require(userAddress != address(0x00), "Unregistered phone-address");
        require(userAddress == _account, "Invalid address");
        require(unPayablePointBalances[_phone] > 0, "Insufficient balance");

        uint256 amount = unPayablePointBalances[_phone];
        uint256 value = amount;
        unPayablePointBalances[_phone] = 0;
        pointBalances[_account] += amount;

        nonce[_account]++;

        emit ChangedToPayablePoint(_phone, _account, amount, value, pointBalances[_account]);
    }

    /// @notice 포인트를 구매에 사용하는 함수
    /// @dev 중계서버를 통해서 호출됩니다.
    function payPoint(PaymentData calldata _data) public {
        PaymentData memory data = _data;
        bytes32 dataHash = keccak256(
            abi.encode(data.purchaseId, data.amount, data.currency, data.shopId, data.account, nonce[data.account])
        );
        require(
            ECDSA.recover(ECDSA.toEthSignedMessageHash(dataHash), data.signature) == data.account,
            "Invalid signature"
        );

        uint256 purchasePoint = convertCurrencyToPoint(data.amount, data.currency);
        uint256 feeValue = (data.amount * fee) / 100;
        uint256 feePoint = convertCurrencyToPoint(feeValue, data.currency);
        uint256 feeToken = convertPointToToken(feePoint);

        require(pointBalances[data.account] >= purchasePoint + feePoint, "Insufficient balance");
        require(tokenBalances[foundationAccount] >= feeToken, "Insufficient foundation balance");

        pointBalances[data.account] -= (purchasePoint + feePoint);

        // 재단의 토큰으로 교환해 지급한다.
        tokenBalances[foundationAccount] -= feeToken;
        tokenBalances[feeAccount] += feeToken;

        shopCollection.addUsedPoint(data.shopId, purchasePoint, data.purchaseId);

        uint256 settlementPoint = shopCollection.getSettlementPoint(data.shopId);
        if (settlementPoint > 0) {
            uint256 settlementToken = convertPointToToken(settlementPoint);
            if (tokenBalances[foundationAccount] >= settlementToken) {
                tokenBalances[settlementAccount] += settlementToken;
                tokenBalances[foundationAccount] -= settlementToken;
                shopCollection.addSettledPoint(data.shopId, settlementPoint, data.purchaseId);
                emit ProvidedTokenForSettlement(
                    settlementAccount,
                    data.shopId,
                    settlementPoint,
                    settlementToken,
                    tokenBalances[settlementAccount],
                    data.purchaseId
                );
            }
        }

        nonce[data.account]++;

        emit PaidPoint(
            data.account,
            purchasePoint,
            data.amount,
            feePoint,
            feeValue,
            pointBalances[data.account],
            data.purchaseId,
            data.shopId
        );
    }

    /// @notice 토큰을 구매에 사용하는 함수
    /// @dev 중계서버를 통해서 호출됩니다.
    function payToken(PaymentData calldata _data) public {
        PaymentData memory data = _data;
        bytes32 dataHash = keccak256(
            abi.encode(data.purchaseId, data.amount, data.currency, data.shopId, data.account, nonce[data.account])
        );
        require(
            ECDSA.recover(ECDSA.toEthSignedMessageHash(dataHash), data.signature) == data.account,
            "Invalid signature"
        );

        uint256 purchasePoint = convertCurrencyToPoint(data.amount, data.currency);
        uint256 purchaseToken = convertPointToToken(purchasePoint);
        uint256 feeValue = (data.amount * fee) / 100;
        uint256 feePoint = convertCurrencyToPoint(feeValue, data.currency);
        uint256 feeToken = convertPointToToken(feePoint);

        require(tokenBalances[data.account] >= purchaseToken + feeToken, "Insufficient balance");

        tokenBalances[data.account] -= (purchaseToken + feeToken);
        tokenBalances[foundationAccount] += purchaseToken;
        tokenBalances[feeAccount] += feeToken;

        shopCollection.addUsedPoint(data.shopId, purchasePoint, data.purchaseId);

        uint256 settlementPoint = shopCollection.getSettlementPoint(data.shopId);
        if (settlementPoint > 0) {
            uint256 settlementToken = convertPointToToken(settlementPoint);
            if (tokenBalances[foundationAccount] >= settlementToken) {
                tokenBalances[settlementAccount] += settlementToken;
                tokenBalances[foundationAccount] -= settlementToken;
                shopCollection.addSettledPoint(data.shopId, settlementPoint, data.purchaseId);
                emit ProvidedTokenForSettlement(
                    settlementAccount,
                    data.shopId,
                    settlementPoint,
                    settlementToken,
                    tokenBalances[settlementAccount],
                    data.purchaseId
                );
            }
        }

        nonce[data.account]++;

        emit PaidToken(
            data.account,
            purchaseToken,
            data.amount,
            feeToken,
            feeValue,
            tokenBalances[data.account],
            data.purchaseId,
            data.shopId
        );
    }

    function convertPointToToken(uint256 amount) internal view returns (uint256) {
        uint256 price = currencyRate.get(token.symbol());
        return (amount * currencyRate.MULTIPLE()) / price;
    }

    function convertTokenToPoint(uint256 amount) internal view returns (uint256) {
        uint256 price = currencyRate.get(token.symbol());
        return (amount * price) / currencyRate.MULTIPLE();
    }

    function convertCurrencyToPoint(uint256 _amount, string memory _currency) internal view returns (uint256) {
        bytes32 byteCurrency = keccak256(bytes(_currency));
        if ((byteCurrency == BASE_CURRENCY) || (byteCurrency == NULL_CURRENCY)) {
            return _amount;
        } else {
            uint256 rate = currencyRate.get(_currency);
            return (_amount * rate) / currencyRate.MULTIPLE();
        }
    }

    /// @notice 토큰을 예치합니다.
    /// @param _amount 금액
    function deposit(uint256 _amount) public {
        require(_amount <= token.allowance(msg.sender, address(this)), "Not allowed deposit");
        token.transferFrom(msg.sender, address(this), _amount);

        tokenBalances[msg.sender] += _amount;

        uint256 amountPoint = convertTokenToPoint(_amount);
        emit Deposited(msg.sender, _amount, amountPoint, tokenBalances[msg.sender]);
    }

    /// @notice 토큰을 인출합니다.
    /// @param _amount 금액
    function withdraw(uint256 _amount) public {
        require(_amount <= tokenBalances[msg.sender], "Insufficient balance");
        token.transfer(msg.sender, _amount);

        tokenBalances[msg.sender] -= _amount;

        uint256 amountPoint = convertTokenToPoint(_amount);
        emit Withdrawn(msg.sender, _amount, amountPoint, tokenBalances[msg.sender]);
    }

    /// @notice 포인트의 잔고를 리턴한다
    /// @param _hash 전화번호의 해시
    function unPayablePointBalanceOf(bytes32 _hash) public view returns (uint256) {
        return unPayablePointBalances[_hash];
    }

    /// @notice 포인트의 잔고를 리턴한다
    /// @param _account 지갑주소
    function pointBalanceOf(address _account) public view returns (uint256) {
        return pointBalances[_account];
    }

    /// @notice 토큰의 잔고를 리턴한다
    /// @param _account 지갑주소
    function tokenBalanceOf(address _account) public view returns (uint256) {
        return tokenBalances[_account];
    }

    /// @notice nonce를  리턴한다
    /// @param _account 지갑주소
    function nonceOf(address _account) public view returns (uint256) {
        return nonce[_account];
    }

    /// @notice 구매 데이터를 리턴한다
    /// @param _purchaseId 구매 아이디
    function purchaseOf(string calldata _purchaseId) public view returns (PurchaseData memory) {
        return purchases[_purchaseId];
    }

    /// @notice 구매 데이터의 아이디를 리턴한다
    /// @param _idx 배열의 순번
    function purchaseIdOf(uint256 _idx) public view returns (string memory) {
        return purchaseIds[_idx];
    }

    /// @notice 구매 데이터의 갯수를 리턴한다
    function purchasesLength() public view returns (uint256) {
        return purchaseIds.length;
    }

    /// @notice 사용자가 적립할 포인트의 종류를 리턴한다
    /// @param _account 지갑주소
    function royaltyTypeOf(address _account) public view returns (RoyaltyType) {
        return royaltyTypes[_account];
    }

    /// @notice 사용자가 적립할 포인트의 종류를 리턴한다
    /// @param _royaltyType 0: 포인트, 1: 토큰
    /// @param _account 지갑주소
    /// @param _signature 서명
    function setRoyaltyType(RoyaltyType _royaltyType, address _account, bytes calldata _signature) public {
        require(RoyaltyType.POINT <= _royaltyType && _royaltyType <= RoyaltyType.TOKEN, "Invalid value");
        bytes32 dataHash = keccak256(abi.encode(_royaltyType, _account, nonce[_account]));
        require(ECDSA.recover(ECDSA.toEthSignedMessageHash(dataHash), _signature) == _account, "Invalid signature");

        royaltyTypes[_account] = _royaltyType;
        nonce[_account]++;
        emit ChangedRoyaltyType(_account, _royaltyType);
    }

    /// @notice 포인트와 토큰의 사용수수료률을 설정합니다. 5%를 초과한 값은 설정할 수 없습니다.
    /// @param _fee % 단위 입니다.
    function setFee(uint32 _fee) public {
        require(_fee <= MAX_FEE, "Invalid value");
        require(msg.sender == feeAccount, "Invalid sender");
        fee = _fee;
    }
}
