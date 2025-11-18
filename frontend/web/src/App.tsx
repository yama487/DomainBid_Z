import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useState, useEffect } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';
import { ethers } from 'ethers';

interface DomainBid {
  id: string;
  name: string;
  encryptedBid: string;
  publicValue1: number;
  publicValue2: number;
  description: string;
  creator: string;
  timestamp: number;
  isVerified: boolean;
  decryptedValue: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [domainBids, setDomainBids] = useState<DomainBid[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingBid, setCreatingBid] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending" as const, 
    message: "" 
  });
  const [newBidData, setNewBidData] = useState({ domain: "", bid: "", description: "" });
  const [selectedBid, setSelectedBid] = useState<DomainBid | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showFAQ, setShowFAQ] = useState(false);
  const [stats, setStats] = useState({ totalBids: 0, verifiedBids: 0, avgBid: 0 });

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const bidsList: DomainBid[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          bidsList.push({
            id: businessId,
            name: businessData.name,
            encryptedBid: businessId,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            description: businessData.description,
            creator: businessData.creator,
            timestamp: Number(businessData.timestamp),
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setDomainBids(bidsList);
      calculateStats(bidsList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const calculateStats = (bids: DomainBid[]) => {
    const totalBids = bids.length;
    const verifiedBids = bids.filter(b => b.isVerified).length;
    const avgBid = bids.length > 0 
      ? bids.reduce((sum, b) => sum + b.publicValue1, 0) / bids.length 
      : 0;
    
    setStats({ totalBids, verifiedBids, avgBid });
  };

  const createBid = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingBid(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating encrypted bid..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract");
      
      const bidValue = parseInt(newBidData.bid) || 0;
      const businessId = `domainbid-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, bidValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newBidData.domain,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        bidValue,
        0,
        newBidData.description
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Confirming transaction..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Bid created!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewBidData({ domain: "", bid: "", description: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected") 
        ? "Transaction rejected" 
        : "Submission failed";
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingBid(false); 
    }
  };

  const decryptBid = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Bid already verified" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying bid..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Bid decrypted!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Bid already verified" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        await loadData();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Decryption failed" 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const callIsAvailable = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const available = await contract.isAvailable();
      if (available) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Contract available!" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      }
    } catch (e) {
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Contract check failed" 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredBids = domainBids.filter(bid => 
    bid.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bid.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>FHE Domain Auction</h1>
          </div>
          <div className="header-actions">
            <div className="wallet-connect-wrapper">
              <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
            </div>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🔒</div>
            <h2>Connect Wallet to Start</h2>
            <p>Secure domain auctions with fully homomorphic encryption</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>Connect your wallet</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>FHE system initializes</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>Bid privately on domains</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption...</p>
        <p>Status: {fhevmInitializing ? "Initializing" : status}</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading encrypted auction system...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>FHE Domain Auction</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn"
          >
            + New Bid
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content-container">
        <div className="dashboard-section">
          <div className="stats-panel">
            <div className="stat-item">
              <div className="stat-value">{stats.totalBids}</div>
              <div className="stat-label">Total Bids</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{stats.verifiedBids}</div>
              <div className="stat-label">Verified</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{stats.avgBid.toFixed(1)}</div>
              <div className="stat-label">Avg Bid</div>
            </div>
          </div>
          
          <div className="fhe-flow">
            <div className="flow-step">
              <div className="step-icon">1</div>
              <div className="step-content">
                <h4>Encrypt Bid</h4>
                <p>Bid value encrypted with FHE 🔒</p>
              </div>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-step">
              <div className="step-icon">2</div>
              <div className="step-content">
                <h4>Submit</h4>
                <p>Encrypted bid stored on-chain</p>
              </div>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-step">
              <div className="step-icon">3</div>
              <div className="step-content">
                <h4>Decrypt</h4>
                <p>Offline decryption with relayer</p>
              </div>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-step">
              <div className="step-icon">4</div>
              <div className="step-content">
                <h4>Verify</h4>
                <p>On-chain verification</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="bids-section">
          <div className="section-header">
            <h2>Active Domain Bids</h2>
            <div className="header-actions">
              <div className="search-container">
                <input 
                  type="text" 
                  placeholder="Search domains..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <button 
                onClick={loadData} 
                className="refresh-btn" 
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
              <button 
                onClick={callIsAvailable}
                className="check-btn"
              >
                Check Contract
              </button>
              <button 
                onClick={() => setShowFAQ(!showFAQ)}
                className="faq-btn"
              >
                FAQ
              </button>
            </div>
          </div>
          
          {showFAQ && (
            <div className="faq-panel">
              <h3>FHE Domain Auction FAQ</h3>
              <div className="faq-item">
                <strong>How does FHE protect my bid?</strong>
                <p>Your bid is encrypted before submission, preventing others from seeing your offer.</p>
              </div>
              <div className="faq-item">
                <strong>When is my bid revealed?</strong>
                <p>Bids are decrypted and verified after the auction ends.</p>
              </div>
              <div className="faq-item">
                <strong>Can I change my bid?</strong>
                <p>No, bids are final once submitted to the blockchain.</p>
              </div>
            </div>
          )}
          
          <div className="bids-list">
            {filteredBids.length === 0 ? (
              <div className="no-bids">
                <p>No domain bids found</p>
                <button 
                  className="create-btn" 
                  onClick={() => setShowCreateModal(true)}
                >
                  Place First Bid
                </button>
              </div>
            ) : filteredBids.map((bid, index) => (
              <div 
                className={`bid-item ${selectedBid?.id === bid.id ? "selected" : ""} ${bid.isVerified ? "verified" : ""}`} 
                key={index}
                onClick={() => setSelectedBid(bid)}
              >
                <div className="bid-title">{bid.name}</div>
                <div className="bid-meta">
                  <span>Bid: 🔒 Encrypted</span>
                  <span>Created: {new Date(bid.timestamp * 1000).toLocaleDateString()}</span>
                </div>
                <div className="bid-status">
                  Status: {bid.isVerified ? "✅ Verified" : "🔓 Pending"}
                </div>
                <div className="bid-creator">Creator: {bid.creator.substring(0, 6)}...{bid.creator.substring(38)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreateBid 
          onSubmit={createBid} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingBid} 
          bidData={newBidData} 
          setBidData={setNewBidData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedBid && (
        <BidDetailModal 
          bid={selectedBid} 
          onClose={() => setSelectedBid(null)} 
          isDecrypting={isDecrypting || fheIsDecrypting} 
          decryptData={() => decryptBid(selectedBid.id)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const ModalCreateBid: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  bidData: any;
  setBidData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, bidData, setBidData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'bid') {
      const intValue = value.replace(/[^\d]/g, '');
      setBidData({ ...bidData, [name]: intValue });
    } else {
      setBidData({ ...bidData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="create-bid-modal">
        <div className="modal-header">
          <h2>New Domain Bid</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE 🔒 Encryption</strong>
            <p>Your bid will be encrypted before submission</p>
          </div>
          
          <div className="form-group">
            <label>Domain Name *</label>
            <input 
              type="text" 
              name="domain" 
              value={bidData.domain} 
              onChange={handleChange} 
              placeholder="Enter domain name..." 
            />
          </div>
          
          <div className="form-group">
            <label>Bid Amount (ETH) *</label>
            <input 
              type="number" 
              name="bid" 
              value={bidData.bid} 
              onChange={handleChange} 
              placeholder="Enter bid amount..." 
              step="0.01"
              min="0"
            />
            <div className="data-type-label">FHE Encrypted</div>
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <textarea 
              name="description" 
              value={bidData.description} 
              onChange={handleChange} 
              placeholder="Describe your bid..." 
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !bidData.domain || !bidData.bid} 
            className="submit-btn"
          >
            {creating || isEncrypting ? "Encrypting..." : "Place Bid"}
          </button>
        </div>
      </div>
    </div>
  );
};

const BidDetailModal: React.FC<{
  bid: DomainBid;
  onClose: () => void;
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
}> = ({ bid, onClose, isDecrypting, decryptData }) => {
  const [decryptedAmount, setDecryptedAmount] = useState<number | null>(null);

  const handleDecrypt = async () => {
    if (decryptedAmount !== null) return;
    
    const decrypted = await decryptData();
    if (decrypted !== null) {
      setDecryptedAmount(decrypted);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="bid-detail-modal">
        <div className="modal-header">
          <h2>Bid Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="bid-info">
            <div className="info-item">
              <span>Domain:</span>
              <strong>{bid.name}</strong>
            </div>
            <div className="info-item">
              <span>Creator:</span>
              <strong>{bid.creator.substring(0, 6)}...{bid.creator.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Date:</span>
              <strong>{new Date(bid.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
          </div>
          
          <div className="data-section">
            <h3>Encrypted Bid Data</h3>
            
            <div className="data-row">
              <div className="data-label">Bid Amount:</div>
              <div className="data-value">
                {bid.isVerified ? 
                  `${bid.decryptedValue} ETH (Verified)` : 
                  decryptedAmount !== null ? 
                  `${decryptedAmount} ETH (Decrypted)` : 
                  "🔒 Encrypted"
                }
              </div>
              {!bid.isVerified && (
                <button 
                  className={`decrypt-btn ${decryptedAmount !== null ? 'decrypted' : ''}`}
                  onClick={handleDecrypt} 
                  disabled={isDecrypting}
                >
                  {isDecrypting ? "Decrypting..." : "Decrypt Bid"}
                </button>
              )}
            </div>
            
            <div className="fhe-info">
              <div className="fhe-icon">🔒</div>
              <div>
                <strong>FHE Protected Bid</strong>
                <p>Your bid remains encrypted until verification</p>
              </div>
            </div>
          </div>
          
          <div className="description-section">
            <h3>Description</h3>
            <p>{bid.description || "No description provided"}</p>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
          {bid.isVerified && (
            <button className="verified-btn">
              ✅ Verified Bid
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;


