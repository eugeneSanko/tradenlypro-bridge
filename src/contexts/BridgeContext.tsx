import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { toast } from "@/hooks/use-toast";
import { useBridgeService } from "@/hooks/useBridgeService";
import {
  BridgeContextType,
  TimerConfig,
  Currency,
  PriceResponse,
} from "@/types/bridge";

/**
 * Configuration for timers used in the bridge process
 */
const TIMER_CONFIG: TimerConfig = {
  QUOTE_VALIDITY_MS: 120000, // 120 seconds (2 minutes)
  TIMER_UPDATE_INTERVAL_MS: 1000, // 1 second update interval
  RECALCULATION_THROTTLE_MS: 120000, // 120 seconds (2 minutes) between recalculations
};

const BridgeContext = createContext<BridgeContextType | undefined>(undefined);

/**
 * BridgeProvider component that manages the state and logic for the cross-chain bridge functionality
 *
 * @param children - React children components
 */
export function BridgeProvider({ children }: { children: React.ReactNode }) {
  const [fromCurrency, setFromCurrency] = useState<string>("");
  const [toCurrency, setToCurrency] = useState<string>("");
  const [amount, setAmount] = useState<string>("11"); // Set default amount to 50
  const [estimatedReceiveAmount, setEstimatedReceiveAmount] =
    useState<string>("");
  const [destinationAddress, setDestinationAddress] = useState<string>("");
  const [orderType, setOrderType] = useState<"fixed" | "float">("fixed");
  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const [availableCurrencies, setAvailableCurrencies] = useState<Currency[]>(
    []
  );
  const [isLoadingCurrencies, setIsLoadingCurrencies] = useState<boolean>(true);
  const [timeRemaining, setTimeRemaining] = useState<string | null>(null);
  const [lastPriceData, setLastPriceData] = useState<PriceResponse | null>(
    null
  );
  const [amountError, setAmountError] = useState<string | null>(null);

  // Use refs for timers to prevent issues with cleanup and closures
  const timeRemainingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const quoteExpiryTimeRef = useRef<number | null>(null);
  const statusCheckTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Last time a price calculation was made
  const lastPriceCheckTimeRef = useRef<number>(0);

  const {
    fetchCurrencies,
    calculatePrice,
    createOrder,
    checkOrderStatus,
    lastPriceCheck,
  } = useBridgeService();

  // Update lastPriceData when lastPriceCheck changes
  useEffect(() => {
    if (lastPriceCheck) {
      setLastPriceData(lastPriceCheck);
      validateAmount(); // Validate amount whenever price data updates
    }
  }, [lastPriceCheck]);

  // Watch for amount changes to validate in real-time
  useEffect(() => {
    validateAmount();
  }, [amount]);

  /**
   * Helper function to format numbers with commas for thousands separators
   */
  const formatNumberWithCommas = (value: string | number): string => {
    if (typeof value === "string") {
      value = parseFloat(value);
    }
    return value.toLocaleString("en-US", { maximumFractionDigits: 8 });
  };

  /**
   * Function to refresh available currencies
   */
  const refreshCurrencies = useCallback(async () => {
    setIsLoadingCurrencies(true);
    try {
      const currencies = await fetchCurrencies();
      if (Array.isArray(currencies) && currencies.length > 0) {
        setAvailableCurrencies(currencies);
        console.log(`Loaded ${currencies.length} currencies`);

        // Set default from currency (USDT) and to currency (BTC) after loading
        const usdtCurrency = currencies.find(
          (c) => c.code?.includes("USDT") && c.send === 1
        );
        const btcCurrency = currencies.find(
          (c) => c.code === "BTC" && c.recv === 1
        );

        if (usdtCurrency && btcCurrency) {
          setFromCurrency(usdtCurrency.code || "");
          setToCurrency(btcCurrency.code || "");
        }
      } else {
        console.warn("No currencies received from API");
        setAvailableCurrencies([]);
      }
    } catch (error) {
      console.error("Failed to load currencies:", error);
      toast({
        title: "Error",
        description: "Failed to load available currencies",
        variant: "destructive",
      });
      setAvailableCurrencies([]);
    } finally {
      setIsLoadingCurrencies(false);
    }
  }, [fetchCurrencies]);

  /**
   * Load available currencies on component mount
   */
  useEffect(() => {
    const loadCurrencies = async () => {
      setIsLoadingCurrencies(true);
      try {
        const currencies = await fetchCurrencies();
        if (Array.isArray(currencies) && currencies.length > 0) {
          setAvailableCurrencies(currencies);
          console.log(`Loaded ${currencies.length} currencies`);

          // Set default from currency (USDT) and to currency (BTC) after loading
          const usdtCurrency = currencies.find(
            (c) => c.code?.includes("USDT") && c.send === 1
          );
          const btcCurrency = currencies.find(
            (c) => c.code === "BTC" && c.recv === 1
          );

          if (usdtCurrency && btcCurrency) {
            setFromCurrency(usdtCurrency.code || "");
            setToCurrency(btcCurrency.code || "");
          }
        } else {
          console.warn("No currencies received from API");
          setAvailableCurrencies([]);
        }
      } catch (error) {
        console.error("Failed to load currencies:", error);
        toast({
          title: "Error",
          description: "Failed to load available currencies",
          variant: "destructive",
        });
        setAvailableCurrencies([]);
      } finally {
        setIsLoadingCurrencies(false);
      }
    };

    loadCurrencies();
  }, [fetchCurrencies]);

  /**
   * Start the countdown timer when a new price estimate is received
   */
  useEffect(() => {
    // Clear any existing timer
    if (timeRemainingTimerRef.current) {
      clearInterval(timeRemainingTimerRef.current);
      timeRemainingTimerRef.current = null;
    }

    // Only start the timer if we have a valid estimate and aren't calculating
    if (estimatedReceiveAmount && !isCalculating) {
      // Set the expiry time for this quote
      quoteExpiryTimeRef.current = Date.now() + TIMER_CONFIG.QUOTE_VALIDITY_MS;

      // Update function to calculate and display remaining time
      const updateTimer = () => {
        if (!quoteExpiryTimeRef.current) return;

        const now = Date.now();
        const timeLeft = Math.max(0, quoteExpiryTimeRef.current - now);

        if (timeLeft <= 0) {
          setTimeRemaining(null);
          if (timeRemainingTimerRef.current) {
            clearInterval(timeRemainingTimerRef.current);
            timeRemainingTimerRef.current = null;
          }
          return;
        }

        // Format the remaining time as seconds with 2 decimal places
        const seconds = Math.floor(timeLeft / 1000);
        const milliseconds = Math.floor((timeLeft % 1000) / 10);
        setTimeRemaining(
          `${seconds}.${milliseconds.toString().padStart(2, "0")}`
        );
      };

      // Initial update
      updateTimer();

      // Set interval for continuous updates
      timeRemainingTimerRef.current = setInterval(
        updateTimer,
        TIMER_CONFIG.TIMER_UPDATE_INTERVAL_MS
      );
    } else {
      // Reset timer if we're recalculating or have no estimate
      setTimeRemaining(null);
    }

    // Clean up timer on unmount or when dependencies change
    return () => {
      if (timeRemainingTimerRef.current) {
        clearInterval(timeRemainingTimerRef.current);
        timeRemainingTimerRef.current = null;
      }
    };
  }, [estimatedReceiveAmount, isCalculating]);

  /**
   * Validate amount against min/max from price data
   */
  const validateAmount = useCallback(() => {
    if (!lastPriceData || !amount) {
      setAmountError(null);
      return true;
    }

    const currentAmount = parseFloat(amount);
    if (isNaN(currentAmount)) {
      setAmountError(null);
      return true;
    }

    const minAmount = parseFloat(lastPriceData.data.from.min);
    const maxAmount = parseFloat(lastPriceData.data.from.max);

    if (currentAmount < minAmount) {
      setAmountError(`Minimum amount is ${minAmount} ${fromCurrency}`);
      return false;
    }

    if (currentAmount > maxAmount) {
      setAmountError(`Maximum amount is ${maxAmount} ${fromCurrency}`);
      return false;
    }

    setAmountError(null);
    return true;
  }, [amount, lastPriceData, fromCurrency]);

  /**
   * Calculate the estimated receive amount based on current input values
   */
  const calculateReceiveAmount = useCallback(async () => {
    // Validate required inputs
    if (!fromCurrency || !toCurrency || !amount || parseFloat(amount) <= 0) {
      setEstimatedReceiveAmount("");
      setLastPriceData(null);
      return;
    }

    setIsCalculating(true);
    try {
      // Get fresh price data
      const data = await calculatePrice(
        fromCurrency,
        toCurrency,
        amount,
        orderType
      );

      if (!data) {
        setEstimatedReceiveAmount("0");
        setLastPriceData(null);
        setIsCalculating(false);
        return;
      }

      // Format the estimated receive amount with commas if needed (keep original raw value for calculations)
      setEstimatedReceiveAmount(data.data.to.amount);
      setLastPriceData(data);

      // Validate amount after getting price data
      validateAmount();

      // Update the last check time
      lastPriceCheckTimeRef.current = Date.now();
    } catch (error) {
      console.error("Error calculating amount:", error);
      setEstimatedReceiveAmount("0");
      setLastPriceData(null);
      toast({
        title: "Calculation Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to calculate estimated amount",
        variant: "destructive",
      });
    } finally {
      setIsCalculating(false);
    }
  }, [
    amount,
    fromCurrency,
    toCurrency,
    orderType,
    calculatePrice,
    validateAmount,
  ]);

  /**
   * Start periodic status checking for an order
   *
   * @param orderId - The ID of the order to monitor
   * @returns Cleanup function
   */
  const startStatusChecking = useCallback(
    (orderId: string) => {
      // Clear any existing status check timer
      if (statusCheckTimerRef.current) {
        clearInterval(statusCheckTimerRef.current);
        statusCheckTimerRef.current = null;
      }

      // Set up status check at regular intervals
      const timerId = setInterval(async () => {
        const data = await checkOrderStatus(orderId);

        // Stop checking if order is in a terminal state
        if (
          data &&
          ["completed", "failed", "expired", "refunded"].includes(data.status)
        ) {
          if (statusCheckTimerRef.current) {
            clearInterval(statusCheckTimerRef.current);
            statusCheckTimerRef.current = null;
          }
        }
      }, 10000);

      statusCheckTimerRef.current = timerId;

      // Return cleanup function
      return () => {
        if (statusCheckTimerRef.current) {
          clearInterval(statusCheckTimerRef.current);
          statusCheckTimerRef.current = null;
        }
      };
    },
    [checkOrderStatus]
  );

  /**
   * Validates all inputs required for a bridge transaction
   *
   * @throws Error with description if validation fails
   */
  const validateBridgeTransaction = () => {
    if (!fromCurrency) throw new Error("Source currency is required");
    if (!toCurrency) throw new Error("Destination currency is required");
    if (!amount || parseFloat(amount) <= 0)
      throw new Error("Valid amount is required");
    if (!destinationAddress) throw new Error("Destination address is required");

    if (!validateAmount()) {
      throw new Error(amountError || "Invalid amount");
    }
  };

  /**
   * Creates a bridge transaction with the current input values
   *
   * @returns Object containing orderId if successful, null otherwise
   */
  const createBridgeTransaction = async () => {
    try {
      validateBridgeTransaction();

      // Verify exchange rate is still valid
      const now = new Date().getTime() / 1000;
      if (!lastPriceData || lastPriceData.expiresAt < now) {
        await calculateReceiveAmount();
        throw new Error("Exchange rate has expired. Please try again.");
      }

      // toast({
      //   title: "Creating Transaction",
      //   description: "Initializing your bridge transaction...",
      // });

      // Create order with updated parameters
      const result = await createOrder(
        fromCurrency,
        toCurrency,
        amount,
        destinationAddress,
        orderType,
        lastPriceData.data.rate || ""
      );

      // If successful, store the transaction data
      if (result && result.code === 0 && result.data) {
        // Extract the order ID and token from the result
        const orderId = result.data.id;
        const orderToken = result.data.token;

        // Store the transaction data for use in awaiting deposit page
        const transactionData = {
          id: orderId,
          orderToken: orderToken, // Store the token separately
          fromCurrency,
          toCurrency,
          amount,
          destinationAddress,
          status: result.data.status,
          depositAddress: result.data.from?.address,
          type: orderType,
          receiveAmount: estimatedReceiveAmount,
          tag: result.data.from?.tag || null,
          tagName: result.data.from?.tagName || null,
          addressAlt: result.data.from?.addressAlt || null,
          expiresAt: result.data.time?.expiration
            ? new Date(result.data.time.expiration * 1000).toISOString()
            : null,
        };

        localStorage.setItem(
          "bridge_transaction_data",
          JSON.stringify(transactionData)
        );
        console.log("Stored bridge transaction data:", transactionData);

        // Start monitoring the order status
        startStatusChecking(orderId);

        // toast({
        //   title: "Transaction Created",
        //   description:
        //     "Your bridge transaction has been initiated successfully!",
        // });

        return result;
      }

      // If the result has an error code and a message, pass it along
      if (
        result &&
        result.code !== undefined &&
        result.code !== 0 &&
        result.msg
      ) {
        console.error(
          `Order creation failed: ${result.msg} (code: ${result.code})`
        );
        return result;
      }

      console.error("Order creation failed: No valid response");
      return {
        orderId: "",
        code: 500,
        msg: "Failed to create order",
        debugInfo: result?.debugInfo,
      };
    } catch (error: any) {
      // Check if this is a specific API error with debugInfo
      if (error && typeof error === "object" && error.code) {
        console.error("API error:", error);
        return error; // Return the error object directly so the UI can handle it
      }

      toast({
        title: "Transaction Failed",
        description: error.message || "Failed to create bridge transaction",
        variant: "destructive",
      });
      console.error("Bridge transaction error:", error);
      return {
        orderId: "",
        code: 500,
        msg: error.message || "Failed to create bridge transaction",
        debugInfo: { error },
      };
    }
  };

  // Context value to be provided
  const value = {
    fromCurrency,
    toCurrency,
    amount,
    estimatedReceiveAmount,
    destinationAddress,
    orderType,
    isCalculating,
    timeRemaining,
    setFromCurrency,
    setToCurrency,
    setAmount,
    setDestinationAddress,
    setOrderType,
    calculateReceiveAmount,
    createBridgeTransaction,
    availableCurrencies,
    isLoadingCurrencies,
    refreshCurrencies,
    lastPriceData,
    amountError,
    formatNumberWithCommas,
  };

  return (
    <BridgeContext.Provider value={value}>{children}</BridgeContext.Provider>
  );
}

/**
 * Hook to access the bridge context
 *
 * @returns Bridge context
 * @throws Error if used outside of BridgeProvider
 */
export function useBridge() {
  const context = useContext(BridgeContext);
  if (context === undefined) {
    throw new Error("useBridge must be used within a BridgeProvider");
  }
  return context;
}
