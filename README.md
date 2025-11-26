# DomainBid: A Privacy-Preserving Sealed Bid Domain Auction

DomainBid is a groundbreaking domain auction platform that ensures the privacy of bids using Zama's Fully Homomorphic Encryption (FHE) technology. This innovative solution allows participants to place and manage bids securely, preventing malicious practices like domain squatting and unfair price inflation.

## The Problem

In traditional domain auctions, bidders submit their offers in cleartext, making their intentions and bidding strategies vulnerable to manipulation. This lack of privacy not only leads to a competitive disadvantage but may also encourage unethical behavior, such as last-minute aggressive bidding. With sensitive information exposed, bidders risk losing not only their desired domains but also their trust in the auction process.

## The Zama FHE Solution

Leveraging Zama's FHE technology, DomainBid addresses these privacy concerns by allowing computation on encrypted data. By using the fhevm framework, bids are securely encrypted, ensuring that they remain confidential throughout the auction process. This approach empowers participants to engage in a fair bidding environment where their strategies are protected from prying eyes. The automation of domain transfers even further promotes trust and efficiency within the system.

## Key Features

- 🔒 **Sealed Bids**: All bids are encrypted, ensuring confidentiality and preventing bid manipulation.
- ⚖️ **Vickrey Auction Format**: Bidders submit bids without knowing competitors’ offers, with only the highest bidder winning at the second-highest bid price.
- 🤖 **Automated Transfers**: Streamlined processes for transferring domain ownership post-auction.
- 🤝 **Fair Competition**: Protects bidders from malicious practices like domain sniping and price inflation.
- 📈 **Analytics**: Participants can gain insights from anonymized data trends without compromising their privacy.

## Technical Architecture & Stack

DomainBid utilizes a robust technology stack centered around Zama's FHE capabilities. 

### Core Tech Stack
- **Core Privacy Engine**: Zama (fhevm)
- **Frontend**: React for user interface
- **Smart Contracts**: Solidity for blockchain interactions
- **Backend**: Node.js
- **Database**: MongoDB for storing auction data securely  

This architecture ensures a seamless interaction between the user interface, smart contracts, and Zama's powerful encryption technology.

## Smart Contract / Core Logic

Below is a simplified Solidity snippet demonstrating the core functionality of the DomainBid auction contract:

```solidity
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract DomainAuction is Ownable {
    struct Bid {
        uint64 amount;
        address bidder;
    }

    mapping(address => Bid) public bids;
    address public highestBidder;
    
    function placeBid(uint64 encryptedBid) external {
        // Process encrypted bid using Zama's FHE primitives
        uint64 decryptedBid = TFHE.decrypt(encryptedBid);
        require(decryptedBid > bids[highestBidder].amount, "Bid must be higher");

        // Store the highest bid
        highestBidder = msg.sender;
        bids[msg.sender] = Bid(decryptedBid, msg.sender);
    }
}
```

In this example, bidders interact with the auction contract while their bids remain encrypted. The contract processes encrypted inputs, ensuring confidentiality and compliance with the auction's rules.

## Directory Structure

Here's the directory structure for the DomainBid project:

```
DomainBid/
├── contracts/
│   ├── DomainAuction.sol
├── frontend/
│   ├── src/
│   │   ├── App.js
│   │   ├── index.js
├── backend/
│   ├── server.js
├── .env
└── package.json
```

This structure organizes the project components effectively, separating smart contracts, frontend code, and backend services.

## Installation & Setup

To get started with DomainBid, ensure you have the following prerequisites:

### Prerequisites
- Node.js and npm installed on your machine.
- A Solidity-compatible development environment.

### Steps to Setup
1. Install the necessary dependencies:
   ```bash
   npm install
   ```
2. Install the Zama library for FHE:
   ```bash
   npm install fhevm
   ```

3. Ensure the packages are set up correctly according to the project needs.

## Build & Run

To build and run the DomainBid project, you can execute the following commands:

1. Compile the smart contracts:
   ```bash
   npx hardhat compile
   ```

2. Start the backend server:
   ```bash
   node backend/server.js
   ```

3. Launch the frontend application:
   ```bash
   npm start
   ```

Access the application through your local server once the installation is complete and services are running.

## Acknowledgements

We would like to extend our gratitude to Zama for providing the open-source FHE primitives that empower DomainBid to maintain the integrity and privacy of its auction process. Their innovative technology enables us to redefine auction mechanics in a secure manner, fostering trust and transparency in the domain trading ecosystem. 

With DomainBid, experience the future of domain auctions—where your bids stay private and secure, ensuring a level playing field for all participants.


