import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useState, useEffect } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface DomainBid {
  id: string;
  name: string;
  bidAmount: number;
  bidder: string;
  timestamp: number;
  isVerified: boolean;
  decryptedValue: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [bids, setBids] = useState<DomainBid[]>([]);
  const [showBidModal, setShowBidModal] = useState(false);
  const [newBidData, setNewBidData] = useState({ domain: "", amount: "" });
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [selectedBid, setSelectedBid] = useState<DomainBid | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [stats, setStats] = useState({
    totalBids: 0,
    verifiedBids: 0,
    avgBid: 0
  });

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption } = useDecrypt();

  useEffect(() => {
    const initFhevm = async () => {
      if (isConnected && !isInitialized) {
        try {
          await initialize();
        } catch (error) {
          console.error('FHEVM init failed:', error);
        }
      }
    };
    initFhevm();
  }, [isConnected, isInitialized, initialize]);

  useEffect(() => {
    const loadData = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        const contract = await getContractReadOnly();
        if (!contract) return;
        
        setContractAddress(await contract.getAddress());
        const businessIds = await contract.getAllBusinessIds();
        const bidsList: DomainBid[] = [];
        
        for (const id of businessIds) {
          const data = await contract.getBusinessData(id);
          bidsList.push({
            id,
            name: data.name,
            bidAmount: Number(data.publicValue1),
            bidder: data.creator,
            timestamp: Number(data.timestamp),
            isVerified: data.isVerified,
            decryptedValue: Number(data.decryptedValue)
          });
        }
        
        setBids(bidsList);
        updateStats(bidsList);
      } catch (error) {
        console.error('Load error:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [isConnected]);

  const updateStats = (bidsList: DomainBid[]) => {
    const total = bidsList.length;
    const verified = bidsList.filter(b => b.isVerified).length;
    const avg = bidsList.length > 0 
      ? bidsList.reduce((sum, b) => sum + b.bidAmount, 0) / bidsList.length 
      : 0;
    
    setStats({
      totalBids: total,
      verifiedBids: verified,
      avgBid: avg
    });
  };

  const placeBid = async () => {
    if (!isConnected || !address) {
      showError("Connect wallet first");
      return;
    }
    
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting bid with FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("No contract");
      
      const amount = parseInt(newBidData.amount);
      if (isNaN(amount)) throw new Error("Invalid bid amount");
      
      const encryptedResult = await encrypt(contractAddress, address, amount);
      
      const tx = await contract.createBusinessData(
        `bid-${Date.now()}`,
        newBidData.domain,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        amount,
        0,
        "Domain Bid"
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for confirmation..." });
      await tx.wait();
      
      showSuccess("Bid placed successfully!");
      setShowBidModal(false);
      setNewBidData({ domain: "", amount: "" });
      loadData();
    } catch (error: any) {
      showError(error.message || "Bid failed");
    }
  };

  const decryptBid = async (bidId: string) => {
    if (!isConnected || !address) {
      showError("Connect wallet first");
      return null;
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const bidData = await contractRead.getBusinessData(bidId);
      if (bidData.isVerified) {
        return Number(bidData.decryptedValue);
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValue = await contractRead.getEncryptedValue(bidId);
      
      const result = await verifyDecryption(
        [encryptedValue],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(bidId, abiEncodedClearValues, decryptionProof)
      );
      
      const clearValue = result.decryptionResult.clearValues[encryptedValue];
      await loadData();
      showSuccess("Bid decrypted and verified!");
      return Number(clearValue);
    } catch (error: any) {
      showError(error.message || "Decryption failed");
      return null;
    } finally {
      setIsDecrypting(false);
    }
  };

  const loadData = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const bidsList: DomainBid[] = [];
      
      for (const id of businessIds) {
        const data = await contract.getBusinessData(id);
        bidsList.push({
          id,
          name: data.name,
          bidAmount: Number(data.publicValue1),
          bidder: data.creator,
          timestamp: Number(data.timestamp),
          isVerified: data.isVerified,
          decryptedValue: Number(data.decryptedValue)
        });
      }
      
      setBids(bidsList);
      updateStats(bidsList);
    } catch (error) {
      console.error('Reload error:', error);
    }
  };

  const showError = (message: string) => {
    setTransactionStatus({ visible: true, status: "error", message });
    setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
  };

  const showSuccess = (message: string) => {
    setTransactionStatus({ visible: true, status: "success", message });
    setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
  };

  const filteredBids = bids.filter(bid => 
    bid.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <h1>FHE Domain Auction</h1>
          <ConnectButton />
        </header>
        <div className="connection-prompt">
          <div className="connection-content">
            <h2>Connect Wallet to Bid</h2>
            <p>Secure domain auctions with fully homomorphic encryption</p>
            <div className="fhe-flow">
              <div className="flow-step">
                <div className="step-icon">🔒</div>
                <p>Encrypt your bid</p>
              </div>
              <div className="flow-arrow">→</div>
              <div className="flow-step">
                <div className="step-icon">📊</div>
                <p>Compare bids securely</p>
              </div>
              <div className="flow-arrow">→</div>
              <div className="flow-step">
                <div className="step-icon">🔓</div>
                <p>Decrypt winning bid</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE System...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Loading auction data...</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>FHE Domain Auction</h1>
        <div className="header-actions">
          <button onClick={() => setShowBidModal(true)} className="bid-button">
            + Place Bid
          </button>
          <ConnectButton />
        </div>
      </header>

      <div className="main-content">
        <div className="stats-panel">
          <div className="stat-card">
            <h3>Total Bids</h3>
            <p>{stats.totalBids}</p>
          </div>
          <div className="stat-card">
            <h3>Verified</h3>
            <p>{stats.verifiedBids}</p>
          </div>
          <div className="stat-card">
            <h3>Avg Bid</h3>
            <p>{stats.avgBid.toFixed(2)}</p>
          </div>
        </div>

        <div className="search-section">
          <input
            type="text"
            placeholder="Search domains..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="bids-list">
          {filteredBids.length === 0 ? (
            <div className="empty-state">
              <p>No bids found</p>
              <button onClick={() => setShowBidModal(true)} className="bid-button">
                Place First Bid
              </button>
            </div>
          ) : (
            filteredBids.map((bid, index) => (
              <div 
                key={index} 
                className={`bid-card ${selectedBid?.id === bid.id ? "selected" : ""}`}
                onClick={() => setSelectedBid(bid)}
              >
                <div className="bid-header">
                  <h3>{bid.name}</h3>
                  <span className={`status ${bid.isVerified ? "verified" : "pending"}`}>
                    {bid.isVerified ? "Verified" : "Pending"}
                  </span>
                </div>
                <div className="bid-details">
                  <p>Bidder: {bid.bidder.substring(0, 6)}...{bid.bidder.substring(38)}</p>
                  <p>Date: {new Date(bid.timestamp * 1000).toLocaleDateString()}</p>
                </div>
                <div className="bid-actions">
                  <button 
                    onClick={async (e) => {
                      e.stopPropagation();
                      const decrypted = await decryptBid(bid.id);
                      if (decrypted !== null) {
                        setSelectedBid({...bid, decryptedValue: decrypted, isVerified: true});
                      }
                    }}
                    disabled={isDecrypting || bid.isVerified}
                    className={`decrypt-button ${bid.isVerified ? "verified" : ""}`}
                  >
                    {bid.isVerified ? "Verified" : isDecrypting ? "Decrypting..." : "Decrypt"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showBidModal && (
        <div className="modal-overlay">
          <div className="bid-modal">
            <div className="modal-header">
              <h2>Place New Bid</h2>
              <button onClick={() => setShowBidModal(false)} className="close-button">
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Domain Name</label>
                <input
                  type="text"
                  value={newBidData.domain}
                  onChange={(e) => setNewBidData({...newBidData, domain: e.target.value})}
                  placeholder="example.com"
                />
              </div>
              <div className="form-group">
                <label>Bid Amount (ETH)</label>
                <input
                  type="number"
                  value={newBidData.amount}
                  onChange={(e) => setNewBidData({...newBidData, amount: e.target.value})}
                  placeholder="0.1"
                  min="0"
                  step="0.01"
                />
                <div className="fhe-note">
                  <small>Amount will be encrypted with FHE</small>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowBidModal(false)} className="cancel-button">
                Cancel
              </button>
              <button 
                onClick={placeBid} 
                disabled={!newBidData.domain || !newBidData.amount || isEncrypting}
                className="submit-button"
              >
                {isEncrypting ? "Encrypting..." : "Place Bid"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedBid && (
        <div className="modal-overlay">
          <div className="detail-modal">
            <div className="modal-header">
              <h2>Bid Details</h2>
              <button onClick={() => setSelectedBid(null)} className="close-button">
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="detail-row">
                <span>Domain:</span>
                <strong>{selectedBid.name}</strong>
              </div>
              <div className="detail-row">
                <span>Bidder:</span>
                <strong>{selectedBid.bidder}</strong>
              </div>
              <div className="detail-row">
                <span>Date:</span>
                <strong>{new Date(selectedBid.timestamp * 1000).toLocaleString()}</strong>
              </div>
              <div className="detail-row">
                <span>Status:</span>
                <strong className={selectedBid.isVerified ? "verified" : "pending"}>
                  {selectedBid.isVerified ? "Verified" : "Pending Verification"}
                </strong>
              </div>
              <div className="detail-row">
                <span>Bid Amount:</span>
                <strong>
                  {selectedBid.isVerified 
                    ? `${selectedBid.decryptedValue} ETH (Verified)` 
                    : "🔒 Encrypted"}
                </strong>
              </div>
              <div className="fhe-explanation">
                <h3>FHE Auction Process</h3>
                <ol>
                  <li>Bid amount encrypted with Zama FHE</li>
                  <li>Encrypted bids stored on-chain</li>
                  <li>Offline comparison of encrypted bids</li>
                  <li>Winner decrypted after auction ends</li>
                </ol>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                onClick={async () => {
                  const decrypted = await decryptBid(selectedBid.id);
                  if (decrypted !== null) {
                    setSelectedBid({...selectedBid, decryptedValue: decrypted, isVerified: true});
                  }
                }}
                disabled={isDecrypting || selectedBid.isVerified}
                className={`verify-button ${selectedBid.isVerified ? "verified" : ""}`}
              >
                {selectedBid.isVerified 
                  ? "Verified" 
                  : isDecrypting 
                    ? "Verifying..." 
                    : "Verify Bid"}
              </button>
            </div>
          </div>
        </div>
      )}

      {transactionStatus.visible && (
        <div className="notification">
          <div className={`notification-content ${transactionStatus.status}`}>
            {transactionStatus.status === "pending" && <div className="spinner"></div>}
            {transactionStatus.status === "success" && <span>✓</span>}
            {transactionStatus.status === "error" && <span>✗</span>}
            <p>{transactionStatus.message}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;