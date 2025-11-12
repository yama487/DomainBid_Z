pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract DomainBidAdapter is ZamaEthereumConfig {
    
    struct Bid {
        string domainName;              
        euint32 encryptedBidAmount;     
        uint256 deposit;                
        uint256 expiration;             
        address bidder;                 
        uint256 bidTime;                
        uint32 decryptedBidAmount;      
        bool isVerified;                
    }
    
    mapping(string => Bid) public domainBids;
    mapping(string => bool) public domainRegistered;
    
    string[] public domainNames;
    
    event BidPlaced(string indexed domainName, address indexed bidder);
    event BidVerified(string indexed domainName, uint32 decryptedBidAmount);
    event DomainRegistered(string indexed domainName);
    
    constructor() ZamaEthereumConfig() {
    }
    
    function placeBid(
        string calldata domainName,
        externalEuint32 encryptedBidAmount,
        bytes calldata inputProof,
        uint256 expiration
    ) external payable {
        require(!domainRegistered[domainName], "Domain already registered");
        require(bytes(domainBids[domainName].domainName).length == 0, "Bid already exists");
        require(msg.value > 0, "Deposit required");
        require(expiration > block.timestamp, "Invalid expiration");
        
        require(FHE.isInitialized(FHE.fromExternal(encryptedBidAmount, inputProof)), "Invalid encrypted input");
        
        domainBids[domainName] = Bid({
            domainName: domainName,
            encryptedBidAmount: FHE.fromExternal(encryptedBidAmount, inputProof),
            deposit: msg.value,
            expiration: expiration,
            bidder: msg.sender,
            bidTime: block.timestamp,
            decryptedBidAmount: 0,
            isVerified: false
        });
        
        FHE.allowThis(domainBids[domainName].encryptedBidAmount);
        FHE.makePubliclyDecryptable(domainBids[domainName].encryptedBidAmount);
        
        domainNames.push(domainName);
        
        emit BidPlaced(domainName, msg.sender);
    }
    
    function verifyBid(
        string calldata domainName, 
        bytes memory abiEncodedClearValue,
        bytes memory decryptionProof
    ) external {
        require(bytes(domainBids[domainName].domainName).length > 0, "Bid does not exist");
        require(!domainBids[domainName].isVerified, "Bid already verified");
        require(block.timestamp < domainBids[domainName].expiration, "Bid expired");
        
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(domainBids[domainName].encryptedBidAmount);
        
        FHE.checkSignatures(cts, abiEncodedClearValue, decryptionProof);
        
        uint32 decodedValue = abi.decode(abiEncodedClearValue, (uint32));
        
        domainBids[domainName].decryptedBidAmount = decodedValue;
        domainBids[domainName].isVerified = true;
        
        emit BidVerified(domainName, decodedValue);
    }
    
    function registerDomain(string calldata domainName) external {
        require(bytes(domainBids[domainName].domainName).length > 0, "Bid does not exist");
        require(domainBids[domainName].isVerified, "Bid not verified");
        require(block.timestamp < domainBids[domainName].expiration, "Bid expired");
        
        domainRegistered[domainName] = true;
        payable(domainBids[domainName].bidder).transfer(domainBids[domainName].deposit);
        
        emit DomainRegistered(domainName);
    }
    
    function getEncryptedBid(string calldata domainName) external view returns (euint32) {
        require(bytes(domainBids[domainName].domainName).length > 0, "Bid does not exist");
        return domainBids[domainName].encryptedBidAmount;
    }
    
    function getBidDetails(string calldata domainName) external view returns (
        uint256 deposit,
        uint256 expiration,
        address bidder,
        uint256 bidTime,
        bool isVerified,
        uint32 decryptedBidAmount
    ) {
        require(bytes(domainBids[domainName].domainName).length > 0, "Bid does not exist");
        Bid storage bid = domainBids[domainName];
        
        return (
            bid.deposit,
            bid.expiration,
            bid.bidder,
            bid.bidTime,
            bid.isVerified,
            bid.decryptedBidAmount
        );
    }
    
    function getAllDomainNames() external view returns (string[] memory) {
        return domainNames;
    }
    
    function isDomainRegistered(string calldata domainName) external view returns (bool) {
        return domainRegistered[domainName];
    }
    
    function withdrawExpiredBid(string calldata domainName) external {
        require(bytes(domainBids[domainName].domainName).length > 0, "Bid does not exist");
        require(block.timestamp >= domainBids[domainName].expiration, "Bid not expired");
        require(msg.sender == domainBids[domainName].bidder, "Not the bidder");
        
        payable(msg.sender).transfer(domainBids[domainName].deposit);
        
        delete domainBids[domainName];
        
        for (uint i = 0; i < domainNames.length; i++) {
            if (keccak256(bytes(domainNames[i])) == keccak256(bytes(domainName))) {
                domainNames[i] = domainNames[domainNames.length - 1];
                domainNames.pop();
                break;
            }
        }
    }
}


