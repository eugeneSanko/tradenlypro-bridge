
import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useBridgeOrder } from "@/hooks/useBridgeOrder";
import { useDeepLink } from "@/hooks/useDeepLink";
import { LoadingState } from "@/components/bridge/LoadingState";
import { ErrorState } from "@/components/bridge/ErrorState";
import { EmptyState } from "@/components/bridge/EmptyState";
import { BridgeTransaction } from "@/components/bridge/BridgeTransaction";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { DebugPanel } from "@/components/bridge/DebugPanel";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const POLLING_INTERVALS = {
  DEFAULT: 15000,     // Default: 15 seconds
  NEW: 10000,         // Awaiting deposit: 10 seconds  
  PENDING: 10000,     // Received, waiting for confirmations: 10 seconds
  EXCHANGE: 20000,    // Exchange in progress: 20 seconds
  WITHDRAW: 20000,    // Sending funds: 20 seconds
  DONE: 30000,        // Completed: continue polling but less frequently
  EXPIRED: null,      // Expired: no polling needed
  EMERGENCY: null     // Emergency: no polling needed
};

const BridgeAwaitingDeposit = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("orderId");
  const token = searchParams.get("token") || "";
  
  const [simulateSuccess, setSimulateSuccess] = useState(false);
  
  const [apiAttempted, setApiAttempted] = useState(false);
  const [manualStatusCheckAttempted, setManualStatusCheckAttempted] = useState(false);
  const [statusCheckDebugInfo, setStatusCheckDebugInfo] = useState(null);
  const [statusCheckError, setStatusCheckError] = useState(null);
  const [pollingInterval, setPollingInterval] = useState(POLLING_INTERVALS.DEFAULT);
  const [lastPollTimestamp, setLastPollTimestamp] = useState(0);
  const [transactionSaved, setTransactionSaved] = useState(false);
  
  const { orderDetails: originalOrderDetails, loading, error, handleCopyAddress } = useBridgeOrder(
    orderId, 
    true, // Always try to fetch from API
    true  // Force API check even if we have local data
  );
  
  const [orderDetails, setOrderDetails] = useState(originalOrderDetails);
  
  useEffect(() => {
    if (!originalOrderDetails) return;
    
    if (simulateSuccess) {
      const simulatedDetails = {
        ...originalOrderDetails,
        currentStatus: "completed",
        rawApiResponse: {
          ...originalOrderDetails.rawApiResponse,
          status: "DONE"
        }
      };
      setOrderDetails(simulatedDetails);
      
      console.log("Simulating DONE state:", {
        originalStatus: originalOrderDetails.currentStatus,
        originalApiStatus: originalOrderDetails.rawApiResponse?.status,
        finalStatus: "completed",
        finalApiStatus: "DONE",
        simulatedDetails
      });
    } else {
      setOrderDetails(originalOrderDetails);
      
      console.log("Using original state:", {
        originalStatus: originalOrderDetails.currentStatus,
        originalApiStatus: originalOrderDetails.rawApiResponse?.status
      });
    }
  }, [originalOrderDetails, simulateSuccess]);
  
  const { deepLink, logs, addLog } = useDeepLink();

  useEffect(() => {
    if (!orderDetails || !orderDetails.rawApiResponse) return;
    
    const apiStatus = orderDetails.rawApiResponse.status;
    const newInterval = POLLING_INTERVALS[apiStatus] ?? POLLING_INTERVALS.DEFAULT;
    
    console.log(`Setting polling interval to ${newInterval === null ? 'none' : `${newInterval}ms`} for status ${apiStatus}`);
    setPollingInterval(newInterval);
  }, [orderDetails?.rawApiResponse?.status]);

  useEffect(() => {
    if (!orderId) {
      toast({
        title: "Missing Order ID",
        description: "No order information found",
        variant: "destructive"
      });
    } else {
      console.log(`Processing order ID: ${orderId} with token: ${token}`);
    }
  }, [orderId, token]);

  const checkOrderStatus = useCallback(async (force = false) => {
    if (!orderId || !token) {
      console.error("Missing order ID or token for status check");
      setStatusCheckError("Missing order ID or token");
      return;
    }
    
    if (pollingInterval === null && !force) {
      console.log("Polling disabled for current status, skipping check");
      return;
    }
    
    const now = Date.now();
    if (!force && (now - lastPollTimestamp) < pollingInterval) {
      console.log(`Not enough time elapsed since last poll (${(now - lastPollTimestamp)/1000}s), skipping`);
      return;
    }
    
    setLastPollTimestamp(now);

    try {
      console.log(`${force ? 'Forcing' : 'Scheduled'} order status check with bridge-status function`);
      setManualStatusCheckAttempted(true);
      
      const { data, error } = await supabase.functions.invoke('bridge-status', {
        body: { id: orderId, token }
      });
      
      if (error) {
        console.error("Error calling bridge-status function:", error);
        setStatusCheckError(`Error: ${error.message}`);
        setStatusCheckDebugInfo({ error });
        return;
      }
      
      console.log("Status check response:", data);
      
      if (data.debugInfo) {
        setStatusCheckDebugInfo(data.debugInfo);
      }
      
      if (data.code === 0 && data.data) {
        const status = data.data.status;
        console.log(`Order status from API: ${status}`);
        
        if (status === 'DONE') {
          console.log("Order is complete, showing notification");
          toast({
            title: "Transaction Complete",
            description: `Your transaction has been completed successfully.`,
            variant: "default"
          });
          
          if (originalOrderDetails) {
            setOrderDetails({
              ...originalOrderDetails,
              currentStatus: "completed",
              rawApiResponse: {
                ...originalOrderDetails.rawApiResponse,
                status: "DONE"
              }
            });
          }

          // Save completed transaction to Supabase
          saveCompletedTransaction(originalOrderDetails, data, false);
        }
      } else {
        console.error("API returned an error:", data);
        setStatusCheckError(`API Error: ${data.msg || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error checking order status:", error);
      setStatusCheckError(`Error: ${error.message}`);
    }
  }, [orderId, token, pollingInterval, lastPollTimestamp, originalOrderDetails]);

  useEffect(() => {
    if (orderId && token && !manualStatusCheckAttempted) {
      checkOrderStatus(true);
    }
  }, [orderId, token, manualStatusCheckAttempted, checkOrderStatus]);

  useEffect(() => {
    if (!apiAttempted && (loading || error || orderDetails)) {
      setApiAttempted(true);
      
      if (error) {
        console.error("API error detected:", error);
        toast({
          title: "Connection Error",
          description: "Could not fetch order details from the exchange API.",
          variant: "destructive"
        });
      }
    }
  }, [apiAttempted, loading, error, orderDetails]);

  useEffect(() => {
    if (!deepLink) return;

    const url = new URL(deepLink);
    const params = url.searchParams;

    if (params.get("errorCode")) {
      addLog(JSON.stringify(Object.fromEntries([...params]), null, 2));
      return;
    }

    if (params.has("status")) {
      const status = params.get("status");
      addLog(`Status from deep link: ${status}`);
      
      if (status === 'completed') {
        console.log("Got completed status from deep link");
        toast({
          title: "Transaction Complete",
          description: `Your transaction has been completed successfully.`,
          variant: "default"
        });
      }
    }

    if (params.has("txId")) {
      const txId = params.get("txId");
      addLog(`Transaction ID from deep link: ${txId}`);
    }
  }, [deepLink, addLog]);

  useEffect(() => {
    if (!orderId || !token || pollingInterval === null) return;
    
    console.log(`Setting up polling with ${pollingInterval}ms interval`);
    
    const intervalId = setInterval(() => {
      checkOrderStatus();
    }, pollingInterval);
    
    return () => {
      console.log('Clearing polling interval');
      clearInterval(intervalId);
    };
  }, [orderId, token, pollingInterval, checkOrderStatus]);

  // Effect to monitor completion status and save to database
  useEffect(() => {
    // Check if order is completed via simulation
    if (
      simulateSuccess && 
      orderDetails && 
      orderDetails.currentStatus === "completed" && 
      orderDetails.rawApiResponse?.status === "DONE" && 
      !transactionSaved
    ) {
      // Save simulated completed transaction
      saveCompletedTransaction(orderDetails, { data: orderDetails.rawApiResponse }, true);
    }
  }, [simulateSuccess, orderDetails, transactionSaved]);

  // Function to save completed transaction to Supabase
  const saveCompletedTransaction = async (details, apiResponse, isSimulated) => {
    if (!details || transactionSaved) return;

    try {
      console.log("Saving completed transaction to database", { isSimulated });
      
      // Convert non-serializable data to serializable format
      const languagesArray = Array.from(navigator.languages || []);
      
      // Prepare transaction data
      const transactionData = {
        ff_order_id: details.ffOrderId || details.orderId,
        ff_order_token: details.ffOrderToken || token,
        from_currency: details.fromCurrency,
        to_currency: details.toCurrency,
        amount: parseFloat(details.depositAmount),
        destination_address: details.destinationAddress,
        deposit_address: details.depositAddress,
        status: "completed",
        raw_api_response: isSimulated 
          ? { 
              ...apiResponse.data,
              simulated: true,
              original_status: originalOrderDetails?.rawApiResponse?.status
            }
          : apiResponse.data,
        client_metadata: {
          device: navigator.userAgent,
          timestamp: new Date().toISOString(),
          ip: null, // Will be filled server-side
          simulation: isSimulated,
          user_agent: navigator.userAgent,
          languages: languagesArray,
          debug_info: statusCheckDebugInfo
        }
      };

      // Save to Supabase
      const { data, error } = await supabase
        .from('completed_bridge_transactions')
        .insert(transactionData);

      if (error) {
        console.error("Error saving completed transaction:", error);
        toast({
          title: "Database Error",
          description: "Could not save transaction data",
          variant: "destructive"
        });
        return;
      }

      console.log("Transaction saved successfully:", data);
      setTransactionSaved(true);
      
      toast({
        title: "Transaction Recorded",
        description: "Transaction has been saved to database",
        variant: "default"
      });
      
      // Optionally redirect to a completion page
      setTimeout(() => {
        navigate(`/bridge/complete?orderId=${details.orderId}`);
      }, 2000);
      
    } catch (err) {
      console.error("Exception saving transaction:", err);
    }
  };

  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return (
      <>
        <ErrorState error={error} />
        {statusCheckDebugInfo && (
          <div className="mt-8">
            <DebugPanel debugInfo={statusCheckDebugInfo} isLoading={false} />
          </div>
        )}
      </>
    );
  }

  if (!orderDetails) {
    return (
      <>
        <EmptyState />
        {statusCheckDebugInfo && (
          <div className="mt-8">
            <DebugPanel debugInfo={statusCheckDebugInfo} isLoading={false} />
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="fixed top-4 right-4 z-50 bg-black/80 p-3 rounded-lg flex items-center gap-3">
        <Switch 
          id="simulate-success"
          checked={simulateSuccess}
          onCheckedChange={setSimulateSuccess}
        />
        <Label htmlFor="simulate-success" className="text-sm text-white">
          Simulate Completed
        </Label>
      </div>
      
      <BridgeTransaction 
        orderDetails={orderDetails} 
        onCopyAddress={handleCopyAddress} 
      />
      {statusCheckDebugInfo && (
        <div className="mt-8">
          <DebugPanel debugInfo={statusCheckDebugInfo} isLoading={false} />
        </div>
      )}
    </>
  );
};

export default BridgeAwaitingDeposit;
