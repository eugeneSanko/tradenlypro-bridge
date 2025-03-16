
import { OrderDetails } from "@/hooks/useBridgeOrder";
import { LoadingState } from "@/components/bridge/LoadingState";
import { ErrorState } from "@/components/bridge/ErrorState";
import { EmptyState } from "@/components/bridge/EmptyState";
import { BridgeTransaction } from "@/components/bridge/BridgeTransaction";
import { DebugInfoDisplay } from "@/components/bridge/DebugInfoDisplay";
import { CompletedTransactionSaver } from "@/components/bridge/CompletedTransactionSaver";
import { useState, useEffect } from "react";

interface BridgeStatusRendererProps {
  loading: boolean;
  error: string | null;
  orderDetails: OrderDetails | null;
  handleCopyAddress: (address: string) => void;
  statusCheckDebugInfo: any | null;
  simulateSuccess: boolean;
  originalOrderDetails: OrderDetails | null;
  token: string;
  transactionSaved: boolean;
  setTransactionSaved: (saved: boolean) => void;
  checkOrderStatus?: () => void;
}

export const BridgeStatusRenderer = ({
  loading,
  error,
  orderDetails: initialOrderDetails,
  handleCopyAddress,
  statusCheckDebugInfo,
  simulateSuccess,
  originalOrderDetails,
  token,
  transactionSaved,
  setTransactionSaved,
  checkOrderStatus
}: BridgeStatusRendererProps) => {
  // Add state to handle updated orderDetails after expired status check
  const [orderDetails, setOrderDetails] = useState<OrderDetails | null>(initialOrderDetails);
  
  // Update local orderDetails when initial orderDetails changes
  useEffect(() => {
    setOrderDetails(initialOrderDetails);
  }, [initialOrderDetails]);
  
  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return (
      <>
        <ErrorState error={error} />
        <DebugInfoDisplay 
          statusCheckDebugInfo={statusCheckDebugInfo} 
          error={error}
          orderDetails={null}
        />
      </>
    );
  }

  if (!orderDetails) {
    return (
      <>
        <EmptyState />
        <DebugInfoDisplay 
          statusCheckDebugInfo={statusCheckDebugInfo} 
          error={null}
          orderDetails={null}
        />
      </>
    );
  }

  // Function to update order details (used by CompletedTransactionSaver)
  const handleOrderDetailsUpdate = (updatedDetails: OrderDetails) => {
    console.log("Updating order details:", updatedDetails);
    setOrderDetails(updatedDetails);
  };

  // Handlers for new actions
  const handleRetryCurrentPrice = () => {
    console.log("Retrying at current price");
    if (checkOrderStatus) {
      checkOrderStatus();
    }
  };

  const handleEmergencyExchange = () => {
    console.log("Emergency exchange requested");
    // This would normally call an API endpoint to handle emergency exchange
    alert("Emergency exchange functionality would be implemented here");
  };

  const handleEmergencyRefund = () => {
    console.log("Emergency refund requested");
    // This would normally call an API endpoint to handle emergency refund
    alert("Emergency refund functionality would be implemented here");
  };

  return (
    <>
      <BridgeTransaction 
        orderDetails={orderDetails} 
        onCopyAddress={handleCopyAddress} 
        onRetryCurrentPrice={handleRetryCurrentPrice}
        onEmergencyExchange={handleEmergencyExchange}
        onEmergencyRefund={handleEmergencyRefund}
      />
      
      <DebugInfoDisplay 
        statusCheckDebugInfo={statusCheckDebugInfo} 
        error={null}
        orderDetails={orderDetails}
      />
      
      <CompletedTransactionSaver
        orderDetails={orderDetails}
        simulateSuccess={simulateSuccess}
        originalOrderDetails={originalOrderDetails}
        token={token}
        transactionSaved={transactionSaved}
        setTransactionSaved={setTransactionSaved}
        statusCheckDebugInfo={statusCheckDebugInfo}
        onOrderDetailsUpdate={handleOrderDetailsUpdate}
      />
    </>
  );
};
