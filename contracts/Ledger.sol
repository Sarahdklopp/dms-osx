// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "link-email-wallet/contracts/LinkCollection.sol";
import "./ValidatorCollection.sol";

/// @notice 마일리지와 토큰의 원장
contract Ledger {
    /// @notice 마일리지의 원장
    mapping(bytes32 => uint256) public mileageLedger;
    /// @notice 토큰의 원장
    mapping(bytes32 => uint256) public tokenLedger;
    /// @notice 서명검증에 사용될 Nonce
    mapping(address => uint256) public nonce;

    struct PurchaseData {
        string purchaseId;
        uint256 timestamp;
        uint256 amount;
        bytes32 userEmail;
        string franchiseeId;
    }

    mapping(string => PurchaseData) public purchaseMap;
    string[] public purchaseIdList;

    bytes32 public foundationAccount;
    address public tokenAddress;
    address public validatorAddress;
    address public linkCollectionAddress;

    IERC20 private token;
    ValidatorCollection private validatorCollection;
    LinkCollection private linkCollection;

    /// @notice 검증자가 추가될 때 발생되는 이벤트
    event SavedPurchase(string purchaseId, uint256 timestamp, uint256 amount, bytes32 userEmail, string franchiseeId);
    /// @notice 마일리지가 지급될 때 발생되는 이벤트
    event ProvidedMileage(bytes32 email, uint256 amount);
    /// @notice 토큰이 지급될 때 발생되는 이벤트
    event ProvidedToken(bytes32 email, uint256 amount, uint256 amountToken);
    /// @notice 마일리지로 지불을 완료했을 때 발생하는 이벤트
    event PaidMileage(string purchaseId, uint256 timestamp, uint256 amount, bytes32 userEmail, string franchiseeId);
    /// @notice 토큰으로 지불을 완료했을 때 발생하는 이벤트
    event PaidToken(
        string purchaseId,
        uint256 timestamp,
        uint256 amount,
        uint256 amountToken,
        bytes32 userEmail,
        string franchiseeId
    );
    /// @notice 토큰을 예치했을 때 발생하는 이벤트
    event Deposited(address depositor, uint256 amount, uint256 balance);
    /// @notice 토큰을 인출했을 때 발생하는 이벤트
    event Withdrawn(address withdrawer, uint256 amount, uint256 balance);
    /// @notice 마일리지를 토큰으로 교환했을 때 발생하는 이벤트
    event ExchangedMileageToToken(bytes32 email, uint256 amountMileage, uint256 amountToken);
    /// @notice 토큰을 마일리지로 교환했을 때 발생하는 이벤트
    event ExchangedTokenToMileage(bytes32 email, uint256 amountToken, uint256 amountMileage);

    /// @notice 생성자
    /// @param _foundationAccount 재단의 계정
    /// @param _tokenAddress 토큰의 주소
    /// @param _validatorAddress 검증자컬랙션의 주소
    /// @param _linkCollectionAddress 이메일-지갑주소 링크 컨트랙트
    constructor(
        bytes32 _foundationAccount,
        address _tokenAddress,
        address _validatorAddress,
        address _linkCollectionAddress
    ) {
        foundationAccount = _foundationAccount;
        tokenAddress = _tokenAddress;
        validatorAddress = _validatorAddress;
        linkCollectionAddress = _linkCollectionAddress;

        token = IERC20(_tokenAddress);
        validatorCollection = ValidatorCollection(_validatorAddress);
        linkCollection = LinkCollection(_linkCollectionAddress);
    }

    modifier onlyValidator(address _account) {
        bool isValidator = false;
        for (uint256 i = 0; i < validatorCollection.getActiveItemsLength(); ++i) {
            if (_account == validatorCollection.activeItems(i)) {
                isValidator = true;
                break;
            }
        }
        require(isValidator, "Not validator");
        _;
    }

    /// @notice 구매내역을 저장합니다.
    /// @dev 이것은 검증자들에 의해 호출되어야 합니다.
    /// @param _purchaseId 구매 아이디
    /// @param _timestamp 구매 시간
    /// @param _amount 구매 금액
    /// @param _userEmail 구매한 사용자의 이메일 해시
    /// @param _franchiseeId 구매한 가맹점 아이디
    function savePurchase(
        string memory _purchaseId,
        uint256 _timestamp,
        uint256 _amount,
        bytes32 _userEmail,
        string memory _franchiseeId
    ) public onlyValidator(msg.sender) {
        PurchaseData memory data = PurchaseData({
            purchaseId: _purchaseId,
            timestamp: _timestamp,
            amount: _amount,
            userEmail: _userEmail,
            franchiseeId: _franchiseeId
        });
        purchaseIdList.push(_purchaseId);
        purchaseMap[_purchaseId] = data;

        if (linkCollection.toAddress(_userEmail) == address(0x00)) {
            uint256 mileage = _amount / 100;
            provideMileage(_userEmail, mileage);
        } else {
            uint256 amount = _amount / 100;
            provideToken(_userEmail, amount);
        }

        emit SavedPurchase(_purchaseId, _timestamp, _amount, _userEmail, _franchiseeId);
    }

    /// @notice 마일리지를 지급합니다.
    /// @dev 구매데아타를 확인한 후 호출됩니다.
    /// @param _email 이메일 해시
    /// @param _amount 지급할 마일리지
    function provideMileage(bytes32 _email, uint256 _amount) internal {
        mileageLedger[_email] += _amount;

        emit ProvidedMileage(_email, _amount);
    }

    /// @notice 토큰을 지급합니다.
    /// @dev 구매데아타를 확인한 후 호출됩니다.
    /// @param _email 이메일 해시
    /// @param _amount 지급할 토큰
    function provideToken(bytes32 _email, uint256 _amount) internal {
        uint256 amountToken = convertMileageToToken(_amount);

        require(tokenLedger[foundationAccount] >= amountToken, "Insufficient foundation balance");
        tokenLedger[_email] += amountToken;
        tokenLedger[foundationAccount] -= amountToken;

        emit ProvidedToken(_email, _amount, amountToken);
    }

    /// @notice 마일리지를 구매에 사용하는 함수
    /// @dev 중계서버를 통해서 호출됩니다.
    /// @param _purchaseId 구매 아이디
    /// @param _amount 구매 금액
    /// @param _userEmail 구매한 사용자의 이메일 해시
    /// @param _franchiseeId 구매한 가맹점 아이디
    /// @param _signer 구매자의 주소
    /// @param _signature 서명
    function payMileage(
        string memory _purchaseId,
        uint256 _amount,
        bytes32 _userEmail,
        string memory _franchiseeId,
        address _signer,
        bytes calldata _signature
    ) public {
        bytes32 dataHash = keccak256(
            abi.encode(_purchaseId, _amount, _userEmail, _franchiseeId, _signer, nonce[_signer])
        );
        require(ECDSA.recover(dataHash, _signature) == _signer, "Invalid signature");
        address userAddress = linkCollection.toAddress(_userEmail);
        require(userAddress != address(0x00), "Unregistered email-address");
        require(userAddress == _signer, "Invalid address");
        require(mileageLedger[_userEmail] >= _amount, "Insufficient balance");

        mileageLedger[_userEmail] -= _amount;

        nonce[_signer]++;

        emit PaidMileage(_purchaseId, block.timestamp, _amount, _userEmail, _franchiseeId);
    }

    /// @notice 토큰을 구매에 사용하는 함수
    /// @dev 중계서버를 통해서 호출됩니다.
    /// @param _purchaseId 구매 아이디
    /// @param _amount 구매 금액
    /// @param _userEmail 구매한 사용자의 이메일 해시
    /// @param _franchiseeId 구매한 가맹점 아이디
    /// @param _signer 구매자의 주소
    /// @param _signature 서명
    function payToken(
        string memory _purchaseId,
        uint256 _amount,
        bytes32 _userEmail,
        string memory _franchiseeId,
        address _signer,
        bytes calldata _signature
    ) public {
        bytes32 dataHash = keccak256(
            abi.encode(_purchaseId, _amount, _userEmail, _franchiseeId, _signer, nonce[_signer])
        );
        require(ECDSA.recover(dataHash, _signature) == _signer, "Invalid signature");
        address userAddress = linkCollection.toAddress(_userEmail);
        require(userAddress != address(0x00), "Unregistered email-address");
        require(userAddress == _signer, "Invalid address");

        uint256 amountToken = convertMileageToToken(_amount);
        require(tokenLedger[_userEmail] >= amountToken, "Insufficient balance");

        tokenLedger[_userEmail] -= amountToken;
        tokenLedger[foundationAccount] += amountToken;

        nonce[_signer]++;

        emit PaidToken(_purchaseId, block.timestamp, _amount, amountToken, _userEmail, _franchiseeId);
    }

    function convertMileageToToken(uint256 amount) internal view returns (uint256) {
        // TODO 토큰가격정보를 이용하여 변환되도록 수정해야 한다
        return amount;
    }

    function convertTokenToMileage(uint256 amount) internal view returns (uint256) {
        // TODO 토큰가격정보를 이용하여 변환되도록 수정해야 한다
        return amount;
    }

    /// @notice 토큰을 예치합니다.
    /// @param _amount 금액
    function deposit(uint256 _amount) public {
        bytes32 userEmail = linkCollection.toHash(msg.sender);
        require(userEmail != bytes32(0x00), "Unregistered email-address");

        require(_amount <= token.allowance(msg.sender, address(this)), "Not allowed deposit");
        token.transferFrom(msg.sender, address(this), _amount);

        tokenLedger[userEmail] += _amount;

        emit Deposited(msg.sender, _amount, tokenLedger[userEmail]);
    }

    /// @notice 토큰을 인출합니다.
    /// @param _amount 금액
    function withdraw(uint256 _amount) public {
        bytes32 userEmail = linkCollection.toHash(msg.sender);
        require(userEmail != bytes32(0x00), "Unregistered email-address");

        require(_amount <= tokenLedger[userEmail], "Insufficient balance");
        token.transfer(msg.sender, _amount);

        tokenLedger[userEmail] -= _amount;

        emit Withdrawn(msg.sender, _amount, tokenLedger[userEmail]);
    }

    /// @notice 마일리지를 토큰으로 교환합니다
    /// @dev 중계서버를 통해서 호출됩니다.
    /// @param _userEmail 사용자의 이메일 해시
    /// @param _amountMileage 교환할 마일리지의 량
    /// @param _signer 사용자의 주소
    /// @param _signature 서명
    function exchangeMileageToToken(
        bytes32 _userEmail,
        uint256 _amountMileage,
        address _signer,
        bytes calldata _signature
    ) public {
        bytes32 dataHash = keccak256(abi.encode(_userEmail, _amountMileage, _signer, nonce[_signer]));
        require(ECDSA.recover(dataHash, _signature) == _signer, "Invalid signature");
        address userAddress = linkCollection.toAddress(_userEmail);
        require(userAddress != address(0x00), "Unregistered email-address");
        require(userAddress == _signer, "Invalid address");

        require(mileageLedger[_userEmail] >= _amountMileage, "Insufficient balance");

        uint256 amountToken = convertMileageToToken(_amountMileage);
        require(tokenLedger[foundationAccount] >= amountToken, "Insufficient foundation balance");

        mileageLedger[_userEmail] -= _amountMileage;

        tokenLedger[_userEmail] += amountToken;
        tokenLedger[foundationAccount] -= amountToken;

        nonce[_signer]++;

        emit ExchangedMileageToToken(_userEmail, _amountMileage, amountToken);
    }

    /// @notice 토큰을 마일리지로 교환합니다
    /// @dev 중계서버를 통해서 호출됩니다.
    /// @param _userEmail 사용자의 이메일 해시
    /// @param _amountToken 교환할 토큰의 량
    /// @param _signer 사용자의 주소
    /// @param _signature 서명
    function exchangeTokenToMileage(
        bytes32 _userEmail,
        uint256 _amountToken,
        address _signer,
        bytes calldata _signature
    ) public {
        bytes32 dataHash = keccak256(abi.encode(_userEmail, _amountToken, _signer, nonce[_signer]));
        require(ECDSA.recover(dataHash, _signature) == _signer, "Invalid signature");
        address userAddress = linkCollection.toAddress(_userEmail);
        require(userAddress != address(0x00), "Unregistered email-address");
        require(userAddress == _signer, "Invalid address");

        require(tokenLedger[_userEmail] >= _amountToken, "Insufficient balance");

        tokenLedger[_userEmail] -= _amountToken;
        tokenLedger[foundationAccount] += _amountToken;

        uint256 amountMileage = convertTokenToMileage(_amountToken);
        mileageLedger[_userEmail] += amountMileage;

        nonce[_signer]++;

        emit ExchangedTokenToMileage(_userEmail, _amountToken, amountMileage);
    }
}
